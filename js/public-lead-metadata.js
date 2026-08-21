/**
 * Limits shared by public lead forms and Firestore rules.
 *
 * Keep these values aligned with validPublicLeadMetadata() in
 * firebase/firestore.rules. Normalising before the write prevents a valid
 * public form from being rejected only because an auxiliary metadata copy is
 * longer than the main field shown to the user.
 */

export const PUBLIC_LEAD_METADATA_LIMITS = Object.freeze({
  alumno: 160,
  account_mode: 80,
  anios: 80,
  canal: 80,
  disponibilidad: 300,
  frecuencia: 120,
  inicio: 120,
  materia: 180,
  materias: 180,
  modalidad: 120,
  nivel: 120,
  niveles: 120,
  objetivo: 160,
  origen: 80,
  page_path: 300,
  page_url: 500,
  presupuesto: 120,
  referrer: 500,
  user_agent: 500,
  utm_campaign: 160,
  utm_content: 160,
  utm_medium: 160,
  utm_source: 160,
  utm_term: 160,
  verificacion: 180,
  zona: 180,
});

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizePublicLeadMetadata(metadata = {}) {
  return Object.entries(PUBLIC_LEAD_METADATA_LIMITS).reduce((result, [key, max]) => {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) return result;
    const value = clean(metadata[key], max);
    if (value) result[key] = value;
    return result;
  }, Object.prototype.hasOwnProperty.call(metadata, 'consent_privacy')
    ? { consent_privacy: metadata.consent_privacy === true }
    : {});
}
