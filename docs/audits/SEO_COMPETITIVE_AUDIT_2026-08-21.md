# Auditoría SEO competitiva — ClasesDe10

Fecha: 21/08/2026  
Dominio: `https://clasesde10.com`  
Mercado prioritario: familias que buscan profesor particular presencial en Madrid u online en España.

## Resumen ejecutivo

La base técnica anterior era correcta —HTTPS, canónicas, sitemap, robots, metadatos sociales y JSON-LD—, pero no bastaba para competir. El dominio no aparecía en las comprobaciones públicas realizadas con `site:clasesde10.com` ni en búsquedas de marca, mientras que resultados comparables favorecían páginas que combinan materia, etapa y Madrid.

El principal problema estratégico era dispersar el sitio en nueve ciudades fuera de Madrid con textos muy similares y sin una oferta presencial demostrada. Esa arquitectura contradecía la promesa pública real: presencial principalmente en Madrid y online en España. También se redirigían a páginas genéricas algunas de las búsquedas locales de mayor intención, como Matemáticas, ESO, Bachillerato o Selectividad en Madrid.

La nueva arquitectura concentra autoridad en el servicio que sí puede explicarse con precisión, recupera seis páginas de intención local, crea un centro editorial con cuatro guías originales y refuerza la entidad de marca sin inventar reseñas, profesores, precios, domicilios o tiempos de respuesta.

## Qué se comprobó

### Indexación y marca

- Las consultas `site:clasesde10.com`, `site:clasesde10.com clases particulares Madrid` y búsquedas directas de `ClasesDe10` no devolvieron páginas propias en la muestra pública revisada.
- El nombre se confunde con otra marca establecida denominada “Clases10”. Se eliminó el nombre alternativo genérico “Clases de 10” del schema para no reforzar esa ambigüedad y se mantuvo la grafía exacta `ClasesDe10`.
- La página principal ya tenía meta de verificación de Google y `robots.txt` declaraba el sitemap. El problema no era un bloqueo global de rastreo.
- El contenido SEO anterior se había actualizado el 15/08/2026; por tanto, solo llevaba seis días publicado. La ausencia inicial puede corresponder en parte al tiempo normal de descubrimiento e indexación de un dominio nuevo.

### Muestra de búsquedas investigadas

1. `clases particulares Madrid`
2. `profesor particular Madrid`
3. `profesor a domicilio Madrid`
4. `apoyo escolar Madrid`
5. `clases particulares matemáticas Madrid ESO`
6. `profesor matemáticas a domicilio Madrid`
7. `clases particulares bachillerato Madrid selectividad`
8. `refuerzo primaria Madrid`

Los resultados públicos pueden variar por fecha, ubicación y personalización. La muestra se utilizó para estudiar la arquitectura y el contenido visibles, no para afirmar una posición fija.

## Panorama competitivo

| Competidor | Fortaleza visible | Qué no conviene copiar | Respuesta de ClasesDe10 |
|---|---|---|---|
| Tusclasesparticulares | Muchas páginas materia + ciudad, perfiles, precios, valoraciones y gran enlazado interno | Competir por volumen de anuncios sin inventario equivalente | Página específica por necesidad real y matching gestionado |
| Superprof | Gran catálogo, URLs locales exactas, precios y prueba social | Publicar cifras o reseñas no demostrables | Reducir la decisión de la familia y explicar el proceso |
| Pupiloo | Posicionamiento local y servicio gestionado en Madrid | Reutilizar sus años, alumnos o profesores como prueba propia | Reforzar selección, seguimiento y panel operativo propios |
| Eurekademy | Página local exacta, mensajes de conversión y referencias universitarias | Afirmar disponibilidad o tiempos que no estén medidos | Curso exacto, modalidad y objetivo antes de asignar |
| Academias y profesores locales | Páginas pequeñas con coincidencia exacta de materia y zona | Crear centenares de páginas casi iguales | Pocas páginas, únicas y con demanda prioritaria |

Conclusión: los directorios dominan por inventario, enlaces y contenido generado por usuarios. ClasesDe10 no debe intentar parecer un directorio grande. Su oportunidad es cubrir muy bien Madrid y las decisiones familiares con una propuesta diferenciada: una solicitud, perfiles revisados, matching y seguimiento.

## Cambios implantados

### 1. Arquitectura de cobertura honesta

- Se mantienen páginas presenciales para Madrid.
- El resto de España se presenta como cobertura online.
- Se retiran del sitemap las páginas genéricas de Barcelona, Valencia, Sevilla, Zaragoza, Málaga, Murcia, Alicante, Bilbao y Valladolid.
- Las nueve URLs antiguas consolidan mediante redirección 301 en `/clases-particulares`.
- No se ampliarán ciudades hasta que exista oferta presencial suficiente y contenido propio demostrable.

### 2. Páginas de alta intención en Madrid

- `/clases-particulares/matematicas-madrid`
- `/clases-particulares/primaria-madrid`
- `/clases-particulares/eso-madrid`
- `/clases-particulares/bachillerato-madrid`
- `/clases-particulares/selectividad-madrid`
- `/clases-particulares/profesor-a-domicilio-madrid`

Cada página tiene título, descripción, H1, contenido, preguntas, enlaces y schema propios. Las cinco combinaciones que existían históricamente dejan de ser interceptadas por las redirecciones a materias genéricas.

### 3. Centro editorial para familias

- `/guias/como-elegir-profesor-particular`
- `/guias/profesor-particular-a-domicilio-u-online`
- `/guias/como-recuperar-matematicas-eso`
- `/guias/preparar-ebau-con-profesor-particular`

Las guías responden decisiones completas y enlazan a la solución correspondiente. Se publican como `Article` con autor y editor `Organization`, fecha real y sin schema de resultados enriquecidos para los que el sitio no sea elegible.

### 4. Entidad, copy y enlazado

- Home orientada a `profesores particulares` y `Madrid`, manteniendo la marca.
- Página familiar orientada a la acción de encontrar profesor y al curso exacto.
- `Organization` explica origen en Madrid y cobertura real: Comunidad de Madrid y España.
- Navegación y pies enlazan las páginas prioritarias y las guías.
- El hub distingue explícitamente presencial en Madrid y online en España.

### 5. Control técnico

- Sitemap regenerado con 38 URLs indexables y `lastmod` correspondiente a un cambio real.
- 38 HTML con canonical propia, un H1, metadatos sociales y JSON-LD válido.
- Cero títulos duplicados, descripciones duplicadas o páginas huérfanas.
- Auditoría HTTP productiva añadida para comprobar las 38 URLs, Googlebot, robots, sitemap, canónicas, ambos dominios Firebase y las nueve redirecciones.
- La auditoría impide que una futura redirección vuelva a ocultar las páginas prioritarias de Madrid.

## Lo que no se ha hecho deliberadamente

- No se han creado páginas para todos los cruces de materia, curso, barrio y ciudad. Serían contenido repetitivo sin demanda o inventario demostrados.
- No se ha usado `LocalBusiness` ni una dirección física porque no existe evidencia pública suficiente para representarlo con exactitud.
- No se han inventado reseñas, estrellas, años, profesores disponibles, precios, teléfonos o tiempos de respuesta.
- No se usa la API de indexación de Google: las páginas educativas normales no están entre los tipos elegibles.
- No se promete una primera posición. Google determina el ranking y los cambios pueden tardar semanas o meses en evaluarse.

## Plan de crecimiento de 90 días

### Primeras dos semanas

1. Confirmar propiedad de dominio en Search Console y enviar `/sitemap.xml`.
2. Solicitar inspección de Home, Madrid, Matemáticas Madrid, profesor a domicilio y la guía principal.
3. Crear o completar Google Business Profile únicamente con categoría, área de servicio y datos verificables.
4. Conectar GA4 o una alternativa consentida y medir `organic landing -> formulario -> solicitud válida`.
5. Registrar consultas reales de las familias y necesidades sin profesor disponible.

### Días 15-45

1. Conseguir menciones y enlaces reales de universidades, asociaciones, AMPAs y recursos educativos de Madrid.
2. Pedir reseñas honestas después de una experiencia suficiente; nunca incentivar una valoración positiva.
3. Publicar dos contenidos mensuales basados en preguntas repetidas de familias, con revisión humana.
4. Mejorar las páginas que reciben impresiones pero no clics antes de abrir nuevos temas.
5. Añadir casos reales anonimizados solo con consentimiento y resultados verificables.

### Días 46-90

1. Evaluar nuevos barrios o municipios únicamente con solicitudes y profesores reales.
2. Crear un nuevo cruce materia + Madrid solo si Search Console o la demanda interna lo justifican.
3. Comparar conversión presencial y online, no solo tráfico.
4. Revisar canibalización, consultas por URL, enlaces obtenidos y calidad de solicitudes.
5. Consolidar o retirar cualquier página que no aporte una respuesta diferente.

## Indicadores de éxito

- Páginas válidas e indexadas en Search Console.
- Impresiones no de marca para búsquedas de Madrid.
- Posición y CTR por consulta, interpretados junto a la intención.
- Solicitudes orgánicas válidas y ratio de asignación.
- Tiempo hasta la asignación y primera clase.
- Enlaces y menciones locales reales.
- Conversión por página de entrada, materia, curso y modalidad.

## Verificación del despliegue

- Firebase Hosting publicó correctamente la nueva versión en el dominio principal y en `clasesde10-50add.web.app`.
- El rastreo HTTP con agente Googlebot obtuvo 200 en las 38 URLs del sitemap, canonical correcta y ausencia de `X-Robots-Tag: noindex`.
- Las siete URLs prioritarias respondieron directamente con 200, sin redirección accidental.
- Las nueve ciudades retiradas respondieron 301 hacia `/clases-particulares`.
- Mediana HTTP observada en el rastreo final: 295 ms; percentil 95: 439 ms. Es una medida de respuesta HTTP de esta ejecución, no Core Web Vitals de usuarios reales.
- La API de PageSpeed respondió 429 por cuota tanto para Home como para Matemáticas Madrid; no se inventa una puntuación alternativa.
- El envío automático a Search Console se intentó con la sesión disponible, pero Google respondió 403 por alcance OAuth insuficiente. La meta de verificación y el sitemap público están preparados; el envío requiere una sesión que haya concedido el permiso `webmasters` y acceso a la propiedad.

## Fuentes de referencia

- Google Search Central, contenido útil: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google Search Central, guía de SEO: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google Search Central, sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google Search Central, solicitar rastreo: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- Google Search Central, Organization: https://developers.google.com/search/docs/appearance/structured-data/organization
- Google Business Profile, ranking local: https://support.google.com/business/answer/7091?hl=es
- Superprof, Matemáticas en Madrid: https://www.superprof.es/clases/matematicas/madrid/
- Tusclasesparticulares, Matemáticas en Madrid: https://www.tusclasesparticulares.com/profesores-matematicas/madrid.aspx
- Tusclasesparticulares, Matemáticas a domicilio: https://www.tusclasesparticulares.com/domicilio/matematicas-en-madrid.aspx
- Pupiloo: https://www.pupiloo.com/
- Eurekademy, clases particulares Madrid: https://www.eurekademy.es/clases-particulares-madrid
