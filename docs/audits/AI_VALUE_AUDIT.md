# Auditoria de IA con impacto real

Fecha: 2026-06-28

## Criterio

No se ha anadido IA generativa por marketing. La decision tecnica sigue siendo:

- Reglas deterministas primero.
- Coste cero por defecto.
- LLM solo como capa opcional, acotada y cacheable.
- Ninguna IA puede inventar profesores, saltarse bloqueos o modificar datos criticos sin trazabilidad.

## Estado previo encontrado

Ya existia una buena base:

- Matching profesional en `js/ai-engine.js`.
- Ranking explicable por materia, nivel, modalidad, ubicacion, disponibilidad, experiencia, reputacion, capacidad y calidad de perfil.
- Reranking opcional con Gemini en `scripts/firebase-automation-worker.mjs`.
- Ajuste de IA generativa acotado y sin permitir candidatos inventados.
- Diagnostico IA visible en administracion para profesores y solicitudes.

## Mejoras implementadas

### 1. Asistente de perfil de profesor

Funcion: `buildTeacherProfileRecommendations`.

Valor:
- Genera descripcion profesional sugerida sin llamar a ningun modelo.
- Detecta siguientes acciones por prioridad.
- Resume senales de confianza y checks de administrador.
- Ayuda a completar perfiles antes de asignar.

Coste: 0.
Latencia esperada: <80 ms.

### 2. Brief inteligente de solicitud familiar

Funcion: `buildFamilyRequestBrief`.

Valor:
- Resume la necesidad real de la familia.
- Detecta campos que faltan para hacer buen matching.
- Marca urgencia si hay examen, recuperacion o necesidad inmediata.
- Se guarda en solicitudes creadas desde leads publicos.

Coste: 0.
Latencia esperada: <80 ms.

### 3. Moderacion ligera de contenido

Funcion: `moderateContent`.

Valor:
- Detecta spam probable.
- Detecta datos bancarios/IBAN.
- Detecta intento de pago fuera de plataforma.
- Detecta lenguaje abusivo o seguridad.
- No bloquea automaticamente leads legitimos: marca revision.

Coste: 0.
Latencia esperada: <80 ms.

### 4. Clasificacion de incidencias

Funcion: `classifyIncident`.

Valor:
- Clasifica incidencias en seguridad, pago, asistencia, horario, calidad, comunicacion, documentacion, tecnica u operativa.
- Asigna prioridad y SLA.
- Propone acciones operativas.
- El worker clasifica incidencias nuevas y existentes sin clasificacion.

Coste: 0.
Latencia esperada: <80 ms.

### 5. Busqueda semantica local

Funcion: `semanticSearchItems`.

Valor:
- Mejora busqueda por conceptos relacionados sin pagar embeddings.
- Entiende familias de materias y niveles ya usadas por el matching.
- Sirve como base para busqueda admin/profesores antes de meter vectores.

Coste: 0.
Latencia esperada: local e inmediata para listas pequenas/medias.

### 6. Politica de ejecucion de IA

Funcion: `getAiExecutionPolicy`.

Valor:
- Cada tarea declara si usa modo local o LLM opcional.
- Incluye cache key, TTL, latencia objetivo, coste y control anti-alucinacion.
- Evita que futuras integraciones llamen a modelos caros sin criterio.

## Integracion operativa

`scripts/firebase-automation-worker.mjs` ahora:

- Modera leads publicos y guarda `aiModeration`.
- Enriquece leads de profesor con `profileAssistant`.
- Enriquece solicitudes de familia con `aiBrief`.
- Guarda `aiVersion`.
- Clasifica incidencias automaticas de clases.
- Clasifica incidencias existentes que sigan abiertas y no tengan `aiClassification`.
- Notifica al admin si una incidencia queda con prioridad alta.

## Lo que NO se implemento

- Embeddings externos: no compensa hasta tener volumen y busqueda con datos reales.
- Chatbot generativo para padres/profesores: riesgo de prometer cosas incorrectas y coste recurrente.
- OCR/PDF multimodal: depende de Storage y documentos reales.
- LLM para redactar todos los mensajes: puede sonar artificial y no mejora el cuello de botella actual.
- IA de voz: no aporta ROI en esta fase.

## Coste y latencia

Modo actual recomendado:

- Matching base: local, gratis.
- Perfiles: local, gratis.
- Solicitudes: local, gratis.
- Moderacion: local, gratis.
- Incidencias: local, gratis.
- Busqueda: local, gratis.
- Gemini: solo reranking opcional de candidatos ya calculados, con ajuste acotado.

## Medicion recomendada

Medir antes de subir complejidad:

- Tiempo desde lead hasta solicitud estructurada.
- Porcentaje de solicitudes con datos suficientes.
- Porcentaje de profesores asignables.
- Tiempo hasta primera propuesta.
- Profesor recomendado vs profesor elegido.
- Clases realizadas/canceladas por fuente de matching.
- Incidencias por categoria y SLA.
- Leads marcados para revision que terminan siendo spam real.

## Conclusion

La IA mas valiosa ahora no es un chatbot. Es inteligencia operacional barata: ordenar, completar, clasificar, detectar riesgos y explicar decisiones. La plataforma queda preparada para usar LLMs solo donde haya mejora medible y con control de coste.
