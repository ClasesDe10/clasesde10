# Auditoría SEO de producción — ClasesDe10

Fecha: 9 de agosto de 2026
Dominio auditado: https://clasesde10.com
Estado final: aprobado

## Resumen ejecutivo

ClasesDe10 no utiliza WordPress: es un sitio estático publicado con Firebase Hosting. AIOSEO exige WordPress, PHP y base de datos, por lo que instalarlo en esta arquitectura no es técnicamente compatible. Se han implantado de forma nativa sus funciones relevantes: títulos y descripciones, URL canónicas, Open Graph y Twitter Cards, datos estructurados JSON-LD, sitemap, robots, redirecciones permanentes, auditoría editorial y rastreo de producción con Playwright.

La incidencia más importante no era una etiqueta ausente. Existían 160 páginas casi idénticas que combinaban materia y ciudad y llevaban al mismo flujo de registro. Esta estructura presentaba un riesgo alto de ser interpretada como páginas puerta o contenido escalado. Se ha consolidado antes de que esas URL aparezcan indexadas.

## Hallazgos corregidos

1. **Arquitectura con riesgo de páginas puerta.** Las 160 combinaciones materia-ciudad se han sustituido por 16 páginas completas de materia, 10 páginas de ciudad y un directorio nacional. Las URL antiguas responden con `301` hacia su materia equivalente.
2. **Lenguaje interno visible.** Se han eliminado expresiones como “arquitectura SEO”, “canónica limpia”, “datos estructurados”, “intención de búsqueda”, “landings generadas” y “SEO local”.
3. **Datos estructurados inexactos.** La entidad principal ya no se declara simultáneamente como `EducationalOrganization` y `LocalBusiness`. Ahora se usa `Organization`, con identificadores estables, cobertura España, logo, contacto y un `WebSite` con nombre alternativo.
4. **Marcado FAQ sin utilidad real.** Se mantiene la sección visible de preguntas, pero se retira `FAQPage`: Google limita ese resultado enriquecido a sitios autorizados de salud y administraciones públicas.
5. **Vista previa social incorrecta.** El logo cuadrado se ha sustituido en Open Graph y Twitter por una imagen horizontal de 1200 × 630 px con texto alternativo y dimensiones declaradas.
6. **Señales canónicas inconsistentes.** Los enlaces internos ya usan rutas limpias sin `.html`; canonical, `og:url`, sitemap y navegación apuntan a la misma URL.
7. **Robots y `noindex`.** Las páginas privadas mantienen `noindex` en HTML y cabecera HTTP, pero ya no se bloquean en `robots.txt`, de modo que el robot puede leer esa directiva.
8. **Sitemap engañosamente fresco.** `lastmod` deja de cambiar en cada ejecución y solo se actualiza cuando cambia el contenido. También se retiraron `priority` y `changefreq`, señales que Google no utiliza.
9. **Patrones visuales artificiales.** Las páginas SEO ya no usan degradados, elevación al pasar el ratón ni redondeo excesivo. Las interacciones se reservan para enlaces y botones.
10. **Auditor frágil.** El rastreador local ya ignora carpetas temporales sin permisos y valida contenido, metadatos, schema, enlaces, páginas huérfanas, duplicados, sitemap, redirecciones y protección de URL privadas.

## Arquitectura indexable final

- 9 páginas corporativas y legales.
- 1 directorio nacional de clases particulares.
- 10 páginas de ciudad.
- 16 páginas de materia o nivel.
- Total: 36 URL indexables.

## Verificación final

### Auditoría estática

- 36/36 documentos indexables aprobados.
- 0 páginas huérfanas.
- 0 títulos duplicados.
- 0 descripciones duplicadas.
- 0 advertencias.
- Navegación pública, límites de contenido, diseño visual y PWA aprobados.

### Rastreo real de producción

- 36/36 URL del sitemap devuelven HTTP 200.
- Canonical y `og:url` coinciden con la URL final en todas ellas.
- 36/36 tienen un solo H1, descripción, JSON-LD válido y vista previa social completa.
- 0 desbordamientos en móvil; 6 plantillas representativas verificadas también en escritorio.
- Login, registro y finalización de cuenta verificadas con doble `noindex` (HTML y `X-Robots-Tag`).
- Las URL materia-ciudad antiguas verificadas responden con 301.

### Medición móvil de laboratorio

Medición Playwright sin throttling; orientativa y no equivalente a datos de campo de CrUX:

- TTFB: 74 ms — bueno.
- FCP: 612 ms — bueno.
- LCP: 612 ms — bueno.
- CLS: 0 — bueno.
- Tiempo de bloqueo: 0 ms — bueno.
- 21 recursos y 56 KB transferidos en la carga medida.

La API pública de PageSpeed no pudo completar una segunda medición porque su cuota diaria respondió con HTTP 429. Para conocer impresiones, consultas, cobertura histórica y Core Web Vitals reales hace falta consultar la propiedad de Google Search Console; esos datos privados no forman parte del repositorio ni del rastreo público.

## Reproducción

```powershell
npm.cmd run seo:generate
npm.cmd run test:seo
npm.cmd run audit:seo:public
npm.cmd run audit:seo:vitals
```

## Referencias oficiales

- Requisitos de AIOSEO: https://aioseo.com/docs/whats-required-to-use-aioseo/
- Políticas de spam y páginas puerta: https://developers.google.com/search/docs/essentials/spam-policies
- Contenido útil y centrado en las personas: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Datos estructurados de organización: https://developers.google.com/search/docs/appearance/structured-data/organization
- Nombre del sitio: https://developers.google.com/search/docs/appearance/site-names
- URL canónicas: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Cambios de FAQ: https://developers.google.com/search/blog/2023/08/howto-faq-changes
- Redirecciones de Firebase Hosting: https://firebase.google.com/docs/hosting/full-config
