export const EXPERIMENTATION_ENGINE_VERSION = 'experimentation-engine-2026-06-28';

export const EXPERIMENT_STATUSES = Object.freeze(['draft', 'active', 'paused', 'completed', 'archived']);
export const EXPERIMENT_TYPES = Object.freeze(['flag', 'experiment']);

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value, max = 500) {
  return clean(value, max).toLowerCase();
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, number(value)));
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value).split(/[,;\n|]/).map((item) => clean(item)).filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function dateFrom(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createdAt(item = {}) {
  return item.createdAt || item.created_at || item.timestamp || item.fecha || item.date;
}

function daysBetween(start, end = new Date()) {
  const startDate = dateFrom(start);
  const endDate = dateFrom(end) || new Date();
  if (!startDate) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
}

export function stableHash(input = '') {
  let hash = 2166136261;
  const text = clean(input, 1000);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function bucketFor(input = '', denominator = 10000) {
  return stableHash(input) % denominator;
}

function normalizeTargeting(targeting = {}) {
  return {
    roles: unique(asArray(targeting.roles).map((item) => lower(item, 80))),
    userUids: unique(asArray(targeting.userUids || targeting.users || targeting.uids)),
    cities: unique(asArray(targeting.cities || targeting.ciudades || targeting.zonas).map((item) => lower(item, 160))),
    includeAdmins: targeting.includeAdmins !== false,
    usersNewerThanDays: targeting.usersNewerThanDays === '' || targeting.usersNewerThanDays === undefined ? null : Math.max(0, number(targeting.usersNewerThanDays)),
    usersOlderThanDays: targeting.usersOlderThanDays === '' || targeting.usersOlderThanDays === undefined ? null : Math.max(0, number(targeting.usersOlderThanDays)),
    createdAfter: clean(targeting.createdAfter, 40),
    createdBefore: clean(targeting.createdBefore, 40),
    percentage: clamp(targeting.percentage ?? targeting.rolloutPercent ?? 100),
  };
}

function normalizeVariant(variant = {}, index = 0, total = 1) {
  const fallbackId = index === 0 ? 'control' : `variant_${index}`;
  return {
    id: lower(variant.id || variant.key || fallbackId, 80).replace(/[^a-z0-9_-]/g, '_') || fallbackId,
    label: clean(variant.label || variant.name || fallbackId, 120),
    weight: Math.max(0, number(variant.weight, total ? Math.round(100 / total) : 100)),
    enabled: variant.enabled !== false,
    config: variant.config && typeof variant.config === 'object' ? variant.config : {},
  };
}

export function normalizeExperimentDefinition(definition = {}) {
  const id = lower(definition.id || definition.key || definition.slug || '', 120).replace(/[^a-z0-9_-]/g, '_');
  const type = EXPERIMENT_TYPES.includes(definition.type) ? definition.type : definition.variants?.length > 1 ? 'experiment' : 'flag';
  const status = EXPERIMENT_STATUSES.includes(definition.status) ? definition.status : definition.enabled === false ? 'paused' : 'draft';
  const variants = (definition.variants?.length ? definition.variants : (
    type === 'flag'
      ? [
        { id: 'off', label: 'Desactivado', weight: 100, enabled: true, config: { enabled: false } },
        { id: 'on', label: 'Activado', weight: 0, enabled: true, config: { enabled: true } },
      ]
      : [
        { id: 'control', label: 'Control', weight: 50, enabled: true },
        { id: 'variant', label: 'Variante', weight: 50, enabled: true },
      ]
  )).map((variant, index, list) => normalizeVariant(variant, index, list.length));

  return {
    id: id || `experiment_${stableHash(JSON.stringify(definition))}`,
    key: lower(definition.key || id || definition.name || '', 120).replace(/[^a-z0-9_-]/g, '_'),
    type,
    name: clean(definition.name || definition.title || id || 'Experimento', 160),
    description: clean(definition.description || definition.hypothesis || '', 800),
    status,
    enabled: definition.enabled !== false && status === 'active',
    rolloutPercent: clamp(definition.rolloutPercent ?? definition.percentage ?? 100),
    targeting: normalizeTargeting(definition.targeting || {}),
    variants,
    metrics: {
      primaryEvent: clean(definition.metrics?.primaryEvent || definition.primaryEvent || 'form.submitted', 120),
      conversionEvent: clean(definition.metrics?.conversionEvent || definition.conversionEvent || definition.metrics?.primaryEvent || 'request.created', 120),
      guardrailEvent: clean(definition.metrics?.guardrailEvent || definition.guardrailEvent || 'form.error', 120),
    },
    startedAt: definition.startedAt || definition.started_at || '',
    endedAt: definition.endedAt || definition.ended_at || '',
    createdAt: definition.createdAt || definition.created_at || '',
    updatedAt: definition.updatedAt || definition.updated_at || '',
  };
}

export function publicExperimentDefinition(definition = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  return {
    id: normalized.id,
    key: normalized.key,
    type: normalized.type,
    name: normalized.name,
    description: normalized.description,
    status: normalized.status,
    enabled: normalized.enabled,
    rolloutPercent: normalized.rolloutPercent,
    targeting: normalized.targeting,
    variants: normalized.variants,
    metrics: normalized.metrics,
    startedAt: normalized.startedAt,
    endedAt: normalized.endedAt,
    updatedAt: normalized.updatedAt,
    engineVersion: EXPERIMENTATION_ENGINE_VERSION,
  };
}

function userAgeDays(context = {}) {
  if (Number.isFinite(Number(context.accountAgeDays))) return Number(context.accountAgeDays);
  return daysBetween(context.createdAt || context.created_at || context.firstSeenAt || context.first_seen_at);
}

function matchesTargeting(definition, context = {}) {
  const target = normalizeExperimentDefinition(definition).targeting;
  const role = lower(context.role || context.rol || context.actorRole || 'anonimo', 80);
  const uid = clean(context.uid || context.userUid || context.actorUid || '', 180);
  const city = lower(context.city || context.ciudad || context.zona || context.zone || '', 160);
  const ageDays = userAgeDays(context);

  if (!target.includeAdmins && role === 'admin') return { ok: false, reason: 'admin_excluded' };
  if (target.roles.length && !target.roles.includes(role)) return { ok: false, reason: 'role' };
  if (target.userUids.length && !target.userUids.includes(uid)) return { ok: false, reason: 'user' };
  if (target.cities.length && !target.cities.some((item) => city.includes(item) || item.includes(city))) return { ok: false, reason: 'city' };
  if (target.usersNewerThanDays !== null && (ageDays === null || ageDays > target.usersNewerThanDays)) return { ok: false, reason: 'not_new_user' };
  if (target.usersOlderThanDays !== null && (ageDays === null || ageDays < target.usersOlderThanDays)) return { ok: false, reason: 'not_old_user' };
  const created = dateFrom(context.createdAt || context.created_at || context.firstSeenAt || context.first_seen_at);
  if (target.createdAfter && created && created < dateFrom(target.createdAfter)) return { ok: false, reason: 'created_before_target' };
  if (target.createdBefore && created && created > dateFrom(target.createdBefore)) return { ok: false, reason: 'created_after_target' };
  return { ok: true, reason: 'targeted' };
}

function rolloutAllowed(definition, context = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  const identity = clean(context.uid || context.userUid || context.actorUid || context.anonymousId || context.sessionId || 'anon', 220);
  const percent = Math.min(normalized.rolloutPercent, normalized.targeting.percentage);
  const bucket = bucketFor(`${normalized.id}:${identity}:rollout`);
  return {
    ok: bucket < percent * 100,
    bucket,
    percent,
  };
}

function selectVariant(definition, context = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  const enabledVariants = normalized.variants.filter((variant) => variant.enabled !== false && variant.weight > 0);
  if (!enabledVariants.length) return null;
  const totalWeight = enabledVariants.reduce((sum, variant) => sum + number(variant.weight), 0);
  if (totalWeight <= 0) return enabledVariants[0];
  const identity = clean(context.uid || context.userUid || context.actorUid || context.anonymousId || context.sessionId || 'anon', 220);
  const bucket = bucketFor(`${normalized.id}:${identity}:variant`, 100000) / 100000;
  let cursor = 0;
  for (const variant of enabledVariants) {
    cursor += variant.weight / totalWeight;
    if (bucket <= cursor) return variant;
  }
  return enabledVariants.at(-1);
}

export function evaluateExperiment(definition = {}, context = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  if (!normalized.enabled || normalized.status !== 'active') {
    return { matched: false, enabled: false, reason: 'inactive', definition: normalized, variant: null };
  }
  const target = matchesTargeting(normalized, context);
  if (!target.ok) return { matched: false, enabled: false, reason: target.reason, definition: normalized, variant: null };
  const rollout = rolloutAllowed(normalized, context);
  if (!rollout.ok) return { matched: true, enabled: false, reason: 'rollout_excluded', definition: normalized, variant: null, bucket: rollout.bucket };
  const variant = selectVariant(normalized, context);
  if (!variant) return { matched: true, enabled: false, reason: 'no_variant', definition: normalized, variant: null, bucket: rollout.bucket };
  const flagEnabled = normalized.type === 'flag'
    ? variant.id === 'on' || variant.config?.enabled === true || normalized.rolloutPercent >= 100
    : true;
  return {
    matched: true,
    enabled: flagEnabled,
    reason: 'assigned',
    definition: normalized,
    variant,
    bucket: rollout.bucket,
    rolloutPercent: rollout.percent,
  };
}

export function evaluateExperiments(definitions = [], context = {}) {
  return (definitions || []).map((definition) => evaluateExperiment(definition, context));
}

function eventName(event = {}) {
  return clean(event.eventName || event.name || event.type, 120);
}

function sessionKey(event = {}) {
  return clean(event.sessionId || event.anonymousId || event.actorUid || event.id, 220);
}

function eventExperimentMap(event = {}) {
  const map = {};
  const fromMetadata = event.metadata?.experiments || event.context?.experiments || {};
  if (fromMetadata && typeof fromMetadata === 'object' && !Array.isArray(fromMetadata)) {
    Object.entries(fromMetadata).forEach(([key, variant]) => {
      const safeKey = lower(key, 120);
      const safeVariant = lower(variant, 80);
      if (safeKey && safeVariant) map[safeKey] = safeVariant;
    });
  }
  const key = lower(event.experimentKey || event.metadata?.experimentKey || event.metadata?.experiment || '', 120);
  const variant = lower(event.variant || event.metadata?.variant || '', 80);
  if (key && variant) map[key] = variant;
  return map;
}

function countUnique(items = [], getter = sessionKey) {
  const values = new Set();
  items.forEach((item) => {
    const value = clean(getter(item), 220);
    if (value) values.add(value);
  });
  return values.size;
}

export function buildExperimentResults(definitions = [], events = [], options = {}) {
  const minSampleSize = Math.max(1, number(options.minSampleSize, 20));
  return (definitions || []).map(normalizeExperimentDefinition).map((definition) => {
    const rows = definition.variants.map((variant) => {
      const assignedEvents = (events || []).filter((event) => eventExperimentMap(event)[definition.key] === variant.id);
      const exposures = assignedEvents.filter((event) => eventName(event) === 'experiment.exposed');
      const conversions = assignedEvents.filter((event) => eventName(event) === definition.metrics.conversionEvent);
      const primary = assignedEvents.filter((event) => eventName(event) === definition.metrics.primaryEvent);
      const guardrail = assignedEvents.filter((event) => eventName(event) === definition.metrics.guardrailEvent);
      const exposedSessions = countUnique(exposures);
      const convertedSessions = countUnique(conversions);
      const primarySessions = countUnique(primary);
      const guardrailSessions = countUnique(guardrail);
      const conversionPct = exposedSessions ? Math.round((convertedSessions / exposedSessions) * 1000) / 10 : 0;
      const primaryPct = exposedSessions ? Math.round((primarySessions / exposedSessions) * 1000) / 10 : 0;
      const guardrailPct = exposedSessions ? Math.round((guardrailSessions / exposedSessions) * 1000) / 10 : 0;
      return {
        variantId: variant.id,
        label: variant.label,
        weight: variant.weight,
        exposures: exposedSessions,
        conversions: convertedSessions,
        primary: primarySessions,
        guardrail: guardrailSessions,
        conversionPct,
        primaryPct,
        guardrailPct,
        sampleReady: exposedSessions >= minSampleSize,
      };
    });
    const control = rows.find((row) => row.variantId === 'control') || rows[0] || { conversionPct: 0, exposures: 0 };
    const enriched = rows.map((row) => ({
      ...row,
      liftPct: control.conversionPct ? Math.round(((row.conversionPct - control.conversionPct) / control.conversionPct) * 1000) / 10 : 0,
    }));
    const winner = enriched.filter((row) => row.sampleReady).sort((a, b) => b.conversionPct - a.conversionPct || b.exposures - a.exposures)[0] || null;
    return {
      experimentId: definition.id,
      key: definition.key,
      name: definition.name,
      type: definition.type,
      status: definition.status,
      metrics: definition.metrics,
      rolloutPercent: definition.rolloutPercent,
      variants: enriched,
      totalExposures: enriched.reduce((sum, row) => sum + row.exposures, 0),
      winner,
      recommendation: winner && control && winner.variantId !== control.variantId && winner.conversionPct > control.conversionPct
        ? `Gana ${winner.label} con ${winner.conversionPct}% (${winner.liftPct}% vs control).`
        : 'Mantener prueba hasta tener mas muestra o lift claro.',
    };
  });
}

export function parseExperimentJson(value, fallback) {
  if (value === undefined || value === null || clean(value) === '') return fallback;
  const parsed = JSON.parse(value);
  return parsed;
}
