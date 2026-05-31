# 🚀 Guía para subir ClasesDe10 a Netlify
## Dominio: clasesde10.es

---

## ✅ OPCIÓN MÁS FÁCIL — Arrastrar y soltar (sin cuenta técnica)

### PASO 1 — Descomprime el ZIP
1. Descarga el archivo `clasesde10_completo.zip`
2. Descomprímelo en tu ordenador
3. Verás una carpeta llamada `clasesde10/` con todos los archivos dentro

---

### PASO 2 — Sube la carpeta a Netlify
1. Ve a **https://app.netlify.com**
2. Inicia sesión (o crea cuenta gratis si no tienes)
3. En el panel principal verás una zona que dice:
   > **"Want to deploy a new site without connecting to Git? Drag and drop your site output folder here"**
4. **Arrastra la carpeta `clasesde10/`** directamente a esa zona
5. Netlify sube todo automáticamente en segundos ✅

---

### PASO 3 — Tu web ya está online
Netlify te dará una URL temporal del tipo:
`https://nombre-aleatorio-123.netlify.app`

Ábrela y comprueba que todo se ve bien.

---

## 🌐 PASO 4 — Conectar tu dominio clasesde10.es

### 4a — Añadir el dominio en Netlify
1. En tu panel de Netlify, entra a tu sitio recién creado
2. Ve a **Site settings → Domain management → Add custom domain**
3. Escribe `clasesde10.es` y haz clic en **Verify** → **Add domain**
4. Añade también `www.clasesde10.es`

---

### 4b — Apuntar el dominio a Netlify (en tu registrador)
Netlify te dará sus **nameservers** (algo como):
```
dns1.p0X.nsone.net
dns2.p0X.nsone.net
dns3.p0X.nsone.net
dns4.p0X.nsone.net
```

Entra al panel donde tienes registrado `clasesde10.es` (Hostalia, Nominalia, Dondominio, etc.) y:
1. Busca **"DNS"** o **"Nameservers"** para el dominio
2. Cambia los nameservers actuales por los 4 de Netlify
3. Guarda los cambios
4. Espera entre **1 y 24 horas** para que se propague

> 💡 **Alternativa más rápida sin cambiar nameservers:**
> En lugar de cambiar nameservers, puedes añadir un **registro A** apuntando a `75.2.60.5` y un **CNAME** de `www` apuntando a `apex-loadbalancer.netlify.com`. Pregunta en Hostalia cuál es más cómodo para ti.

---

## 🔒 PASO 5 — Activar HTTPS (SSL gratuito automático)

En Netlify el SSL es **automático y gratuito**.

1. Ve a **Site settings → Domain management → HTTPS**
2. Haz clic en **"Verify DNS configuration"**
3. Cuando el dominio esté propagado, aparecerá el botón **"Provision certificate"**
4. Haz clic y listo — Netlify instala el SSL en segundos

> ✅ Netlify también activa automáticamente la redirección HTTP → HTTPS. No necesitas .htaccess.

---

## 📬 PASO 6 — Activar los formularios (para recibir emails)

Los formularios de la web actualmente muestran confirmación visual pero no envían emails.
Tienes dos opciones fáciles:

### Opción A — Netlify Forms (integrado, 100 envíos/mes gratis)
Añade `netlify` al tag `<form>` en cada formulario de los HTML:
```html
<form name="contacto" method="POST" data-netlify="true">
  <input type="hidden" name="form-name" value="contacto">
  <!-- resto de campos -->
</form>
```
Los mensajes llegan directamente a tu panel de Netlify y puedes configurar notificaciones por email desde:
**Site settings → Forms → Form notifications → Add notification → Email notification**

### Opción B — Formspree (más fácil, sin tocar código)
1. Regístrate gratis en **https://formspree.io**
2. Crea un formulario y copia tu endpoint: `https://formspree.io/f/XXXXXXXX`
3. Cambia el botón de cada formulario para que use ese endpoint
4. Los mensajes llegan a `contacto.clasesde10@gmail.com`

---

## 🔄 CÓMO ACTUALIZAR LA WEB EN EL FUTURO

Cuando quieras cambiar algo y volver a subir:
1. Modifica los archivos HTML en tu ordenador
2. Ve a tu sitio en Netlify → **Deploys**
3. Arrastra de nuevo la carpeta `clasesde10/` a la zona de deploys
4. Netlify actualiza la web en segundos, sin borrar nada

---

## ✅ CHECKLIST FINAL

- [ ] Carpeta subida a Netlify (arrastrar y soltar)
- [ ] La URL temporal de Netlify funciona y se ve bien
- [ ] Dominio `clasesde10.es` añadido en Netlify
- [ ] Nameservers o registros DNS apuntando a Netlify
- [ ] SSL activado (https:// funciona)
- [ ] Formularios configurados para recibir emails
- [ ] Comprobado en móvil que todo se ve bien

---

## ❓ PROBLEMAS FRECUENTES EN NETLIFY

| Problema | Solución |
|---|---|
| La web carga sin estilos | Asegúrate de subir la carpeta entera, no solo los HTML |
| El dominio no carga | Espera la propagación DNS (hasta 24h) y verifica en netlify |
| SSL no se activa | El DNS tiene que estar propagado primero |
| Logo no carga | WordPress.com puede bloquear la imagen; descárgala y súbela en `img/logo.png` |
| Formularios sin respuesta | Configura Netlify Forms o Formspree como se indica arriba |

---

*Guía preparada para ClasesDe10 · clasesde10.es · Netlify*
