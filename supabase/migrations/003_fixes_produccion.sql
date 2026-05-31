-- ═══════════════════════════════════════════════════════════════
-- ClasesDe10 — Migración 003: Fixes de producción
-- Ejecutar DESPUÉS de 001_schema_completo.sql
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. GRANTs en vistas para PostgREST / anon key
-- ───────────────────────────────────────────────────────────────
-- Sin estos GRANTs, Supabase PostgREST devuelve error de permisos
-- aunque RLS esté configurada correctamente.

GRANT SELECT ON v_dashboard_admin    TO authenticated;
GRANT SELECT ON v_clases_completas   TO authenticated;
GRANT SELECT ON v_resumen_profesor_mes TO authenticated;

-- La vista v_dashboard_admin solo tiene sentido para admin (la RLS de
-- las tablas subyacentes aplica con el contexto del llamador). OK.

-- ───────────────────────────────────────────────────────────────
-- 2. Trigger mejorado: crear perfil completo al registrarse
--    Corrige el bug crítico de dashboards vacíos tras registro.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_usuario_id UUID;
  v_rol        TEXT;
BEGIN
  v_rol := COALESCE(NEW.raw_user_meta_data->>'rol', 'familia');

  -- Insertar en usuarios (texto plano, sin entidades HTML)
  INSERT INTO usuarios (auth_id, email, nombre, apellidos, telefono, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre',    'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    NEW.raw_user_meta_data->>'telefono',
    v_rol::rol_usuario
  )
  ON CONFLICT (auth_id) DO NOTHING
  RETURNING id INTO v_usuario_id;

  -- Si hubo conflicto (re-confirmación de email), recuperar ID
  IF v_usuario_id IS NULL THEN
    SELECT id INTO v_usuario_id FROM usuarios WHERE auth_id = NEW.id;
  END IF;

  -- Crear perfil específico del rol
  IF v_usuario_id IS NOT NULL THEN
    IF v_rol = 'profesor' THEN
      INSERT INTO profesores (usuario_id)
      VALUES (v_usuario_id)
      ON CONFLICT (usuario_id) DO NOTHING;

    ELSIF v_rol = 'familia' THEN
      INSERT INTO familias (usuario_id)
      VALUES (v_usuario_id)
      ON CONFLICT (usuario_id) DO NOTHING;
    END IF;
    -- 'admin' y 'alumno' no necesitan perfil adicional en este flujo
  END IF;

  RETURN NEW;
END; $$;

-- El trigger ya existe en la migración 001, esta versión lo reemplaza (OR REPLACE).
-- No hace falta DROP/CREATE del trigger.

-- ───────────────────────────────────────────────────────────────
-- 3. Reparar usuarios existentes que ya se registraron sin perfil
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reparar_perfiles_faltantes()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r              RECORD;
  creados_prof   INTEGER := 0;
  creados_fam    INTEGER := 0;
BEGIN
  FOR r IN
    SELECT u.id, u.rol
    FROM   usuarios u
    WHERE  u.activo = true
      AND  u.rol IN ('profesor', 'familia')
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
END; $$;

-- Ejecutar la reparación para usuarios ya existentes
SELECT reparar_perfiles_faltantes();

-- ───────────────────────────────────────────────────────────────
-- 4. Políticas RLS: incidencias (FALTABAN COMPLETAMENTE)
-- ───────────────────────────────────────────────────────────────
CREATE POLICY "Incidencias: admin CRUD"
  ON incidencias FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

CREATE POLICY "Incidencias: usuario puede reportar"
  ON incidencias FOR INSERT TO authenticated
  WITH CHECK (reportado_por = get_usuario_id());

CREATE POLICY "Incidencias: usuario ve las suyas reportadas"
  ON incidencias FOR SELECT TO authenticated
  USING (reportado_por = get_usuario_id());

CREATE POLICY "Incidencias: usuario actualiza solo las suyas abiertas"
  ON incidencias FOR UPDATE TO authenticated
  USING (
    reportado_por = get_usuario_id()
    AND estado = 'abierta'
  )
  WITH CHECK (reportado_por = get_usuario_id());

-- ───────────────────────────────────────────────────────────────
-- 5. Políticas RLS: auditoria (faltaba INSERT)
-- ───────────────────────────────────────────────────────────────
-- SELECT ya existe en migración 001 (solo admin).
-- INSERT solo via service_role (triggers del servidor).
-- Los usuarios normales nunca deben escribir directamente en auditoria.
-- La política de INSERT para admin se añade por si se necesita log manual:

CREATE POLICY "Auditoria: admin INSERT"
  ON auditoria FOR INSERT TO authenticated
  WITH CHECK (get_rol_actual() = 'admin');

-- ───────────────────────────────────────────────────────────────
-- 6. Políticas RLS: disponibilidad (faltaban todas)
-- ───────────────────────────────────────────────────────────────
CREATE POLICY "Disponibilidad: admin CRUD"
  ON disponibilidad FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

CREATE POLICY "Disponibilidad: profesor gestiona la suya"
  ON disponibilidad FOR ALL TO authenticated
  USING (
    profesor_id IN (SELECT id FROM profesores WHERE usuario_id = get_usuario_id())
  )
  WITH CHECK (
    profesor_id IN (SELECT id FROM profesores WHERE usuario_id = get_usuario_id())
  );

CREATE POLICY "Disponibilidad: familias y alumnos ven profesores verificados"
  ON disponibilidad FOR SELECT TO authenticated
  USING (
    get_rol_actual() IN ('familia', 'alumno')
    AND profesor_id IN (
      SELECT id FROM profesores WHERE estado_verificacion = 'verificado'
    )
  );

-- ───────────────────────────────────────────────────────────────
-- 7. Políticas RLS: asignaciones (faltaban todas)
-- ───────────────────────────────────────────────────────────────
CREATE POLICY "Asignaciones: admin CRUD"
  ON asignaciones FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

CREATE POLICY "Asignaciones: profesor ve las suyas"
  ON asignaciones FOR SELECT TO authenticated
  USING (
    profesor_id IN (SELECT id FROM profesores WHERE usuario_id = get_usuario_id())
  );

CREATE POLICY "Asignaciones: familia ve las de sus hijos"
  ON asignaciones FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT a.id FROM alumnos a
      JOIN   familias f ON f.id = a.familia_id
      WHERE  f.usuario_id = get_usuario_id()
    )
  );

CREATE POLICY "Asignaciones: alumno ve las suyas"
  ON asignaciones FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE usuario_id = get_usuario_id())
  );

-- ───────────────────────────────────────────────────────────────
-- 8. Corregir política de notificaciones (conflicto FOR ALL → INSERT libre)
-- ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Notificaciones: usuario ve las suyas"   ON notificaciones;
DROP POLICY IF EXISTS "Notificaciones: admin puede crear"       ON notificaciones;

-- SELECT: cada usuario solo ve las suyas
CREATE POLICY "Notificaciones: SELECT propio"
  ON notificaciones FOR SELECT TO authenticated
  USING (usuario_id = get_usuario_id());

-- UPDATE: marcar como leída (solo la propia)
CREATE POLICY "Notificaciones: UPDATE propio (marcar leída)"
  ON notificaciones FOR UPDATE TO authenticated
  USING    (usuario_id = get_usuario_id())
  WITH CHECK (usuario_id = get_usuario_id());

-- INSERT: solo el admin puede crear notificaciones
CREATE POLICY "Notificaciones: INSERT solo admin"
  ON notificaciones FOR INSERT TO authenticated
  WITH CHECK (get_rol_actual() = 'admin');

-- ───────────────────────────────────────────────────────────────
-- 9. Verificar que las políticas FOR ALL tienen WITH CHECK implícito
--    En PostgreSQL, FOR ALL sin WITH CHECK usa la cláusula USING
--    tanto para reads como para writes. Es seguro pero dejamos
--    explícito en las más críticas:
-- ───────────────────────────────────────────────────────────────

-- Añadir WITH CHECK explícito donde falta en políticas críticas de admin
-- (para INSERT/UPDATE con datos de otros usuarios vía admin)

-- Clases: admin con WITH CHECK explícito
DROP POLICY IF EXISTS "Clases: admin ve todo" ON clases;
CREATE POLICY "Clases: admin CRUD completo"
  ON clases FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

-- Familias: admin con WITH CHECK explícito
DROP POLICY IF EXISTS "Familias: admin CRUD" ON familias;
CREATE POLICY "Familias: admin CRUD completo"
  ON familias FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

-- Alumnos: admin con WITH CHECK explícito
DROP POLICY IF EXISTS "Alumnos: admin ve todo" ON alumnos;
CREATE POLICY "Alumnos: admin CRUD completo"
  ON alumnos FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

-- Solicitudes: admin con WITH CHECK explícito
DROP POLICY IF EXISTS "Solicitudes: admin CRUD" ON solicitudes;
CREATE POLICY "Solicitudes: admin CRUD completo"
  ON solicitudes FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

-- Pagos: admin con WITH CHECK explícito
DROP POLICY IF EXISTS "Pagos: admin CRUD" ON pagos;
CREATE POLICY "Pagos: admin CRUD completo"
  ON pagos FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

-- Documentos: admin con WITH CHECK explícito
DROP POLICY IF EXISTS "Documentos: admin ve todo" ON documentos;
CREATE POLICY "Documentos: admin CRUD completo"
  ON documentos FOR ALL TO authenticated
  USING    (get_rol_actual() = 'admin')
  WITH CHECK (get_rol_actual() = 'admin');

-- ───────────────────────────────────────────────────────────────
-- 10. Función helper para generar signed URLs en el servidor
--     (usado para acceso a documentos privados)
-- ───────────────────────────────────────────────────────────────
-- NOTA: En Supabase, la generación de signed URLs desde SQL
-- requiere la extensión pg_net o llamar a la API de Storage.
-- Desde el frontend se usa: db.storage.from('documentos').createSignedUrl(path, 3600)
-- Esta función es solo documentativa — no ejecutar.

-- ───────────────────────────────────────────────────────────────
-- 11. Índices adicionales para rendimiento
-- ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_disponibilidad_prof_dia
  ON disponibilidad(profesor_id, dia_semana);

CREATE INDEX IF NOT EXISTS idx_asignaciones_alumno_activa
  ON asignaciones(alumno_id) WHERE activa = true;

CREATE INDEX IF NOT EXISTS idx_asignaciones_profesor_activa
  ON asignaciones(profesor_id) WHERE activa = true;

CREATE INDEX IF NOT EXISTS idx_incidencias_reportado
  ON incidencias(reportado_por, estado);

-- ───────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ───────────────────────────────────────────────────────────────
-- Ejecutar para comprobar que todo está correcto:
--
-- SELECT schemaname, tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- SELECT table_name, grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'authenticated';
