# FIREBASE_DOMAIN_CUTOVER - ClasesDe10

Actualizado: 2026-06-18

## Objetivo

Mover `clasesde10.com` de Netlify a Firebase Hosting sin activar facturacion.

## Estado actual

- Web Firebase publicada: `https://clasesde10-50add.web.app`
- Sitio Firebase Hosting: `clasesde10-50add`
- Dominio principal creado en Firebase Hosting: `clasesde10.com`
- Dominio `www` creado en Firebase Hosting con redireccion a `clasesde10.com`
- Estado Firebase actual:
  - `hostState`: `HOST_MISMATCH`
  - `ownershipState`: `OWNERSHIP_MISSING`
  - certificado temporal en validacion
- Motivo: DNS todavia apunta a Netlify.

## DNS actual detectado

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

## Cambios DNS necesarios

En el panel DNS del proveedor actual, hacer exactamente esto:

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

5. Anadir el TXT de certificado para el dominio principal:
   - Host: `_acme-challenge`
   - Tipo: `TXT`
   - Valor: `XAfVmRmiMZI3ICQ5vmvyAXCJLzFeYJeIM-wqzeLmw4E`

6. Reemplazar el CNAME de `www`:
   - Host: `www`
   - Tipo: `CNAME`
   - Valor: `clasesde10-50add.web.app`

7. Anadir el TXT de certificado para `www`:
   - Host: `_acme-challenge.www`
   - Tipo: `TXT`
   - Valor: `oM7tJOt3sa5uZ9bMLqLrvazj6C-C12TaYH01cAsSePg`

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
