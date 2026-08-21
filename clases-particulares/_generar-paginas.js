#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://clasesde10.com';
// Se actualiza únicamente cuando cambia de forma sustancial el contenido SEO.
// Google recomienda que `lastmod` refleje cambios reales, no cada ejecución.
const SEO_CONTENT_LASTMOD = '2026-08-21';
const SEO_ENGINE_VERSION = 'seo-engine-2026-08-21-madrid-authority';
const ORGANIZATION_ID = `${DOMAIN}/#organization`;
const WEBSITE_ID = `${DOMAIN}/#website`;

const CITIES = [
  { slug: 'madrid', name: 'Madrid', region: 'Comunidad de Madrid', intent: 'alta demanda de refuerzo escolar, Bachillerato y EBAU', modality: 'presencial y online' },
];

const SUBJECTS = [
  {
    slug: 'matematicas',
    name: 'Matemáticas',
    short: 'mates',
    category: 'ciencias',
    levels: ['Primaria', 'ESO', 'Bachillerato', 'EBAU', 'Universidad'],
    pains: ['bloqueos con problemas', 'falta de base', 'preparación de exámenes'],
    outcomes: ['razonamiento paso a paso', 'seguridad en ejercicios', 'mejora de notas'],
    faq: [
      ['¿Qué nivel de matemáticas cubrís?', 'Trabajamos desde Primaria hasta universidad, incluyendo ESO, Bachillerato, EBAU, álgebra, cálculo y estadística.'],
      ['¿Puedo pedir profesor para preparar un examen concreto?', 'Sí. La solicitud puede centrarse en un examen, recuperación, selectividad o seguimiento semanal.'],
    ],
  },
  {
    slug: 'ingles',
    name: 'Inglés',
    short: 'inglés',
    category: 'idiomas',
    levels: ['Primaria', 'ESO', 'Bachillerato', 'Cambridge', 'IELTS', 'Conversación'],
    pains: ['falta de fluidez', 'gramática irregular', 'preparación de certificados'],
    outcomes: ['más conversación', 'mejor comprensión', 'preparación orientada a objetivos'],
    faq: [
      ['¿Hay profesores para conversación?', 'Sí. Puedes pedir clases centradas en conversación, pronunciación, gramática o preparación de certificados.'],
      ['¿Preparáis Cambridge, IELTS o TOEFL?', 'La plataforma permite encontrar profesores con experiencia en certificados oficiales cuando el caso lo requiere.'],
    ],
  },
  {
    slug: 'fisica',
    name: 'Física',
    short: 'física',
    category: 'ciencias',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Universidad', 'Ingeniería'],
    pains: ['problemas de teoría', 'ejercicios largos', 'poca práctica guiada'],
    outcomes: ['método de resolución', 'comprensión de fórmulas', 'entrenamiento de examen'],
    faq: [
      ['¿Cubren Física y Química de ESO?', 'Sí. Muchos casos de ESO combinan Física y Química, y se pueden trabajar juntas.'],
      ['¿Hay apoyo para ingeniería?', 'Sí, especialmente en asignaturas de base como mecánica, electricidad, termodinámica o física general.'],
    ],
  },
  {
    slug: 'quimica',
    name: 'Química',
    short: 'química',
    category: 'ciencias',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Universidad', 'Ciencias de la Salud'],
    pains: ['formulación', 'estequiometría', 'química orgánica'],
    outcomes: ['dominio de ejercicios tipo', 'orden en procedimientos', 'mejor preparación de pruebas'],
    faq: [
      ['¿Se puede trabajar formulación desde cero?', 'Sí. El profesor puede empezar por nomenclatura, formulación y base teórica antes de avanzar.'],
      ['¿Preparáis Química de selectividad?', 'Sí. Se puede orientar la clase al modelo de examen y a los criterios de corrección.'],
    ],
  },
  {
    slug: 'lengua',
    name: 'Lengua y Literatura',
    short: 'lengua',
    category: 'humanidades',
    levels: ['Primaria', 'ESO', 'Bachillerato', 'EBAU', 'ELE'],
    pains: ['sintaxis', 'comentario de texto', 'ortografía y redacción'],
    outcomes: ['mejor expresión escrita', 'análisis ordenado', 'seguridad en exámenes'],
    faq: [
      ['¿Ayudáis con comentario de texto?', 'Sí. Se puede trabajar estructura, análisis, argumentación y práctica con textos reales.'],
      ['¿También hay clases de español para extranjeros?', 'Sí. Puedes solicitar apoyo de español como lengua extranjera según nivel y objetivo.'],
    ],
  },
  {
    slug: 'biologia',
    name: 'Biología',
    short: 'biología',
    category: 'ciencias',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Universidad', 'Ciencias de la Salud'],
    pains: ['temario amplio', 'memorización sin método', 'preparación EBAU'],
    outcomes: ['esquemas útiles', 'comprensión de procesos', 'repaso orientado a examen'],
    faq: [
      ['¿Incluye Biología y Geología?', 'Sí. En ESO se puede trabajar Biología y Geología en la misma planificación.'],
      ['¿Sirve para carreras sanitarias?', 'Sí. También puede orientarse a contenidos de base universitaria.'],
    ],
  },
  {
    slug: 'historia',
    name: 'Historia',
    short: 'historia',
    category: 'humanidades',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Historia del Arte', 'Geografía'],
    pains: ['demasiada teoría', 'comentario histórico', 'fechas sin contexto'],
    outcomes: ['líneas temporales claras', 'mejor argumentación', 'respuestas de examen más sólidas'],
    faq: [
      ['¿Preparáis Historia de España para EBAU?', 'Sí. Se puede trabajar temario, comentarios, temas largos y práctica de examen.'],
      ['¿Hay apoyo en Historia del Arte?', 'Sí. Puedes pedir profesores con perfil de humanidades o arte.'],
    ],
  },
  {
    slug: 'primaria',
    name: 'Primaria',
    short: 'primaria',
    category: 'refuerzo escolar',
    levels: ['1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria'],
    pains: ['falta de hábito', 'dificultades de lectura', 'base de matemáticas'],
    outcomes: ['rutina de estudio', 'confianza', 'seguimiento cercano con la familia'],
    faq: [
      ['¿Puede ser apoyo general?', 'Sí. En Primaria es habitual trabajar varias asignaturas en la misma clase.'],
      ['¿Cuántas clases semanales suelen hacer falta?', 'Depende del caso, pero muchas familias empiezan con una o dos sesiones por semana.'],
    ],
  },
  {
    slug: 'eso',
    name: 'ESO',
    short: 'ESO',
    category: 'refuerzo escolar',
    levels: ['1º ESO', '2º ESO', '3º ESO', '4º ESO', 'Recuperaciones'],
    pains: ['salto de dificultad', 'asignaturas acumuladas', 'falta de organización'],
    outcomes: ['plan semanal', 'recuperación de base', 'seguimiento de deberes y exámenes'],
    faq: [
      ['¿Se pueden trabajar varias asignaturas?', 'Sí. Muchos casos de ESO combinan matemáticas, lengua, inglés o ciencias.'],
      ['¿Ayudáis con recuperaciones?', 'Sí. Se puede preparar un plan intensivo orientado a recuperar asignaturas.'],
    ],
  },
  {
    slug: 'bachillerato',
    name: 'Bachillerato',
    short: 'bachillerato',
    category: 'refuerzo escolar',
    levels: ['1º Bachillerato', '2º Bachillerato', 'Ciencias', 'Sociales', 'Humanidades'],
    pains: ['ritmo alto', 'notas de acceso', 'materias muy específicas'],
    outcomes: ['priorización del temario', 'preparación de exámenes', 'continuidad hasta EBAU'],
    faq: [
      ['¿Hay profesores por modalidad?', 'Sí. Se puede buscar perfil para ciencias, sociales, humanidades o asignaturas concretas.'],
      ['¿Se puede combinar con preparación EBAU?', 'Sí. Muchos planes de Bachillerato se orientan ya a la prueba de acceso.'],
    ],
  },
  {
    slug: 'selectividad',
    name: 'Selectividad EBAU',
    short: 'EBAU',
    category: 'preparación de exámenes',
    levels: ['EBAU', 'EvAU', 'PAU', '2º Bachillerato', 'Intensivos'],
    pains: ['poco tiempo', 'presión por la nota', 'dudas de criterios de corrección'],
    outcomes: ['simulacros', 'ejercicios tipo', 'plan de repaso medible'],
    faq: [
      ['¿Cuándo conviene empezar?', 'Lo ideal es empezar con margen, pero también se pueden organizar intensivos antes de la prueba.'],
      ['¿Los profesores conocen el formato EBAU?', 'La solicitud permite priorizar profesores con experiencia específica en preparación de selectividad.'],
    ],
  },
  {
    slug: 'universidad',
    name: 'Universidad',
    short: 'universidad',
    category: 'universidad',
    levels: ['Cálculo', 'Álgebra', 'Estadística', 'Programación', 'Economía', 'Ingeniería'],
    pains: ['asignaturas densas', 'prácticas difíciles', 'exámenes parciales'],
    outcomes: ['resolución guiada', 'preparación de parciales', 'mejor método de estudio'],
    faq: [
      ['¿Hay clases para carreras técnicas?', 'Sí. Puedes pedir apoyo en cálculo, álgebra, estadística, física, programación u otras materias.'],
      ['¿Ayudáis con trabajos?', 'Se puede recibir orientación metodológica y explicación, manteniendo siempre un uso académico responsable.'],
    ],
  },
  {
    slug: 'programacion',
    name: 'Programación',
    short: 'programación',
    category: 'tecnología',
    levels: ['Python', 'JavaScript', 'Java', 'Universidad', 'FP', 'Adultos'],
    pains: ['errores de lógica', 'falta de práctica', 'proyectos bloqueados'],
    outcomes: ['pensamiento computacional', 'código explicado', 'mejor autonomía'],
    faq: [
      ['¿Puedo aprender desde cero?', 'Sí. Hay clases para principiantes, estudiantes de FP, universidad y adultos.'],
      ['¿Se puede trabajar con mi propio proyecto?', 'Sí, siempre que se use como aprendizaje y no como sustitución del trabajo personal.'],
    ],
  },
  {
    slug: 'guitarra',
    name: 'Guitarra',
    short: 'guitarra',
    category: 'música',
    levels: ['Principiantes', 'Intermedio', 'Adultos', 'Niños', 'Acompañamiento'],
    pains: ['falta de constancia', 'técnica irregular', 'dificultad con acordes'],
    outcomes: ['rutina de práctica', 'mejor técnica', 'canciones adaptadas al nivel'],
    faq: [
      ['¿Hay clases para niños?', 'Sí. Se puede solicitar profesor con experiencia infantil y metodología práctica.'],
      ['¿Puede ser guitarra española o eléctrica?', 'Sí. Indica estilo, nivel y objetivo en la solicitud.'],
    ],
  },
  {
    slug: 'piano',
    name: 'Piano',
    short: 'piano',
    category: 'música',
    levels: ['Principiantes', 'Conservatorio', 'Adultos', 'Niños', 'Lenguaje musical'],
    pains: ['lectura de partituras', 'coordinación', 'práctica sin guía'],
    outcomes: ['técnica progresiva', 'repertorio adecuado', 'mejor disciplina de estudio'],
    faq: [
      ['¿Hace falta tener piano en casa?', 'Es recomendable contar con piano o teclado para practicar entre clases.'],
      ['¿También se trabaja lenguaje musical?', 'Sí. Se puede combinar piano, lectura, ritmo y teoría musical.'],
    ],
  },
  {
    slug: 'padel',
    name: 'Pádel',
    short: 'pádel',
    category: 'deporte',
    levels: ['Iniciación', 'Intermedio', 'Adultos', 'Niños', 'Parejas'],
    pains: ['técnica de golpeo', 'colocación', 'falta de progresión'],
    outcomes: ['mejor técnica', 'lectura de partido', 'entrenamiento adaptado'],
    faq: [
      ['¿Se pueden organizar clases en pareja?', 'Sí. Indica si buscas clase individual, pareja o grupo reducido.'],
      ['¿Hay profesores para iniciación?', 'Sí. Puedes solicitar clases desde cero o perfeccionamiento técnico.'],
    ],
  },
];

const MADRID_LANDINGS = [
  {
    slug: 'matematicas-madrid',
    short: 'Matemáticas en Madrid',
    title: 'Clases particulares de Matemáticas en Madrid | ClasesDe10',
    description: 'Encuentra profesor particular de Matemáticas en Madrid para Primaria, ESO, Bachillerato o EBAU. Perfiles revisados y opción presencial u online.',
    h1: 'Clases particulares de Matemáticas en Madrid',
    eyebrow: 'Primaria · ESO · Bachillerato · EBAU',
    intro: 'Buscamos un profesor que domine el curso exacto, el temario del alumno y la modalidad que necesita la familia. Puedes pedir clases presenciales en Madrid o ampliar opciones con clases online.',
    proofs: ['Selección según curso y dificultad concreta', 'Modalidad presencial u online según disponibilidad', 'Seguimiento desde el panel de la familia'],
    problemTitle: 'Un profesor distinto para cada dificultad de Matemáticas',
    problemIntro: 'No necesita el mismo perfil un alumno que está construyendo la base de Primaria que otro que prepara la EBAU. Por eso la solicitud recoge el curso exacto y el objetivo antes de revisar candidatos.',
    cards: [
      ['Primaria', 'Cálculo, resolución de problemas, fracciones y una rutina de estudio que no dependa de memorizar pasos.'],
      ['ESO', 'Álgebra, proporcionalidad, geometría, funciones y recuperación de lagunas acumuladas de cursos anteriores.'],
      ['Bachillerato', 'Matemáticas académicas o aplicadas, ritmo de exámenes y práctica ordenada de ejercicios tipo.'],
      ['EBAU', 'Plan por bloques, control del tiempo, simulacros y revisión de errores que restan puntuación.'],
    ],
    localTitle: 'Presencial en Madrid cuando aporta una ventaja real',
    localText: 'Para algunas familias, trabajar cara a cara facilita la concentración y permite revisar cuadernos y exámenes con más naturalidad. En otros casos, la modalidad online permite acceder a un perfil más específico y ganar flexibilidad. La búsqueda tiene en cuenta ambas opciones y no presenta como equivalente un desplazamiento que en la práctica resulte inviable.',
    faqs: [
      ['¿Puedo pedir profesor para un curso concreto?', 'Sí. La solicitud recoge el curso exacto, la materia, el horario, la zona y el objetivo del alumno.'],
      ['¿Las clases pueden ser a domicilio?', 'Sí, cuando existe un profesor compatible con la zona y el desplazamiento. También puedes elegir modalidad online.'],
      ['¿Se puede preparar una recuperación o la EBAU?', 'Sí. Indica la fecha, los bloques que más cuestan y el material del centro para orientar la selección.'],
    ],
    related: ['/clases-particulares/eso-madrid', '/clases-particulares/bachillerato-madrid', '/guias/como-recuperar-matematicas-eso'],
  },
  {
    slug: 'primaria-madrid',
    short: 'Refuerzo de Primaria en Madrid',
    title: 'Clases particulares de Primaria en Madrid | ClasesDe10',
    description: 'Profesor particular de Primaria en Madrid para apoyo general, lectura, Matemáticas y hábitos de estudio. Selección personalizada, presencial u online.',
    h1: 'Clases particulares de Primaria en Madrid',
    eyebrow: 'De 1.º a 6.º de Primaria',
    intro: 'El apoyo en Primaria debe encajar tanto con el curso como con la forma de aprender del niño. Revisamos experiencia, disponibilidad y cercanía para proponer un perfil que pueda acompañar a la familia con continuidad.',
    proofs: ['Curso exacto y necesidades de aprendizaje', 'Apoyo general o por asignaturas', 'Coordinación sencilla con la familia'],
    problemTitle: 'Refuerzo que construye base y autonomía',
    problemIntro: 'En estas edades no se trata solo de terminar los deberes. Un buen plan detecta qué conceptos faltan, crea una rutina asumible y explica de una forma que el alumno pueda repetir por sí mismo.',
    cards: [
      ['Lectura y escritura', 'Comprensión lectora, ortografía, expresión escrita y seguridad al explicar lo aprendido.'],
      ['Matemáticas', 'Cálculo, problemas, medidas, fracciones y razonamiento adaptados al curso real.'],
      ['Apoyo general', 'Organización de deberes y repaso de varias materias sin convertir la clase en una carrera.'],
      ['Hábitos de estudio', 'Agenda, preparación de controles y rutinas pequeñas que la familia pueda mantener.'],
    ],
    localTitle: 'Un encaje pensado también para la familia',
    localText: 'La disponibilidad semanal, el desplazamiento y la capacidad de comunicarse con la familia son especialmente importantes en Primaria. Por eso no basta con que el profesor conozca la materia: debe poder explicar con paciencia, generar confianza y sostener el horario acordado.',
    faqs: [
      ['¿Puede el profesor ayudar con varias asignaturas?', 'Sí. En Primaria es habitual solicitar apoyo general, indicando qué áreas necesitan más atención.'],
      ['¿Cómo indico el nivel del niño?', 'Selecciona el curso exacto, de 1.º a 6.º, y explica brevemente qué está costando más.'],
      ['¿Es mejor una o dos clases por semana?', 'Depende del punto de partida, la carga escolar y el objetivo. El horario puede ajustarse después de observar las primeras semanas.'],
    ],
    related: ['/clases-particulares/matematicas-madrid', '/clases-particulares/eso-madrid', '/guias/como-elegir-profesor-particular'],
  },
  {
    slug: 'eso-madrid',
    short: 'Refuerzo de ESO en Madrid',
    title: 'Clases particulares de ESO en Madrid | ClasesDe10',
    description: 'Profesor particular para 1.º, 2.º, 3.º o 4.º de ESO en Madrid. Refuerzo por asignaturas, organización y recuperaciones, presencial u online.',
    h1: 'Clases particulares de ESO en Madrid',
    eyebrow: '1.º · 2.º · 3.º · 4.º de ESO',
    intro: 'La ESO acumula cambios de ritmo, más profesores y materias que empiezan a exigir una base sólida. Buscamos un perfil compatible con el curso exacto, las asignaturas pendientes y la forma de trabajar del alumno.',
    proofs: ['Curso exacto y asignaturas prioritarias', 'Plan semanal o apoyo para recuperaciones', 'Profesor presencial u online según el caso'],
    problemTitle: 'Distinguir entre una duda puntual y una base incompleta',
    problemIntro: 'Cuando las notas bajan, repetir ejercicios sin diagnóstico suele consumir tiempo. La primera prioridad es saber si falla un tema reciente, una herramienta anterior o la organización general del estudio.',
    cards: [
      ['1.º de ESO', 'Acompañamiento en el cambio de etapa, organización y consolidación de Matemáticas y Lengua.'],
      ['2.º de ESO', 'Seguimiento del ritmo semanal y recuperación de conceptos antes de que se acumulen.'],
      ['3.º de ESO', 'Refuerzo de Álgebra, Física y Química, idiomas y materias con mayor especialización.'],
      ['4.º de ESO', 'Preparación de exámenes, decisiones de itinerario y base para empezar Bachillerato con seguridad.'],
    ],
    localTitle: 'Un horario sostenible funciona mejor que un intensivo continuo',
    localText: 'La modalidad presencial puede ayudar cuando cuesta concentrarse; la online puede facilitar un profesor más especializado y reducir desplazamientos. La opción adecuada es la que el alumno puede mantener cada semana sin añadir más fricción a su rutina.',
    faqs: [
      ['¿Se pueden reforzar varias asignaturas?', 'Sí. Conviene indicar cuál es prioritaria y qué nivel tiene el alumno en cada una.'],
      ['¿Puedo solicitar ayuda para recuperaciones?', 'Sí. Incluye fechas, temario y resultados anteriores para buscar un perfil y un ritmo adecuados.'],
      ['¿Trabajáis con alumnos de cualquier curso de ESO?', 'Sí. La solicitud diferencia 1.º, 2.º, 3.º y 4.º para evitar emparejamientos demasiado generales.'],
    ],
    related: ['/clases-particulares/matematicas-madrid', '/clases-particulares/bachillerato-madrid', '/guias/como-recuperar-matematicas-eso'],
  },
  {
    slug: 'bachillerato-madrid',
    short: 'Bachillerato en Madrid',
    title: 'Clases particulares de Bachillerato en Madrid | ClasesDe10',
    description: 'Profesor particular para 1.º o 2.º de Bachillerato en Madrid. Ciencias, Sociales y Humanidades, con preparación de exámenes y EBAU.',
    h1: 'Clases particulares de Bachillerato en Madrid',
    eyebrow: '1.º y 2.º · Ciencias · Sociales · Humanidades',
    intro: 'En Bachillerato importan la especialidad del profesor, el calendario de exámenes y la nota objetivo. La búsqueda se ajusta a la modalidad, el curso y la asignatura concreta, no solo a la etapa educativa.',
    proofs: ['Selección por asignatura y modalidad', 'Preparación semanal o intensiva', 'Continuidad posible hasta la EBAU'],
    problemTitle: 'Especialización y prioridades claras',
    problemIntro: 'El volumen de temario hace difícil reforzarlo todo a la vez. Un plan útil prioriza los bloques que más pesan, corrige el método de resolución y reserva tiempo para practicar bajo condiciones de examen.',
    cards: [
      ['Ciencias y Tecnología', 'Matemáticas, Física, Química, Dibujo Técnico y Biología con práctica orientada al programa.'],
      ['Ciencias Sociales', 'Matemáticas aplicadas, Economía, Historia y materias que combinan técnica y argumentación.'],
      ['Humanidades', 'Latín, Lengua, Literatura, Historia y comentario de texto con una estructura reproducible.'],
      ['2.º y EBAU', 'Coordinación entre evaluación del centro, recuperaciones y preparación progresiva de la prueba de acceso.'],
    ],
    localTitle: 'La nota objetivo cambia el tipo de preparación',
    localText: 'No es lo mismo recuperar una evaluación que competir por una nota de acceso concreta. Indicar desde el principio el resultado buscado, el calendario y las dificultades permite seleccionar mejor al profesor y proponer un ritmo realista.',
    faqs: [
      ['¿Puedo pedir un profesor para una sola asignatura?', 'Sí. Indica asignatura, modalidad de Bachillerato, curso y temas prioritarios.'],
      ['¿Se puede empezar a preparar la EBAU desde 1.º?', 'Puede reforzarse la base desde 1.º; la preparación específica de formato y simulacros se intensifica en 2.º.'],
      ['¿Hay clases presenciales en Madrid?', 'Sí, según zona, desplazamiento y disponibilidad del profesor. La modalidad online amplía las opciones.'],
    ],
    related: ['/clases-particulares/selectividad-madrid', '/clases-particulares/matematicas-madrid', '/guias/preparar-ebau-con-profesor-particular'],
  },
  {
    slug: 'selectividad-madrid',
    short: 'EBAU en Madrid',
    title: 'Clases particulares para Selectividad en Madrid | ClasesDe10',
    description: 'Prepara la PAU de Madrid con un profesor particular: plan por asignaturas, ejercicios tipo, simulacros y revisión de errores. Presencial u online.',
    h1: 'Clases particulares para Selectividad en Madrid',
    eyebrow: 'PAU · Acceso a la universidad · Madrid',
    intro: 'La preparación de la prueba de acceso necesita dominio de la asignatura y trabajo específico sobre el formato. Buscamos profesores compatibles con la materia, la convocatoria y el tiempo disponible del alumno.',
    proofs: ['Plan según nota objetivo y calendario', 'Ejercicios tipo y simulacros', 'Refuerzo de una o varias asignaturas'],
    problemTitle: 'Preparar la prueba, no solo repasar el temario',
    problemIntro: 'Saber la materia es imprescindible, pero también hay que decidir qué bloques priorizar, practicar con tiempo limitado y reconocer los errores que se repiten. El plan debe medir avances y ajustarse a las semanas disponibles.',
    cards: [
      ['Diagnóstico', 'Revisión del punto de partida, ponderaciones relevantes y distancia hasta la nota objetivo.'],
      ['Plan por bloques', 'Orden de temas según dificultad, peso y margen real antes de la convocatoria.'],
      ['Práctica de examen', 'Ejercicios con formato de prueba, tiempo controlado y criterios claros de corrección.'],
      ['Revisión', 'Registro de errores para distinguir fallos de contenido, procedimiento, lectura o gestión del tiempo.'],
    ],
    localTitle: 'Presencial u online: decide por especialidad y constancia',
    localText: 'En EBAU puede compensar ampliar la búsqueda online si así se encuentra un profesor más especializado en la asignatura. Si la concentración y el acompañamiento cara a cara son prioritarios, se valora primero una opción presencial compatible en Madrid.',
    faqs: [
      ['¿Puedo preparar únicamente una asignatura?', 'Sí. Es habitual concentrar el apoyo en las asignaturas que más ponderan o en las que existe mayor margen de mejora.'],
      ['¿También atendéis convocatorias extraordinarias?', 'Sí. Indica convocatoria, fecha y temario para organizar una búsqueda ajustada al plazo.'],
      ['¿Necesito llevar modelos de examen?', 'Ayudan a diagnosticar, pero el profesor también puede estructurar la práctica a partir del temario y el formato aplicable.'],
    ],
    related: ['/clases-particulares/bachillerato-madrid', '/clases-particulares/matematicas-madrid', '/guias/preparar-ebau-con-profesor-particular'],
  },
  {
    slug: 'profesor-a-domicilio-madrid',
    short: 'Profesor a domicilio en Madrid',
    title: 'Profesor particular a domicilio en Madrid | ClasesDe10',
    description: 'Encuentra profesor particular a domicilio en Madrid. Selección por materia, curso, zona, horario y desplazamiento real; alternativa online disponible.',
    h1: 'Profesor particular a domicilio en Madrid',
    eyebrow: 'Búsqueda por zona, horario y desplazamiento',
    intro: 'Una clase presencial solo funciona si el trayecto es compatible de verdad con el horario semanal. Por eso la selección combina materia y curso con zona, disponibilidad y opciones razonables de desplazamiento.',
    proofs: ['Compatibilidad por zona y horario', 'Curso y materia antes que proximidad aislada', 'Alternativa online si mejora el encaje'],
    problemTitle: 'La distancia útil no se mide solo en kilómetros',
    problemIntro: 'Dos direcciones cercanas pueden estar mal conectadas y otras más alejadas tener un trayecto directo. El encaje debe valorar el tiempo real y el medio de transporte viable para el profesor, además de la calidad académica.',
    cards: [
      ['A pie', 'Puede ser la opción más estable cuando familia y profesor están realmente cerca.'],
      ['Transporte público', 'Se valora el tiempo de trayecto y la conexión práctica, no una distancia en línea recta.'],
      ['Coche', 'Solo cuenta como alternativa cuando el profesor ha indicado que dispone de él y el horario lo permite.'],
      ['Online', 'Amplía especialistas y evita convertir el desplazamiento en el punto débil de una buena relación.'],
    ],
    localTitle: 'Qué conviene incluir en la solicitud',
    localText: 'Indica el curso exacto, la materia, una zona suficientemente precisa, los horarios posibles y si aceptarías clases online. Con esos datos se puede descartar pronto un desplazamiento inviable y reservar la revisión detallada para candidatos con posibilidades reales.',
    faqs: [
      ['¿Tengo que publicar mi dirección exacta?', 'No se muestra públicamente. La plataforma utiliza la información necesaria para coordinar la búsqueda y el servicio.'],
      ['¿La opción más cercana es siempre la mejor?', 'No. Primero debe existir encaje académico y de horario; después se compara la viabilidad del desplazamiento.'],
      ['¿Puedo combinar clases presenciales y online?', 'Sí, si familia y profesor lo acuerdan y el plan de trabajo se beneficia de esa flexibilidad.'],
    ],
    related: ['/clases-particulares/madrid', '/guias/profesor-particular-a-domicilio-u-online', '/guias/como-elegir-profesor-particular'],
  },
];

const GUIDES = [
  {
    slug: 'como-elegir-profesor-particular',
    title: 'Cómo elegir profesor particular: guía para familias | ClasesDe10',
    description: 'Guía práctica para elegir profesor particular: nivel, experiencia, método, horario, modalidad, primera clase y señales para saber si funciona.',
    h1: 'Cómo elegir un profesor particular para tu hijo',
    intro: 'Elegir bien no consiste en buscar el currículum más largo. Consiste en encontrar a una persona que domine el nivel, sepa explicar la dificultad concreta y pueda sostener una relación de trabajo compatible con la familia.',
    sections: [
      ['1. Define el problema antes de comparar perfiles', ['Anota el curso exacto, la asignatura, las notas recientes, los temas que cuestan y el próximo objetivo con fecha. «Necesita Matemáticas» produce una búsqueda demasiado amplia; «3.º de ESO, Álgebra y problemas, recuperación en seis semanas» permite evaluar encaje.', 'Distingue también si hace falta explicar contenido, crear hábito, preparar un examen o recuperar confianza. Cada necesidad favorece un tipo de experiencia diferente.']],
      ['2. Comprueba conocimiento y capacidad de explicar', ['Los estudios del profesor importan, pero no bastan. Pregunta cómo abordaría un tema que el alumno no entiende y qué haría si el primer enfoque no funciona.', 'Una explicación útil deja pasos que el alumno puede repetir. Si durante la clase solo copia procedimientos, puede parecer que avanza sin estar ganando autonomía.']],
      ['3. Haz viable el horario y la modalidad', ['Un buen perfil que llega tarde cada semana o necesita un trayecto frágil no es un buen encaje. Para clases presenciales, valora el tiempo real de desplazamiento. Para clases online, confirma que el alumno dispone de un espacio, conexión y materiales adecuados.', 'No elijas presencial u online por costumbre: decide qué opción favorece concentración, especialización y continuidad en ese caso.']],
      ['4. Evalúa las primeras semanas con señales concretas', ['Acordad un objetivo observable: entregar tareas con menos ayuda, reducir un tipo de error, preparar un control o mantener una rutina. Revisa el progreso después de varias sesiones, no únicamente por la sensación de una primera clase.', 'Debe existir comunicación suficiente con la familia sin invadir el trabajo del alumno. Si no hay plan, puntualidad o adaptación, conviene revisar pronto el encaje.']],
    ],
    checklist: ['Curso y materia exactos', 'Objetivo y fecha', 'Dificultades observables', 'Horarios realmente posibles', 'Modalidad y zona', 'Forma de medir el avance'],
    related: ['/clases-particulares/madrid', '/clases-particulares/profesor-a-domicilio-madrid', '/para-padres#formulario'],
  },
  {
    slug: 'profesor-particular-a-domicilio-u-online',
    title: 'Profesor a domicilio u online: cómo elegir | ClasesDe10',
    description: 'Compara clases particulares a domicilio y online según concentración, especialización, desplazamiento, materiales, horario y continuidad.',
    h1: '¿Profesor particular a domicilio u online?',
    intro: 'No existe una modalidad mejor para todos. La decisión correcta depende de qué ayuda necesita el alumno, qué profesores encajan y qué formato puede mantenerse sin fricción cada semana.',
    sections: [
      ['Cuándo puede aportar más la clase a domicilio', ['El formato presencial puede facilitar la atención de alumnos pequeños, el trabajo con cuadernos físicos y la creación de una rutina clara. También reduce la dependencia tecnológica.', 'Su límite es el desplazamiento: zona, hora punta y conexiones pueden reducir mucho los perfiles disponibles o volver inestable un horario aparentemente posible.']],
      ['Cuándo puede aportar más la clase online', ['La modalidad online amplía la búsqueda cuando hace falta una asignatura o nivel muy específico. También permite encajar mejor horarios y evita tiempo perdido en trayectos.', 'Funciona mejor si el alumno dispone de un espacio tranquilo, comparte materiales con facilidad y participa activamente. Una videollamada pasiva no sustituye una clase bien diseñada.']],
      ['Cómo decidir en cinco minutos', ['Prioriza presencial si la dificultad principal es concentrarse, organizar materiales o generar vínculo y existen opciones cercanas viables. Prioriza online si la especialización, la flexibilidad o la continuidad pesan más.', 'Si ambas opciones encajan, compara la calidad del profesor y la sostenibilidad del horario antes que la modalidad. Incluso puede acordarse un formato mixto cuando tenga sentido.']],
    ],
    checklist: ['Atención y edad del alumno', 'Especialización necesaria', 'Tiempo real de desplazamiento', 'Espacio y conexión', 'Flexibilidad semanal', 'Continuidad durante exámenes o viajes'],
    related: ['/clases-particulares/profesor-a-domicilio-madrid', '/guias/como-elegir-profesor-particular', '/para-padres#formulario'],
  },
  {
    slug: 'como-recuperar-matematicas-eso',
    title: 'Cómo recuperar Matemáticas en ESO: plan práctico | ClasesDe10',
    description: 'Plan para recuperar Matemáticas en ESO: diagnóstico, prioridades, práctica, registro de errores, simulacros y apoyo de un profesor particular.',
    h1: 'Cómo recuperar Matemáticas en ESO sin estudiar a ciegas',
    intro: 'Cuando se acumulan suspensos, hacer más ejercicios al azar suele aumentar la frustración. El primer paso es localizar qué herramientas faltan y construir un plan pequeño que pueda medirse cada semana.',
    sections: [
      ['Semana 1: localizar la raíz', ['Reúne controles, ejercicios corregidos y temario. Clasifica los fallos: concepto, cálculo, lectura del enunciado, procedimiento o falta de tiempo. Busca patrones en lugar de contar únicamente errores.', 'Comprueba bases anteriores como operaciones con signos, fracciones, proporcionalidad y manejo algebraico. Muchos bloqueos actuales nacen ahí.']],
      ['Semanas 2 y 3: practicar por bloques', ['Trabaja un tipo de ejercicio cada vez: ejemplo explicado, ejercicio acompañado y ejercicio autónomo. No pases de bloque hasta poder explicar los pasos sin mirar.', 'Mantén un registro breve de errores. Es más útil repetir tres ejercicios que corrigen un patrón que completar veinte sin revisar por qué fallan.']],
      ['Última fase: mezclar y simular', ['Cuando cada bloque funciona por separado, mezcla ejercicios y limita el tiempo. Practica también cómo empezar un problema y cómo revisar el resultado.', 'Un profesor particular puede acelerar el diagnóstico, adaptar la explicación y evitar que el alumno practique durante semanas un procedimiento incorrecto.']],
    ],
    checklist: ['Exámenes corregidos', 'Lista de temas', 'Bases que faltan', 'Bloques semanales', 'Registro de errores', 'Simulacro final'],
    related: ['/clases-particulares/matematicas-madrid', '/clases-particulares/eso-madrid', '/para-padres#formulario'],
  },
  {
    slug: 'preparar-ebau-con-profesor-particular',
    title: 'Preparar la EBAU con profesor particular: plan | ClasesDe10',
    description: 'Cómo organizar la preparación de la EBAU con profesor particular: nota objetivo, prioridades, práctica, simulacros y revisión del progreso.',
    h1: 'Cómo preparar la EBAU con un profesor particular',
    intro: 'El apoyo particular es más útil cuando existe un plan compartido. La nota objetivo, las asignaturas que ponderan y el tiempo disponible deben convertirse en prioridades semanales y ejercicios medibles.',
    sections: [
      ['Empieza por la nota objetivo y el calendario', ['Identifica qué asignaturas pueden mover más la nota y cuánto margen existe hasta la convocatoria. No repartas el tiempo por igual si el impacto y la dificultad son distintos.', 'Lleva al profesor exámenes anteriores, criterios del centro y resultados recientes. Esa información permite separar repaso de contenido y entrenamiento específico de prueba.']],
      ['Convierte el temario en ciclos cortos', ['Cada ciclo puede incluir explicación, práctica guiada, ejercicio autónomo y una comprobación breve. Al final de la semana debe quedar claro qué bloque mejora y cuál necesita otro enfoque.', 'Reserva desde el principio tiempo para volver sobre errores antiguos. Aprender un tema y abandonarlo hasta mayo produce una falsa sensación de avance.']],
      ['Simula y revisa como parte del aprendizaje', ['Un simulacro sirve para medir contenido, estrategia y tiempo. Después hay que clasificar los fallos y convertirlos en tareas concretas; la nota aislada no explica qué corregir.', 'El profesor debería ayudar a decidir prioridades, enseñar criterios de revisión y reducir gradualmente la ayuda para que el alumno llegue autónomo a la prueba.']],
    ],
    checklist: ['Nota objetivo', 'Ponderaciones relevantes', 'Calendario real', 'Bloques prioritarios', 'Simulacros periódicos', 'Registro de errores'],
    related: ['/clases-particulares/selectividad-madrid', '/clases-particulares/bachillerato-madrid', '/para-padres#formulario'],
  },
];

const CORE_PAGES = [
  { path: '/', file: 'index.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/como-funciona', file: 'como-funciona.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/para-padres', file: 'para-padres.html', priority: '0.9', changefreq: 'monthly' },
  { path: '/para-profesores', file: 'para-profesores.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/sobre-nosotros', file: 'sobre-nosotros.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/contacto', file: 'contacto.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/terminos', file: 'terminos.html', priority: '0.2', changefreq: 'yearly' },
  { path: '/privacidad', file: 'privacidad.html', priority: '0.2', changefreq: 'yearly' },
  { path: '/cookies', file: 'cookies.html', priority: '0.2', changefreq: 'yearly' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeJson(value) {
  return String(value ?? '').replaceAll('</script', '<\\/script');
}

function cleanUrl(pathname) {
  if (pathname === '/') return `${DOMAIN}/`;
  return `${DOMAIN}${pathname}`;
}

function subjectUrl(subject) {
  return `/clases-particulares/${subject.slug}`;
}

function subjectFile(subject) {
  return path.join(__dirname, `${subject.slug}.html`);
}

function cityUrl(city) {
  return `/clases-particulares/${city.slug}`;
}

function cityFile(city) {
  return path.join(__dirname, `${city.slug}.html`);
}

function landingUrl(landing) {
  return `/clases-particulares/${landing.slug}`;
}

function landingFile(landing) {
  return path.join(__dirname, `${landing.slug}.html`);
}

function guideUrl(guide) {
  return `/guias/${guide.slug}`;
}

function guideFile(guide) {
  return path.join(ROOT, 'guias', `${guide.slug}.html`);
}

function madridLandingForSubject(subject) {
  return MADRID_LANDINGS.find((landing) => landing.slug === `${subject.slug}-madrid`);
}

function listNatural(items) {
  const values = items.filter(Boolean);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
}

function nearbyCities(city) {
  return CITIES.filter((item) => item.slug !== city.slug).slice(0, 6);
}

function relatedSubjects(subject) {
  const sameCategory = SUBJECTS.filter((item) => item.category === subject.category && item.slug !== subject.slug);
  const others = SUBJECTS.filter((item) => item.category !== subject.category && item.slug !== subject.slug);
  return [...sameCategory, ...others].slice(0, 6);
}

function jsonLd(graph) {
  return `<script type="application/ld+json">${escapeJson(JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }))}</script>`;
}

function head({ title, description, canonical, schema, type = 'website' }) {
  const image = `${DOMAIN}/assets/img/social-share.png`;
  return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0f1f3d">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ClasesDe10">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" type="image/png" href="/assets/img/logo-192.png">
<link rel="apple-touch-icon" href="/assets/img/logo-192.png">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ClasesDe10, profesores particulares para cada alumno">
<meta property="og:site_name" content="ClasesDe10">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="ClasesDe10, profesores particulares para cada alumno">
<link rel="stylesheet" href="/css/style.css?v=20260808-editorial">
${schema}
<style>
.seo-main { background: var(--cream); }
.seo-hero { padding: calc(var(--nav-h) + 52px) 5vw 64px; background: var(--navy); color: var(--white); border-bottom: 3px solid var(--gold); }
.seo-hero-inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(260px, .85fr); gap: 34px; align-items: center; }
.seo-breadcrumb { display: flex; gap: 8px; flex-wrap: wrap; color: rgba(255,255,255,.64); font-size: .82rem; margin-bottom: 20px; }
.seo-breadcrumb a { color: rgba(255,255,255,.78); text-decoration: none; }
.seo-breadcrumb a:hover { color: var(--gold); }
.seo-eyebrow { color: var(--gold-light); font-size: .76rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 12px; }
.seo-hero h1 { font-family: 'Playfair Display', serif; font-size: clamp(2rem, 5vw, 4.1rem); line-height: 1.08; color: var(--white); margin-bottom: 18px; }
.seo-hero h1 em { color: var(--gold); font-style: normal; }
.seo-hero p { color: rgba(255,255,255,.78); font-size: clamp(1rem, 1.7vw, 1.16rem); line-height: 1.75; max-width: 680px; }
.seo-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
.seo-button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 12px 22px; border-radius: 3px; text-decoration: none; font-weight: 800; }
.seo-button.primary { background: var(--gold); color: var(--navy); }
.seo-button.secondary { border: 1px solid rgba(255,255,255,.32); color: var(--white); }
.seo-proof { display: grid; gap: 12px; padding: 4px 0 4px 24px; border-left: 2px solid var(--gold); }
.seo-proof strong { color: var(--white); font-size: 1rem; }
.seo-proof span { color: rgba(255,255,255,.72); line-height: 1.5; font-size: .9rem; }
.seo-section { padding: 64px 5vw; }
.seo-section:nth-of-type(odd) { background: var(--gray-soft); }
.seo-section-inner { max-width: 1120px; margin: 0 auto; }
.seo-section h2 { font-family: 'Playfair Display', serif; color: var(--navy); font-size: clamp(1.5rem, 3vw, 2.4rem); line-height: 1.18; margin-bottom: 12px; }
.seo-section p { color: var(--gray-mid); line-height: 1.75; max-width: 760px; }
.seo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 14px; margin-top: 26px; }
.seo-card { display: grid; gap: 8px; padding: 18px; background: var(--white); border: 1px solid rgba(15,31,61,.16); border-radius: 3px; color: var(--text-body); text-decoration: none; min-width: 0; }
.seo-card[href]:hover { border-color: var(--gold); }
.seo-card strong { color: var(--navy); overflow-wrap: anywhere; }
.seo-card span { color: var(--gray-mid); font-size: .86rem; line-height: 1.55; }
.seo-steps { counter-reset: step; }
.seo-step { position: relative; padding-left: 54px; }
.seo-step::before { counter-increment: step; content: counter(step); position: absolute; left: 18px; top: 18px; width: 26px; height: 26px; border-radius: 2px; display: grid; place-items: center; background: var(--gold); color: var(--navy); font-weight: 900; }
.seo-faq { display: grid; gap: 12px; margin-top: 26px; }
.seo-faq details { background: var(--white); border: 1px solid rgba(15,31,61,.16); border-radius: 3px; padding: 16px 18px; }
.seo-faq summary { cursor: pointer; color: var(--navy); font-weight: 800; }
.seo-faq details p { margin-top: 10px; font-size: .94rem; }
.seo-copy { display: grid; gap: 16px; max-width: 820px; }
.seo-copy p { max-width: none; }
.seo-list { margin: 18px 0 0; padding-left: 22px; color: var(--gray-mid); line-height: 1.75; }
.seo-meta { margin-top: 18px; color: rgba(255,255,255,.62); font-size: .82rem; }
.seo-related { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 10px; }
.seo-related a { color: var(--navy); background: var(--white); border: 1px solid rgba(15,31,61,.18); padding: 10px 14px; text-decoration: none; font-weight: 700; }
.seo-related a:hover { border-color: var(--gold); }
.seo-cta { margin: 0 5vw 64px; padding: 42px 5vw; border-radius: 3px; background: var(--navy); border-top: 3px solid var(--gold); color: var(--white); text-align: center; }
.seo-cta h2 { font-family: 'Playfair Display', serif; color: var(--white); font-size: clamp(1.6rem, 4vw, 2.7rem); margin-bottom: 12px; }
.seo-cta p { color: rgba(255,255,255,.78); max-width: 660px; margin: 0 auto 24px; line-height: 1.7; }
@media (max-width: 760px) {
  .seo-hero-inner { grid-template-columns: 1fr; }
  .seo-proof { padding: 16px; }
  .seo-actions .seo-button { flex: 1 1 180px; }
  .seo-section { padding: 48px 5vw; }
}
</style>
</head>`;
}

function pageShell({ title, description, canonical, schema, body, type = 'website' }) {
  return `<!DOCTYPE html>
<html lang="es">
${head({ title, description, canonical, schema, type })}
<body>
<script src="/js/nav.js?v=20260809-seo"></script>
${body}
<script src="/js/pwa.js" defer></script>
</body>
</html>
`;
}

function breadcrumb(items) {
  return `<nav class="seo-breadcrumb" aria-label="Ruta de navegación">
${items.map((item, index) => item.url
    ? `<a href="${item.url}">${escapeHtml(item.name)}</a>${index < items.length - 1 ? '<span>/</span>' : ''}`
    : `<span>${escapeHtml(item.name)}</span>`).join('\n')}
</nav>`;
}

function faqItems(subject) {
  return [
    ...subject.faq,
    [`¿Las clases de ${subject.short} pueden ser online?`, 'Sí. Puedes solicitar clases online y, cuando haya disponibilidad en tu zona, también presenciales.'],
    ['¿Cómo se elige el profesor?', 'ClasesDe10 revisa la materia, nivel, disponibilidad y contexto del alumno para proponer un profesor adecuado.'],
    ['¿Hay permanencia?', 'No. Puedes empezar sin permanencia y ajustar el ritmo de clases según la evolución del alumno.'],
  ];
}

function subjectHubPage(subject) {
  const pathname = subjectUrl(subject);
  const canonical = cleanUrl(pathname);
  const title = `Clases particulares de ${subject.name} | Profesores revisados`;
  const description = `Encuentra profesor de ${subject.name} para ${listNatural(subject.levels.slice(0, 3))}. Clases online o presenciales según disponibilidad, sin permanencia.`;
  const serviceName = `Clases particulares de ${subject.name}`;
  const faqs = faqItems(subject);
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: cleanUrl('/clases-particulares') },
        { '@type': 'ListItem', position: 3, name: subject.name, item: canonical },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: SEO_CONTENT_LASTMOD,
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': `${canonical}#service` },
    },
    {
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: serviceName,
      description,
      provider: { '@id': ORGANIZATION_ID },
      areaServed: { '@type': 'Country', name: 'España' },
      serviceType: `Profesor particular de ${subject.name}`,
      audience: { '@type': 'Audience', audienceType: 'familias, estudiantes y adultos' },
    },
  ];
  const related = relatedSubjects(subject);
  const madridLanding = madridLandingForSubject(subject);
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([
          { name: 'Inicio', url: '/' },
          { name: 'Clases particulares', url: '/clases-particulares' },
          { name: subject.name },
        ])}
        <div class="seo-eyebrow">Perfiles revisados · presencial y online</div>
        <h1>Clases particulares de <em>${escapeHtml(subject.name)}</em></h1>
        <p>${escapeHtml(description)} Te ayudamos a encontrar un perfil que encaje con el nivel, el horario y el objetivo del alumno.</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
          <a class="seo-button secondary" href="/contacto">Hablar con ClasesDe10</a>
        </div>
      </div>
      <aside class="seo-proof" aria-label="Resumen del servicio">
        <strong>Un plan adaptado a ${escapeHtml(subject.short)}</strong>
        <span>Niveles: ${escapeHtml(listNatural(subject.levels.slice(0, 5)))}.</span>
        <span>Dificultades habituales: ${escapeHtml(listNatural(subject.pains.slice(0, 3)))}.</span>
        <span>Objetivo: ${escapeHtml(listNatural(subject.outcomes.slice(0, 3)))}.</span>
      </aside>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Qué trabajamos en las clases de ${escapeHtml(subject.short)}</h2>
      <p>El profesor se adapta al punto de partida del alumno. La prioridad no es solo resolver ejercicios, sino crear un método que permita mejorar de forma constante.</p>
      <div class="seo-grid">
        ${subject.levels.map((level) => `<article class="seo-card"><strong>${escapeHtml(level)}</strong><span>Plan adaptado al temario, ritmo del centro y próximos exámenes.</span></article>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Cómo encontramos un profesor adecuado para cada caso</h2>
      <p>Recogemos la necesidad, revisamos los perfiles disponibles y acompañamos el inicio para que la familia no tenga que coordinar todo desde cero.</p>
      <div class="seo-grid seo-steps">
        <article class="seo-card seo-step"><strong>Diagnóstico inicial</strong><span>Materia, nivel, disponibilidad, modalidad y urgencia.</span></article>
        <article class="seo-card seo-step"><strong>Selección del profesor</strong><span>Encaje por especialidad, experiencia, confianza y disponibilidad real.</span></article>
        <article class="seo-card seo-step"><strong>Inicio de clases</strong><span>Coordinación sencilla y seguimiento del progreso.</span></article>
        <article class="seo-card seo-step"><strong>Mejora continua</strong><span>Si algo no encaja, se revisa el perfil o el plan de trabajo.</span></article>
      </div>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Materias relacionadas y clases en Madrid</h2>
      <p>Compara otras materias o consulta la búsqueda presencial en Madrid. Para el resto de España, la modalidad online permite ampliar los perfiles compatibles.</p>
      <div class="seo-grid">
        ${related.map((item) => `<a class="seo-card" href="${subjectUrl(item)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(listNatural(item.levels.slice(0, 3)))}</span></a>`).join('\n        ')}
        ${madridLanding
          ? `<a class="seo-card" href="${landingUrl(madridLanding)}"><strong>${escapeHtml(madridLanding.short)}</strong><span>Servicio presencial y online según disponibilidad.</span></a>`
          : `<a class="seo-card" href="/clases-particulares/madrid"><strong>Clases en Madrid</strong><span>Servicio presencial y online según disponibilidad.</span></a>`}
      </div>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Preguntas frecuentes</h2>
      <div class="seo-faq">
        ${faqs.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="seo-cta">
    <h2>Encuentra profesor de ${escapeHtml(subject.short)} sin perder tiempo</h2>
    <p>Cuéntanos el nivel, el horario y el objetivo. Buscamos el perfil más adecuado, sin permanencia y con seguimiento.</p>
    <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
  </section>
</main>`,
  });
}

function cityHubPage(city) {
  const pathname = cityUrl(city);
  const canonical = cleanUrl(pathname);
  const title = 'Clases particulares en Madrid a domicilio y online | ClasesDe10';
  const description = 'Encuentra profesor particular en Madrid por materia, curso, zona y horario. Perfiles revisados, clases a domicilio u online y seguimiento familiar.';
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: cleanUrl('/clases-particulares') },
        { '@type': 'ListItem', position: 3, name: city.name, item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: SEO_CONTENT_LASTMOD,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: SUBJECTS.map((subject, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: subject.name,
          url: cleanUrl(subjectUrl(subject)),
        })),
      },
    },
  ];
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([
          { name: 'Inicio', url: '/' },
          { name: 'Clases particulares', url: '/clases-particulares' },
          { name: city.name },
        ])}
        <div class="seo-eyebrow">${escapeHtml(city.region)} · ${escapeHtml(city.modality)}</div>
        <h1>Clases particulares en <em>${escapeHtml(city.name)}</em></h1>
        <p>${escapeHtml(description)} No tienes que comparar decenas de anuncios: cuéntanos el caso y revisamos el encaje académico y práctico.</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
          <a class="seo-button secondary" href="/guias/como-elegir-profesor-particular">Cómo elegir profesor</a>
        </div>
      </div>
      <aside class="seo-proof" aria-label="Información para elegir profesor">
        <strong>Una selección con datos concretos</strong>
        <span>Curso exacto, materia y objetivo académico.</span>
        <span>Zona, horario y desplazamiento viable.</span>
        <span>Modalidad presencial u online según disponibilidad.</span>
      </aside>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Materias disponibles en ${escapeHtml(city.name)}</h2>
      <p>Empieza por la materia o el nivel. Las páginas específicas de Madrid reúnen las necesidades más habituales y permiten solicitar directamente un perfil compatible.</p>
      <div class="seo-grid">
        ${MADRID_LANDINGS.filter((landing) => landing.slug !== 'profesor-a-domicilio-madrid').map((landing) => `<a class="seo-card" href="${landingUrl(landing)}"><strong>${escapeHtml(landing.short)}</strong><span>${escapeHtml(landing.description)}</span></a>`).join('\n        ')}
        ${SUBJECTS.filter((subject) => !madridLandingForSubject(subject)).map((subject) => `<a class="seo-card" href="${subjectUrl(subject)}"><strong>${escapeHtml(subject.name)}</strong><span>Consulta niveles y modalidad disponible.</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>A domicilio, online o con una combinación flexible</h2>
      <p>La mejor modalidad es la que mantiene la calidad del profesor y un horario sostenible. Para presencial se revisan zona y desplazamiento; para online, especialización y disponibilidad sin limitar la búsqueda a un barrio.</p>
      <div class="seo-grid">
        <a class="seo-card" href="/clases-particulares/profesor-a-domicilio-madrid"><strong>Profesor a domicilio en Madrid</strong><span>Qué se tiene en cuenta para que el trayecto sea viable.</span></a>
        <a class="seo-card" href="/guias/profesor-particular-a-domicilio-u-online"><strong>Comparar presencial y online</strong><span>Ventajas, límites y criterios para decidir.</span></a>
        <a class="seo-card" href="/guias/como-elegir-profesor-particular"><strong>Guía para elegir profesor</strong><span>Checklist de encaje, método y seguimiento.</span></a>
      </div>
    </div>
  </section>
  <section class="seo-cta">
    <h2>Cuéntanos qué profesor necesitas en ${escapeHtml(city.name)}</h2>
    <p>Materia, nivel, horario y modalidad. Nosotros filtramos perfiles para que no tengas que buscar desde cero.</p>
    <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
  </section>
</main>`,
  });
}

function madridLandingPage(landing) {
  const canonical = cleanUrl(landingUrl(landing));
  const faqs = [
    ...landing.faqs,
    ['¿Cómo empieza la búsqueda?', 'Completa la solicitud con el curso exacto, la materia, la zona, la modalidad y los horarios posibles. ClasesDe10 revisa el caso antes de proponer un profesor.'],
  ];
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: cleanUrl('/clases-particulares') },
        { '@type': 'ListItem', position: 3, name: 'Madrid', item: cleanUrl('/clases-particulares/madrid') },
        { '@type': 'ListItem', position: 4, name: landing.short, item: canonical },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      name: landing.title,
      description: landing.description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: SEO_CONTENT_LASTMOD,
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': `${canonical}#service` },
    },
    {
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: landing.h1,
      description: landing.description,
      provider: { '@id': ORGANIZATION_ID },
      areaServed: { '@type': 'AdministrativeArea', name: 'Comunidad de Madrid' },
      availableChannel: [
        { '@type': 'ServiceChannel', serviceLocation: { '@type': 'AdministrativeArea', name: 'Comunidad de Madrid' } },
        { '@type': 'ServiceChannel', serviceUrl: canonical },
      ],
      audience: { '@type': 'Audience', audienceType: 'familias y estudiantes' },
    },
  ];
  return pageShell({
    title: landing.title,
    description: landing.description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([
          { name: 'Inicio', url: '/' },
          { name: 'Clases particulares', url: '/clases-particulares' },
          { name: 'Madrid', url: '/clases-particulares/madrid' },
          { name: landing.short },
        ])}
        <div class="seo-eyebrow">${escapeHtml(landing.eyebrow)}</div>
        <h1>${escapeHtml(landing.h1)}</h1>
        <p>${escapeHtml(landing.intro)}</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
          <a class="seo-button secondary" href="/contacto">Consultar mi caso</a>
        </div>
      </div>
      <aside class="seo-proof" aria-label="Criterios de selección">
        <strong>Qué se revisa para el encaje</strong>
        ${landing.proofs.map((proof) => `<span>${escapeHtml(proof)}.</span>`).join('\n        ')}
      </aside>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>${escapeHtml(landing.problemTitle)}</h2>
      <p>${escapeHtml(landing.problemIntro)}</p>
      <div class="seo-grid">
        ${landing.cards.map(([title, text]) => `<article class="seo-card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></article>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Cómo funciona la selección de ClasesDe10</h2>
      <p>La familia envía una única solicitud y el equipo revisa el encaje antes de abrir la relación dentro de la plataforma.</p>
      <div class="seo-grid seo-steps">
        <article class="seo-card seo-step"><strong>Necesidad exacta</strong><span>Curso, materia, objetivo, zona, modalidad y horarios posibles.</span></article>
        <article class="seo-card seo-step"><strong>Perfiles compatibles</strong><span>Especialidad, experiencia, disponibilidad y desplazamiento cuando la clase es presencial.</span></article>
        <article class="seo-card seo-step"><strong>Asignación y horario</strong><span>La familia recibe el perfil y propone el horario semanal desde su panel.</span></article>
        <article class="seo-card seo-step"><strong>Seguimiento</strong><span>Chat, calendario, clases y avisos quedan organizados en la plataforma.</span></article>
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner seo-copy">
      <h2>${escapeHtml(landing.localTitle)}</h2>
      <p>${escapeHtml(landing.localText)}</p>
      <p>La disponibilidad presencial se confirma para cada caso. Para estudiantes de fuera de Madrid, ClasesDe10 ofrece búsqueda de profesores online en España.</p>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Preguntas frecuentes</h2>
      <div class="seo-faq">
        ${faqs.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('\n        ')}
      </div>
      <nav class="seo-related" aria-label="Contenido relacionado">
        ${landing.related.map((url) => `<a href="${url}">${escapeHtml(labelForRelatedUrl(url))}</a>`).join('\n        ')}
      </nav>
    </div>
  </section>
  <section class="seo-cta">
    <h2>Cuéntanos el curso y el objetivo</h2>
    <p>Con datos concretos podemos buscar un profesor que encaje académicamente y que pueda sostener el horario.</p>
    <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
  </section>
</main>`,
  });
}

function labelForRelatedUrl(url) {
  const landing = MADRID_LANDINGS.find((item) => landingUrl(item) === url);
  if (landing) return landing.short;
  const guide = GUIDES.find((item) => guideUrl(item) === url);
  if (guide) return guide.h1;
  if (url.startsWith('/para-padres')) return 'Solicitar profesor';
  if (url === '/clases-particulares/madrid') return 'Clases particulares en Madrid';
  return 'Ver contenido relacionado';
}

function guidePage(guide) {
  const canonical = cleanUrl(guideUrl(guide));
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Guías', item: cleanUrl('/guias') },
        { '@type': 'ListItem', position: 3, name: guide.h1, item: canonical },
      ],
    },
    {
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: guide.h1,
      description: guide.description,
      url: canonical,
      mainEntityOfPage: { '@id': `${canonical}#webpage` },
      inLanguage: 'es-ES',
      datePublished: SEO_CONTENT_LASTMOD,
      dateModified: SEO_CONTENT_LASTMOD,
      image: [`${DOMAIN}/assets/img/social-share.png`],
      author: { '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'ClasesDe10', url: `${DOMAIN}/` },
      publisher: {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'ClasesDe10',
        url: `${DOMAIN}/`,
        logo: { '@type': 'ImageObject', url: `${DOMAIN}/assets/img/logo-512.png`, width: 512, height: 512 },
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      name: guide.title,
      description: guide.description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: SEO_CONTENT_LASTMOD,
      isPartOf: { '@id': WEBSITE_ID },
      primaryImageOfPage: { '@type': 'ImageObject', url: `${DOMAIN}/assets/img/social-share.png` },
    },
  ];
  return pageShell({
    title: guide.title,
    description: guide.description,
    canonical,
    schema: jsonLd(graph),
    type: 'article',
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <article>
    <header class="seo-hero">
      <div class="seo-hero-inner">
        <div>
          ${breadcrumb([{ name: 'Inicio', url: '/' }, { name: 'Guías', url: '/guias' }, { name: guide.h1 }])}
          <div class="seo-eyebrow">Guía práctica para familias</div>
          <h1>${escapeHtml(guide.h1)}</h1>
          <p>${escapeHtml(guide.intro)}</p>
          <div class="seo-meta">Publicado y revisado por el equipo de ClasesDe10 · ${SEO_CONTENT_LASTMOD.split('-').reverse().join('/')}</div>
        </div>
        <aside class="seo-proof" aria-label="Resumen de la guía">
          <strong>Qué te llevarás</strong>
          <span>Criterios concretos para tomar una decisión.</span>
          <span>Errores frecuentes que conviene evitar.</span>
          <span>Una lista final para pasar a la acción.</span>
        </aside>
      </div>
    </header>
    ${guide.sections.map(([title, paragraphs]) => `<section class="seo-section">
      <div class="seo-section-inner seo-copy">
        <h2>${escapeHtml(title)}</h2>
        ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n        ')}
      </div>
    </section>`).join('\n    ')}
    <section class="seo-section">
      <div class="seo-section-inner">
        <h2>Checklist antes de empezar</h2>
        <ul class="seo-list">${guide.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <nav class="seo-related" aria-label="Siguiente paso">
          ${guide.related.map((url) => `<a href="${url}">${escapeHtml(labelForRelatedUrl(url))}</a>`).join('\n          ')}
        </nav>
      </div>
    </section>
  </article>
  <section class="seo-cta">
    <h2>¿Ya sabes qué apoyo necesitas?</h2>
    <p>Indica el curso exacto, la materia, el objetivo y los horarios posibles. Revisamos el caso para buscar un perfil compatible.</p>
    <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
  </section>
</main>`,
  });
}

function guideHubPage() {
  const canonical = cleanUrl('/guias');
  const title = 'Guías para elegir y aprovechar clases particulares | ClasesDe10';
  const description = 'Guías prácticas para familias sobre profesores particulares, refuerzo escolar, clases a domicilio u online, Matemáticas y preparación EBAU.';
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Guías', item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: SEO_CONTENT_LASTMOD,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: GUIDES.map((guide, index) => ({
          '@type': 'ListItem', position: index + 1, name: guide.h1, url: cleanUrl(guideUrl(guide)),
        })),
      },
    },
  ];
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([{ name: 'Inicio', url: '/' }, { name: 'Guías' }])}
        <div class="seo-eyebrow">Decisiones mejor informadas</div>
        <h1>Guías para familias que buscan profesor particular</h1>
        <p>${escapeHtml(description)} Contenido directo, sin rankings comprados ni promesas que no se puedan demostrar.</p>
      </div>
      <aside class="seo-proof" aria-label="Criterios editoriales">
        <strong>Contenido de ClasesDe10</strong>
        <span>Escrito para resolver decisiones reales.</span>
        <span>Revisado cuando cambia el servicio.</span>
        <span>Sin cifras ni testimonios inventados.</span>
      </aside>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Elegir, organizar y medir el apoyo</h2>
      <p>Empieza por la duda que necesitas resolver. Cada guía incluye criterios, pasos y un siguiente movimiento concreto.</p>
      <div class="seo-grid">
        ${GUIDES.map((guide) => `<a class="seo-card" href="${guideUrl(guide)}"><strong>${escapeHtml(guide.h1)}</strong><span>${escapeHtml(guide.description)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-cta">
    <h2>Del diagnóstico a una solicitud concreta</h2>
    <p>Cuando tengas claro el curso, la materia y el objetivo, envía la solicitud para que podamos revisar perfiles compatibles.</p>
    <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
  </section>
</main>`,
  });
}

function nationalHubPage() {
  const canonical = cleanUrl('/clases-particulares');
  const title = 'Clases particulares online en España y presenciales en Madrid';
  const description = 'Encuentra profesor particular online en España o presencial en Madrid. Selección por materia, curso exacto, horario y necesidades del alumno.';
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: SEO_CONTENT_LASTMOD,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
          { name: 'Clases particulares en Madrid', url: cleanUrl('/clases-particulares/madrid') },
          ...SUBJECTS.map((subject) => ({ name: `Clases de ${subject.name}`, url: cleanUrl(subjectUrl(subject)) })),
        ].map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          url: item.url,
        })),
      },
    },
  ];
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([{ name: 'Inicio', url: '/' }, { name: 'Clases particulares' }])}
        <div class="seo-eyebrow">Madrid presencial · España online</div>
        <h1>Clases particulares con una <em>selección más precisa</em></h1>
        <p>${escapeHtml(description)} Explora las materias o cuéntanos el caso para buscar un perfil compatible sin recorrer decenas de anuncios.</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
          <a class="seo-button secondary" href="/para-profesores">Soy profesor</a>
        </div>
      </div>
      <aside class="seo-proof" aria-label="Opciones de búsqueda">
        <strong>Servicio explicado sin ambigüedad</strong>
        <span>Presencial en Madrid según zona y disponibilidad.</span>
        <span>Online para familias de toda España.</span>
        <span>Curso exacto y objetivo antes de revisar profesores.</span>
      </aside>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Clases particulares en Madrid</h2>
      <p>Consulta las búsquedas presenciales con más demanda. El encaje tiene en cuenta materia, curso, horario, zona y un desplazamiento que resulte viable de verdad.</p>
      <div class="seo-grid">
        <a class="seo-card" href="/clases-particulares/madrid"><strong>Todas las clases en Madrid</strong><span>Materias, niveles y modalidades disponibles.</span></a>
        ${MADRID_LANDINGS.map((landing) => `<a class="seo-card" href="${landingUrl(landing)}"><strong>${escapeHtml(landing.short)}</strong><span>${escapeHtml(landing.eyebrow)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Materias populares</h2>
      <p>Para clases online en España, empieza por la materia que necesitas y revisa niveles, objetivos y modalidades habituales.</p>
      <div class="seo-grid">
        ${SUBJECTS.map((subject) => `<a class="seo-card" href="${subjectUrl(subject)}"><strong>${escapeHtml(subject.name)}</strong><span>${escapeHtml(listNatural(subject.levels.slice(0, 4)))}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Guías para tomar una mejor decisión</h2>
      <p>Resolvemos las dudas que aparecen antes de elegir modalidad, profesor o plan de refuerzo.</p>
      <div class="seo-grid">
        ${GUIDES.map((guide) => `<a class="seo-card" href="${guideUrl(guide)}"><strong>${escapeHtml(guide.h1)}</strong><span>${escapeHtml(guide.description)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-cta">
    <h2>Encuentra profesor sin recorrer decenas de anuncios</h2>
    <p>ClasesDe10 centraliza la solicitud, filtra perfiles y reduce el tiempo hasta encontrar un profesor adecuado.</p>
    <a class="seo-button primary" href="/para-padres#formulario">Pedir un profesor</a>
  </section>
</main>`,
  });
}

function sitemapEntries() {
  const seoEntries = [
    { path: '/clases-particulares', priority: '0.95', changefreq: 'weekly' },
    ...CITIES.map((city) => ({ path: cityUrl(city), priority: '0.92', changefreq: 'weekly' })),
    ...MADRID_LANDINGS.map((landing) => ({ path: landingUrl(landing), priority: '0.94', changefreq: 'weekly' })),
    ...SUBJECTS.map((subject) => ({
      path: subjectUrl(subject),
      priority: ['matematicas', 'ingles', 'bachillerato', 'selectividad'].includes(subject.slug) ? '0.92' : '0.8',
      changefreq: 'weekly',
    })),
    { path: '/guias', priority: '0.86', changefreq: 'monthly' },
    ...GUIDES.map((guide) => ({ path: guideUrl(guide), priority: '0.84', changefreq: 'monthly' })),
  ];
  return [...CORE_PAGES.map(({ path: pathname, priority, changefreq }) => ({ path: pathname, priority, changefreq })), ...seoEntries];
}

function writeSitemap() {
  const entries = sitemapEntries();
  const body = entries.map((entry) => `  <url>
    <loc>${cleanUrl(entry.path)}</loc>
    <lastmod>${SEO_CONTENT_LASTMOD}</lastmod>
  </url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`, 'utf8');
  return entries.length;
}

function writeRobots() {
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /supabase/
Disallow: /firebase/
Disallow: /functions/
Disallow: /scripts/
Disallow: /output/
Disallow: /.claude/
Disallow: /.github/
Disallow: /.firebase/
Disallow: /.netlify/
Disallow: /package.json
Disallow: /package-lock.json
Disallow: /firebase.json
Disallow: /.firebaserc
Disallow: /clases-particulares/_generar-paginas.js

Sitemap: ${DOMAIN}/sitemap.xml
`, 'utf8');
}

function normalizeInternalHtmlLinks(html) {
  const cleanExtensions = html.replace(/href="([^"?#]+)\.html([?#][^"]*)?"/g, (match, pathname, suffix = '') => {
    if (/^(?:https?:)?\/\//i.test(pathname)) return match;
    const normalized = pathname.replace(/^\.\//, '').replace(/^\/+/, '');
    const cleanPath = normalized === 'index' ? '/' : `/${normalized}`;
    return `href="${cleanPath}${suffix}"`;
  });
  return cleanExtensions.replace(
    /\/clases-particulares\/(ingles)-madrid\b/g,
    '/clases-particulares/$1',
  );
}

function normalizeCoreHtml(html) {
  let normalized = normalizeInternalHtmlLinks(html).replace(
    /<img\b([^>]*\bsrc="\/assets\/img\/logo-(192|512)\.png"[^>]*)>/gi,
    (match, attributes, size) => /\bwidth=/i.test(attributes) && /\bheight=/i.test(attributes)
      ? match
      : `<img${attributes} width="${size}" height="${size}">`,
  );
  normalized = normalized
    .replace(/(\.(?:sv-card|fi-item|ci-card|shortcuts)) h4/g, '$1 h3')
    .replaceAll('<h4>', '<h3>')
    .replaceAll('</h4>', '</h3>');
  if (normalized.includes('<section class="steps-section">') && !normalized.includes('Tres pasos para empezar</h2>')) {
    normalized = normalized.replace(
      /<section class="steps-section">\s*<div class="section-inner">/,
      '<section class="steps-section">\n  <div class="section-inner">\n    <h2 class="section-title">Tres pasos para empezar</h2>',
    );
  }
  if (normalized.includes('<section class="contact-section">') && !normalized.includes('Elige cómo contactar con nosotros</h2>')) {
    normalized = normalized.replace(
      /<section class="contact-section">\s*<div class="section-inner">/,
      '<section class="contact-section">\n  <div class="section-inner">\n    <h2 class="section-title">Elige cómo contactar con nosotros</h2>',
    );
  }
  if (!normalized.includes('href="/sobre-nosotros"') && normalized.includes('<li><a href="/contacto">Formulario de contacto</a></li>')) {
    normalized = normalized.replace(
      '<li><a href="/contacto">Formulario de contacto</a></li>',
      '<li><a href="/sobre-nosotros">Sobre nosotros</a></li>\n        <li><a href="/contacto">Formulario de contacto</a></li>',
    );
  }
  return normalized;
}

function syncCoreSeoUrls() {
  for (const page of CORE_PAGES.filter((item) => item.path !== '/')) {
    const filePath = path.join(ROOT, page.file);
    if (!fs.existsSync(filePath)) continue;
    const clean = cleanUrl(page.path);
    const htmlUrl = `${clean}.html`;
    const current = fs.readFileSync(filePath, 'utf8');
    const next = normalizeCoreHtml(current.replaceAll(htmlUrl, clean));
    if (next !== current) fs.writeFileSync(filePath, next, 'utf8');
  }

  const homePath = path.join(ROOT, 'index.html');
  const home = fs.readFileSync(homePath, 'utf8');
  const normalizedHome = normalizeCoreHtml(home);
  if (normalizedHome !== home) fs.writeFileSync(homePath, normalizedHome, 'utf8');
}

function cleanGeneratedHtml() {
  const keep = new Set(['index.html']);
  for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html') || keep.has(entry.name)) continue;
    fs.unlinkSync(path.join(__dirname, entry.name));
  }
}

function cleanGeneratedGuides() {
  const directory = path.join(ROOT, 'guias');
  fs.mkdirSync(directory, { recursive: true });
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    fs.unlinkSync(path.join(directory, entry.name));
  }
}

function main() {
  cleanGeneratedHtml();
  cleanGeneratedGuides();
  fs.writeFileSync(path.join(__dirname, 'index.html'), nationalHubPage(), 'utf8');
  for (const city of CITIES) {
    fs.writeFileSync(cityFile(city), cityHubPage(city), 'utf8');
  }
  for (const subject of SUBJECTS) {
    fs.writeFileSync(subjectFile(subject), subjectHubPage(subject), 'utf8');
  }
  for (const landing of MADRID_LANDINGS) {
    fs.writeFileSync(landingFile(landing), madridLandingPage(landing), 'utf8');
  }
  fs.writeFileSync(path.join(ROOT, 'guias', 'index.html'), guideHubPage(), 'utf8');
  for (const guide of GUIDES) {
    fs.writeFileSync(guideFile(guide), guidePage(guide), 'utf8');
  }
  syncCoreSeoUrls();
  writeRobots();
  const sitemapCount = writeSitemap();
  console.log(JSON.stringify({
    ok: true,
    engine: SEO_ENGINE_VERSION,
    cities: CITIES.length,
    subjects: SUBJECTS.length,
    madridLandings: MADRID_LANDINGS.length,
    guides: GUIDES.length,
    generatedPages: 2 + CITIES.length + SUBJECTS.length + MADRID_LANDINGS.length + GUIDES.length,
    sitemapUrls: sitemapCount,
  }, null, 2));
}

main();
