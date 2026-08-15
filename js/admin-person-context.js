const ROLE_ALIASES = Object.freeze({
  teacher: 'profesor', profesor: 'profesor', profesora: 'profesor', docente: 'profesor',
  family: 'familia', familia: 'familia', parent: 'familia', guardian: 'familia',
  student: 'alumno', alumno: 'alumno', alumna: 'alumno', estudiante: 'alumno',
  admin: 'admin', administrador: 'admin', user: 'usuario', usuario: 'usuario',
});

const ROLE_LABELS = Object.freeze({
  profesor: 'Profesor',
  familia: 'Familia',
  alumno: 'Alumno',
  admin: 'Administrador',
  usuario: 'Usuario',
});

const PROFILE_SECTIONS = Object.freeze({
  profesor: 'profesores',
  familia: 'familias',
  alumno: 'alumnos',
});

const GENERIC_NAMES = new Set([
  'profesor', 'profesora', 'profesor/a', 'docente', 'familia', 'alumno', 'alumna',
  'alumno/a', 'estudiante', 'usuario', 'sin nombre', 'contacto', 'la familia',
  'el profesor', 'la profesora', 'el alumno', 'la alumna',
]);

function clean(value, max = 240) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function key(value) {
  return clean(value, 240).toLowerCase();
}

function first(...values) {
  return values.find((value) => clean(value));
}

function normalizeRole(value) {
  return ROLE_ALIASES[key(value)] || key(value) || 'usuario';
}

function roleLabel(role) {
  const normalized = normalizeRole(role);
  return ROLE_LABELS[normalized] || clean(role, 40) || 'Usuario';
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(clean(value));
}

function isOpaqueIdentifier(value) {
  const text = clean(value);
  if (!text || text.includes(' ')) return false;
  return /\d/.test(text) && /^[a-z0-9_-]{6,}$/i.test(text);
}

function isUsableName(value) {
  const text = clean(value);
  const normalized = key(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!text || isEmail(text) || isOpaqueIdentifier(text) || GENERIC_NAMES.has(normalized)) return false;
  return /[A-Za-zÀ-ÿ]/.test(text);
}

function nameRank(value) {
  const text = clean(value);
  if (!isUsableName(text)) return -1;
  const words = text.split(' ').filter(Boolean);
  return Math.min(words.length, 4) * 100 + Math.min(text.length, 80);
}

function bestName(...values) {
  return values
    .flat(Infinity)
    .map((value) => clean(value))
    .filter(isUsableName)
    .sort((a, b) => nameRank(b) - nameRank(a))[0] || '';
}

function joinedName(entity = {}) {
  const nested = entity.usuarios || entity.user || entity.profile || {};
  return bestName(
    [nested.nombre, nested.apellidos].filter(Boolean).join(' '),
    [entity.nombre, entity.apellidos].filter(Boolean).join(' '),
    [entity.firstName, entity.lastName].filter(Boolean).join(' '),
    entity.nombreCompleto,
    entity.nombre_completo,
    entity.fullName,
    entity.displayName,
    entity.name,
  );
}

function roleIds(role, entity = {}) {
  const normalized = normalizeRole(role);
  const common = [entity.id, entity.uid, entity.userUid, entity.user_uid, entity.usuario_id, entity.ownerUid];
  if (normalized === 'profesor') common.push(entity.teacherUid, entity.teacherId, entity.profesor_id, entity.profesorId);
  if (normalized === 'familia') common.push(entity.familyUid, entity.familyId, entity.familia_id, entity.familiaId);
  if (normalized === 'alumno') common.push(entity.studentId, entity.studentUid, entity.alumno_id, entity.alumnoId);
  return [...new Set(common.map((value) => clean(value, 180)).filter(Boolean))];
}

function sourceName(role, source = {}, explicitName = '') {
  const normalized = normalizeRole(role);
  const nested = source.usuarios || source.user || {};
  const common = [explicitName, joinedName(source)];
  if (normalized === 'profesor') common.push(
    source.teacherName, source.profesor_nombre, source.profesorName, source.teacherDisplayName,
    [source.profesor?.nombre, source.profesor?.apellidos].filter(Boolean).join(' '),
    [source.profesores?.usuarios?.nombre, source.profesores?.usuarios?.apellidos].filter(Boolean).join(' '),
  );
  if (normalized === 'familia') common.push(
    source.familyName, source.familia_nombre, source.familiaName, source.parentName,
    [source.familia?.nombre, source.familia?.apellidos].filter(Boolean).join(' '),
    [source.familias?.usuarios?.nombre, source.familias?.usuarios?.apellidos].filter(Boolean).join(' '),
  );
  if (normalized === 'alumno') common.push(
    source.studentName, source.alumno_nombre, source.alumnoName,
    [source.alumnos?.nombre, source.alumnos?.apellidos].filter(Boolean).join(' '),
  );
  common.push([nested.nombre, nested.apellidos].filter(Boolean).join(' '));
  return bestName(common);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function listNames(records = [], max = 3) {
  const names = [...new Set(records.map((record) => clean(record?.fullName)).filter(isUsableName))];
  if (names.length <= max) return names;
  return [...names.slice(0, max), `y ${names.length - max} más`];
}

export class AdminPersonDirectory {
  constructor() {
    this.records = new Map();
    this.aliases = new Map();
  }

  reset() {
    this.records.clear();
    this.aliases.clear();
    return this;
  }

  recordKey(role, id) {
    return `${normalizeRole(role)}:${clean(id, 180)}`;
  }

  get(role, id) {
    const normalized = normalizeRole(role);
    const cleanId = clean(id, 180);
    if (!cleanId) return null;
    const direct = this.records.get(this.recordKey(normalized, cleanId));
    if (direct) return direct;
    const aliasKey = this.aliases.get(this.recordKey(normalized, cleanId));
    return aliasKey ? this.records.get(aliasKey) || null : null;
  }

  registerPerson(role, entity = {}, options = {}) {
    const normalized = normalizeRole(role);
    const ids = [...new Set([
      ...roleIds(normalized, entity),
      ...(options.aliases || []).map((value) => clean(value, 180)),
    ].filter(Boolean))];
    if (!ids.length) return null;
    const aliasedExisting = ids.map((id) => this.get(normalized, id)).find(Boolean);
    const profileId = clean(first(options.profileId, entity.profileId, aliasedExisting?.profileId, entity.id, ids[0]), 180);
    const canonicalKey = this.recordKey(normalized, profileId);
    const existing = this.records.get(canonicalKey) || {
      id: profileId,
      profileId,
      role: normalized,
      fullName: '',
      email: '',
      studentIds: new Set(),
      familyIds: new Set(),
      teacherIds: new Set(),
      aliases: new Set(),
    };
    const candidateName = bestName(options.fullName, joinedName(entity), sourceName(normalized, entity));
    if (nameRank(candidateName) > nameRank(existing.fullName)) existing.fullName = candidateName;
    existing.email = clean(first(options.email, entity.email, entity.usuarios?.email, existing.email), 220);
    existing.userUid = clean(first(options.userUid, entity.userUid, entity.user_uid, entity.usuario_id, entity.uid, existing.userUid), 180);
    existing.raw = { ...(existing.raw || {}), ...entity };
    ids.forEach((id) => {
      existing.aliases.add(id);
      this.aliases.set(this.recordKey(normalized, id), canonicalKey);
    });
    this.records.set(canonicalKey, existing);
    return existing;
  }

  linkStudent({ studentId, familyId, teacherId } = {}) {
    const sid = clean(studentId, 180);
    const fid = clean(familyId, 180);
    const tid = clean(teacherId, 180);
    const student = sid ? this.get('alumno', sid) : null;
    const family = fid ? this.get('familia', fid) : null;
    const teacher = tid ? this.get('profesor', tid) : null;
    if (student && family) {
      student.familyIds.add(family.profileId);
      family.studentIds.add(student.profileId);
    }
    if (student && teacher) {
      student.teacherIds.add(teacher.profileId);
      teacher.studentIds.add(student.profileId);
    }
  }

  register({ users = [], teachers = [], families = [], students = [], classes = [], requests = [], assignments = [] } = {}) {
    const usersById = new Map();
    users.forEach((user) => roleIds(user.role || user.rol || 'usuario', user).forEach((id) => usersById.set(id, user)));

    teachers.forEach((teacher) => {
      const userId = clean(first(teacher.userUid, teacher.user_uid, teacher.usuario_id, teacher.uid), 180);
      const user = usersById.get(userId) || {};
      this.registerPerson('profesor', { ...user, ...teacher }, { aliases: roleIds('usuario', user), userUid: userId });
    });
    families.forEach((family) => {
      const userId = clean(first(family.userUid, family.user_uid, family.usuario_id, family.uid), 180);
      const user = usersById.get(userId) || {};
      this.registerPerson('familia', { ...user, ...family }, { aliases: roleIds('usuario', user), userUid: userId });
    });
    students.forEach((student) => this.registerPerson('alumno', student));
    users.forEach((user) => {
      const role = normalizeRole(user.role || user.rol || 'usuario');
      const userId = clean(first(user.uid, user.id, user.userUid), 180);
      const existing = this.get(role, userId);
      this.registerPerson(role, user, existing ? { profileId: existing.profileId } : {});
    });

    students.forEach((student) => this.linkStudent({
      studentId: first(student.id, student.studentId, student.alumno_id),
      familyId: first(student.familyUid, student.familyId, student.familia_id, student.familiaId),
    }));

    [...classes, ...requests, ...assignments].forEach((item) => {
      const studentId = clean(first(item.studentId, item.studentUid, item.alumno_id, item.alumnoId), 180);
      const familyId = clean(first(item.familyUid, item.familyId, item.familia_id, item.familiaId), 180);
      const teacherId = clean(first(item.teacherUid, item.teacherId, item.profesor_id, item.profesorId, item.assignedTeacherUid, item.profesor_asignado_id), 180);
      if (studentId) this.registerPerson('alumno', { id: studentId, studentName: sourceName('alumno', item) }, { fullName: sourceName('alumno', item) });
      if (familyId) this.registerPerson('familia', { id: familyId, familyName: sourceName('familia', item) }, { fullName: sourceName('familia', item) });
      if (teacherId) this.registerPerson('profesor', { id: teacherId, teacherName: sourceName('profesor', item) }, { fullName: sourceName('profesor', item) });
      this.linkStudent({ studentId, familyId, teacherId });
    });
    return this;
  }

  relatedStudents(record, explicitStudentId = '') {
    const explicit = clean(explicitStudentId, 180);
    if (explicit) {
      const student = this.get('alumno', explicit);
      if (student) return [student];
    }
    return [...(record?.studentIds || [])].map((id) => this.get('alumno', id)).filter(Boolean);
  }

  resolve({ role = 'usuario', id = '', source = {}, name = '', studentId = '', studentName = '', familyId = '', familyName = '' } = {}) {
    const normalized = normalizeRole(role);
    const resolvedId = clean(first(id, roleIds(normalized, source)), 180);
    const record = this.get(normalized, resolvedId);
    const fullName = bestName(record?.fullName, sourceName(normalized, source, name)) || `${roleLabel(normalized)} pendiente de nombre`;
    const explicitStudentId = clean(first(studentId, source.studentId, source.studentUid, source.alumno_id, source.alumnoId), 180);
    const explicitStudentName = bestName(studentName, sourceName('alumno', source), this.get('alumno', explicitStudentId)?.fullName);
    const relatedStudents = normalized === 'alumno'
      ? []
      : this.relatedStudents(record, explicitStudentId);
    const relatedStudentNames = listNames([
      ...(explicitStudentName ? [{ fullName: explicitStudentName }] : []),
      ...relatedStudents,
    ]);

    let relationshipLabel = '';
    if (normalized === 'familia') {
      relationshipLabel = relatedStudentNames.length
        ? `${relatedStudentNames.length === 1 ? 'Hijo/a' : 'Hijos'}: ${relatedStudentNames.join(', ')}`
        : 'Sin hijo asociado';
    } else if (normalized === 'profesor') {
      relationshipLabel = relatedStudentNames.length
        ? `${relatedStudentNames.length === 1 ? 'Alumno/a' : 'Alumnos'}: ${relatedStudentNames.join(', ')}`
        : 'Sin alumno asociado';
    } else if (normalized === 'alumno') {
      const explicitFamilyId = clean(first(familyId, source.familyUid, source.familyId, source.familia_id, source.familiaId, [...(record?.familyIds || [])][0]), 180);
      const family = this.get('familia', explicitFamilyId);
      const resolvedFamilyName = bestName(family?.fullName, familyName, sourceName('familia', source));
      relationshipLabel = resolvedFamilyName ? `Familia: ${resolvedFamilyName}` : 'Sin familia asociada';
    }

    return {
      id: record?.profileId || resolvedId,
      profileId: record?.profileId || resolvedId,
      role: normalized,
      roleLabel: roleLabel(normalized),
      fullName,
      email: record?.email || '',
      relationshipLabel,
      section: PROFILE_SECTIONS[normalized] || '',
      canOpenProfile: Boolean((record?.profileId || resolvedId) && PROFILE_SECTIONS[normalized]),
    };
  }
}

export const adminPersonDirectory = new AdminPersonDirectory();

export function renderAdminPersonReference(options = {}, directory = adminPersonDirectory) {
  const person = directory.resolve(options);
  const compact = options.compact === true;
  const buttonLabel = clean(options.buttonLabel, 40) || 'Ver ficha';
  return `<div class="admin-person-reference${compact ? ' is-compact' : ''}" data-admin-person-reference="${escapeHtml(person.role)}">
    <div class="admin-person-reference__copy">
      <strong>${escapeHtml(person.fullName)}</strong>
      ${person.relationshipLabel ? `<span>${escapeHtml(person.relationshipLabel)}</span>` : ''}
    </div>
    ${person.canOpenProfile ? `<button type="button" class="btn btn-outline btn-sm admin-person-reference__action" data-action="ver-persona-admin" data-person-role="${escapeHtml(person.role)}" data-person-id="${escapeHtml(person.profileId)}">${escapeHtml(buttonLabel)}</button>` : ''}
  </div>`;
}

export function adminPersonName(options = {}, directory = adminPersonDirectory) {
  return directory.resolve(options).fullName;
}

export { normalizeRole as normalizeAdminPersonRole };

export default adminPersonDirectory;
