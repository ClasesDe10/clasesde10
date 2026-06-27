# TOTAL_PLATFORM_AUDIT - ClasesDe10

Fecha: 2026-06-27  
Alcance: auditoria tecnica, producto, UX, operacion, crecimiento, IA, seguridad, performance, PWA, SEO, responsive y migracion Firebase/Supabase.  
Estado: no se han modificado flujos runtime durante esta auditoria.

## 1. Resumen ejecutivo

ClasesDe10 ya no es solo una landing: tiene Firebase Hosting en produccion, Firebase Auth operativo, Firestore con datos reales, Cloud Functions de automatizacion y formularios publicos guardando leads. La base es recuperable y puede convertirse en una plataforma seria.

El problema principal no es que falte "una feature". El problema es que el producto esta partido en dos mundos:

- Firebase ya sostiene hosting, auth, leads, usuarios, profesores importados, solicitudes iniciales y automatizacion de matching.
- Supabase sigue sosteniendo la mayoria de dashboards privados y operaciones legacy.
- Los dashboards son monoliticos y concentran demasiada logica en HTML/JS inline.
- Firebase Storage no tiene bucket creado, por lo que documentos siguen bloqueados.
- La operacion de matching existe en backend, pero aun no esta cerrada como flujo visible, medible y fiable de admin/familia/profesor.
- Mobile publico esta mucho mejor que antes, pero el panel privado sigue siendo la zona de mayor riesgo por tablas, modales, filtros y datos legacy.

La prioridad real no es anadir mas IA de pago. La prioridad es cerrar el ciclo operativo:

1. Familia entra o deja lead.
2. Se crea solicitud Firebase.
3. Se normaliza perfil de alumno/familia.
4. Se recomiendan profesores.
5. Admin asigna profesor desde Firebase.
6. Se crea asignacion.
7. Familia, profesor y admin ven el mismo estado.
8. Chat/documentos/pagos/notificaciones se activan sobre Firebase.
9. Supabase se elimina.

## 2. Evidencia verificada

Comprobaciones ejecutadas:

| Area | Resultado |
| --- | --- |
| `npm run check:quality` | OK. Sin vulnerabilidades npm, sintaxis OK, adaptadores OK, self-test matching OK, hosting audit OK, Supabase audit OK, centralizacion OK. |
| `npm run check:functions` | OK. `functions/index.js` valido y auditoria npm de functions sin vulnerabilidades. |
| `npm run audit:auth` | Auth disponible, 5 usuarios, admin existe, proveedores presentes en usuarios exportados: `password`. |
| `npm run audit:storage` | APIs activas, pero no existe bucket `clasesde10-50add.firebasestorage.app` ni `clasesde10-50add.appspot.com`. |
| `npm run audit:hosting` | Config local OK y rutas criticas protegidas o servidas correctamente. |
| `npm run audit:supabase` | 7 runtime files siguen usando Supabase: 85 queries, 2 storage calls, 1 realtime channel. |
| Chrome responsive publico | 27 mediciones en `clasesde10.com` a 390, 360 y 320 px sin overflow horizontal en rutas publicas clave. |
| Firestore REST | Colecciones reales: `users=5`, `profesores=25`, `familias=1`, `alumnos=1`, `solicitudes=1`, `leadsPublicos=3`. |
| Perfil profesores Firestore | 25 profesores con `status=pendiente_revision`; 25 sin `profileComplete/perfil_completo`. |
| Admin SDK local | Intento de custom token fallo por falta de ADC: `Could not load the default credentials`. |

## 2.1 Acciones ejecutadas tras la auditoria

| Accion | Resultado | Evidencia |
| --- | --- | --- |
| Inicializar Firebase Storage automaticamente | Bloqueado por permisos | `npm run firebase:storage:create-default` devolvio `403 PERMISSION_DENIED` en `v1alpha` y `v1beta`. |
| Convertir auditorias Playwright en comandos npm | Completado | Nuevo `scripts/run-playwright-cli-function.mjs`, `npm run audit:mobile:public` y `npm run audit:mobile:admin`. |
| Auditar responsive publico en Chrome | OK | `mode=public`, `total=27`, `failures=[]`. |
| Auditar responsive admin autenticado en Chrome | OK | Login admin OK, `mode=admin`, `total=36`, `failures=[]`. |
| Normalizar profesores Firestore | Completado | 26 profesores actualizados con aliases seguros (`subjects`, `levels`, `hourlyRate`, `profileIssues`, `profileComplete`). Dry-run posterior: `teachersToUpdate=0`. |
| Matching lee aliases importados | Completado | `functions/index.js` ahora reconoce `subjects`, `levels`, `hourlyRate` y `tarifaHora`. |
| Desplegar Functions con cambio de matching | Bloqueado por facturacion | `firebase deploy --only functions` exige Blaze para habilitar `cloudbuild.googleapis.com` y `artifactregistry.googleapis.com`. |

## 3. Arquitectura actual

### Produccion y hosting

- Produccion principal: Firebase Hosting.
- Dominio canonico esperado: `https://clasesde10.com`.
- Dominio Firebase: `https://clasesde10-50add.web.app`.
- Netlify queda como legado/rollback, no como produccion deseada.
- `firebase.json` tiene headers de seguridad, cache, rewrites y redirects.
- CSP permite `unsafe-inline`, necesario por el codigo actual, pero no ideal.

### Frontend

- Aplicacion estatica HTML/CSS/JS.
- Dashboards privados en:
  - `pages/dashboard/admin.html`
  - `pages/dashboard/familia.html`
  - `pages/dashboard/profesor.html`
  - `pages/dashboard/alumno.html`
- CSS principal:
  - `css/style.css`
  - `css/dashboard.css`
- Riesgo de mantenibilidad:
  - `admin.html`: 1998 lineas.
  - `dashboard.css`: 1324 lineas.
  - `profesor.html`: 981 lineas.
  - `familia.html`: 884 lineas.
  - 110 asignaciones a `innerHTML`.
  - 497 atributos/eventos inline `on...`.
  - 466 estilos inline `style=`.

### Backend Firebase

- Firestore Rules existen y validan bastantes campos.
- Firestore Indexes son iniciales, pero incompletos para todo el modelo operativo.
- Cloud Functions en `functions/index.js`:
  - procesa leads publicos.
  - crea solicitudes desde leads de familia.
  - puntua profesores para matching.
  - opcionalmente llama a Gemini si hay `GEMINI_API_KEY`.
  - crea matches en `solicitudMatches`.
  - crea asignaciones al marcar solicitud como asignada.
  - genera resumen mensual.
- Esta es una buena base de automatizacion gratuita: reglas deterministas primero, LLM opcional despues.

### Backend Supabase legacy

Runtime aun activo en 7 archivos:

| Archivo | Dependencia |
| --- | --- |
| `pages/dashboard/admin.html` | `alumnos`, `asignaciones`, `clases`, `documentos`, `familias`, `incidencias`, `pagos`, `profesores`, `solicitudMatches`, `solicitudes`, vistas admin. |
| `pages/dashboard/familia.html` | alumnos, solicitudes, pagos, documentos, profesores, familia, invitaciones. |
| `pages/dashboard/profesor.html` | profesor, clases, alumnos asignados, disponibilidad, documentos, ingresos. |
| `pages/dashboard/alumno.html` | alumno, clases, asignaciones, vista completa. |
| `js/chat-widget.js` | asignaciones. |
| `js/document-storage-provider.js` | Supabase Storage. |
| `js/notifications-provider.js` | Supabase realtime. |

### Datos Firebase actuales

| Coleccion | Conteo | Comentario |
| --- | ---: | --- |
| `users` | 5 | 1 admin, 1 familia, 3 profesores. |
| `profesores` | 25 | Importados, todos `pendiente_revision`, sin `profileComplete`. |
| `familias` | 1 | Dato vivo parcial. |
| `alumnos` | 1 | Dato vivo parcial. |
| `solicitudes` | 1 | Existe pero sin `matchStatus`. |
| `leadsPublicos` | 3 | Formulario publico activo. |
| `legacyImports` | 1 | Importacion legacy. |
| `importAudits` | 2 | Auditorias de importacion. |

Colecciones esperadas que aun no aparecen con datos vivos: `asignaciones`, `clases`, `pagos`, `documentos`, `notificaciones`, `chats`, `mensajes`, `incidencias`, `disponibilidad`, `matchingRuns`, `solicitudMatches`.

## 4. Diagnostico principal

### Lo que esta bien

- Firebase Auth funciona.
- Email/password funciona.
- Login/registro publico esta migrado a Firebase.
- Google Auth esta implementado en UI, aunque el audit de usuarios no muestra aun usuarios con provider `google.com`.
- Hosting esta centralizado en Firebase.
- Leads publicos escriben en Firestore.
- Responsive publico basico pasa en Chrome a 320/360/390 px.
- Hay una automatizacion de matching gratuita basada en reglas.
- Los scripts de auditoria existentes son utiles y pasan.
- Firestore Rules ya limitan campos de leads y perfiles basicos.

### Lo que bloquea producto

- Firebase Storage no existe.
- Admin, familia, profesor y alumno siguen muy dependientes de Supabase.
- Los profesores importados no tienen perfil normalizado completo.
- La asignacion profesor-alumno no esta cerrada de punta a punta en Firebase UI.
- La IA/matching esta mas cerca de backend que de producto usable.
- No hay una suite E2E que pruebe familia -> solicitud -> match -> asignacion -> chat.
- Falta observabilidad de conversion, matching, errores y operacion.

### Lo que genera sensacion de "no avanza"

- Se arreglan piezas, pero el flujo completo principal sigue cortado.
- El usuario ve mensajes legacy porque los dashboards aun miran Supabase.
- Mobile publico puede estar bien, pero admin privado concentra tablas y modales complejos.
- La migracion se ha hecho por infraestructura y no por casos de uso cerrados.

## 5. Lista priorizada de 110 mejoras reales

Prioridad: P0 bloqueante, P1 alta, P2 media, P3 mejora.  
Dificultad: Baja, Media, Alta.

| # | Mejora | Problema | Por que ocurre | Solucion | Impacto | Prioridad | Dificultad | Tiempo | Beneficio esperado |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Crear bucket Firebase Storage | Documentos no pueden migrar | Bucket no existe aunque APIs estan activas | Ejecutar creacion automatica y desplegar rules | Desbloquea documentos | P0 | Media | 1h | Quita bloqueo operativo clave |
| 2 | Normalizar profesores Firestore | 25 profesores sin `profileComplete` | Importacion no relleno campos de perfil | Script de normalizacion con campos minimos y flags | Asignacion fiable | P0 | Media | 0.5d | Admin puede validar perfiles |
| 3 | Crear `disponibilidad` Firebase | Profesor no puede operar sin Supabase | Dashboard profesor lee tabla Supabase | Coleccion `disponibilidad` e indice por `teacherUid` | Cierra perfil profesor | P0 | Media | 0.5d | Permite matching por horario |
| 4 | Crear `incidencias` Firebase | Admin depende de Supabase | Falta adaptador/datos Firestore | Coleccion, rules, adaptador y UI posterior | Soporte interno | P1 | Media | 0.5d | Menos legacy |
| 5 | Migrar lectura admin de profesores | Admin ve profesores legacy | `admin.html` consulta `db.from('profesores')` | Usar Firestore para seccion profesores | Alto | P0 | Alta | 1d | El admin puede revisar profesores reales Firebase |
| 6 | Migrar detalle profesor admin | Perfil completo depende de Supabase | Cache y modal usan estructura legacy | Mapear Firestore a modelo de UI | Alto | P0 | Media | 0.5d | Ver datos, foto, zona, materias |
| 7 | Flujo aprobar profesor Firebase | Aceptar profesores no es fiable | Estado legacy y perfil incompleto | Accion admin que valida campos y cambia status | Alto | P0 | Media | 0.5d | Profesores pasan a asignables |
| 8 | Formulario perfil profesor dentro del dashboard | Registro no debe pedir todo al principio | Hay friccion publica y perfil incompleto despues | Onboarding post-registro obligatorio | Alto | P0 | Alta | 1d | Menos abandono y mas datos completos |
| 9 | Wizard familia post-registro | Familias nuevas no completan contexto | Registro solo crea perfil base | Paso guiado: hijo, materia, nivel, zona, horario | Alto | P0 | Alta | 1d | Crea solicitud util sin pedir demasiado |
| 10 | Convertir lead familia a solicitud completa | Lead y operacion estan separados | Function crea solicitud parcial | Completar normalizacion de alumno/familia/request | Alto | P0 | Media | 0.5d | Reduce trabajo manual |
| 11 | Convertir lead profesor a candidato | Lead profesor no crea perfil operativo | Function solo diagnostica y notifica | Crear `profesores/{id}` candidato o tarea admin | Alto | P0 | Media | 0.5d | Admin puede aprobar desde panel |
| 12 | Unificar IDs Firebase | Mezcla `profesor_id`, `teacherUid`, `usuario_id` | Compatibilidad Supabase/Firebase | Definir `uid` canonico y aliases solo de lectura | Alto | P0 | Alta | 1d | Evita datos invisibles |
| 13 | Cerrar asignacion Firebase | Asignar depende de Supabase | Modal lee/escribe legacy | Usar `solicitudes`, `solicitudMatches`, `asignaciones` Firestore | Muy alto | P0 | Alta | 1.5d | Cierra el flujo core |
| 14 | Mostrar matches en admin desde Firebase | IA no visible de forma fiable | UI usa `solicitudMatches` legacy | Leer `solicitudMatches` Firestore | Alto | P0 | Media | 0.5d | Admin usa recomendaciones reales |
| 15 | Crear historial de matching | No se sabe por que se recomendo | Falta UI para `matchingRuns` | Panel con score, razones, riesgos, fecha | Alto | P1 | Media | 0.5d | Confianza y trazabilidad |
| 16 | Recalcular matching manual | Admin no puede forzar recomputo | Solo triggers/scheduler | Callable/HTTPS function admin-only | Alto | P1 | Media | 0.5d | Operacion recuperable |
| 17 | Matching por disponibilidad | Score no usa horario real estructurado | Disponibilidad no migrada | Normalizar franjas e incluirlas en score | Alto | P1 | Alta | 1d | Mejor calidad de asignacion |
| 18 | Matching por distancia/zona | Zona es texto libre | No hay geocoding ni normalizacion | Normalizar zona, CP, modalidad online/presencial | Alto | P1 | Media | 1d | Menos asignaciones malas |
| 19 | Matching por carga maxima | Usa estimacion simple | `maxStudents` y asignaciones incompletas | Mantener contador activo por profesor | Alto | P1 | Media | 0.5d | Evita saturar profesores |
| 20 | Matching por nivel/materia canonicos | Materias texto libre fallan | No hay taxonomia | Diccionario materia/nivel con aliases | Alto | P1 | Media | 1d | Mejores matches sin LLM |
| 21 | Activar Gemini solo con guardrails | IA opcional puede alucinar | Prompt JSON sin validacion fuerte | Usar reglas como base, LLM solo reordena y validar schema | Medio | P2 | Media | 0.5d | IA barata y controlada |
| 22 | Cache de resultados IA | LLM puede gastar de mas | Cada solicitud podria llamar modelo | Hash perfil+candidatos y cache en `aiCache` | Medio | P2 | Media | 0.5d | Coste menor |
| 23 | Modo gratis sin LLM | Se quiere coste cero | IA de pago no siempre necesaria | Mantener deterministic scoring como default | Alto | P0 | Baja | 0.2d | Matching sin coste variable |
| 24 | Evaluacion de matching | No se mide acierto | No hay feedback post-asignacion | Registrar aceptacion, cambio, queja, clase realizada | Alto | P1 | Media | 1d | Mejora continua real |
| 25 | Panel de cola operativa | Admin no ve trabajo priorizado | Datos dispersos por secciones | Bandeja: leads, solicitudes, profesores pendientes, incidencias | Alto | P1 | Alta | 1d | Menos tiempo operativo |
| 26 | Migrar familia dashboard minimo | Familia nueva entra pero ve legacy | `familia.html` consulta Supabase | Leer Firestore para perfil, hijos, solicitudes | Muy alto | P0 | Alta | 2d | Firebase se vuelve backend real |
| 27 | Crear hijo desde familia en Firebase | Alta de alumnos depende legacy | Form escribe Supabase | Adaptador `alumnos` + rules | Alto | P0 | Alta | 1d | Familia puede iniciar flujo |
| 28 | Solicitar profesor desde familia Firebase | Solicitudes siguen Supabase | Form escribe tabla legacy | Escribir `solicitudes` Firestore | Muy alto | P0 | Alta | 1d | Genera matching automatico |
| 29 | Mostrar profesor asignado a familia | Familia no ve asignacion Firebase | UI consulta joins Supabase | Leer `asignaciones` con snapshots | Alto | P0 | Media | 0.5d | Transparencia para padres |
| 30 | Migrar profesor dashboard minimo | Profesor nuevo queda sin operativa | `profesor.html` usa Supabase | Perfil, disponibilidad, asignaciones Firestore | Muy alto | P0 | Alta | 2d | Profesor puede trabajar |
| 31 | Mostrar alumnos asignados a profesor | Chat/asignacion no visible | Asignaciones no migradas UI | Consulta por `teacherUid` | Alto | P0 | Media | 0.5d | Profesor sabe a quien atender |
| 32 | Migrar alumno dashboard minimo | Alumno con acceso depende legacy | `alumno.html` usa Supabase | Leer `alumnos`, `asignaciones`, clases Firestore | Medio | P2 | Alta | 1d | Portal alumno funcional |
| 33 | Migrar clases a Firestore | Clases son nucleo operativo | Dashboard usa `clases` y vista SQL | Coleccion `clases` denormalizada | Alto | P1 | Alta | 2d | Gestion diaria sin Supabase |
| 34 | Validar solapes de clases | Firestore rules no pueden rangos complejos | Logica estaba en SQL trigger | Cloud Function transaccional | Alto | P1 | Alta | 1d | Evita errores de calendario |
| 35 | Calculo de comisiones server-side | Importe profesor no debe confiar en cliente | SQL tenia calculo | Funcion compartida o callable admin | Alto | P1 | Media | 0.5d | Pagos consistentes |
| 36 | Migrar pagos | Pagos bloqueados por Supabase/Storage | Datos y documentos legacy | `pagos` Firestore + Storage | Alto | P1 | Alta | 2d | Facturacion controlada |
| 37 | Migrar documentos metadata | Documentos dependen legacy | Storage no existe | `documentos` Firestore con owner y file path | Alto | P1 | Media | 1d | Base para justificantes |
| 38 | Migrar upload documentos | Upload usa Supabase Storage | Provider activo legacy | Firebase Storage provider tras bucket | Alto | P0 | Media | 0.5d | Subidas reales |
| 39 | Signed URLs o reglas directas | Lectura documentos debe ser privada | Modelo Supabase usaba signed URLs | Usar rules por owner/admin o function signed URL | Alto | P1 | Media | 0.5d | Seguridad documentos |
| 40 | Migrar notificaciones realtime | Supabase channel activo | `notifications-provider.js` usa realtime legacy | `onSnapshot` Firestore por `userUid` | Medio | P1 | Media | 0.5d | Avisos sin Supabase |
| 41 | Chat por asignacion | Chat debe limitarse familia-profesor-admin | Necesita permisos por asignacion | Colecciones `chats/{id}/messages` con participants | Alto | P1 | Alta | 1.5d | Comunicacion segura |
| 42 | Rules de chat | Riesgo de acceso cruzado | Permisos complejos | Rules por `participants` y admin | Alto | P1 | Alta | 0.5d | Privacidad |
| 43 | Moderacion de chat gratuita | Riesgo spam/abuso | Mensajes directos sin control | Filtros deterministas y reporte admin | Medio | P2 | Media | 0.5d | Menos riesgo |
| 44 | IA moderacion opcional | Riesgo contenido sensible | Filtros simples no bastan | LLM barato solo para mensajes reportados | Medio | P3 | Media | 0.5d | Seguridad escalable |
| 45 | Email transaccional | Notificaciones solo internas | Falta canal externo | Integrar proveedor gratuito/SMTP o Firebase extension si viable | Medio | P2 | Media | 1d | Mejor respuesta |
| 46 | WhatsApp manual asistido | Familias usan WhatsApp | No hay workflow | Plantillas copiables desde admin | Medio | P2 | Baja | 0.5d | Mas conversion sin coste |
| 47 | Antispam leads server-side | Honeypot cliente insuficiente | Firestore anon puede recibir abuso | Function o App Check/rate limit por IP/hash | Alto | P1 | Media | 1d | Protege costes y datos |
| 48 | App Check | Firestore publico expuesto a bots | Reglas validan pero no origen | Activar App Check gradual | Alto | P2 | Media | 1d | Menos abuso |
| 49 | Rate limit de registro | Auth puede ser atacado | No hay control UI/edge | Captcha progresivo o limitacion por backend | Medio | P2 | Media | 1d | Menos spam |
| 50 | Verificacion email obligatoria por accion sensible | Admin actual no verificado | Auth permite cuentas no verificadas | Requerir `emailVerified` para roles no admin o acciones criticas | Medio | P2 | Media | 0.5d | Mas confianza |
| 51 | Custom claims para admin | Rules leen `users/{uid}` | Cada rule hace get y depende del doc | Claims para rol admin + doc perfil | Medio | P2 | Media | 0.5d | Rules mas robustas |
| 52 | Auditoria de cambios | Falta trazabilidad completa | Solo eventos parciales | `auditLogs` por acciones admin y functions | Alto | P1 | Media | 1d | Control operativo |
| 53 | Observabilidad de errores frontend | Errores quedan en consola | No hay captura central | Logger cliente a `clientErrors` con rate limit | Alto | P1 | Media | 0.5d | Diagnostico rapido |
| 54 | Dashboards de salud interna | Estado disperso | Hay scripts pero no panel | Seccion admin "Sistema" con checks | Medio | P2 | Media | 1d | Menos incertidumbre |
| 55 | Alertas de funciones fallidas | Errores solo en logs | Sin notificacion | `automationEvents` de error + notificacion admin | Alto | P1 | Baja | 0.5d | Operacion proactiva |
| 56 | Tests E2E core | No se prueba flujo completo | Scripts parciales | Playwright: registro familia, solicitud, match, asignacion | Muy alto | P0 | Alta | 2d | Evita regresiones |
| 57 | Tests responsive admin autenticado | Quejas moviles persisten | Publico probado, privado no suficiente | E2E login admin y secciones 320/360/390 | Alto | P0 | Media | 1d | Cierra problema movil real |
| 58 | Convertir scripts Playwright en npm ejecutables | Scripts son funciones sueltas | CLI pasa mal multilinea | Wrapper Node que ejecute cada script | Medio | P1 | Baja | 0.5d | QA reproducible |
| 59 | Visual regression de modales | Modales son fragiles | Mucho CSS inline | Screenshots por viewport | Medio | P2 | Media | 1d | Evita roturas moviles |
| 60 | CI GitHub Actions | Checks locales no bastan | No hay pipeline obligado | `npm run check:quality`, functions, audits ligeros | Alto | P1 | Media | 1d | Calidad continua |
| 61 | Deploy preview controlado | Produccion se toca directamente | Flujo rapido sin staging real | Canal Firebase preview por branch | Medio | P2 | Media | 0.5d | Menos riesgo |
| 62 | Rollback documentado | Hay docs pero no flujo unico | Mucha historia acumulada | Runbook unico de deploy/rollback | Medio | P2 | Baja | 0.3d | Recuperacion rapida |
| 63 | Eliminar Netlify final | Doble hosting confunde | Config legacy persiste | Borrar Netlify tras DNS/Firebase estable | Medio | P2 | Baja | 0.5d | Menos superficies |
| 64 | Eliminar Supabase final | Runtime aun lo usa | Dashboards legacy | Migrar modulos y borrar cliente/config | Muy alto | P0 | Alta | 5d | Backend unico |
| 65 | CSP sin `unsafe-inline` | Seguridad degradada | JS/CSS inline masivo | Mover handlers/estilos a archivos y nonces si aplica | Alto | P2 | Alta | 3d | Menos XSS |
| 66 | Reducir `innerHTML` | Riesgo XSS y bugs layout | Render manual con strings | Helpers DOM seguros o templates sanitizadas | Alto | P1 | Alta | 2d | Seguridad y mantenibilidad |
| 67 | Revisar `sanitize` central | Sanitizacion dispersa | Cada dashboard define logica | Utilidad unica importable | Medio | P1 | Media | 0.5d | Menos errores |
| 68 | Quitar handlers inline | 497 `on...` detectados | HTML mezcla comportamiento | Event delegation en JS | Medio | P2 | Alta | 2d | CSP y mantenibilidad |
| 69 | Quitar estilos inline | 466 `style=` detectados | Ajustes rapidos en HTML | Clases CSS semanticas | Medio | P2 | Alta | 2d | Responsive consistente |
| 70 | Componentizar tablas | Tablas repetidas | Dashboards copian patrones | Tabla responsive compartida | Alto | P1 | Alta | 1.5d | Menos bugs moviles |
| 71 | Tablas mobile tipo cards | Tablas horizontales son incomodas | `overflow-x` solo parchea | Card rows en mobile para admin/familia/profesor | Alto | P0 | Media | 1d | Mejora movil real |
| 72 | Filtros compactos mobile | Inputs fijos de 220-260px | Estilos inline | Barra de filtros apilada y collapsible | Alto | P0 | Media | 0.5d | Sin overflow |
| 73 | Modales full-screen mobile | Modal puede ser estrecho/largo | Desktop-first | Bottom sheet o pantalla completa en mobile | Alto | P0 | Media | 0.5d | Asignacion usable |
| 74 | Menu dashboard mobile persistente | Sidebar puede ocultar contexto | Patron desktop adaptado | Top bar + drawer + breadcrumbs | Medio | P1 | Media | 1d | Navegacion clara |
| 75 | Estados vacios accionables | Muchas tablas dicen "sin datos" | Falta siguiente accion | Empty states con CTA contextual | Alto | P1 | Media | 0.5d | Menos bloqueo usuario |
| 76 | Errores con accion | Mensajes legacy no guian | Fallos Supabase antiguos | Error + accion alternativa Firebase | Alto | P1 | Baja | 0.5d | Menos frustracion |
| 77 | Skeletons y loaders consistentes | "Cargando" repetido | Render manual | Componente de loading por seccion | Medio | P2 | Baja | 0.5d | Sensacion profesional |
| 78 | Toasts accesibles | Feedback puede perderse | No siempre `aria-live` | Region global accesible | Medio | P2 | Baja | 0.3d | A11y |
| 79 | Foco en modales | Navegacion teclado frágil | Modales custom | Focus trap y retorno de foco | Medio | P2 | Media | 0.5d | Accesibilidad |
| 80 | Contraste y tamanos tactiles | Mobile necesita targets | CSS no auditado por WCAG completo | Revisar botones 44px y contraste | Medio | P2 | Media | 1d | Uso movil |
| 81 | Onboarding profesor progresivo | Pedir todo publico reduce conversion | Form largo en landing era friccion | Cuenta primero, perfil despues con progreso | Alto | P0 | Alta | 1d | Mas altas y mejor perfil |
| 82 | Onboarding familia ligero | Obligar cuenta puede bajar leads | Mercado necesita baja friccion | Lead corto o cuenta Google, luego detalle | Alto | P0 | Alta | 1d | Conversion |
| 83 | Credenciales automaticas para leads | Crear password desde email es inseguro | Idea operativa pero mala seguridad | Mejor magic link o invitacion Firebase reset | Alto | P1 | Media | 0.5d | Seguridad sin friccion |
| 84 | Google sign-in por rol | Google login sin perfil puede fallar | No siempre hay rol | Botones "Google como familia/profesor" | Alto | P1 | Baja | 0.5d | Menos errores |
| 85 | Perfil incompleto bloqueante | Profesor puede existir sin datos utiles | Firestore permite minima alta | Guard de dashboard hasta completar perfil | Alto | P0 | Media | 0.5d | Datos de calidad |
| 86 | Foto profesor con validacion | Foto pedida pero Storage bloqueado | No hay bucket | Upload a Storage y fallback iniciales | Medio | P1 | Media | 0.5d | Confianza |
| 87 | Verificacion documental profesor | Calidad marketplace depende confianza | Documentos legacy | Tipo documento + estado revision | Alto | P1 | Alta | 1d | Seguridad familias |
| 88 | Scoring de confianza profesor | Admin necesita priorizar | Datos dispersos | Score por perfil, docs, experiencia, respuesta | Medio | P2 | Media | 1d | Mejor seleccion |
| 89 | Perfil publico profesor futuro | SEO y confianza desaprovechados | Profesores privados | Landing indexable para profesores verificados si aceptan | Medio | P3 | Alta | 2d | SEO y conversion |
| 90 | Taxonomia SEO por materias | Paginas SEO pocas y manuales | Generador limitado | Clusters materia+nivel+zona | Alto | P1 | Media | 1d | Trafico organico |
| 91 | Schema SEO ampliado | Rich results limitados | Schema basico | `EducationalOrganization`, FAQ, LocalBusiness, Course where valid | Medio | P2 | Media | 0.5d | CTR |
| 92 | Medicion conversion | No se sabe que convierte | Analytics basico insuficiente | Eventos: view, start form, submit, signup, request | Alto | P1 | Media | 0.5d | Decisiones con datos |
| 93 | UTM hasta solicitud | Leads guardan UTM, no siempre operaciones | Metadata se pierde | Propagar UTM a familia/solicitud | Medio | P1 | Baja | 0.3d | CAC por canal |
| 94 | Funnel admin | No hay pipeline visible | Estados dispersos | Lead -> solicitud -> match -> asignacion -> clase | Alto | P1 | Alta | 1d | Gestion marketplace |
| 95 | Recordatorios automaticos | Leads se enfrían | Admin manual | Scheduled functions para pendientes | Medio | P2 | Media | 0.5d | Mas conversion |
| 96 | Emails de seguimiento | Sin nurture | Falta motor email | Plantillas por estado | Medio | P2 | Media | 1d | Retencion |
| 97 | NPS despues de clase | No se mide calidad | Sin feedback | Encuesta corta por familia/profesor | Medio | P2 | Media | 1d | Mejora servicio |
| 98 | Alertas de churn | Familias inactivas no se detectan | Sin analitica de clases | Query clases/sesiones sin actividad | Medio | P2 | Media | 1d | Retencion |
| 99 | Pricing estructurado | Tarifas texto libre | No hay modelo comercial | Campos numericos tarifa familia/profesor/comision | Alto | P1 | Media | 1d | Margen controlado |
| 100 | Motor de comision configurable | Comision hardcoded/legacy | SQL y funciones dispersas | `configuracion/pricing` + function | Alto | P1 | Media | 0.5d | Cambios sin deploy |
| 101 | Importacion Supabase a Firestore | Datos legacy no migrados | Supabase no responde o no esta integrado | Export validado + mapper por coleccion | Alto | P0 | Alta | 2d | Elimina dependencia real |
| 102 | Mapa de correspondencias legacy | IDs antiguos siguen necesarios | Datos importados mezclados | `legacyMappings/{type_id}` | Alto | P1 | Media | 0.5d | Migracion segura |
| 103 | Backfill de agregados admin | Vistas SQL faltan en Firestore | Firestore no hace joins | `adminStats/current` y summaries | Alto | P1 | Media | 1d | Dashboard rapido |
| 104 | Indices Firestore completos | Queries futuras fallaran | Indexes actuales son minimos | Definir indices por dashboard antes de migrar | Alto | P1 | Media | 0.5d | Menos errores runtime |
| 105 | Paginar siempre | Lecturas pueden crecer | Varias consultas cargan todo | `limit`, cursor, filtros indexados | Alto | P1 | Media | 1d | Escalabilidad |
| 106 | Denormalizacion controlada | Firestore no reemplaza SQL joins directo | Vistas Supabase usadas | Snapshots de nombres/email/materia en documentos | Alto | P1 | Alta | 1d | UI simple y rapida |
| 107 | Validacion schema compartida | Cliente/functions/rules pueden divergir | No hay schema unico | Definir contratos JS + tests | Alto | P1 | Alta | 1d | Menos bugs de datos |
| 108 | Internacionalizacion futura | Textos hardcoded | HTML estatico | Diccionario `es` y helper gradual | Bajo | P3 | Alta | 2d | Escalabilidad futura |
| 109 | Politica RGPD operativa | Se capturan datos sensibles | Docs legales no bastan | Retencion, export, borrado, consentimiento versionado | Alto | P1 | Alta | 1.5d | Riesgo legal menor |
| 110 | Preparar arquitectura modular | Dashboards gigantes frenan todo | HTML mezcla vista, datos y acciones | Extraer servicios, componentes y adaptadores por modulo | Muy alto | P0 | Alta | 5d | Velocidad real de desarrollo |

## 6. Roadmap por ROI

### Fase 1: cerrar el flujo core Firebase sin tocar todo

Objetivo: que una familia pueda pedir profesor y que admin pueda asignar un profesor Firebase.

Orden:

1. Crear o desbloquear Firebase Storage.
2. Normalizar profesores Firestore.
3. Completar `disponibilidad` e `incidencias` como dominios Firebase.
4. Migrar seccion admin de profesores a Firestore.
5. Migrar seccion admin de solicitudes y modal de asignar a Firestore.
6. Crear asignacion Firebase desde admin.
7. Mostrar asignacion en familia/profesor.
8. Tests E2E core y responsive admin.

### Fase 2: dashboards privados minimos Firebase

Objetivo: que familia, profesor y alumno funcionen sin Supabase para lo esencial.

Orden:

1. Familia: perfil, hijos, solicitudes, profesor asignado.
2. Profesor: perfil, disponibilidad, alumnos asignados.
3. Admin: bandeja operativa y auditoria.
4. Alumno: vista basica.
5. Notificaciones Firestore.

### Fase 3: operacion completa

Objetivo: clases, pagos, documentos, chat y notificaciones sin Supabase.

Orden:

1. Clases con validacion de solapes.
2. Pagos y comisiones.
3. Documentos Storage.
4. Chat por asignacion.
5. Resumen mensual y analitica.

### Fase 4: escala y ventaja competitiva

Objetivo: marketplace medible y defendible.

Orden:

1. Matching con feedback loop.
2. Scoring de confianza de profesor.
3. SEO por clusters.
4. Automatizaciones de conversion.
5. IA opcional y cacheada para casos donde aporte valor medible.

## 7. Recomendacion de arquitectura IA

La mejor arquitectura no es "meter GPT en todo". Para ClasesDe10, la ruta correcta es:

1. Reglas deterministas gratis como base.
2. Taxonomias controladas para materia, nivel, modalidad, zona y disponibilidad.
3. Scores transparentes guardados en Firestore.
4. Feedback de resultados reales.
5. LLM opcional solo para desempatar, resumir perfiles, detectar riesgos o generar mensajes.

Uso recomendado por caso:

| Caso | Modelo recomendado | Momento | Coste | Guardrail |
| --- | --- | --- | --- | --- |
| Matching inicial | Reglas propias | Al crear solicitud | Gratis | Score explicable |
| Reordenar candidatos dificiles | Gemini Flash o GPT mini | Solo si hay 3+ candidatos cercanos | Bajo | JSON schema + cache |
| Resumir perfil profesor | Modelo barato o reglas | Al completar perfil | Bajo | No inventar, solo campos dados |
| Detectar perfil incompleto | Reglas | Al guardar perfil | Gratis | Lista fija de campos |
| Moderar chat | Reglas primero, LLM en reportes | Al reportar o alta sospecha | Bajo | Decision humana para sancion |
| SEO | LLM solo borradores | Offline/admin | Bajo | Revision antes de publicar |
| Emails/WhatsApp | Plantillas + variables | Por estado | Gratis | Sin promesas no verificadas |

No recomiendo RAG, embeddings ni agentes complejos en esta fase. Antes hay que cerrar datos, permisos y flujos. Embeddings pueden venir despues para busqueda semantica de profesores, pero no antes de normalizar perfiles.

## 8. Riesgos principales

| Riesgo | Nivel | Mitigacion |
| --- | --- | --- |
| Activar UI Firebase parcial y romper dashboards | Alto | Migrar modulo por modulo con flags y rollback. |
| Datos duplicados Supabase/Firebase inconsistentes | Alto | `legacyMappings`, IDs canonicos y una fuente de verdad por modulo. |
| Reglas Firestore demasiado permisivas | Alto | Tests por rol antes de abrir escrituras. |
| Storage privado mal configurado | Alto | Rules por owner/admin y pruebas reales. |
| IA inventando razones de match | Medio | Reglas primero, LLM solo sobre candidatos reales, schema y cache. |
| Mobile admin roto por tablas | Alto | Card layout por tabla y visual tests. |
| Costes por bots en leads | Medio | App Check, rate limits, honeypot server-side. |
| Dependencia de credenciales locales | Medio | Documentar CLI, ADC y service accounts separadas. |

## 9. Secuencia optima desde el estado actual

1. Intentar crear bucket Firebase Storage automaticamente.
2. Si Storage queda creado, desplegar y probar rules.
3. Crear tests Playwright ejecutables para admin mobile autenticado.
4. Normalizar profesores Firestore.
5. Migrar admin profesores a Firestore.
6. Migrar admin solicitudes/matches/asignacion a Firestore.
7. Migrar familia solicitud/alumnos a Firestore.
8. Migrar profesor perfil/disponibilidad/asignaciones a Firestore.
9. Activar chat por asignacion.
10. Migrar documentos.
11. Migrar clases y pagos.
12. Eliminar runtime Supabase.
13. Quitar Netlify.
14. Endurecer CSP quitando inline JS/CSS.

## 10. Porcentaje real estimado

| Area | Migracion a Firebase |
| --- | ---: |
| Hosting | 90% |
| Auth | 80% |
| Formularios publicos/leads | 80% |
| Usuarios base | 70% |
| Profesores | 45% |
| Familias | 35% |
| Alumnos | 25% |
| Solicitudes | 35% |
| Matching backend | 60% |
| Matching UI/admin | 25% |
| Asignaciones | 20% |
| Clases | 10% |
| Pagos | 5% |
| Documentos | 10% |
| Notificaciones | 15% |
| Chat | 20% |
| Supabase eliminado | 0% |

Estimacion global: 45% migrado a Firebase.  
Estimacion del nucleo operativo privado: 25%-30% migrado.

## 11. Decision CTO

La decision correcta es dejar de medir avance por "cuantas piezas se han migrado" y medirlo por flujos cerrados.

El primer flujo que debe quedar cerrado es:

`familia/lead -> solicitud -> matching -> admin asigna -> asignacion -> familia/profesor lo ven`.

Hasta que ese flujo no funcione en Firebase, cualquier otra mejora se sentira como avance lateral.
