-- ═══════════════════════════════════════════════════════════════
-- ClasesDe10 — Schema completo PostgreSQL / Supabase
-- Versión: 1.0.0
-- ═══════════════════════════════════════════════════════════════

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- búsqueda fuzzy

-- ───────────────────────────────────────────────────────────────
-- ENUMS
-- ───────────────────────────────────────────────────────────────
CREATE TYPE rol_usuario     AS ENUM ('admin','profesor','familia','alumno');
CREATE TYPE estado_clase     AS ENUM ('programada','realizada','cancelada','reprogramada');
CREATE TYPE estado_doc       AS ENUM ('pendiente','validado','rechazado');
CREATE TYPE estado_solicitud AS ENUM ('nueva','asignada','cancelada','completada');
CREATE TYPE estado_pago      AS ENUM ('pendiente','validado','rechazado');
CREATE TYPE estado_incidencia AS ENUM ('abierta','en_proceso','resuelta','cerrada');
CREATE TYPE prioridad_inc    AS ENUM ('baja','media','alta','urgente');
CREATE TYPE tipo_notif       AS ENUM ('info','exito','advertencia','error');
CREATE TYPE estado_verificacion AS ENUM ('pendiente','verificado','rechazado');
CREATE TYPE tipo_documento   AS ENUM ('dni','titulo','curriculum','justificante_pago','contrato','otro');

-- ───────────────────────────────────────────────────────────────
-- TABLA USUARIOS (base para todos los roles)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT UNIQUE NOT NULL,
  nombre      TEXT NOT NULL,
  apellidos   TEXT NOT NULL,
  telefono    TEXT,
  rol         rol_usuario NOT NULL DEFAULT 'familia',
  activo      BOOLEAN NOT NULL DEFAULT true,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_auth_id ON usuarios(auth_id);
CREATE INDEX idx_usuarios_rol     ON usuarios(rol);
CREATE INDEX idx_usuarios_email   ON usuarios(email);
CREATE INDEX idx_usuarios_trgm    ON usuarios USING GIN ((nombre || ' ' || apellidos) gin_trgm_ops);

-- ───────────────────────────────────────────────────────────────
-- TABLA PROFESORES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profesores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            UUID UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dni                   TEXT,
  fecha_nacimiento      DATE,
  direccion             TEXT,
  ciudad                TEXT DEFAULT 'Madrid',
  codigo_postal         TEXT,
  nivel_estudios        TEXT,
  universidad           TEXT,
  especialidades        TEXT[] DEFAULT '{}',
  materias              TEXT[] DEFAULT '{}',
  niveles_educativos    TEXT[] DEFAULT '{}',
  tarifa_hora           DECIMAL(8,2),
  comision_porcentaje   DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  iban                  TEXT,
  bio                   TEXT,
  estado_verificacion   estado_verificacion NOT NULL DEFAULT 'pendiente',
  notas_admin           TEXT,
  fecha_alta            DATE DEFAULT CURRENT_DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profesores_usuario ON profesores(usuario_id);
CREATE INDEX idx_profesores_estado  ON profesores(estado_verificacion);
CREATE INDEX idx_profesores_ciudad  ON profesores(ciudad);

-- ───────────────────────────────────────────────────────────────
-- TABLA FAMILIAS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS familias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  direccion       TEXT,
  ciudad          TEXT DEFAULT 'Madrid',
  codigo_postal   TEXT,
  como_nos_conocio TEXT,
  notas_admin     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_familias_usuario ON familias(usuario_id);

-- ───────────────────────────────────────────────────────────────
-- TABLA ALUMNOS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alumnos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- NULL si < 16 años
  familia_id        UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  apellidos         TEXT NOT NULL,
  fecha_nacimiento  DATE,
  nivel_educativo   TEXT,
  curso             TEXT,
  colegio           TEXT,
  materias_necesita TEXT[] DEFAULT '{}',
  notas_admin       TEXT,
  activo            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alumnos_familia  ON alumnos(familia_id);
CREATE INDEX idx_alumnos_usuario  ON alumnos(usuario_id);
CREATE INDEX idx_alumnos_activo   ON alumnos(activo);

-- ───────────────────────────────────────────────────────────────
-- TABLA ASIGNACIONES (profesor ↔ alumno)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asignaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id  UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  alumno_id    UUID NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
  materia      TEXT NOT NULL,
  activa       BOOLEAN NOT NULL DEFAULT true,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin    DATE,
  tarifa_hora  DECIMAL(8,2),
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profesor_id, alumno_id, materia)
);

CREATE INDEX idx_asignaciones_profesor ON asignaciones(profesor_id);
CREATE INDEX idx_asignaciones_alumno   ON asignaciones(alumno_id);

-- ───────────────────────────────────────────────────────────────
-- TABLA DISPONIBILIDAD PROFESORES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disponibilidad (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
  dia_semana  SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=Lun, 6=Dom
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (hora_fin > hora_inicio)
);

CREATE INDEX idx_disponibilidad_profesor ON disponibilidad(profesor_id);

-- ───────────────────────────────────────────────────────────────
-- TABLA SOLICITUDES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id           UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  alumno_id            UUID REFERENCES alumnos(id) ON DELETE SET NULL,
  materia              TEXT NOT NULL,
  nivel                TEXT,
  preferencia_horario  TEXT,
  observaciones        TEXT,
  estado               estado_solicitud NOT NULL DEFAULT 'nueva',
  profesor_asignado_id UUID REFERENCES profesores(id) ON DELETE SET NULL,
  fecha_asignacion     TIMESTAMPTZ,
  notas_admin          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_solicitudes_familia ON solicitudes(familia_id);
CREATE INDEX idx_solicitudes_estado  ON solicitudes(estado);
CREATE INDEX idx_solicitudes_fecha   ON solicitudes(created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- TABLA CLASES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clases (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id            UUID NOT NULL REFERENCES alumnos(id) ON DELETE RESTRICT,
  profesor_id          UUID NOT NULL REFERENCES profesores(id) ON DELETE RESTRICT,
  asignacion_id        UUID REFERENCES asignaciones(id) ON DELETE SET NULL,
  materia              TEXT NOT NULL,
  fecha                DATE NOT NULL,
  hora_inicio          TIME NOT NULL,
  hora_fin             TIME NOT NULL,
  duracion_minutos     INTEGER GENERATED ALWAYS AS (
                         EXTRACT(EPOCH FROM (hora_fin - hora_inicio))::INTEGER / 60
                       ) STORED,
  precio_total         DECIMAL(8,2),
  comision_clasesde10  DECIMAL(8,2),
  importe_profesor     DECIMAL(8,2),
  estado               estado_clase NOT NULL DEFAULT 'programada',
  observaciones        TEXT,
  notas_profesor       TEXT,
  cancelacion_motivo   TEXT,
  reprogramada_de      UUID REFERENCES clases(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (hora_fin > hora_inicio),
  CHECK (precio_total IS NULL OR (comision_clasesde10 + importe_profesor = precio_total))
);

CREATE INDEX idx_clases_alumno   ON clases(alumno_id);
CREATE INDEX idx_clases_profesor ON clases(profesor_id);
CREATE INDEX idx_clases_fecha    ON clases(fecha DESC);
CREATE INDEX idx_clases_estado   ON clases(estado);

-- ───────────────────────────────────────────────────────────────
-- TABLA PAGOS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id       UUID NOT NULL REFERENCES familias(id) ON DELETE RESTRICT,
  clase_id         UUID REFERENCES clases(id) ON DELETE SET NULL,
  monto            DECIMAL(8,2) NOT NULL,
  metodo           TEXT NOT NULL DEFAULT 'bizum',
  referencia       TEXT,
  estado           estado_pago NOT NULL DEFAULT 'pendiente',
  notas_familia    TEXT,
  notas_admin      TEXT,
  validado_por     UUID REFERENCES usuarios(id),
  fecha_validacion TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_familia ON pagos(familia_id);
CREATE INDEX idx_pagos_estado  ON pagos(estado);
CREATE INDEX idx_pagos_fecha   ON pagos(created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- TABLA DOCUMENTOS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo         tipo_documento NOT NULL,
  nombre       TEXT NOT NULL,
  url          TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tamano_bytes INTEGER,
  mime_type    TEXT,
  estado       estado_doc NOT NULL DEFAULT 'pendiente',
  notas_admin  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documentos_usuario ON documentos(usuario_id);
CREATE INDEX idx_documentos_estado  ON documentos(estado);
CREATE INDEX idx_documentos_tipo    ON documentos(tipo);

-- ───────────────────────────────────────────────────────────────
-- TABLA INCIDENCIAS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidencias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reportado_por    UUID NOT NULL REFERENCES usuarios(id),
  relacionado_con  UUID REFERENCES usuarios(id),
  clase_id         UUID REFERENCES clases(id),
  tipo             TEXT,
  descripcion      TEXT NOT NULL,
  estado           estado_incidencia NOT NULL DEFAULT 'abierta',
  prioridad        prioridad_inc NOT NULL DEFAULT 'media',
  resolucion       TEXT,
  resuelta_por     UUID REFERENCES usuarios(id),
  fecha_resolucion TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidencias_estado    ON incidencias(estado);
CREATE INDEX idx_incidencias_prioridad ON incidencias(prioridad);
CREATE INDEX idx_incidencias_reporter  ON incidencias(reportado_por);

-- ───────────────────────────────────────────────────────────────
-- TABLA NOTIFICACIONES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL,
  mensaje    TEXT NOT NULL,
  tipo       tipo_notif NOT NULL DEFAULT 'info',
  leida      BOOLEAN NOT NULL DEFAULT false,
  url_accion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_usuario ON notificaciones(usuario_id);
CREATE INDEX idx_notif_leida   ON notificaciones(usuario_id, leida) WHERE leida = false;

-- ───────────────────────────────────────────────────────────────
-- TABLA AUDITORÍA
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       UUID REFERENCES usuarios(id),
  accion           TEXT NOT NULL,
  tabla_afectada   TEXT,
  registro_id      UUID,
  datos_anteriores JSONB,
  datos_nuevos     JSONB,
  ip               INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_tabla   ON auditoria(tabla_afectada);
CREATE INDEX idx_auditoria_fecha   ON auditoria(created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- TABLA CONFIGURACIÓN
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave       TEXT UNIQUE NOT NULL,
  valor       TEXT,
  descripcion TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────
-- TRIGGERS — updated_at automático
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios','profesores','familias','alumnos','solicitudes',
                            'clases','pagos','documentos','incidencias'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────
-- TRIGGER — Calcular comisiones automáticamente al crear/actualizar clase
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calcular_comision_clase()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_comision_pct DECIMAL;
BEGIN
  IF NEW.precio_total IS NOT NULL THEN
    SELECT comision_porcentaje INTO v_comision_pct
    FROM profesores WHERE id = NEW.profesor_id;

    NEW.comision_clasesde10 := ROUND(NEW.precio_total * (v_comision_pct / 100), 2);
    NEW.importe_profesor    := NEW.precio_total - NEW.comision_clasesde10;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_clases_comision
  BEFORE INSERT OR UPDATE OF precio_total ON clases
  FOR EACH ROW EXECUTE FUNCTION calcular_comision_clase();

-- ───────────────────────────────────────────────────────────────
-- TRIGGER — Crear perfil al registrar usuario en auth
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usuarios (auth_id, email, nombre, apellidos, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'familia')::rol_usuario
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ───────────────────────────────────────────────────────────────
-- VISTAS ÚTILES
-- ───────────────────────────────────────────────────────────────

-- Vista: clases con datos completos
CREATE OR REPLACE VIEW v_clases_completas AS
SELECT
  c.*,
  a.nombre   || ' ' || a.apellidos AS alumno_nombre,
  a.nivel_educativo, a.curso,
  up.nombre  || ' ' || up.apellidos AS profesor_nombre,
  up.telefono AS profesor_telefono,
  f.id AS familia_id,
  uf.nombre  || ' ' || uf.apellidos AS familia_nombre
FROM clases c
JOIN alumnos a    ON a.id = c.alumno_id
JOIN familias f   ON f.id = a.familia_id
JOIN usuarios uf  ON uf.id = f.usuario_id
JOIN profesores p ON p.id = c.profesor_id
JOIN usuarios up  ON up.id = p.usuario_id;

-- Vista: resumen mensual por profesor
CREATE OR REPLACE VIEW v_resumen_profesor_mes AS
SELECT
  p.id AS profesor_id,
  u.nombre || ' ' || u.apellidos AS profesor_nombre,
  date_trunc('month', c.fecha) AS mes,
  COUNT(*)                        AS total_clases,
  SUM(c.duracion_minutos)         AS total_minutos,
  SUM(c.precio_total)             AS total_facturado,
  SUM(c.comision_clasesde10)      AS total_comision,
  SUM(c.importe_profesor)         AS total_profesor
FROM clases c
JOIN profesores p ON p.id = c.profesor_id
JOIN usuarios u   ON u.id = p.usuario_id
WHERE c.estado = 'realizada'
GROUP BY p.id, u.nombre, u.apellidos, date_trunc('month', c.fecha);

-- Vista: dashboard admin
CREATE OR REPLACE VIEW v_dashboard_admin AS
SELECT
  (SELECT COUNT(*) FROM usuarios WHERE rol = 'profesor' AND activo) AS profesores_activos,
  (SELECT COUNT(*) FROM usuarios WHERE rol = 'familia'  AND activo) AS familias_activas,
  (SELECT COUNT(*) FROM alumnos  WHERE activo)                      AS alumnos_activos,
  (SELECT COUNT(*) FROM clases   WHERE date_trunc('month', fecha) = date_trunc('month', NOW())) AS clases_mes,
  (SELECT COALESCE(SUM(precio_total),0) FROM clases WHERE date_trunc('month', fecha) = date_trunc('month', NOW()) AND estado = 'realizada') AS ingresos_mes,
  (SELECT COALESCE(SUM(comision_clasesde10),0) FROM clases WHERE date_trunc('month', fecha) = date_trunc('month', NOW()) AND estado = 'realizada') AS comisiones_mes,
  (SELECT COUNT(*) FROM incidencias WHERE estado = 'abierta')       AS incidencias_abiertas,
  (SELECT COUNT(*) FROM solicitudes WHERE estado = 'nueva')         AS solicitudes_nuevas,
  (SELECT COUNT(*) FROM pagos WHERE estado = 'pendiente')           AS pagos_pendientes;

-- ───────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ───────────────────────────────────────────────────────────────
ALTER TABLE usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE familias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE alumnos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE disponibilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria     ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_rol_actual()
RETURNS rol_usuario LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT rol FROM usuarios WHERE auth_id = auth.uid()
$$;

-- Helper: obtener ID de usuario actual
CREATE OR REPLACE FUNCTION get_usuario_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM usuarios WHERE auth_id = auth.uid()
$$;

-- ─── POLÍTICAS: usuarios ───
CREATE POLICY "Usuarios: admin ve todo"
  ON usuarios FOR SELECT TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Usuarios: propio registro"
  ON usuarios FOR SELECT TO authenticated
  USING (auth_id = auth.uid());

CREATE POLICY "Usuarios: actualizar propio"
  ON usuarios FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid() AND rol = (SELECT rol FROM usuarios WHERE auth_id = auth.uid()));

-- ─── POLÍTICAS: profesores ───
CREATE POLICY "Profesores: admin CRUD"
  ON profesores FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Profesores: propio perfil"
  ON profesores FOR SELECT TO authenticated
  USING (usuario_id = get_usuario_id());

CREATE POLICY "Profesores: actualizar propio"
  ON profesores FOR UPDATE TO authenticated
  USING (usuario_id = get_usuario_id())
  WITH CHECK (usuario_id = get_usuario_id());

CREATE POLICY "Profesores: familias ven verificados"
  ON profesores FOR SELECT TO authenticated
  USING (get_rol_actual() = 'familia' AND estado_verificacion = 'verificado');

-- ─── POLÍTICAS: familias ───
CREATE POLICY "Familias: admin CRUD"
  ON familias FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Familias: propio perfil"
  ON familias FOR ALL TO authenticated
  USING (usuario_id = get_usuario_id());

-- ─── POLÍTICAS: alumnos ───
CREATE POLICY "Alumnos: admin ve todo"
  ON alumnos FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Alumnos: familia ve sus hijos"
  ON alumnos FOR ALL TO authenticated
  USING (
    familia_id IN (SELECT id FROM familias WHERE usuario_id = get_usuario_id())
  );

CREATE POLICY "Alumnos: profesor ve sus alumnos"
  ON alumnos FOR SELECT TO authenticated
  USING (
    get_rol_actual() = 'profesor' AND
    id IN (SELECT alumno_id FROM asignaciones WHERE profesor_id = (
      SELECT id FROM profesores WHERE usuario_id = get_usuario_id()
    ))
  );

CREATE POLICY "Alumnos: propio perfil"
  ON alumnos FOR SELECT TO authenticated
  USING (usuario_id = get_usuario_id());

-- ─── POLÍTICAS: clases ───
CREATE POLICY "Clases: admin ve todo"
  ON clases FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Clases: profesor ve las suyas"
  ON clases FOR SELECT TO authenticated
  USING (
    profesor_id IN (SELECT id FROM profesores WHERE usuario_id = get_usuario_id())
  );

CREATE POLICY "Clases: profesor puede registrar realizada"
  ON clases FOR UPDATE TO authenticated
  USING (
    profesor_id IN (SELECT id FROM profesores WHERE usuario_id = get_usuario_id())
  )
  WITH CHECK (
    profesor_id IN (SELECT id FROM profesores WHERE usuario_id = get_usuario_id())
    AND estado IN ('realizada','cancelada')
  );

CREATE POLICY "Clases: familia ve clases de sus hijos"
  ON clases FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT a.id FROM alumnos a
      JOIN familias f ON f.id = a.familia_id
      WHERE f.usuario_id = get_usuario_id()
    )
  );

CREATE POLICY "Clases: alumno ve las suyas"
  ON clases FOR SELECT TO authenticated
  USING (
    alumno_id IN (SELECT id FROM alumnos WHERE usuario_id = get_usuario_id())
  );

-- ─── POLÍTICAS: solicitudes ───
CREATE POLICY "Solicitudes: admin CRUD"
  ON solicitudes FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Solicitudes: familia CRUD propio"
  ON solicitudes FOR ALL TO authenticated
  USING (
    familia_id IN (SELECT id FROM familias WHERE usuario_id = get_usuario_id())
  );

-- ─── POLÍTICAS: pagos ───
CREATE POLICY "Pagos: admin CRUD"
  ON pagos FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Pagos: familia ve y crea los suyos"
  ON pagos FOR ALL TO authenticated
  USING (
    familia_id IN (SELECT id FROM familias WHERE usuario_id = get_usuario_id())
  );

-- ─── POLÍTICAS: documentos ───
CREATE POLICY "Documentos: admin ve todo"
  ON documentos FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

CREATE POLICY "Documentos: usuario ve los suyos"
  ON documentos FOR ALL TO authenticated
  USING (usuario_id = get_usuario_id());

-- ─── POLÍTICAS: notificaciones ───
CREATE POLICY "Notificaciones: usuario ve las suyas"
  ON notificaciones FOR ALL TO authenticated
  USING (usuario_id = get_usuario_id());

CREATE POLICY "Notificaciones: admin puede crear"
  ON notificaciones FOR INSERT TO authenticated
  WITH CHECK (get_rol_actual() = 'admin');

-- ─── POLÍTICAS: auditoria ───
CREATE POLICY "Auditoria: solo admin"
  ON auditoria FOR SELECT TO authenticated
  USING (get_rol_actual() = 'admin');

-- ─── POLÍTICAS: configuracion ───
CREATE POLICY "Configuracion: solo admin"
  ON configuracion FOR ALL TO authenticated
  USING (get_rol_actual() = 'admin');

-- ───────────────────────────────────────────────────────────────
-- DATOS INICIALES
-- ───────────────────────────────────────────────────────────────
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('comision_defecto',      '20',                          'Comisión estándar (%) de ClasesDe10'),
  ('precio_hora_minimo',    '15',                          'Tarifa mínima por hora (€)'),
  ('precio_hora_maximo',    '60',                          'Tarifa máxima por hora (€)'),
  ('email_soporte',         'contacto.clasesde10@gmail.com', 'Email de contacto soporte'),
  ('whatsapp_soporte',      '34600000000',                 'WhatsApp soporte'),
  ('dias_aviso_clase',      '1',                           'Días de antelación para aviso de clase'),
  ('max_docs_por_usuario',  '10',                          'Máximo documentos por usuario'),
  ('tamano_max_doc_mb',     '10',                          'Tamaño máximo documento (MB)')
ON CONFLICT (clave) DO NOTHING;
