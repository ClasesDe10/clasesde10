# ClasesDe10 — Guía de configuración Supabase

## 1. Crear proyecto en Supabase

1. Ir a https://supabase.com → New project
2. Nombre: `clasesde10`
3. Región: **West EU (Ireland)** — la más cercana a España
4. Password: generar uno seguro y guardarlo
5. Esperar ~2 minutos a que el proyecto arranque

---

## 2. Ejecutar el schema SQL

1. En Supabase → **SQL Editor** → New query
2. Copiar el contenido de `supabase/migrations/001_schema_completo.sql`
3. Ejecutar (▶ Run)
4. Verificar que no hay errores

---

## 3. Configurar Storage (buckets)

En Supabase → **Storage** → New bucket:

### Bucket: `documentos`
- **Name:** `documentos`
- **Public:** ✅ Sí (para poder mostrar imágenes directamente)
- **File size limit:** 10 MB
- **Allowed MIME types:** `image/jpeg, image/png, image/webp, application/pdf`

Después en **Policies** del bucket `documentos`, añadir:

```sql
-- Permitir subida a usuarios autenticados (solo su propia carpeta)
CREATE POLICY "Usuarios autenticados pueden subir"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documentos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Permitir leer archivos públicos
CREATE POLICY "Archivos públicos visibles"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'documentos');

-- Permitir al admin gestionar todo
CREATE POLICY "Admin gestiona todo"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'documentos' AND
  EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
);
```

---

## 4. Configurar Auth

En Supabase → **Authentication** → **Settings**:

### Email
- **Enable email confirmations:** ✅ Sí
- **Secure email change:** ✅ Sí
- **Site URL:** `https://clasesde10.com`
- **Redirect URLs permitidas:**
  ```
  https://clasesde10.com/pages/login.html
  https://clasesde10.com/pages/reset-password.html
  http://localhost:3000/pages/login.html
  ```

### Email templates (personalizar)
En **Authentication → Email Templates**, personalizar:
- **Confirm signup** → Bienvenida a ClasesDe10
- **Reset password** → Recuperar contraseña ClasesDe10
- **Magic Link** → Acceso mágico ClasesDe10

---

## 5. Conectar con el frontend

### Obtener las keys

En Supabase → **Settings → API**:
- `Project URL` → es tu `SUPABASE_URL`
- `anon public` key → es tu `SUPABASE_ANON_KEY`

### Actualizar el archivo JS

Editar `web/js/supabase-client.js`:

```javascript
const SUPABASE_URL    = 'https://TU_PROJECT_REF.supabase.co';  // ← Poner tu URL
const SUPABASE_ANON_KEY = 'eyJhbGci...';                        // ← Poner tu anon key
```

---

## 6. Variables de entorno Netlify

En **Netlify → Site Settings → Environment Variables**, añadir:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://tu-ref.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhb...` |

---

## 7. Crear el primer usuario admin

Ejecutar en el **SQL Editor** de Supabase (tras registrarte con el email de admin):

```sql
-- Primero regístrate en la web con el email de administrador,
-- luego ejecuta esto para promoverle a admin:

UPDATE usuarios
SET rol = 'admin'
WHERE email = 'tu-email-admin@clasesde10.com';
```

---

## 8. Configurar Realtime (opcional)

Para notificaciones en tiempo real, activar Realtime en las tablas:

En Supabase → **Database → Replication**:
- Activar `notificaciones` ✅
- Activar `clases` ✅
- Activar `solicitudes` ✅
- Activar `pagos` ✅

---

## 9. Generar páginas SEO locales

```bash
# Desde la raíz del proyecto, con Node.js:
node web/clases-particulares/_generar-paginas.js

# O con Python:
python web/clases-particulares/_gen.py
```

Esto genera las 11 páginas de materias en Madrid.

---

## 10. Despliegue en Netlify

```bash
# 1. Conectar repo en Netlify
# En Netlify → Add new site → Import from Git → GitHub

# 2. Configuración de build:
# Build command: (dejar vacío — HTML estático)
# Publish directory: web/

# 3. El archivo netlify.toml ya configura:
# - Headers de seguridad (CSP, HSTS, X-Frame-Options...)
# - Cache de assets
# - Redirects

# 4. Dominio personalizado:
# Netlify → Domain management → Add custom domain
# → clasesde10.com
# → Añadir DNS en tu proveedor (registro A o CNAME)
```

---

## 11. Checklist de lanzamiento

### Base de datos
- [ ] Schema ejecutado sin errores
- [ ] RLS activado en todas las tablas
- [ ] Policies aplicadas
- [ ] Vista `v_dashboard_admin` funcionando
- [ ] Trigger comisiones funcionando

### Auth
- [ ] Confirmación email activada
- [ ] Redirect URLs configuradas
- [ ] Email templates personalizados

### Storage
- [ ] Bucket `documentos` creado
- [ ] Policies de storage configuradas

### Frontend
- [ ] `SUPABASE_URL` y `SUPABASE_ANON_KEY` actualizados en `supabase-client.js`
- [ ] Analytics configurados en `analytics.js`
- [ ] `robots.txt` y `sitemap.xml` desplegados
- [ ] Páginas SEO generadas (python/_gen.py)

### Netlify
- [ ] Dominio configurado
- [ ] HTTPS activado
- [ ] Variables de entorno añadidas
- [ ] Deploy exitoso

### Primer acceso
- [ ] Crear cuenta con email admin
- [ ] Ejecutar UPDATE para rol='admin'
- [ ] Entrar al panel admin y verificar dashboard
- [ ] Crear primer profesor de prueba
- [ ] Crear primera familia de prueba
- [ ] Crear primera clase de prueba

---

## Estructura de archivos final

```
CD10/web/
├── index.html                    ← Página principal
├── como-funciona.html
├── para-padres.html
├── para-profesores.html
├── sobre-nosotros.html
├── contacto.html
├── robots.txt                    ← SEO
├── sitemap.xml                   ← SEO
├── netlify.toml                  ← Config Netlify + headers seguridad
├── .env.example                  ← Template de variables
│
├── css/
│   ├── style.css                 ← Estilos web pública
│   ├── dashboard.css             ← Estilos dashboards
│   ├── style.css                 ← Estilos públicos globales
│   └── dashboard.css             ← Estilos de paneles
│
├── js/
│   ├── supabase-client.js        ← Cliente Supabase (EDITAR con tus keys)
│   ├── auth.js                   ← Login, registro, logout, protección rutas
│   ├── utils.js                  ← Utilidades: toast, modal, fecha, CSV...
│   ├── calendario.js             ← Componente calendario
│   ├── analytics.js              ← GA4, Clarity, Meta Pixel
│   ├── nav.js                    ← Nav/footer compartido para páginas SEO
│   └── pwa.js                    ← Registro PWA e instalación
│
├── pages/
│   ├── login.html                ← Login
│   ├── registro.html             ← Registro familias/profesores
│   └── dashboard/
│       ├── admin.html            ← Panel administrador completo
│       ├── profesor.html         ← Panel profesor completo
│       ├── familia.html          ← Panel familia completo
│       └── alumno.html           ← Panel alumno completo
│
├── clases-particulares/
│   ├── matematicas-madrid.html   ← SEO principal (ya generada)
│   ├── ingles-madrid.html        ← Generar con _gen.py
│   ├── fisica-madrid.html
│   ├── quimica-madrid.html
│   ├── lengua-madrid.html
│   ├── primaria-madrid.html
│   ├── eso-madrid.html
│   ├── bachillerato-madrid.html
│   ├── selectividad-madrid.html
│   ├── universidad-madrid.html
│   ├── biologia-madrid.html
│   ├── historia-madrid.html
│   ├── _gen.py                   ← Script generador (Python)
│   └── _generar-paginas.js       ← Script generador (Node.js)
│
└── supabase/
    └── migrations/
        └── 001_schema_completo.sql  ← Schema PostgreSQL completo
```
