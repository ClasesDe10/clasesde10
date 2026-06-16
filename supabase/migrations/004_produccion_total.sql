-- ClasesDe10 - Migracion 004: Produccion total
-- Ejecutar despues de 001, 002 y 003. Es idempotente y corrige auth, roles,
-- leads publicos, pagos, storage privado y solapes de clases.

-- ---------------------------------------------------------------------------
-- 1. Tablas y columnas nuevas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leads_publicos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       TEXT NOT NULL CHECK (tipo IN ('contacto','familia','profesor')),
  nombre     TEXT NOT NULL,
  email      TEXT NOT NULL,
  telefono   TEXT,
  perfil     TEXT,
  asunto     TEXT,
  mensaje    TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado     TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','contactado','cerrado','spam')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_publicos_tipo ON leads_publicos(tipo);
CREATE INDEX IF NOT EXISTS idx_leads_publicos_estado ON leads_publicos(estado);
CREATE INDEX IF NOT EXISTS idx_leads_publicos_fecha ON leads_publicos(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_publicos_email_format'
  ) THEN
    ALTER TABLE leads_publicos
      ADD CONSTRAINT chk_leads_publicos_email_format
      CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_publicos_lengths'
  ) THEN
    ALTER TABLE leads_publicos
      ADD CONSTRAINT chk_leads_publicos_lengths
      CHECK (
        char_length(nombre) BETWEEN 2 AND 160
        AND char_length(email) BETWEEN 5 AND 254
        AND (telefono IS NULL OR char_length(telefono) <= 40)
        AND (perfil IS NULL OR char_length(perfil) <= 80)
        AND (asunto IS NULL OR char_length(asunto) <= 180)
        AND (mensaje IS NULL OR char_length(mensaje) <= 3000)
      ) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS alumno_invitaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id   UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  token       UUID NOT NULL DEFAULT gen_random_uuid(),
  email       TEXT,
  creado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usado_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usado_at    TIMESTAMPTZ,
  expira_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(token)
);

CREATE INDEX IF NOT EXISTS idx_alumno_invitaciones_alumno ON alumno_invitaciones(alumno_id);
CREATE INDEX IF NOT EXISTS idx_alumno_invitaciones_token ON alumno_invitaciones(token);

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_documento ON pagos(documento_id);

-- Trigger updated_at para tabla nueva
DROP TRIGGER IF EXISTS trg_leads_publicos_updated_at ON leads_publicos;
CREATE TRIGGER trg_leads_publicos_updated_at
  BEFORE UPDATE ON leads_publicos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Auth: crear usuario y perfil sin romper signUp
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id UUID;
  v_rol_text   TEXT;
  v_inv_token  UUID;
  v_rows       INTEGER;
BEGIN
  v_rol_text := COALESCE(NEW.raw_user_meta_data->>'rol', 'familia');

  -- Nunca permitir admin desde registro publico.
  IF v_rol_text NOT IN ('profesor','familia','alumno') THEN
    v_rol_text := 'familia';
  END IF;

  SELECT id INTO v_usuario_id
  FROM usuarios
  WHERE auth_id = NEW.id OR email = NEW.email
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    INSERT INTO usuarios (auth_id, email, nombre, apellidos, telefono, rol)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'nombre', ''), 'Usuario'),
      COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
      NULLIF(NEW.raw_user_meta_data->>'telefono', ''),
      v_rol_text::rol_usuario
    )
    RETURNING id INTO v_usuario_id;
  ELSE
    UPDATE usuarios
    SET auth_id = NEW.id,
        email = NEW.email,
        nombre = COALESCE(NULLIF(NEW.raw_user_meta_data->>'nombre', ''), nombre),
        apellidos = COALESCE(NEW.raw_user_meta_data->>'apellidos', apellidos),
        telefono = COALESCE(NULLIF(NEW.raw_user_meta_data->>'telefono', ''), telefono),
        rol = CASE WHEN rol = 'admin' THEN rol ELSE v_rol_text::rol_usuario END,
        activo = true
    WHERE id = v_usuario_id;
  END IF;

  IF v_rol_text = 'profesor' THEN
    INSERT INTO profesores (usuario_id)
    VALUES (v_usuario_id)
    ON CONFLICT (usuario_id) DO NOTHING;
  ELSIF v_rol_text = 'familia' THEN
    INSERT INTO familias (usuario_id)
    VALUES (v_usuario_id)
    ON CONFLICT (usuario_id) DO NOTHING;
  ELSIF v_rol_text = 'alumno' THEN
    BEGIN
      v_inv_token := NULLIF(NEW.raw_user_meta_data->>'alumno_invitacion_token', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      v_inv_token := NULL;
    END;

    IF v_inv_token IS NULL THEN
      RAISE EXCEPTION 'Invitacion de alumno invalida';
    END IF;

    UPDATE alumnos a
    SET usuario_id = v_usuario_id
    FROM alumno_invitaciones ai
    WHERE ai.alumno_id = a.id
      AND ai.token = v_inv_token
      AND ai.usado_at IS NULL
      AND ai.expira_at > NOW()
      AND a.usuario_id IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Invitacion de alumno invalida, expirada o ya usada';
    END IF;

    UPDATE alumno_invitaciones
    SET usado_por = v_usuario_id,
        usado_at = NOW()
    WHERE token = v_inv_token
      AND usado_at IS NULL
      AND expira_at > NOW();
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_auth_user failed for auth user %, email %, sqlstate %, error %',
    NEW.id, NEW.email, SQLSTATE, SQLERRM;
  RAISE;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_auth_user ON auth.users;
CREATE TRIGGER trg_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

CREATE OR REPLACE FUNCTION reparar_perfiles_faltantes()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            RECORD;
  creados_prof INTEGER := 0;
  creados_fam  INTEGER := 0;
BEGIN
  FOR r IN
    SELECT u.id, u.rol
    FROM usuarios u
    WHERE u.activo = true
      AND u.rol IN ('profesor', 'familia')
  LOOP
    IF r.rol = 'profesor' AND NOT EXISTS (SELECT 1 FROM profesores WHERE usuario_id = r.id) THEN
      INSERT INTO profesores (usuario_id) VALUES (r.id);
      creados_prof := creados_prof + 1;
    ELSIF r.rol = 'familia' AND NOT EXISTS (SELECT 1 FROM familias WHERE usuario_id = r.id) THEN
      INSERT INTO familias (usuario_id) VALUES (r.id);
      creados_fam := creados_fam + 1;
    END IF;
  END LOOP;

  RETURN format('Reparados: %s profesores, %s familias', creados_prof, creados_fam);
END;
$$;

SELECT reparar_perfiles_faltantes();

-- ---------------------------------------------------------------------------
-- 3. RLS de leads, invitaciones, pagos y documentos
-- ---------------------------------------------------------------------------

ALTER TABLE leads_publicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumno_invitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leads publicos: anon insert" ON leads_publicos;
DROP POLICY IF EXISTS "Leads publicos: public insert" ON leads_publicos;
DROP POLICY IF EXISTS "Leads publicos: admin CRUD" ON leads_publicos;

CREATE POLICY "Leads publicos: anon insert"
  ON leads_publicos FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Leads publicos: admin CRUD"
  ON leads_publicos FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

DROP POLICY IF EXISTS "Alumno invitaciones: admin CRUD" ON alumno_invitaciones;
DROP POLICY IF EXISTS "Alumno invitaciones: familia gestiona las suyas" ON alumno_invitaciones;

CREATE POLICY "Alumno invitaciones: admin CRUD"
  ON alumno_invitaciones FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

CREATE POLICY "Alumno invitaciones: familia gestiona las suyas"
  ON alumno_invitaciones FOR ALL TO authenticated
  USING (
    alumno_id IN (
      SELECT a.id
      FROM alumnos a
      JOIN familias f ON f.id = a.familia_id
      WHERE f.usuario_id = get_usuario_id()
    )
  )
  WITH CHECK (
    alumno_id IN (
      SELECT a.id
      FROM alumnos a
      JOIN familias f ON f.id = a.familia_id
      WHERE f.usuario_id = get_usuario_id()
    )
  );

DROP POLICY IF EXISTS "Pagos: familia ve y crea los suyos" ON pagos;
DROP POLICY IF EXISTS "Pagos: familia SELECT propio" ON pagos;
DROP POLICY IF EXISTS "Pagos: familia INSERT propio" ON pagos;

CREATE POLICY "Pagos: familia SELECT propio"
  ON pagos FOR SELECT TO authenticated
  USING (
    familia_id IN (SELECT id FROM familias WHERE usuario_id = get_usuario_id())
  );

CREATE POLICY "Pagos: familia INSERT propio"
  ON pagos FOR INSERT TO authenticated
  WITH CHECK (
    familia_id IN (SELECT id FROM familias WHERE usuario_id = get_usuario_id())
    AND documento_id IN (SELECT id FROM documentos WHERE usuario_id = get_usuario_id())
    AND monto > 0
  );

DROP POLICY IF EXISTS "Documentos: usuario ve los suyos" ON documentos;
DROP POLICY IF EXISTS "Documentos: usuario CRUD propio" ON documentos;

CREATE POLICY "Documentos: usuario CRUD propio"
  ON documentos FOR ALL TO authenticated
  USING (usuario_id = get_usuario_id())
  WITH CHECK (usuario_id = get_usuario_id());

-- ---------------------------------------------------------------------------
-- 3b. RLS sin recursion para alumnos y asignaciones
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_profesor_id_actual()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM profesores p
  WHERE p.usuario_id = get_usuario_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_familia_id_actual()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id
  FROM familias f
  WHERE f.usuario_id = get_usuario_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_alumno_id_actual()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM alumnos a
  WHERE a.usuario_id = get_usuario_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.profesor_puede_ver_alumno(p_alumno_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM asignaciones a
    WHERE a.alumno_id = p_alumno_id
      AND a.profesor_id = get_profesor_id_actual()
      AND a.activa = true
  )
$$;

CREATE OR REPLACE FUNCTION public.familia_puede_ver_alumno(p_alumno_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM alumnos a
    WHERE a.id = p_alumno_id
      AND a.familia_id = get_familia_id_actual()
  )
$$;

DROP POLICY IF EXISTS "Alumnos: admin ve todo" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: admin CRUD completo" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: familia ve sus hijos" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: familia CRUD hijos" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: profesor ve sus alumnos" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: profesor ve asignados" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: propio perfil" ON alumnos;
DROP POLICY IF EXISTS "Alumnos: alumno ve propio" ON alumnos;

CREATE POLICY "Alumnos: admin CRUD completo"
  ON alumnos FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

CREATE POLICY "Alumnos: familia CRUD hijos"
  ON alumnos FOR ALL TO authenticated
  USING (familia_id = get_familia_id_actual())
  WITH CHECK (familia_id = get_familia_id_actual());

CREATE POLICY "Alumnos: profesor ve asignados"
  ON alumnos FOR SELECT TO authenticated
  USING (public.profesor_puede_ver_alumno(id));

CREATE POLICY "Alumnos: alumno ve propio"
  ON alumnos FOR SELECT TO authenticated
  USING (id = get_alumno_id_actual());

DROP POLICY IF EXISTS "Asignaciones: admin CRUD" ON asignaciones;
DROP POLICY IF EXISTS "Asignaciones: profesor ve las suyas" ON asignaciones;
DROP POLICY IF EXISTS "Asignaciones: familia ve las de sus hijos" ON asignaciones;
DROP POLICY IF EXISTS "Asignaciones: alumno ve las suyas" ON asignaciones;

CREATE POLICY "Asignaciones: admin CRUD"
  ON asignaciones FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

CREATE POLICY "Asignaciones: profesor ve las suyas"
  ON asignaciones FOR SELECT TO authenticated
  USING (profesor_id = get_profesor_id_actual());

CREATE POLICY "Asignaciones: familia ve las de sus hijos"
  ON asignaciones FOR SELECT TO authenticated
  USING (public.familia_puede_ver_alumno(alumno_id));

CREATE POLICY "Asignaciones: alumno ve las suyas"
  ON asignaciones FOR SELECT TO authenticated
  USING (alumno_id = get_alumno_id_actual());

-- ---------------------------------------------------------------------------
-- 4. Storage privado coherente
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "storage_public_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_user_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_user_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_user_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_all" ON storage.objects;

CREATE POLICY "storage_user_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos'
  AND (
    (storage.foldername(name))[1] = get_usuario_id()::text
    OR ((storage.foldername(name))[1] = 'documentos' AND (storage.foldername(name))[2] = get_usuario_id()::text)
    OR get_rol_actual() = 'admin'
  )
);

CREATE POLICY "storage_user_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND (
    (storage.foldername(name))[1] = get_usuario_id()::text
    OR ((storage.foldername(name))[1] = 'documentos' AND (storage.foldername(name))[2] = get_usuario_id()::text)
  )
);

CREATE POLICY "storage_user_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos'
  AND (
    (storage.foldername(name))[1] = get_usuario_id()::text
    OR ((storage.foldername(name))[1] = 'documentos' AND (storage.foldername(name))[2] = get_usuario_id()::text)
    OR get_rol_actual() = 'admin'
  )
);

CREATE POLICY "storage_admin_all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'documentos' AND get_rol_actual() = 'admin')
WITH CHECK (bucket_id = 'documentos' AND get_rol_actual() = 'admin');

-- ---------------------------------------------------------------------------
-- 5. Conflictos horarios de clases
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validar_solape_clase()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado <> 'cancelada' THEN
    IF EXISTS (
      SELECT 1
      FROM clases c
      WHERE c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND c.fecha = NEW.fecha
        AND c.estado <> 'cancelada'
        AND (c.profesor_id = NEW.profesor_id OR c.alumno_id = NEW.alumno_id)
        AND NEW.hora_inicio < c.hora_fin
        AND NEW.hora_fin > c.hora_inicio
    ) THEN
      RAISE EXCEPTION 'Conflicto horario: el profesor o alumno ya tiene una clase en esa franja.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_solape_clase ON clases;
CREATE TRIGGER trg_validar_solape_clase
  BEFORE INSERT OR UPDATE OF profesor_id, alumno_id, fecha, hora_inicio, hora_fin, estado ON clases
  FOR EACH ROW EXECUTE FUNCTION validar_solape_clase();

-- ---------------------------------------------------------------------------
-- 6. Grants y configuracion de dominio canonico
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_dashboard_admin AS
SELECT
  (SELECT COUNT(*) FROM usuarios WHERE rol = 'profesor' AND activo) AS profesores_activos,
  (SELECT COUNT(*) FROM usuarios WHERE rol = 'familia'  AND activo) AS familias_activas,
  (SELECT COUNT(*) FROM alumnos  WHERE activo) AS alumnos_activos,
  (SELECT COUNT(*) FROM clases   WHERE date_trunc('month', fecha) = date_trunc('month', NOW())) AS clases_mes,
  (SELECT COALESCE(SUM(precio_total),0) FROM clases WHERE date_trunc('month', fecha) = date_trunc('month', NOW()) AND estado = 'realizada') AS ingresos_mes,
  (SELECT COALESCE(SUM(comision_clasesde10),0) FROM clases WHERE date_trunc('month', fecha) = date_trunc('month', NOW()) AND estado = 'realizada') AS comisiones_mes,
  (SELECT COUNT(*) FROM incidencias WHERE estado = 'abierta') AS incidencias_abiertas,
  (SELECT COUNT(*) FROM solicitudes WHERE estado = 'nueva') AS solicitudes_nuevas,
  (SELECT COUNT(*) FROM pagos WHERE estado = 'pendiente') AS pagos_pendientes
WHERE get_rol_actual() = 'admin';

REVOKE ALL ON v_dashboard_admin FROM anon, public;
GRANT INSERT ON leads_publicos TO anon;
GRANT INSERT ON leads_publicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON leads_publicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alumno_invitaciones TO authenticated;
GRANT SELECT ON v_dashboard_admin TO authenticated;
GRANT SELECT ON v_clases_completas TO authenticated;
GRANT SELECT ON v_resumen_profesor_mes TO authenticated;

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('dominio_canonico', 'https://clasesde10.com', 'Dominio canonico de produccion'),
  ('email_soporte', 'contacto.clasesde10@gmail.com', 'Email publico de soporte')
ON CONFLICT (clave) DO UPDATE
SET valor = EXCLUDED.valor,
    descripcion = EXCLUDED.descripcion,
    updated_at = NOW();
