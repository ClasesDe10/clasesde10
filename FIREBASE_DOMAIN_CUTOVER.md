# FIREBASE_DOMAIN_CUTOVER - ClasesDe10

Actualizado: 2026-06-25 17:39 Europe/Madrid

## Objetivo

Mover `clasesde10.com` de Netlify a Firebase Hosting sin activar facturacion.

## Estado actual

- Web Firebase publicada: `https://clasesde10-50add.web.app`
- Sitio Firebase Hosting: `clasesde10-50add`
- Dominio principal creado en Firebase Hosting: `clasesde10.com`
- Dominio `www` creado en Firebase Hosting con redireccion a `clasesde10.com`
- DNS editado en Hostalia el 2026-06-25:
  - `clasesde10.com A 199.36.158.100`
  - `clasesde10.com TXT hosting-site=clasesde10-50add`
  - `_acme-challenge.clasesde10.com TXT XAfVmRmiMZI3ICQ5vmvyAXCJLzFeYJeIM-wqzeLmw4E` (valor antiguo, Firebase lo roto despues)
  - `www.clasesde10.com CNAME clasesde10-50add.web.app`
  - `_acme-challenge.www.clasesde10.com TXT oM7tJOt3sa5uZ9bMLqLrvazj6C-C12TaYH01cAsSePg` (valor antiguo, Firebase lo roto despues)
- Verificacion autoritativa:
  - `clasesde10.com A` ya responde `199.36.158.100` en `ns10`, `ns11` y `ns12`.
  - `clasesde10.com TXT hosting-site=clasesde10-50add` ya responde en `ns10`, `ns11` y `ns12`.
  - `www.clasesde10.com CNAME clasesde10-50add.web.app` ya responde en `ns10`, `ns11` y `ns12`.
  - Los dos `_acme-challenge` ya responden correctamente en resolvers publicos tras la actualizacion de Hostalia.
- Estado Firebase API a las 17:16 Europe/Madrid:
  - `clasesde10.com`: `hostState=HOST_MISMATCH`, `ownershipState=OWNERSHIP_MISSING`, `cert=CERT_VALIDATING`.
  - `www.clasesde10.com`: `hostState=HOST_MISMATCH`, `ownershipState=OWNERSHIP_MISSING`, `cert=CERT_VALIDATING`.
  - Firebase pidio estos TXT ACME actuales, ya actualizados en Hostalia a las 17:39 Europe/Madrid:
    - `_acme-challenge TXT s05n1RCrYwkepmrS7GpQerXvilgBdwBtY2khK8WN89E`
    - `_acme-challenge.www TXT LtpaKSyfq73psiVycwKtmzgclH__jL0Ytdj52bR2mIU`
- Estado web temporal:
  - `https://clasesde10-50add.web.app` esta publicado.
  - `https://clasesde10.com` y `https://www.clasesde10.com` pueden fallar certificado, mostrar 404 temporal de Firebase o seguir sirviendo cache/Netlify hasta que Firebase complete la transferencia de propiedad y emita certificado.
  - Firebase Hosting puede tardar hasta 24 horas en transferir propiedad y activar SSL tras detectar los DNS correctos.

## DNS previo detectado

- Nameservers:
  - `ns10.servicio-online.net`
  - `ns11.servicio-online.net`
  - `ns12.servicio-online.net`
- `clasesde10.com`:
  - `A 75.2.60.5` -> Netlify, debe eliminarse.
  - `TXT v=spf1 redirect=spf.dominioabsoluto.net` -> conservar.
  - `MX mx.clasesde10.com` prioridad `10` -> conservar.
- `www.clasesde10.com`:
  - `CNAME helpful-fenglisu-f1d7b9.netlify.app` -> Netlify, debe reemplazarse.

## Cambios DNS aplicados en Hostalia

En el panel DNS del proveedor actual se hizo exactamente esto:

1. Eliminar el registro:
   - Host: `@` o `clasesde10.com`
   - Tipo: `A`
   - Valor: `75.2.60.5`

2. Anadir el registro:
   - Host: `@` o `clasesde10.com`
   - Tipo: `A`
   - Valor: `199.36.158.100`

3. Anadir el registro de verificacion Firebase:
   - Host: `@` o `clasesde10.com`
   - Tipo: `TXT`
   - Valor: `hosting-site=clasesde10-50add`

4. Conservar el TXT de email existente:
   - Host: `@` o `clasesde10.com`
   - Tipo: `TXT`
   - Valor: `v=spf1 redirect=spf.dominioabsoluto.net`

5. Anadir o reemplazar el TXT de certificado para el dominio principal:
   - Host: `_acme-challenge`
   - Tipo: `TXT`
   - Valor actual pedido por Firebase: `s05n1RCrYwkepmrS7GpQerXvilgBdwBtY2khK8WN89E`

6. Reemplazar el CNAME de `www`:
   - Host: `www`
   - Tipo: `CNAME`
   - Valor: `clasesde10-50add.web.app`

7. Anadir o reemplazar el TXT de certificado para `www`:
   - Host: `_acme-challenge.www`
   - Tipo: `TXT`
   - Valor actual pedido por Firebase: `LtpaKSyfq73psiVycwKtmzgclH__jL0Ytdj52bR2mIU`

## No tocar

- No activar Blaze.
- No cambiar MX.
- No eliminar el TXT SPF existente.
- No cambiar nameservers si el panel permite editar registros DNS.
- No borrar Netlify hasta verificar Firebase con `clasesde10.com`.

## Verificacion tras cambiar DNS

Ejecutar:

```powershell
Resolve-DnsName clasesde10.com -Type A
Resolve-DnsName clasesde10.com -Type TXT
Resolve-DnsName www.clasesde10.com -Type CNAME
Resolve-DnsName _acme-challenge.clasesde10.com -Type TXT
Resolve-DnsName _acme-challenge.www.clasesde10.com -Type TXT
```

Esperado:

- `clasesde10.com` A -> `199.36.158.100`
- `clasesde10.com` TXT contiene `hosting-site=clasesde10-50add`
- `www.clasesde10.com` CNAME -> `clasesde10-50add.web.app`
- ambos `_acme-challenge` devuelven los TXT indicados arriba

Despues, Firebase debe pasar a:

- `hostState`: `HOST_ACTIVE`
- `ownershipState`: `OWNERSHIP_ACTIVE`
- certificado: `CERT_ACTIVE`

## Verificacion web final

```powershell
curl.exe -I https://clasesde10.com
curl.exe -I https://www.clasesde10.com
curl.exe -L -s -o NUL -w "%{http_code}" https://clasesde10.com
curl.exe -L -s -o NUL -w "%{http_code}" https://www.clasesde10.com
```

Esperado:

- `https://clasesde10.com` devuelve `200`.
- `https://www.clasesde10.com` redirige a `https://clasesde10.com`.
- Manifest, service worker, robots y sitemap siguen disponibles.
