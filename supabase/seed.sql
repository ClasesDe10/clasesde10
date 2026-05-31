-- ═══════════════════════════════════════════════════════════════
-- ClasesDe10 — Seed de datos para desarrollo/testing
-- NO ejecutar en producción con datos reales
-- ═══════════════════════════════════════════════════════════════

-- NOTA: Los usuarios de auth los crea Supabase al registrarse.
-- Este seed solo inserta datos de prueba en las tablas de la app.
-- Primero debes registrar los usuarios desde la web o el Dashboard de Auth.

-- ── CONFIGURACIÓN INICIAL ────────────────────────────────────────
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('comision_defecto',      '20',           'Comisión estándar (%) de ClasesDe10'),
  ('precio_hora_minimo',    '15',           'Tarifa mínima por hora (€)'),
  ('precio_hora_maximo',    '60',           'Tarifa máxima por hora (€)'),
  ('email_soporte',         'hola@clasesde10.es', 'Email soporte'),
  ('whatsapp_soporte',      '34600000000',  'WhatsApp soporte'),
  ('dias_aviso_clase',      '1',            'Días de antelación para aviso'),
  ('max_docs_por_usuario',  '10',           'Máximo documentos por usuario'),
  ('tamano_max_doc_mb',     '10',           'Tamaño máximo documento (MB)')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

-- ── INSTRUCCIONES PARA SEED MANUAL ──────────────────────────────
/*
Pasos para crear datos de prueba:

1. CREAR USUARIO ADMIN:
   - Regístrate en /pages/registro.html con tu email de admin
   - Ve a Supabase SQL Editor y ejecuta:
     UPDATE usuarios SET rol = 'admin' WHERE email = 'tu-admin@email.com';

2. CREAR PROFESOR DE PRUEBA:
   - Regístrate como profesor en /pages/registro.html
   - El admin verifica el perfil desde el panel

3. CREAR FAMILIA DE PRUEBA:
   - Regístrate como familia en /pages/registro.html
   - Añade un hijo desde el panel de familia

4. ASIGNAR PROFESOR:
   - La familia crea una solicitud
   - El admin asigna el profesor desde su panel

5. CREAR CLASES:
   - El admin crea clases desde el panel administrador
*/

-- ── EJEMPLO: Datos de prueba (ejecutar solo en desarrollo) ────────
/*
-- Solo si ya tienes usuarios creados con sus auth_id reales:

-- Verificar un profesor de prueba (cambiar el email real)
UPDATE profesores p
SET estado_verificacion = 'verificado',
    materias = ARRAY['Matemáticas', 'Física'],
    niveles_educativos = ARRAY['ESO', 'Bachillerato'],
    comision_porcentaje = 20,
    tarifa_hora = 25,
    ciudad = 'Madrid'
FROM usuarios u
WHERE p.usuario_id = u.id AND u.email = 'profesor@test.com';

-- Crear una clase de ejemplo
INSERT INTO clases (alumno_id, profesor_id, materia, fecha, hora_inicio, hora_fin, precio_total, estado)
SELECT
  a.id,
  pr.id,
  'Matemáticas',
  CURRENT_DATE + INTERVAL '2 days',
  '17:00',
  '18:00',
  25.00,
  'programada'
FROM alumnos a
JOIN asignaciones asi ON asi.alumno_id = a.id
JOIN profesores pr ON pr.id = asi.profesor_id
LIMIT 1;
*/
