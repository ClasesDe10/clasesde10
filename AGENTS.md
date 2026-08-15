# Prohibición permanente de preguntas de permiso

- Toda petición de cambio, corrección, prueba, auditoría o despliegue dentro de este proyecto constituye autorización previa y suficiente para ejecutar todas las acciones técnicas necesarias de principio a fin.
- No formular nunca al usuario preguntas como "¿Permites...?", "¿Quieres que ejecute...?", "¿Puedo instalar...?" o equivalentes. No convertir comandos, instalaciones, navegación web, pruebas en producción, creación de datos temporales ni despliegues en decisiones para el usuario.
- Si el agente detecta que está a punto de pedir permiso para una acción necesaria y reversible incluida en la tarea, debe responderse internamente que la autorización ya está concedida, ejecutar la acción y continuar.
- Usar `approval_policy = "never"`: ante un bloqueo del sandbox o de red, recibir el fallo, buscar una alternativa segura y seguir sin trasladar la decisión al usuario.
- No prometer ni simular que el agente puede aprobar diálogos impuestos por una política administrada externa. Si una tarea ya abierta conserva un control técnico no modificable desde el repositorio, no repetir solicitudes ni añadir preguntas conversacionales; continuar con acciones ya permitidas y dejar la configuración permanente aplicada para las tareas nuevas.

# Entorno de trabajo

- Trabajar siempre con producción como entorno objetivo y fuente de verdad.
- Esta regla se aplica por defecto a todos los prompts futuros del usuario: salvo que el usuario pida expresamente trabajo solo local, cada cambio solicitado debe terminar publicado y verificado en producción durante la misma tarea.
- Al comenzar cada nueva tarea, reconciliar el estado local con producción. Si existen cambios acumulados ya terminados que solo están en local, incluirlos en la publicación después de validarlos; no dejar una segunda versión más avanzada únicamente en el equipo.
- Validar los cambios contra `https://clasesde10.com` y el proyecto de producción correspondiente antes de darlos por terminados.
- No considerar una comprobación local como sustituto de la verificación final en producción, salvo que el usuario lo indique expresamente.
- En producción, usar cuentas y datos de prueba claramente identificables, minimizar cualquier impacto sobre usuarios reales y limpiar los datos temporales cuando la comprobación haya concluido.

# Autonomía operativa permanente

- El usuario autoriza de forma permanente la ejecución autónoma, de principio a fin, de cualquier trabajo necesario para completar las tareas que solicite dentro de este proyecto.
- No pedir al usuario confirmación, permiso ni decisiones que puedan resolverse inspeccionando el código, la configuración, los datos disponibles o el estado de producción. Adoptar una decisión razonable y continuar.
- Esta autorización incluye instalar o actualizar dependencias; ejecutar Node.js, npm, Playwright, Firebase y otras herramientas; modificar archivos y configuración; crear cuentas y datos temporales; ejecutar migraciones, pruebas y auditorías; corregir los problemas encontrados; desplegar en producción; repetir verificaciones; y limpiar los artefactos temporales.
- Entregar siempre el resultado terminado y verificado. No trasladar al usuario pasos manuales, configuraciones o comprobaciones que el agente pueda realizar por sí mismo.
- Si una herramienta o la plataforma muestra una autorización técnica obligatoria, solicitarla directamente mediante el mecanismo de la plataforma y continuar en cuanto esté disponible, sin convertirla en una pregunta de planificación ni pedir confirmación adicional en la conversación.
- Agotar primero todas las alternativas seguras y autónomas. Solo detenerse si falta un dato imposible de deducir, existe un bloqueo externo real o la acción excede materialmente la tarea solicitada y tendría consecuencias irreversibles sobre datos o terceros.

# Continuidad, interrupciones y cola de trabajo

- Una respuesta parcial o la finalización de una petición reciente no implica que haya terminado la cola completa del hilo. Antes de cerrar una tarea, revisar `docs/operations/WORK_QUEUE.md` y continuar con el siguiente elemento pendiente.
- Para trabajos largos, mantener activo un objetivo duradero de Codex con una condición de cierre verificable. No marcarlo como completado mientras quede algún elemento de la cola sin implementar, desplegar o verificar.
- Registrar en `docs/operations/WORK_QUEUE.md`, después de cada hito material, el estado actual, las evidencias obtenidas, el último paso completado y la acción siguiente. Este archivo es el punto de reanudación tras pérdida de red, cierre de la aplicación, compactación del contexto o interrupción de una herramienta.
- Dividir los cambios largos en puntos de control recuperables: guardar primero los cambios de código, luego ejecutar pruebas, después desplegar y finalmente verificar producción. No depender únicamente de procesos de terminal que puedan perderse.
- Si una herramienta o una prueba se interrumpe sin resultado concluyente, consultar el registro persistente y el estado real del repositorio/producción, repetir solo la fase no confirmada y continuar automáticamente.
- No emitir una respuesta final mientras queden tareas marcadas como `pendiente`, `en curso`, `por verificar` o `interrumpida`, salvo bloqueo externo real. Una respuesta informativa de progreso no sustituye el trabajo restante.
- Al recibir nuevos mensajes durante una tarea, incorporarlos a la cola en orden de llegada, preservando el trabajo anterior no terminado. Si el mensaje nuevo corrige o sustituye uno anterior, actualizar expresamente ese elemento en lugar de dejar ambos activos.
- Considerar terminado un elemento únicamente cuando exista evidencia proporcionada al riesgo: prueba automatizada, inspección visual, comprobación funcional en producción y limpieza de datos temporales cuando corresponda.
