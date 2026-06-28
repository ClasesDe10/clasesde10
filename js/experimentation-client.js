import {
  collection,
  getDocs,
  limit as firestoreLimit,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import { trackAnalyticsEvent, analyticsAnonymousId, analyticsSessionId } from './analytics-client.js?v=20260628-analytics';
import {
  EXPERIMENTATION_ENGINE_VERSION,
  evaluateExperiment,
  normalizeExperimentDefinition,
} from './experimentation-engine.js?v=20260628-experiments';

const FIRST_SEEN_KEY = 'cd10:first-seen-at';
const ASSIGNMENT_KEY = 'cd10:experiment-assignments';
const EXPOSURE_SESSION_KEY = 'cd10:experiment-exposures-session';
const CACHE_MS = 5 * 60 * 1000;
let definitionsCache = { expiresAt: 0, items: [] };
let initialized = false;

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function slug(value, max = 80) {
  return clean(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function storageGet(key, fallback = '') {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch (_) {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

function readJson(key, fallback = {}) {
  try {
    const raw = storageGet(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  storageSet(key, JSON.stringify(value));
}

function firstSeenAt() {
  let value = storageGet(FIRST_SEEN_KEY);
  if (!value) {
    value = new Date().toISOString();
    storageSet(FIRST_SEEN_KEY, value);
  }
  return value;
}

function dateFrom(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function accountAgeDays(value) {
  const date = dateFrom(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function currentUserContext(overrides = {}) {
  const user = firebaseAuth.currentUser;
  const profile = globalThis.CD10CurrentUser || {};
  const created = overrides.createdAt || profile.createdAt || profile.created_at || user?.metadata?.creationTime || firstSeenAt();
  return {
    uid: clean(overrides.uid || profile.uid || profile.id || profile.userUid || user?.uid || '', 180),
    role: clean(overrides.role || profile.role || profile.rol || 'anonimo', 80),
    city: clean(overrides.city || profile.city || profile.ciudad || profile.zona || profile.zone || '', 160),
    createdAt: created,
    firstSeenAt: firstSeenAt(),
    accountAgeDays: accountAgeDays(created),
    anonymousId: analyticsAnonymousId(),
    sessionId: analyticsSessionId(),
  };
}

function assignments() {
  return readJson(ASSIGNMENT_KEY, {});
}

function saveAssignment(key, assignment) {
  const all = assignments();
  all[key] = {
    variantId: assignment.variant?.id || '',
    assignedAt: new Date().toISOString(),
    experimentId: assignment.definition?.id || '',
    experimentKey: assignment.definition?.key || key,
  };
  writeJson(ASSIGNMENT_KEY, all);
}

function exposureKey(definition, variant) {
  return `${definition.key}:${variant.id}:${analyticsSessionId()}`;
}

function hasExposed(definition, variant) {
  const key = exposureKey(definition, variant);
  const map = readJson(EXPOSURE_SESSION_KEY, {});
  return map[key] === true;
}

function rememberExposure(definition, variant) {
  const key = exposureKey(definition, variant);
  const map = readJson(EXPOSURE_SESSION_KEY, {});
  map[key] = true;
  writeJson(EXPOSURE_SESSION_KEY, map);
}

function activeAssignmentsMetadata() {
  return Object.entries(assignments()).reduce((acc, [key, item]) => {
    if (item?.variantId) acc[key] = item.variantId;
    return acc;
  }, {});
}

function experimentationEnabled() {
  const config = globalThis.CD10PublicRuntimeConfig?.experimentation;
  return config?.enabled !== false && config?.publicRuntimeEnabled !== false;
}

function applyVariantConfig(result) {
  const { definition, variant } = result || {};
  if (!definition || !variant) return;
  const key = slug(definition.key);
  const variantId = slug(variant.id);
  if (!key || !variantId) return;
  document.documentElement.classList.add(`exp-${key}-${variantId}`);
  document.documentElement.dataset[`exp${key.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`] = variantId;
  if (definition.type === 'flag') {
    document.documentElement.classList.toggle(`flag-${key}-on`, result.enabled === true);
  }

  const config = variant.config || {};
  if (config.cssVariables && typeof config.cssVariables === 'object') {
    Object.entries(config.cssVariables).forEach(([name, value]) => {
      const safeName = clean(name, 80);
      const safeValue = clean(value, 160);
      if (/^--[a-z0-9-]+$/i.test(safeName) && safeValue) {
        document.documentElement.style.setProperty(safeName, safeValue);
      }
    });
  }
  if (config.bodyClass) {
    document.body?.classList.add(...clean(config.bodyClass, 200).split(/\s+/).filter(Boolean).map(slug));
  }
  if (Array.isArray(config.hideSelectors)) {
    config.hideSelectors.slice(0, 12).forEach((selector) => {
      document.querySelectorAll(clean(selector, 180)).forEach((element) => { element.hidden = true; });
    });
  }
  if (Array.isArray(config.showSelectors)) {
    config.showSelectors.slice(0, 12).forEach((selector) => {
      document.querySelectorAll(clean(selector, 180)).forEach((element) => { element.hidden = false; });
    });
  }
  if (config.text && typeof config.text === 'object') {
    Object.entries(config.text).slice(0, 20).forEach(([selector, text]) => {
      document.querySelectorAll(clean(selector, 180)).forEach((element) => {
        element.textContent = clean(text, 220);
      });
    });
  }
}

function applyDeclarativeGates(results) {
  const byKey = new Map(results.map((result) => [result.definition.key, result]));
  document.querySelectorAll('[data-feature-flag]').forEach((element) => {
    const key = slug(element.dataset.featureFlag);
    const result = byKey.get(key);
    element.hidden = !(result?.enabled === true);
  });
  document.querySelectorAll('[data-experiment-key][data-experiment-variant]').forEach((element) => {
    const key = slug(element.dataset.experimentKey);
    const expected = slug(element.dataset.experimentVariant);
    const result = byKey.get(key);
    element.hidden = slug(result?.variant?.id) !== expected;
  });
}

async function trackExposure(result) {
  if (!result?.definition || !result?.variant || hasExposed(result.definition, result.variant)) return;
  rememberExposure(result.definition, result.variant);
  await trackAnalyticsEvent('experiment.exposed', {
    category: 'experimentation',
    feature: result.definition.key,
    entityType: 'experiment',
    entityId: result.definition.id,
    experimentId: result.definition.id,
    experimentKey: result.definition.key,
    variant: result.variant.id,
    metadata: {
      experimentId: result.definition.id,
      experimentKey: result.definition.key,
      experiment: result.definition.key,
      variant: result.variant.id,
      type: result.definition.type,
      reason: result.reason,
      rolloutPercent: result.rolloutPercent,
      experiments: activeAssignmentsMetadata(),
    },
  });
}

export async function loadExperimentDefinitions({ force = false } = {}) {
  if (!experimentationEnabled()) return [];
  if (!force && definitionsCache.expiresAt > Date.now()) return definitionsCache.items;
  try {
    const snap = await getDocs(query(
      collection(firebaseDb, 'experimentsPublic'),
      where('status', 'in', ['active', 'paused', 'completed']),
      firestoreLimit(100),
    ));
    const items = snap.docs.map((docSnap) => normalizeExperimentDefinition({ id: docSnap.id, ...docSnap.data() }));
    definitionsCache = { expiresAt: Date.now() + CACHE_MS, items };
    return items;
  } catch (error) {
    console.warn('No se pudieron cargar experimentos publicos', error);
    definitionsCache = { expiresAt: Date.now() + 60 * 1000, items: [] };
    return [];
  }
}

export async function evaluateRuntimeExperiments(contextOverrides = {}) {
  if (!experimentationEnabled()) return [];
  const definitions = await loadExperimentDefinitions();
  const context = currentUserContext(contextOverrides);
  const previous = assignments();
  const results = definitions.map((definition) => {
    const stored = previous[definition.key];
    const evaluated = evaluateExperiment(definition, context);
    if (stored?.variantId && evaluated.matched && evaluated.definition?.variants?.some((variant) => variant.id === stored.variantId)) {
      const variant = evaluated.definition.variants.find((item) => item.id === stored.variantId);
      return {
        ...evaluated,
        enabled: evaluated.definition.type === 'flag' ? (variant.id === 'on' || variant.config?.enabled === true) : evaluated.enabled,
        variant,
        reason: 'sticky_assignment',
      };
    }
    return evaluated;
  });
  results.filter((result) => result.variant).forEach((result) => {
    saveAssignment(result.definition.key, result);
    applyVariantConfig(result);
    trackExposure(result);
  });
  globalThis.CD10ExperimentAssignments = activeAssignmentsMetadata();
  globalThis.CD10ExperimentResults = results;
  applyDeclarativeGates(results);
  window.dispatchEvent(new CustomEvent('cd10:experiments-ready', {
    detail: {
      engineVersion: EXPERIMENTATION_ENGINE_VERSION,
      results,
      assignments: globalThis.CD10ExperimentAssignments,
    },
  }));
  return results;
}

export async function isFeatureEnabled(key, fallback = false, contextOverrides = {}) {
  const definitions = await loadExperimentDefinitions();
  const definition = definitions.find((item) => item.type === 'flag' && item.key === slug(key));
  if (!definition) return fallback;
  const result = evaluateExperiment(definition, currentUserContext(contextOverrides));
  return result.enabled === true;
}

export async function experimentVariant(key, fallback = 'control', contextOverrides = {}) {
  const definitions = await loadExperimentDefinitions();
  const definition = definitions.find((item) => item.key === slug(key));
  if (!definition) return fallback;
  const result = evaluateExperiment(definition, currentUserContext(contextOverrides));
  return result.variant?.id || fallback;
}

export function initExperimentationRuntime() {
  if (initialized) return;
  initialized = true;
  if (!experimentationEnabled()) return;
  evaluateRuntimeExperiments();
  window.CD10Experiments = {
    refresh: async () => {
      await loadExperimentDefinitions({ force: true });
      return evaluateRuntimeExperiments();
    },
    isFeatureEnabled,
    experimentVariant,
    assignments: activeAssignmentsMetadata,
  };
}

export default {
  initExperimentationRuntime,
  loadExperimentDefinitions,
  evaluateRuntimeExperiments,
  isFeatureEnabled,
  experimentVariant,
};
