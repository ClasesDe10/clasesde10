# Preparacion de lanzamiento y estrategia de crecimiento de ClasesDe10

Fecha: 2026-06-29

## Diagnostico ejecutivo

ClasesDe10 no debe posicionarse como otro directorio de profesores. Superprof y TusClasesParticulares ya compiten muy bien en volumen y busqueda abierta; Preply, Classgap y GoStudent compiten muy bien en experiencia online y marca. La ventaja defendible de ClasesDe10 esta en ser un marketplace gestionado: la familia no quiere revisar 80 perfiles, quiere que alguien entienda su caso, proponga un profesor fiable, facilite horarios, registre clases, centralice pagos y resuelva problemas.

La propuesta de valor debe ser:

> Profesores particulares verificados, matching gestionado y seguimiento continuo para que la familia encuentre ayuda sin perder tiempo.

Esta promesa encaja con lo que ya existe en el producto: perfiles completos, matching, chat interno, calendario, clases, pagos, notificaciones, reputacion, CRM de administracion, analitica interna y paginas SEO por ciudad/materia.

## Estado real del producto antes de lanzar

Fortalezas ya disponibles:

- Dominio principal en Firebase Hosting y sitemap con 180 URLs indexables.
- Paginas SEO por ciudad, materia y nivel con canonical, Open Graph y Schema.org.
- Paginas legales basicas: privacidad, terminos y cookies.
- Formularios publicos persistiendo leads en Firebase.
- Medicion interna de eventos en Firestore, con UTMs capturadas en leads.
- Panel admin con CRM, clases, pagos, finanzas, incidencias, documentos, analitica y experimentacion.
- Flujo probado de familia-profesor-clase: propuesta, aceptacion, clase confirmada, calendario y clases de ambas partes.
- PWA y auditorias responsive automatizadas.

Brechas antes de invertir fuerte en marketing:

- Falta activar IDs externos de medicion: GA4, Microsoft Clarity y Meta Pixel. El codigo ya esta preparado, pero los IDs estan vacios.
- Falta consentimiento granular de cookies si se activan scripts no tecnicos de terceros.
- Faltan testimonios reales verificables y casos de exito propios.
- Falta Google Business Profile si se quiere capturar busquedas locales de Madrid.
- Falta un mecanismo comercial explicito de referidos dentro de la web app.
- Falta una oferta de lanzamiento cerrada y medible.
- Faltan creatividades publicitarias y landing variants para experimentos.

Cambio aplicado en esta preparacion:

- Se eliminaron referencias publicas a WhatsApp. La estrategia operativa queda alineada con email y chat interno de la web app.

## Posicionamiento

### Para familias

Dolor real:

- No saben que profesor elegir.
- No confian en perfiles anonimos.
- Les preocupa perder tiempo probando a alguien que no encaje.
- Necesitan claridad de horarios, precio y seguimiento.

Mensaje recomendado:

> Cuéntanos que necesita tu hijo y te ayudamos a encontrar un profesor verificado, con seguimiento por chat, calendario y clases registradas.

Promesas concretas:

- Profesor verificado.
- Matching gestionado.
- Sin coste por solicitar.
- Chat interno y calendario.
- Seguimiento de clases y pagos.
- Sin permanencia.

No prometer todavia:

- "El mejor profesor garantizado" si no existe garantia formal.
- "Respuesta inmediata" si el equipo operativo no puede sostenerla.
- "Profesores en toda España" con presencial si la liquidez real no existe en todas las ciudades.

### Para profesores

Dolor real:

- Conseguir alumnos fiables cuesta tiempo.
- Los directorios obligan a competir por precio.
- Las familias preguntan y desaparecen.
- La gestion de horarios/pagos consume energia.

Mensaje recomendado:

> Recibe solicitudes filtradas, trabaja con familias serias y gestiona clases desde un panel sencillo.

Promesas concretas:

- Solicitudes con contexto.
- Familias filtradas.
- Perfil profesional.
- Chat interno y calendario.
- Pagos y clases ordenados.
- Sin tener que venderse constantemente en directorios.

## Estudio competitivo

| Competidor | Lo que hace bien | Debilidad aprovechable | Respuesta de ClasesDe10 |
|---|---|---|---|
| Superprof | Enorme catalogo, SEO muy fuerte, confianza por volumen. | Mucha decision recae en la familia; puede sentirse como directorio. | "No revises decenas de perfiles: hacemos matching gestionado." |
| TusClasesParticulares | Mucha oferta local y busqueda amplia por materias. | Experiencia transaccional y variable segun cada profesor. | "Profesores verificados, flujo de clase y seguimiento." |
| Preply | Online, reservas, reviews y conversion internacional. | Enfoque mas global/online; menos acompanamiento familiar local. | "Acompanamiento educativo y familias espanolas, no solo reserva online." |
| Classgap | Aula virtual, agenda online y foco en clases remotas. | Menos diferencial para presencial local y matching humano. | "Online o presencial con criterio de encaje." |
| GoStudent | Marca, venta consultiva, clases online estructuradas. | Puede percibirse como paquete cerrado o mas caro. | "Flexibilidad sin permanencia, profesor adecuado y seguimiento." |

Conclusion: ClasesDe10 debe evitar competir por "mas profesores" y competir por "menos incertidumbre".

## Economia unitaria inicial

Datos reales usados como referencia de producto:

- Flujo E2E actual crea clases con importe familia de 32 EUR, importe profesor de 24 EUR y comision de 8 EUR.
- Margen de plataforma observado en ese caso: 25%.

Escenarios por familia activa:

| Escenario | Clases/mes | Margen por clase | Margen mensual | Retencion estimada | Margen por familia |
|---|---:|---:|---:|---:|---:|
| Conservador | 4 | 6 EUR | 24 EUR | 2 meses | 48 EUR |
| Base | 8 | 8 EUR | 64 EUR | 3 meses | 192 EUR |
| Optimista | 12 | 10 EUR | 120 EUR | 5 meses | 600 EUR |

Regla de inversion:

- Mientras no haya datos reales, el CPA maximo recomendado por familia activada no debe superar 40-60 EUR.
- Si se confirma el escenario base, puede subirse gradualmente hacia 100-120 EUR.
- No optimizar por registros; optimizar por "familia con clase confirmada".

Embudo recomendado:

1. Visita.
2. Registro o lead publico.
3. Solicitud de profesor.
4. Profesor asignado.
5. Chat abierto.
6. Clase propuesta.
7. Clase confirmada.
8. Primera clase realizada.
9. Segunda clase realizada.
10. Pago confirmado.

Metrica norte:

> Familias con segunda clase realizada.

Es mejor que "registros" porque mide confianza, matching y retencion temprana.

## Canales de adquisicion priorizados

| Prioridad | Canal | Dificultad | Coste | Tiempo a resultado | ROI esperado | Riesgo | Decisión |
|---:|---|---|---|---|---|---|---|
| 1 | SEO local por materia/ciudad | Media | Bajo | 2-6 meses | Muy alto | Lentitud inicial | Mantener y ampliar con contenido util. |
| 2 | Convenios con AMPAs, colegios y academias pequenas | Media | Bajo/medio | 2-8 semanas | Alto | Requiere venta manual | Prioridad de lanzamiento. |
| 3 | Captacion de profesores en universidades | Baja/media | Bajo | 1-4 semanas | Alto | Calidad variable | Crear bolsa inicial por materias clave. |
| 4 | Referidos familia-profesor | Media | Bajo | 1-3 meses | Alto | Requiere masa inicial | Implementar cuando haya primeras clases. |
| 5 | Google Ads busquedas exactas | Media | Medio/alto | Inmediato | Medio | CPC competitivo | Solo con tracking y presupuesto pequeno. |
| 6 | Meta Ads familias Madrid | Media | Medio | 1-4 semanas | Medio | Leads frios | Probar solo con oferta concreta. |
| 7 | Contenido short-form TikTok/Instagram | Media | Bajo | 1-3 meses | Medio | Constancia | Usar para confianza, no como canal unico. |
| 8 | Email marketing | Baja | Bajo | Inmediato | Medio | Base pequena | Necesario para nurturing de leads. |
| 9 | PR local y blogs educativos | Media | Bajo | 1-3 meses | Medio | Poco control | Util para confianza y SEO. |
| 10 | LinkedIn | Baja | Bajo | Lento | Bajo/medio | Poco alineado familias | Usar para profesores y partners, no familias. |
| 11 | Afiliados/influencers | Media | Variable | 1-2 meses | Incierto | Calidad de lead | Probar solo con microcreadores locales. |
| 12 | WhatsApp | Baja | Bajo | Inmediato | No aplica | No alineado | Descartado: solo email y chat interno. |

## Presupuesto recomendado

Primer mes, antes de tener datos:

- 0-150 EUR: herramientas y pequenos activos creativos.
- 150-300 EUR: Google Ads solo para keywords muy concretas en Madrid.
- 100-250 EUR: Meta Ads con una landing de familias, solo si GA4/Clarity/Meta estan activos.
- 0 EUR: SEO, email, partnerships, universidades y contenido organico.

No gastar mas de 500-700 EUR en paid media antes de medir:

- coste por solicitud;
- coste por familia asignada;
- coste por primera clase;
- coste por segunda clase.

## Oferta de lanzamiento

Oferta recomendada para familias:

> Primera solicitud gratuita, profesor verificado y seguimiento desde el panel. Sin permanencia.

Incentivo recomendado:

- Si la familia realiza 4 clases en el primer mes, recibe una revision gratuita del plan de estudio del alumno.
- Evitar descuentos agresivos en precio/hora porque deterioran el valor percibido y presionan margen.

Oferta recomendada para profesores:

> Perfil profesional gratuito y acceso a solicitudes filtradas durante el lanzamiento.

Incentivo recomendado:

- Prioridad en matching para profesores con perfil completo, disponibilidad marcada y documentos verificados.

## Copy listo para usar

### Google Ads familias

Titulos:

- Profesores particulares verificados
- Clases particulares en Madrid
- Encuentra profesor para tu hijo
- Matching educativo personalizado
- Sin permanencia ni cuota inicial

Descripciones:

- Cuéntanos materia, nivel y horario. Te ayudamos a encontrar un profesor verificado y compatible.
- Clases online o presenciales segun disponibilidad. Chat interno, calendario y seguimiento.
- Solicita profesor gratis y empieza con una propuesta adaptada a tu hijo.

### Meta Ads familias

Texto 1:

> Encontrar profesor no deberia ser una loteria. En ClasesDe10 revisamos tu caso, buscamos un profesor verificado y dejamos todo ordenado en tu panel: chat, horarios, clases y pagos.

Texto 2:

> Si tu hijo necesita refuerzo en matematicas, ingles, fisica o cualquier materia, cuentanos el caso y te ayudamos a encontrar un profesor compatible.

CTA:

- Solicitar profesor.
- Crear cuenta gratis.

### Captacion de profesores

Texto:

> Si das clases particulares y quieres recibir solicitudes mejor filtradas, crea tu perfil en ClasesDe10. Las familias ven informacion completa, disponibilidad y confianza. Tu decides horarios y modalidad; nosotros ordenamos el proceso.

### Email para familia que dejo lead pero no completo solicitud

Asunto: ¿Seguimos con la búsqueda de profesor?

Hola,

Hemos recibido tu interes en ClasesDe10. Para poder proponerte un profesor adecuado necesitamos confirmar materia, nivel, zona/modalidad y disponibilidad del alumno.

Puedes entrar en tu cuenta y completar la solicitud cuando quieras. A partir de ahi revisaremos el caso y te avisaremos con la propuesta.

Gracias,
ClasesDe10

### Email para profesor con perfil incompleto

Asunto: Completa tu perfil para recibir mejores solicitudes

Hola,

Para poder asignarte alumnos con buen encaje necesitamos que tu perfil incluya materias, niveles, disponibilidad, formacion, zona y verificacion basica.

Los perfiles completos tienen prioridad en el matching porque reducen dudas para las familias.

Gracias,
ClasesDe10

## Plan de lanzamiento

### Antes del lanzamiento

1. Activar GA4, Clarity y Meta Pixel con consentimiento de cookies.
2. Enviar sitemap a Google Search Console.
3. Crear Google Business Profile para Madrid.
4. Revisar que cada lead tenga UTM y origen.
5. Definir oferta de lanzamiento.
6. Crear 10 piezas organicas: 5 para familias, 5 para profesores.
7. Crear lista inicial de 30 AMPAs/colegios/academias/universidades.
8. Conseguir 10-20 profesores verificados en materias de alta demanda.
9. Preparar email de seguimiento para leads sin solicitud.
10. Preparar email de activacion para profesores con perfil incompleto.

### Semana de lanzamiento

1. Publicar en canales propios.
2. Contactar partners locales con mensaje personalizado.
3. Lanzar Google Ads con presupuesto bajo y keywords exactas.
4. Lanzar Meta Ads solo si tracking esta activo.
5. Revisar diariamente solicitudes, asignaciones y primeras clases.
6. Registrar manualmente motivos de abandono hasta automatizar reportes.

### Primer mes

1. Optimizar landing segun conversion real.
2. Doblar ciudades/materias que traigan leads organicos.
3. Cortar cualquier paid media que no llegue a solicitud con CPA razonable.
4. Pedir testimonios reales tras segunda clase realizada.
5. Activar programa de referidos cuando haya familias satisfechas.
6. Crear contenido SEO basado en busquedas reales internas.

### Primer trimestre

1. Expandir SEO a nuevas ciudades solo si hay oferta de profesores.
2. Crear paginas de colegios/barrios con demanda demostrada.
3. Automatizar nurturing de leads.
4. Medir LTV por familia, profesor y materia.
5. Crear ranking interno de mejores fuentes de usuarios.
6. Diseñar referidos con incentivo no destructivo de margen.

## Sistema de medicion

Eventos que deben vigilarse cada semana:

- `form.submitted` por tipo y UTM.
- `auth.signup.succeeded` por rol.
- solicitudes creadas.
- profesor asignado.
- chat abierto.
- propuesta de clase creada.
- clase confirmada.
- clase realizada.
- pago confirmado.
- segunda clase realizada.
- abandono por paso.

Panel semanal recomendado:

- Familias nuevas.
- Profesores nuevos.
- Solicitudes nuevas.
- Ratio solicitud -> profesor asignado.
- Ratio asignacion -> primera clase.
- Ratio primera clase -> segunda clase.
- Margen por clase.
- CPA por canal.
- Tiempo medio hasta asignacion.
- Materias con demanda sin oferta.
- Profesores activos sin alumnos.

## UTM estandar

Formato:

`utm_source={canal}&utm_medium={tipo}&utm_campaign={objetivo}_{ciudad}_{fecha}&utm_content={creativo}&utm_term={keyword}`

Ejemplos:

- `utm_source=google&utm_medium=cpc&utm_campaign=familias_madrid_202607&utm_content=matching&utm_term=profesor+matematicas+madrid`
- `utm_source=instagram&utm_medium=social&utm_campaign=familias_madrid_202607&utm_content=reel_confianza`
- `utm_source=universidad&utm_medium=partnership&utm_campaign=profesores_madrid_202607&utm_content=cartel_qr`

## Riesgos principales

1. Lanzar paid media sin medicion externa: alto riesgo de gastar sin saber que convierte.
2. Captar familias en zonas sin profesores suficientes: daña confianza.
3. Captar profesores sin perfiles completos: reduce calidad del matching.
4. Prometer respuesta inmediata: genera expectativa operativa dificil.
5. Competir por precio: erosiona margen y atrae demanda menos fiel.
6. Depender de un solo canal: SEO tarda y ads pueden encarecerse.

## Decisiones recomendadas

- Prioridad absoluta: Madrid + online al inicio.
- Materias prioritarias: matematicas, ingles, fisica/quimica, lengua, primaria/ESO/bachillerato.
- Diferencial principal: matching gestionado + confianza + seguimiento.
- Paid media: pequeno, medido y con CPA maximo.
- SEO: seguir escalando, pero solo con paginas utiles y enlazado interno.
- Profesores: calidad antes que volumen.
- Soporte: email para publico, chat interno para usuarios registrados.

## Fuentes revisadas

- TusClasesParticulares: https://www.tusclasesparticulares.com/
- Superprof: https://www.superprof.es/
- Preply: https://preply.com/
- Classgap: https://www.classgap.com/es
- GoStudent: https://www.gostudent.org/es
- EsadeEcPol, educacion en la sombra: https://www.esade.edu/ecpol/
- OCU, clases particulares: https://www.ocu.org/

