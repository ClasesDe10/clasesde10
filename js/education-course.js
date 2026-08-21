export const CUSTOM_EDUCATION_COURSE_VALUE = '__otro__';

export const EDUCATION_COURSE_GROUPS = Object.freeze([
  Object.freeze({
    stage: 'Primaria',
    courses: Object.freeze(['1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria']),
  }),
  Object.freeze({
    stage: 'ESO',
    courses: Object.freeze(['1º ESO', '2º ESO', '3º ESO', '4º ESO']),
  }),
  Object.freeze({
    stage: 'Bachillerato y acceso a la universidad',
    courses: Object.freeze(['1º Bachillerato', '2º Bachillerato', 'Selectividad / EBAU']),
  }),
  Object.freeze({
    stage: 'Formación Profesional',
    courses: Object.freeze([
      '1º FP Básica',
      '2º FP Básica',
      '1º FP Grado Medio',
      '2º FP Grado Medio',
      '1º FP Grado Superior',
      '2º FP Grado Superior',
    ]),
  }),
  Object.freeze({
    stage: 'Universidad',
    courses: Object.freeze(['1º Universidad', '2º Universidad', '3º Universidad', '4º Universidad', '5º Universidad', '6º Universidad']),
  }),
]);

const COURSES = EDUCATION_COURSE_GROUPS.flatMap((group) => group.courses);

function normalizeCourseKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)\s*[ºª°]/g, '$1')
    .replace(/\bde\b/g, ' ')
    .replace(/\bcurso\b/g, ' ')
    .replace(/\bsecundaria obligatoria\b/g, 'eso')
    .replace(/\bsecundaria\b/g, 'eso')
    .replace(/\bbach\b/g, 'bachillerato')
    .replace(/\bformacion profesional\b/g, 'fp')
    .replace(/\bgrado basico\b/g, 'fp basica')
    .replace(/\bciclo medio\b/g, 'fp grado medio')
    .replace(/\bciclo superior\b/g, 'fp grado superior')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COURSE_BY_KEY = new Map(COURSES.map((course) => [normalizeCourseKey(course), course]));
['selectividad', 'ebau', 'evau', 'pau', 'selectividad ebau']
  .forEach((alias) => COURSE_BY_KEY.set(normalizeCourseKey(alias), 'Selectividad / EBAU'));
const BROAD_STAGE_KEYS = new Set([
  'primaria',
  'eso',
  'bachillerato',
  'fp',
  'fp basica',
  'fp grado medio',
  'fp grado superior',
  'universidad',
  'adultos',
  'educacion adultos',
].map(normalizeCourseKey));

function isBroadEducationStage(value) {
  return BROAD_STAGE_KEYS.has(normalizeCourseKey(value));
}

export function canonicalEducationCourse(value) {
  const key = normalizeCourseKey(value);
  if (!key) return '';
  return COURSE_BY_KEY.get(key) || '';
}

export function educationStageForCourse(value) {
  const canonical = canonicalEducationCourse(value) || String(value || '').trim();
  const key = normalizeCourseKey(canonical);
  if (!key) return '';
  if (/\bprimaria\b/.test(key)) return 'Primaria';
  if (/\beso\b/.test(key)) return 'ESO';
  if (/\bbachillerato\b/.test(key)) return 'Bachillerato';
  if (/\b(selectividad|ebau|evau|pau)\b/.test(key)) return 'Selectividad';
  if (/\bfp basica\b/.test(key)) return 'FP Básica';
  if (/\bfp grado medio\b/.test(key)) return 'FP Grado Medio';
  if (/\bfp grado superior\b/.test(key)) return 'FP Grado Superior';
  if (/\b(universidad|grado universitario)\b/.test(key)) return 'Universidad';
  return 'Otros estudios';
}

export function resolveEducationCourse(selectValue, customValue = '') {
  if (selectValue === CUSTOM_EDUCATION_COURSE_VALUE) {
    const custom = String(customValue || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    return isBroadEducationStage(custom) ? '' : custom;
  }
  return canonicalEducationCourse(selectValue);
}

export function educationCourseFromStudent(student = {}) {
  const rawCourse = String(student.course || student.curso || '').trim();
  const rawStage = String(student.educationStage || student.nivel_educativo || student.level || student.nivel || '').trim();
  const canonical = [
    rawCourse,
    [rawCourse, rawStage].filter(Boolean).join(' '),
  ].map(canonicalEducationCourse).find(Boolean) || '';

  if (canonical) return { selectValue: canonical, customValue: '' };
  if (rawCourse && !isBroadEducationStage(rawCourse)) {
    return { selectValue: CUSTOM_EDUCATION_COURSE_VALUE, customValue: rawCourse.slice(0, 120) };
  }
  return { selectValue: '', customValue: '' };
}
