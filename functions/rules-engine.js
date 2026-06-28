'use strict';

const RULE_ENGINE_VERSION = 'rules-engine-2026-06-28';

const EVENT_CATALOG = Object.freeze([
  { type: 'user.registered', entityType: 'users', description: 'Usuario registrado en la plataforma.' },
  { type: 'profile.updated', entityType: 'profesores|familias|users', description: 'Perfil actualizado con datos relevantes.' },
  { type: 'teacher.verified', entityType: 'profesores', description: 'Profesor verificado por administracion.' },
  { type: 'request.created', entityType: 'solicitudes', description: 'Nueva solicitud de familia/alumno.' },
  { type: 'request.stale', entityType: 'solicitudes', description: 'Solicitud abierta sin avance dentro del SLA.' },
  { type: 'assignment.created', entityType: 'asignaciones', description: 'Profesor asignado a una familia/alumno.' },
  { type: 'class.scheduled', entityType: 'clases', description: 'Clase creada o programada.' },
  { type: 'class.rescheduled', entityType: 'clases', description: 'Clase modificada o reprogramada.' },
  { type: 'class.cancelled', entityType: 'clases', description: 'Clase cancelada.' },
  { type: 'class.completed', entityType: 'clases', description: 'Clase finalizada.' },
  { type: 'class.confirmation_overdue', entityType: 'clases', description: 'Clase terminada sin confirmacion.' },
  { type: 'payment.created', entityType: 'pagos', description: 'Pago, solicitud de Bizum o payout creado.' },
  { type: 'payment.overdue', entityType: 'pagos', description: 'Pago pendiente vencido.' },
  { type: 'payment.verified', entityType: 'pagos', description: 'Pago recibido o validado.' },
  { type: 'message.received', entityType: 'chats', description: 'Mensaje recibido en chat.' },
  { type: 'document.created', entityType: 'documentos', description: 'Documento subido.' },
  { type: 'document.expiring_soon', entityType: 'documentos', description: 'Documento validado proximo a caducar.' },
  { type: 'document.expired', entityType: 'documentos', description: 'Documento caducado automaticamente.' },
  { type: 'document.stale', entityType: 'documentos', description: 'Documento pendiente demasiado tiempo.' },
  { type: 'incident.created', entityType: 'incidencias', description: 'Incidencia abierta.' },
  { type: 'incident.stale', entityType: 'incidencias', description: 'Incidencia abierta sin resolver dentro del SLA.' },
  { type: 'review.created', entityType: 'valoraciones', description: 'Valoracion registrada.' },
  { type: 'teacher.inactive', entityType: 'profesores', description: 'Profesor activo sin actividad reciente.' },
]);

const ACTION_CATALOG = Object.freeze([
  'automationEvent',
  'notification',
  'systemJob',
  'audit',
  'crmTask',
  'opsAlert',
  'patch',
]);

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getPath(source, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return current[key];
  }, source);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function renderTemplate(value, context) {
  return String(value).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => {
    const resolved = getPath(context, path);
    if (resolved === undefined || resolved === null) return '';
    if (typeof resolved === 'object') return clean(JSON.stringify(resolved), 800);
    return clean(resolved, 800);
  });
}

function resolveValue(spec, context) {
  if (typeof spec === 'string') return renderTemplate(spec, context);
  if (spec === null || typeof spec !== 'object') return spec;
  if (Array.isArray(spec)) return spec.map((item) => resolveValue(item, context));

  if (Object.prototype.hasOwnProperty.call(spec, 'const')) return spec.const;
  if (Object.prototype.hasOwnProperty.call(spec, 'path')) return getPath(context, spec.path);
  if (Object.prototype.hasOwnProperty.call(spec, 'template')) return renderTemplate(spec.template, context);
  if (Object.prototype.hasOwnProperty.call(spec, 'firstOf')) {
    for (const candidate of spec.firstOf || []) {
      const value = typeof candidate === 'string' ? getPath(context, candidate) : resolveValue(candidate, context);
      if (value !== undefined && value !== null && clean(value) !== '') return value;
    }
    return '';
  }
  if (Object.prototype.hasOwnProperty.call(spec, 'join')) {
    const values = (spec.join || []).map((item) => resolveValue(item, context)).filter((item) => clean(item) !== '');
    return values.join(spec.separator ?? ' ');
  }
  if (Object.prototype.hasOwnProperty.call(spec, 'lower')) return lower(resolveValue(spec.lower, context));
  if (Object.prototype.hasOwnProperty.call(spec, 'number')) {
    const value = Number(resolveValue(spec.number, context));
    return Number.isFinite(value) ? value : 0;
  }
  if (Object.prototype.hasOwnProperty.call(spec, 'boolean')) return Boolean(resolveValue(spec.boolean, context));

  return Object.fromEntries(Object.entries(spec).map(([key, value]) => [key, resolveValue(value, context)]));
}

function comparable(value) {
  if (typeof value === 'string') return lower(value);
  return value;
}

function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return clean(value) === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function compareCondition(condition, context) {
  const operator = lower(condition.operator || condition.op || 'truthy');
  const actual = Object.prototype.hasOwnProperty.call(condition, 'valueSpec')
    ? resolveValue(condition.valueSpec, context)
    : getPath(context, condition.path);
  const expected = Object.prototype.hasOwnProperty.call(condition, 'valueSpec')
    ? undefined
    : Object.prototype.hasOwnProperty.call(condition, 'value')
      ? resolveValue(condition.value, context)
      : undefined;
  const actualComparable = comparable(actual);
  const expectedComparable = comparable(expected);

  if (operator === 'truthy') return Boolean(actual);
  if (operator === 'falsy') return !actual;
  if (operator === 'exists') return actual !== undefined && actual !== null;
  if (operator === 'missing') return actual === undefined || actual === null;
  if (operator === 'empty') return isEmpty(actual);
  if (operator === 'not_empty') return !isEmpty(actual);
  if (operator === 'eq' || operator === 'equals') return actualComparable === expectedComparable;
  if (operator === 'neq' || operator === 'not_equals') return actualComparable !== expectedComparable;
  if (operator === 'in') return (Array.isArray(expected) ? expected.map(comparable) : []).includes(actualComparable);
  if (operator === 'not_in') return !(Array.isArray(expected) ? expected.map(comparable) : []).includes(actualComparable);
  if (operator === 'contains') return Array.isArray(actual)
    ? actual.map(comparable).includes(expectedComparable)
    : lower(actual).includes(lower(expected));
  if (operator === 'regex') {
    try {
      return new RegExp(String(expected), condition.flags || 'i').test(clean(actual, 2000));
    } catch {
      return false;
    }
  }

  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  if (operator === 'gt') return actualNumber > expectedNumber;
  if (operator === 'gte') return actualNumber >= expectedNumber;
  if (operator === 'lt') return actualNumber < expectedNumber;
  if (operator === 'lte') return actualNumber <= expectedNumber;
  return false;
}

function matchesCondition(condition, context) {
  if (!condition || !isPlainObject(condition)) return true;
  if (Array.isArray(condition.all)) return condition.all.every((item) => matchesCondition(item, context));
  if (Array.isArray(condition.any)) return condition.any.some((item) => matchesCondition(item, context));
  if (condition.not) return !matchesCondition(condition.not, context);
  return compareCondition(condition, context);
}

function normalizeRule(rule, source = 'runtime') {
  const id = clean(rule.id || rule.ruleId || `rule_${hashString(stableStringify(rule))}`, 180);
  const eventTypes = Array.isArray(rule.eventTypes)
    ? rule.eventTypes.map((item) => clean(item, 120)).filter(Boolean)
    : [clean(rule.eventType || '*', 120) || '*'];
  const actions = Array.isArray(rule.actions) ? rule.actions.filter((item) => isPlainObject(item)) : [];
  return {
    ...rule,
    id,
    name: clean(rule.name || id, 180),
    description: clean(rule.description || '', 500),
    eventTypes,
    active: rule.active !== false,
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 500,
    fallback: rule.fallback === true,
    actions,
    source: clean(rule.source || source, 120),
  };
}

function mergeRuleSets(defaultRules = [], externalRules = []) {
  const map = new Map();
  defaultRules.map((rule) => normalizeRule(rule, 'default')).forEach((rule) => map.set(rule.id, rule));
  externalRules.map((rule) => normalizeRule(rule, 'firestore')).forEach((rule) => {
    const base = map.get(rule.id);
    map.set(rule.id, base ? { ...base, ...rule, actions: rule.actions.length ? rule.actions : base.actions } : rule);
  });
  return [...map.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

function ruleMatchesEvent(rule, event, context) {
  if (!rule.active) return false;
  if (!rule.eventTypes.includes('*') && !rule.eventTypes.includes(event.type)) return false;
  return matchesCondition(rule.when || rule.conditions, context);
}

function applyAutomationRules({
  event,
  context,
  plan,
  rules,
  handlers,
}) {
  const normalizedRules = rules.map((rule) => normalizeRule(rule, rule.source || 'runtime'));
  const primary = normalizedRules.filter((rule) => !rule.fallback && ruleMatchesEvent(rule, event, context));
  const candidates = primary.length
    ? primary
    : normalizedRules.filter((rule) => rule.fallback && ruleMatchesEvent(rule, event, context));
  const matches = [];

  for (const rule of candidates) {
    const actions = [];
    for (const action of rule.actions) {
      if (!matchesCondition(action.when, context)) continue;
      const type = clean(action.type, 80);
      const handler = handlers[type];
      if (!handler) continue;
      const resolved = resolveValue(action, context);
      handler(resolved, { event, context, plan, rule });
      actions.push(type);
    }
    matches.push({
      ruleId: rule.id,
      ruleName: rule.name,
      source: rule.source,
      eventType: event.type,
      entityType: event.entityType,
      entityId: event.entityId,
      actionCount: actions.length,
      actions,
    });
    if (rule.stopProcessing) break;
  }

  return matches;
}

module.exports = {
  ACTION_CATALOG,
  EVENT_CATALOG,
  RULE_ENGINE_VERSION,
  applyAutomationRules,
  getPath,
  matchesCondition,
  mergeRuleSets,
  normalizeRule,
  resolveValue,
};
