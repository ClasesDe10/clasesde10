# Matching presencial: cascada de rutas multimodales

## Estado operativo

El matching `professional_matching_v7_route_cascade` ya no depende de que Google Maps tenga facturación activa. El worker preselecciona hasta diez profesores, calcula la mejor movilidad disponible y vuelve a ordenar la lista con una cascada automática:

1. Google Routes para caminar, transporte público y coche con tráfico cuando está disponible.
2. Geoapify para los tres modos si existe una clave gratuita válida.
3. OpenStreetMap/OSRM sin clave para red peatonal y viaria, usando centros de código postal oficiales; el transporte público queda como estimación prudente y visible.
4. Estimación geográfica determinista si ningún proveedor de red responde o la ubicación queda fuera del callejero local.

Comprobación del 21/08/2026 sobre `clasesde10-50add`:

- facturación de Google Cloud: no vinculada;
- `routes.googleapis.com`: desactivada;
- Geoapify: integración preparada, sin clave configurada;
- fallback sin clave: operativo con OpenStreetMap/OSRM y los 55 códigos postales de Madrid;
- consecuencia: Google ya no bloquea la funcionalidad. El matching funciona, cambia de proveedor automáticamente y declara la precisión real de cada modo.

No se ha contratado ningún plan ni generado ningún coste.

## Estudio profesional de alternativas

| Opción | Modos y precisión | Coste/cuota actual | Privacidad y operación | Decisión |
|---|---|---|---|---|
| Google Routes | WALK, TRANSIT y DRIVE; tráfico y horarios; direcciones precisas | Exige facturación vinculada incluso dentro del tramo sin cargo; la tabla vigente incluye 10.000 elementos Essentials mensuales sin coste | Proveedor de mayor calidad ya integrado; OAuth de servidor; no operativo hoy por configuración externa | Primera opción automática cuando esté disponible |
| Geoapify Routing | `walk`, `transit`, `approximated_transit` y `drive`; geocodificación precisa | Plan gratuito de 3.000 créditos/día, 5 peticiones/s, sin tarjeta; uso comercial limitado | Requiere crear una clave; sin SLA en el plan gratuito; atribución obligatoria | Mejor alternativa gratuita multimodal; integración lista y segunda opción |
| OpenStreetMap + OSRM público de FOSSGIS | Rutas de red para `foot` y `car`; sin transporte público programado | Sin facturación; máximo 1 petición/s; sin uso intensivo ni SLA | El servicio registra coordenadas. Para no enviar domicilios se generalizan localmente al centro del CP. Debe poder sustituirse y mostrar atribución/corrección del mapa | Fallback inmediato sin credenciales, apto para el volumen de lanzamiento |
| openrouteservice | Caminar y coche; matriz y geocodificación; no ofrece transporte público programado equivalente | Plan estándar gratuito con cuotas diarias y clave | Buen proveedor abierto, pero aporta menos que Geoapify para este caso | Reserva técnica, no elegido |
| TravelTime | Transporte público, caminar y coche, con rutas temporales | Prueba gratuita temporal; servicio de pago después | Buena semántica multimodal, pero no resuelve un fallback gratuito permanente | Descartado para el estado actual |
| Transitous/MOTIS público | Transporte público abierto con horarios y acceso peatonal | Sin clave y best effort | El operador pide contacto previo para routing, orienta el servicio a software libre/no lucrativo y no garantiza uso comercial | No usado por esta plataforma comercial; válido para prototipos o instancia propia |
| OSRM/Valhalla + OpenTripPlanner propios | Control total y posible combinación OSM + GTFS | Software libre, pero requiere infraestructura, datos, actualizaciones y operación | Máxima independencia y privacidad si se aloja internamente | Ruta de escala futura, desproporcionada para el volumen actual |

Fuentes oficiales consultadas:

- [Google Routes: uso y facturación](https://developers.google.com/maps/documentation/routes/usage-and-billing) y [precios](https://developers.google.com/maps/billing-and-pricing/pricing).
- [Geoapify Routing y modos de viaje](https://apidocs.geoapify.com/docs/routing/) y [plan gratuito](https://www.geoapify.com/pricing/).
- [OSRM público de FOSSGIS: perfiles, datos y política de uso](https://map.project-osrm.org/about.html) y [API oficial de OSRM](https://project-osrm.org/docs/v5.24.0/api/).
- [openrouteservice: planes y límites](https://openrouteservice.org/plans/).
- [TravelTime Routes API](https://docs.traveltime.com/api/reference/routes).
- [Transitous: API y política de uso](https://transitous.org/api/) y [MOTIS](https://github.com/motis-project/motis).
- [Callejero oficial del Ayuntamiento de Madrid](https://datos.madrid.es/dataset/200075-0-callejero), licencia CC BY 4.0.

## Implementación elegida

`scripts/firebase-automation-worker.mjs` intenta Google y rellena cualquier candidato no resuelto con `computeBestFreeRoutesForTeachers()`. Dentro del fallback gratuito, Geoapify tiene prioridad y OpenStreetMap cubre los candidatos restantes. Una respuesta parcial de un proveedor no impide usar otro para los demás.

El archivo `js/madrid-postal-centroids.js` contiene 55 centroides generados a partir de 215.268 coordenadas de portales del callejero oficial. El método usa la mediana de latitud y longitud para que valores extremos no desplacen el centro representativo. Se regenera con:

```bash
npm run geo:generate-postal-centroids
```

El fallback OSRM agrupa todos los candidatos en una matriz de una a diez rutas por modo, limita globalmente el proceso a una petición cada 1,1 segundos, envía `User-Agent` y `Referer` identificativos y conserva los enlaces de atribución y corrección del mapa exigidos por el operador. Solo consulta coche cuando el profesor declara disponer de él y añade seis minutos de acceso/aparcamiento al tiempo de conducción.

## Precisión, scoring y seguridad de la decisión

- `exact=true` solo aparece cuando todos los modos visibles proceden de rutas calculadas sobre una ubicación precisa.
- `networkCalculated=true` indica que al menos un modo usa la red real, aunque la ubicación o alguna modalidad sean aproximadas.
- OpenStreetMap se muestra como `Red viaria por centro de CP · transporte público estimado`; nunca como ruta exacta.
- Una distancia solo puede producir un bloqueo automático si todas las opciones aplicables son rutas precisas y ninguna entra en rango.
- Un centro postal, una modalidad estimada o un fallo parcial generan revisión manual, nunca el descarte silencioso del profesor.
- A pie se favorece hasta 25 minutos si queda a cinco minutos o menos de la alternativa más rápida; el límite operativo es 30 minutos.
- Transporte público se favorece si queda a cuatro minutos o menos de la más rápida; el límite de revisión es 35 minutos.
- Coche se limita a profesores que declaran vehículo y usa un límite recomendado de 20 minutos.

Cada match persiste únicamente proveedor, kilómetros, minutos, precisión, modo y fecha. No duplica domicilios en `solicitudMatches` ni `matchingRuns`.

## Privacidad y atribución

- Google o Geoapify, cuando están activos, reciben solo dirección/coordenadas necesarias y nunca nombre, correo o teléfono.
- El servicio público de OpenStreetMap no recibe calles privadas: únicamente el centro del código postal resuelto dentro del worker.
- No se usa Nominatim público para geocodificar domicilios. Su política pide no remitir datos personales o confidenciales y exige caché y límites estrictos: [política oficial de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).
- El panel muestra `© OpenStreetMap` y `Corregir el mapa`; privacidad y términos públicos identifican los proveedores.

## Configuración y conmutación

- `matching.googleRoutesEnabled=false`: omite Google y continúa con la cascada gratuita.
- `matching.freeRoutesFallbackEnabled=false`: desactiva la capa gratuita; solo debe usarse para diagnóstico.
- `GOOGLE_MAPS_ROUTES_API_KEY`: opcional; Google usa OAuth del servicio si no existe.
- `GEOAPIFY_API_KEY`: opcional; el workflow ya acepta el secreto. Si no existe o falla, OSRM continúa automáticamente.

Estados útiles en Firestore:

- `routingProvider`: proveedor único o `route_cascade`.
- `routingStatus`: `ready`, `ready_with_fallback`, `free_fallback_ready_with_estimated_transit` u otro diagnóstico.
- `routingExactCandidates`: candidatos con todas sus modalidades precisas.
- `routingCalculatedCandidates`: candidatos enriquecidos por cualquier capa de rutas.
- `routingFreeRequests` y `routingFreeCredits`: consumo de la capa gratuita.
- En cada propuesta: `routingExact`, `routingNetworkCalculated` y `locationEstimate` por modalidad.

## Pruebas y umbrales de escala

Pruebas obligatorias:

```bash
npm run test:google-routes
npm run test:alternative-routes
npm run smoke:free-routes
```

La prueba alternativa cubre Google ausente, Geoapify con clave simulada, OSRM sin clave, coche solo cuando procede, transporte estimado, no descarte automático y ausencia de direcciones privadas en la URL pública. El smoke realiza una ruta real entre `28001` y `28005` sin elementos facturables.

Antes de que el tráfico agregado se acerque al límite comunitario de una petición por segundo o deje de ser moderado, se debe retirar OSRM público como dependencia de producción y activar Geoapify/Google o desplegar un router propio. La telemetría `freeRoutesRequests`, errores y proveedor permite tomar esa decisión sin cambiar el motor de scoring.
