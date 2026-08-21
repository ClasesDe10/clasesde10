# Matching presencial con Google Maps

## Estado operativo

La integración está implementada en `professional_matching_v6_google_routes`. El worker preselecciona hasta diez profesores por materia, curso, modalidad, horario, calidad y disponibilidad, solicita rutas reales y vuelve a ordenar los candidatos con los tiempos de Google Maps.

Comprobación del 21/08/2026 sobre `clasesde10-50add`:

- facturación de Google Cloud: no vinculada;
- `routes.googleapis.com`: desactivada;
- consecuencia: el matching sigue funcionando con una estimación geográfica marcada como tal y nunca presenta esos minutos como datos exactos de Google Maps.

Google exige facturación activa aunque el consumo quede dentro del tramo gratuito. La tabla vigente ofrece 10.000 elementos mensuales sin cargo para Compute Route Matrix Essentials: [precios oficiales](https://developers.google.com/maps/billing-and-pricing/pricing).

## Activación pendiente

1. Vincular una cuenta de facturación al proyecto Google Cloud `clasesde10-50add`.
2. Activar `routes.googleapis.com` en ese mismo proyecto.
3. Confirmar que la cuenta de servicio usada por `FIREBASE_SERVICE_ACCOUNT_JSON` puede consumir APIs del proyecto. El worker usa OAuth de servidor y no expone credenciales al navegador.
4. Ejecutar manualmente `Firebase automation worker without Blaze` o crear una solicitud presencial nueva.
5. Verificar en la solicitud `routingStatus=ready`, `routingExactCandidates>0` y en cada propuesta `routingExact=true`.

No hace falta crear una clave API. Si se prefiere una clave separada, debe guardarse como secreto `GOOGLE_MAPS_ROUTES_API_KEY`, restringida exclusivamente a Routes API; nunca debe añadirse al código ni al cliente web. Guía oficial: [seguridad de claves y OAuth](https://developers.google.com/maps/api-security-best-practices).

## Criterios de matching

- A pie: se considera razonable hasta 30 minutos.
- Transporte público: se considera razonable hasta 35 minutos.
- Coche: solo se consulta y se considera cuando el profesor declara disponer de coche; límite recomendado de 20 minutos.
- Entre opciones válidas se elige la más rápida, favoreciendo caminar si queda a cinco minutos o menos de la más rápida y no supera 25 minutos, y transporte público si queda a cuatro minutos o menos.
- La distancia solo bloquea una asignación automática cuando ninguna opción comprobada entra en rango.
- Si Google falla para algún modo, no se descarta al profesor por distancia: queda marcado para revisión manual.

Cada solicitud consulta como máximo diez destinos. Eso supone hasta 30 elementos cuando todos tienen coche, y menos cuando no lo tienen. Las solicitudes exclusivamente online no consumen Routes API.

## Privacidad, atribución y persistencia

Las llamadas contienen únicamente dirección o coordenadas de origen y destino. No se envían nombres, correos ni teléfonos. En Firestore se guardan solo kilómetros, minutos, modo, fecha de cálculo y estado del proveedor; no se duplican direcciones dentro de los resultados del matching.

El panel diferencia visualmente una ruta exacta de una estimación, muestra la atribución `Google Maps` junto al contenido y avisa de la limitación oficial de las rutas a pie. Las páginas de privacidad y términos incorporan las referencias exigidas por las [políticas de Routes API](https://developers.google.com/maps/documentation/routes/policies).
