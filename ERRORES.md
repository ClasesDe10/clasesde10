# ERRORES — ClasesDe10

## CRÍTICOS (bloquean producción)

### E01 — Supabase redirect URLs no configuradas
- Estado: ❌ ABIERTO
- Impacto: confirmación email falla, reset password falla
- Fix: añadir en Supabase Auth > URL Configuration

### E02 — GitHub Action falla (nfp_ token incompatible con API v1)
- Estado: ⚠️ WORKAROUND (Netlify deploys directamente de GitHub)
- Impacto: el workflow .github/workflows/deploy.yml falla siempre
- Fix: eliminar o desactivar el workflow, Netlify ya hace auto-deploy

### E03 — Primer admin no creado
- Estado: ❌ ABIERTO
- Fix: registrarse en web + UPDATE usuarios SET rol='admin'

## CONOCIDOS (no bloquean)

### E04 — idx_clases_mes eliminado (date_trunc no IMMUTABLE)
- Estado: ✅ RESUELTO en migración 003

### E05 — Token nfp_ incompatible con api.netlify.com/api/v1
- Estado: ✅ WORKAROUND (GitHub App de Netlify instalada)
