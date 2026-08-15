# 📋 Guía para subir ClasesDe10 a Hostalia
## Dominio: clasesde10.com

---

## 📁 ESTRUCTURA DE ARCHIVOS QUE DEBES SUBIR

```
clasesde10/
├── index.html               ← Página de inicio
├── como-funciona.html       ← Cómo funciona
├── para-padres.html         ← Para familias
├── para-profesores.html     ← Para profesores
├── sobre-nosotros.html      ← Sobre nosotros
├── contacto.html            ← Contacto
└── css/
    ├── style.css            ← Estilos globales
    └── style.css            ← estilos globales
```

---

## 🚀 PASO A PASO EN HOSTALIA

### PASO 1 — Accede al Panel de Control
1. Ve a **https://www.hostalia.com** e inicia sesión con tu cuenta.
2. En el panel, busca el apartado **"Hosting"** o **"Mis servicios"**.
3. Haz clic en **"Administrar"** junto a tu plan de hosting.

---

### PASO 2 — Abre el Administrador de Archivos
1. Dentro del panel, busca **"Administrador de archivos"** o **"File Manager"**.
   *(También puedes usar la sección "cPanel" → "Administrador de archivos")*
2. Navega hasta la carpeta **`public_html`**.
   > ⚠️ Esta es la carpeta raíz de tu dominio. Todo lo que subas aquí será accesible en clasesde10.com

---

### PASO 3 — Sube los archivos
**Opción A — Subida desde el Administrador de archivos (más fácil):**
1. Dentro de `public_html`, haz clic en **"Subir"** o **"Upload"**.
2. Sube el archivo **clasesde10.zip** que te he preparado.
3. Una vez subido, haz clic derecho sobre el ZIP y selecciona **"Extraer"**.
4. Asegúrate de que los archivos quedan directamente en `public_html/`, NO dentro de una subcarpeta.

**Opción B — Por FTP (si tienes FileZilla u otro cliente FTP):**
1. En Hostalia, busca los datos FTP: servidor, usuario y contraseña.
   *(Panel → Hosting → FTP o "Cuentas FTP")*
2. Conéctate con FileZilla a:
   - **Servidor:** ftp.clasesde10.com (o el que te indique Hostalia)
   - **Puerto:** 21
3. Arrastra todos los archivos de la carpeta `clasesde10/` a `public_html/`.

---

### PASO 4 — Estructura correcta en public_html
Después de subir, dentro de `public_html` debes tener:
```
public_html/
├── index.html
├── como-funciona.html
├── para-padres.html
├── para-profesores.html
├── sobre-nosotros.html
├── contacto.html
└── css/
    ├── style.css
    └── style.css
```
> ✅ Si abres clasesde10.com en el navegador y ves la web → ¡Todo correcto!

---

### PASO 5 — Apuntar el dominio clasesde10.com al hosting
Si el dominio ya está registrado en Hostalia con el mismo plan, es automático.

Si el dominio está en otro registrador (Dondominio, OVH, etc.):
1. Ve al panel del registrador y busca **"DNS" o "Nameservers"**.
2. Cambia los nameservers a los de Hostalia (te los indican en tu panel, suelen ser algo como `ns1.hostalia.com` y `ns2.hostalia.com`).
3. Espera entre **1 y 24 horas** para que se propague el cambio.

---

### PASO 6 — Activar HTTPS (SSL gratuito)
1. En el panel de Hostalia, busca **"SSL"** o **"Certificado SSL"**.
2. Activa el certificado **Let's Encrypt** (gratuito) para `clasesde10.com` y `clasesde10.com`.
3. Una vez activo, activa la opción **"Redirigir HTTP a HTTPS"** si está disponible.
   *(Si no está disponible, se puede hacer con un archivo .htaccess — ver abajo)*

---

## ⚙️ ARCHIVO .htaccess RECOMENDADO
Crea un archivo llamado `.htaccess` en `public_html/` con este contenido para redirigir HTTP→HTTPS y www→sin www:

```apache
Options -Indexes

# Redirigir HTTP a HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Redirigir www a sin www
RewriteCond %{HTTP_HOST} ^www\.clasesde10\.es [NC]
RewriteRule ^(.*)$ https://clasesde10.com/$1 [L,R=301]

# Página de error 404
ErrorDocument 404 /index.html
```

---

## ✅ CHECKLIST FINAL

- [ ] Archivos subidos a `public_html/` (no en subcarpeta)
- [ ] `css/style.css` accesible en `clasesde10.com/css/style.css`
- [ ] El dominio apunta al hosting de Hostalia
- [ ] SSL activado (https:// funciona)
- [ ] Redirección http→https activa
- [ ] Abre `clasesde10.com` en el navegador y se ve la web
- [ ] Comprueba que los menús de navegación funcionan
- [ ] Comprueba que se ve bien en el móvil

---

## ❓ PROBLEMAS FRECUENTES

| Problema | Solución |
|---|---|
| La web carga pero sin estilos | Comprueba que la carpeta `css/` está dentro de `public_html/` |
| El dominio no carga | Espera la propagación DNS (hasta 24h) |
| Error 403 | Revisa los permisos: carpetas en 755, archivos en 644 |
| El logo no carga | Es normal si WordPress.com bloquea la URL; contacta para cambiarla por el logo descargado |
| Formularios no envían email | Los formularios actuales son visuales; para envío real necesitas configurar un servicio como Formspree o EmailJS |

---

## 📬 PARA QUE LOS FORMULARIOS ENVÍEN EMAILS DE VERDAD
Los formularios actuales muestran confirmación visual pero no envían email al servidor.
Para activarlo sin programación backend, usa **Formspree** (gratis):

1. Regístrate en https://formspree.io con tu email
2. Crea un nuevo formulario y copia tu endpoint (ej: `https://formspree.io/f/xxxxxxxx`)
3. En cada archivo HTML, cambia la línea del botón submit por un `<form>` real:
   ```html
   <form action="https://formspree.io/f/TU_ID" method="POST">
     <!-- tus campos aquí -->
     <button type="submit">Enviar</button>
   </form>
   ```
4. Los mensajes llegarán a `contacto.clasesde10@gmail.com`

---

*Guía preparada para ClasesDe10 · clasesde10.com*
