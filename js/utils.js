/**
 * ClasesDe10 — Utilidades globales
 */

import { watchUnreadNotifications } from './notifications-provider.js?v=20260627-domain-auth';

// ─── SANITIZACIÓN XSS ───────────────────────────────────────────
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function desanitize(str) {
  if (typeof str !== 'string') return '';
  const el = document.createElement('div');
  el.innerHTML = str;
  return el.textContent || el.innerText || '';
}

// ─── FECHAS ─────────────────────────────────────────────────────
export function formatFecha(fechaISO, opts = {}) {
  if (!fechaISO) return '—';
  const d = new Date(fechaISO + (fechaISO.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric', ...opts,
  });
}

export function formatFechaCorta(fechaISO) {
  if (!fechaISO) return '—';
  const d = new Date(fechaISO + (fechaISO.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatHora(hora) {
  if (!hora) return '—';
  return hora.substring(0, 5);
}

export function mesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function fechaHoy() {
  return new Date().toISOString().split('T')[0];
}

export function nombreMes(idx) {
  return ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][idx];
}

export function nombreDia(idx) {
  return ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][idx];
}

// ─── TABLAS RESPONSIVE ───────────────────────────────────────────
let responsiveTablesObserver;
let responsiveTablesFrame = 0;

export function refreshResponsiveTables(root = null) {
  if (typeof document === 'undefined') return;
  const scope = root?.querySelectorAll ? root : document;
  const tables = scope.matches?.('.table-wrapper table')
    ? [scope]
    : Array.from(scope.querySelectorAll?.('.table-wrapper table') || []);

  tables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll('thead th'))
      .map((th) => th.textContent.trim().replace(/\s+/g, ' '));
    if (!headers.length) return;

    table.classList.add('responsive-card-table');
    Array.from(table.tBodies || []).forEach((tbody) => {
      Array.from(tbody.rows || []).forEach((row) => {
        Array.from(row.cells || []).forEach((cell, index) => {
          if (Number(cell.getAttribute('colspan') || 1) > 1) {
            cell.dataset.label = '';
            return;
          }
          const label = headers[index] || '';
          if (label) cell.dataset.label = label;
        });
      });
    });
  });
}

function scheduleResponsiveTablesRefresh() {
  if (responsiveTablesFrame) return;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 16);
  responsiveTablesFrame = raf(() => {
    responsiveTablesFrame = 0;
    refreshResponsiveTables();
  });
}

export function initResponsiveTables() {
  if (typeof document === 'undefined') return;
  refreshResponsiveTables();
  if (responsiveTablesObserver || typeof MutationObserver === 'undefined') return;

  responsiveTablesObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) {
      scheduleResponsiveTablesRefresh();
    }
  });
  responsiveTablesObserver.observe(document.body, { childList: true, subtree: true });
}

function isFormField(field) {
  return field instanceof HTMLElement
    && field.matches('input, select, textarea')
    && field.type !== 'hidden'
    && !field.disabled;
}

function isVisibleField(field) {
  return Boolean(field.offsetWidth || field.offsetHeight || field.getClientRects().length);
}

function getFieldLabel(field) {
  const explicit = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
  const implicit = field.closest('label');
  const raw = field.getAttribute('aria-label')
    || explicit?.textContent
    || implicit?.textContent
    || field.placeholder
    || field.name
    || 'este campo';
  return raw.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function getValidationMessage(field) {
  const label = getFieldLabel(field);
  if (field.validity.valueMissing) {
    if (field.type === 'checkbox') return 'Debes aceptar este punto para continuar.';
    return `Completa ${label}.`;
  }
  if (field.validity.typeMismatch) return `Introduce un ${label.toLowerCase()} valido.`;
  if (field.validity.tooShort) return `Usa al menos ${field.minLength} caracteres.`;
  if (field.validity.patternMismatch) return `Revisa el formato de ${label.toLowerCase()}.`;
  if (field.validity.customError) return field.validationMessage;
  return field.validationMessage || `Revisa ${label}.`;
}

export function clearFieldError(field) {
  if (!isFormField(field)) return;
  field.classList.remove('field-invalid', 'error');
  field.removeAttribute('aria-invalid');
  const errorId = field.dataset.errorId;
  if (errorId) document.getElementById(errorId)?.remove();
}

export function setFieldError(field, message = '') {
  if (!isFormField(field)) return null;

  const idBase = field.id || field.name || `field-${Math.random().toString(36).slice(2)}`;
  const errorId = field.dataset.errorId || `${idBase}-error`;
  field.dataset.errorId = errorId;
  field.classList.add('field-invalid');
  field.setAttribute('aria-invalid', 'true');

  const describedBy = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  describedBy.add(errorId);
  field.setAttribute('aria-describedby', Array.from(describedBy).join(' '));

  let error = document.getElementById(errorId);
  if (!error) {
    error = document.createElement('div');
    error.id = errorId;
    error.className = 'field-error-message';
    const host = field.closest('.form-group, .cf-field, .auth-check, label') || field.parentElement;
    host?.appendChild(error);
  }
  error.textContent = message || getValidationMessage(field);
  return error;
}

export function focusFirstInvalidField(form) {
  const fields = Array.from(form.elements || []).filter(isFormField);
  fields.forEach((field) => {
    if (field.checkValidity()) clearFieldError(field);
    else setFieldError(field);
  });

  const firstInvalid = fields.find((field) => !field.checkValidity() && isVisibleField(field))
    || fields.find((field) => !field.checkValidity());
  if (!firstInvalid) return null;

  firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => firstInvalid.focus({ preventScroll: true }), 120);
  return firstInvalid;
}

let formValidationFeedbackReady = false;

export function initFormValidationFeedback(root = document) {
  if (typeof document === 'undefined' || formValidationFeedbackReady) return;
  formValidationFeedbackReady = true;

  document.addEventListener('invalid', (event) => {
    if (isFormField(event.target)) setFieldError(event.target);
  }, true);

  document.addEventListener('input', (event) => {
    if (isFormField(event.target) && event.target.checkValidity()) clearFieldError(event.target);
  }, true);

  document.addEventListener('change', (event) => {
    if (isFormField(event.target) && event.target.checkValidity()) clearFieldError(event.target);
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.uxSkipValidation === 'true') return;
    if (form.checkValidity()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    focusFirstInvalidField(form);
  }, true);

  root.querySelectorAll?.('form').forEach((form) => {
    if (!form.hasAttribute('aria-live')) form.setAttribute('aria-live', 'polite');
  });
}

function initPageUtilities() {
  initMojibakeRepair();
  initResponsiveTables();
  initFormValidationFeedback();
}

const CP1252_BYTES = new Map(Object.entries({
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8A,
  '‹': 0x8B,
  'Œ': 0x8C,
  'Ž': 0x8E,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9A,
  '›': 0x9B,
  'œ': 0x9C,
  'ž': 0x9E,
  'Ÿ': 0x9F,
}));

const MOJIBAKE_PATTERN = /Ã|Â|â€|â€¦|â€”|â€“|âœ|âš|â„|ðŸ|Ã¢/;
const VISIBLE_TEXT_ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt', 'value'];
const UTF8_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function mojibakeScore(value) {
  return (String(value).match(/Ã|Â|â|ðŸ|�/g) || []).length;
}

function cp1252Bytes(value) {
  const bytes = [];
  for (const char of String(value)) {
    const code = char.charCodeAt(0);
    if (code <= 255) {
      bytes.push(code);
    } else if (CP1252_BYTES.has(char)) {
      bytes.push(CP1252_BYTES.get(char));
    } else {
      return null;
    }
  }
  return new Uint8Array(bytes);
}

export function repairMojibakeText(value) {
  if (!UTF8_DECODER || !MOJIBAKE_PATTERN.test(String(value))) return value;
  let current = String(value);
  for (let pass = 0; pass < 3; pass += 1) {
    const bytes = cp1252Bytes(current);
    if (!bytes) break;
    const decoded = UTF8_DECODER.decode(bytes);
    if (!decoded || decoded === current || mojibakeScore(decoded) > mojibakeScore(current)) break;
    current = decoded;
    if (!MOJIBAKE_PATTERN.test(current)) break;
  }
  return current;
}

function repairTextNode(node) {
  const repaired = repairMojibakeText(node.nodeValue || '');
  if (repaired !== node.nodeValue) node.nodeValue = repaired;
}

function repairElementAttributes(element) {
  for (const attribute of VISIBLE_TEXT_ATTRIBUTES) {
    if (!element.hasAttribute?.(attribute)) continue;
    const value = element.getAttribute(attribute);
    const repaired = repairMojibakeText(value);
    if (repaired !== value) element.setAttribute(attribute, repaired);
  }
}

function repairVisibleText(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    repairTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root !== document.body) return;

  repairElementAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent && ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) repairTextNode(node);
    else if (node.nodeType === Node.ELEMENT_NODE) repairElementAttributes(node);
  }
}

function initMojibakeRepair() {
  if (document.body?.dataset.mojibakeRepairBound === 'true') return;
  if (!document.body) return;
  document.body.dataset.mojibakeRepairBound = 'true';
  document.title = repairMojibakeText(document.title);
  repairVisibleText(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => repairVisibleText(node));
      if (mutation.type === 'characterData') repairTextNode(mutation.target);
      if (mutation.type === 'attributes') repairElementAttributes(mutation.target);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: VISIBLE_TEXT_ATTRIBUTES,
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageUtilities, { once: true });
  } else {
    initPageUtilities();
  }
}

// ─── DINERO ─────────────────────────────────────────────────────
export function formatEuros(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

// ─── TOAST NOTIFICATIONS ─────────────────────────────────────────
let toastContainer;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const TOAST_ICONS = {
  success: '✓',
  warning: '⚠',
  error:   '✕',
  info:    'ℹ',
};

function dismissToast(toast) {
  if (!toast || toast.dataset.dismissing === 'true') return;
  toast.dataset.dismissing = 'true';
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(20px)';
  toast.style.transition = 'all .3s';
  setTimeout(() => toast.remove(), 300);
}

export function showToast(titulo, mensaje = '', tipo = 'info', duracion = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.setAttribute('role', tipo === 'error' || tipo === 'warning' ? 'alert' : 'status');
  toast.setAttribute('aria-atomic', 'true');
  toast.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[tipo] || 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${sanitize(titulo)}</div>
      ${mensaje ? `<div class="toast-msg">${sanitize(mensaje)}</div>` : ''}
    </div>
    <button type="button" class="toast-close" aria-label="Cerrar aviso">x</button>
  `;
  container.appendChild(toast);
  toast.querySelector('.toast-close')?.addEventListener('click', () => dismissToast(toast));

  while (container.children.length > 4) {
    container.firstElementChild?.remove();
  }

  setTimeout(() => {
    dismissToast(toast);
  }, duracion);
}

// ─── MODAL ──────────────────────────────────────────────────────
let lastModalFocus = null;

function focusModalPanel(modal) {
  const panel = modal.querySelector('.modal') || modal;
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
  setTimeout(() => panel.focus({ preventScroll: true }), 30);
}

export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.classList.add('open');
    modal.setAttribute('aria-modal', 'true');
    document.body.style.overflow = 'hidden';
    focusModalPanel(modal);
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    modal.removeAttribute('aria-modal');
    if (!document.querySelector('.modal-overlay.open')) {
      document.body.style.overflow = '';
    }
    lastModalFocus?.focus?.({ preventScroll: true });
    lastModalFocus = null;
  }
}

export function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    if (overlay.dataset.modalUxBound === 'true') return;
    overlay.dataset.modalUxBound = 'true';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && overlay.id) closeModal(overlay.id);
    });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    if (btn.dataset.modalUxBound === 'true') return;
    btn.dataset.modalUxBound = 'true';
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay?.id) closeModal(overlay.id);
    });
  });
  if (!document.body.dataset.modalEscapeBound) {
    document.body.dataset.modalEscapeBound = 'true';
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const openOverlay = document.querySelector('.modal-overlay.open');
      if (openOverlay?.id) closeModal(openOverlay.id);
    });
  }
}

// ─── TABLA: ORDENAR Y FILTRAR ────────────────────────────────────
export function filtrarTabla(datos, busqueda, campos) {
  if (!busqueda) return datos;
  const q = busqueda.toLowerCase();
  return datos.filter(row =>
    campos.some(campo => {
      const val = String(row[campo] || '').toLowerCase();
      return val.includes(q);
    })
  );
}

// ─── PAGINACIÓN ─────────────────────────────────────────────────
export class Paginacion {
  constructor({ porPagina = 20, contenedor, onPageChange }) {
    this.porPagina = porPagina;
    this.paginaActual = 1;
    this.total = 0;
    this.contenedor = contenedor;
    this.onPageChange = onPageChange;
  }

  setTotal(total) {
    this.total = total;
    this.totalPaginas = Math.ceil(total / this.porPagina);
    this.render();
  }

  offset() { return (this.paginaActual - 1) * this.porPagina; }

  ir(pag) {
    if (pag < 1 || pag > this.totalPaginas) return;
    this.paginaActual = pag;
    this.render();
    this.onPageChange(pag);
  }

  render() {
    if (!this.contenedor) return;
    const { paginaActual: p, totalPaginas: t } = this;
    const btns = [];
    btns.push(`<button class="page-btn" data-p="${p-1}" ${p===1?'disabled':''}>‹</button>`);
    for (let i = Math.max(1,p-2); i <= Math.min(t,p+2); i++) {
      btns.push(`<button class="page-btn ${i===p?'active':''}" data-p="${i}">${i}</button>`);
    }
    btns.push(`<button class="page-btn" data-p="${p+1}" ${p===t?'disabled':''}>›</button>`);
    this.contenedor.innerHTML = btns.join('');
    this.contenedor.querySelectorAll('[data-p]').forEach(btn => {
      btn.addEventListener('click', () => this.ir(Number(btn.dataset.p)));
    });
  }
}

// ─── EXPORTAR CSV ────────────────────────────────────────────────
export function exportarCSV(datos, nombreArchivo, columnas) {
  const encabezado = columnas.map(c => c.titulo).join(';');
  const filas = datos.map(row =>
    columnas.map(c => {
      let val = row[c.campo] ?? '';
      if (typeof val === 'string' && val.includes(';')) val = `"${val}"`;
      return val;
    }).join(';')
  );
  const csv = [encabezado, ...filas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── AVATAR INICIALES ────────────────────────────────────────────
export function getIniciales(nombre, apellidos = '') {
  const n = (nombre || '').trim()[0] || '';
  const a = (apellidos || '').trim()[0] || '';
  return (n + a).toUpperCase() || '?';
}

// ─── SIDEBAR MÓVIL ──────────────────────────────────────────────
export function initSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.querySelector('.sidebar-overlay');
  const hamburger = document.querySelector('.hamburger-btn');

  if (!sidebar || !hamburger) return;

  const setOpen = (open) => {
    sidebar.classList.toggle('open', open);
    overlay?.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('sidebar-open', open);
  };

  hamburger.setAttribute('aria-expanded', sidebar.classList.contains('open') ? 'true' : 'false');
  hamburger.setAttribute('aria-controls', sidebar.id || 'sidebar');
  if (!sidebar.id) sidebar.id = 'sidebar';

  hamburger.addEventListener('click', () => {
    setOpen(!sidebar.classList.contains('open'));
  });
  overlay?.addEventListener('click', () => {
    setOpen(false);
  });

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      setOpen(false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

// ─── TOPBAR: NOTIFICACIONES ──────────────────────────────────────
export function initNotificacionesBadge(usuarioId, db) {
  const badge = document.querySelector('.topbar-notification-badge');
  if (!badge) return;

  return watchUnreadNotifications(db, usuarioId, (count) => {
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent = count > 9 ? '9+' : String(count || '');
  });
}

// ─── VALIDAR EMAIL ───────────────────────────────────────────────
export function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── DEBOUNCE ────────────────────────────────────────────────────
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── BADGE HTML ──────────────────────────────────────────────────
const LABEL_ESTADO = {
  programada:    'Programada',
  confirmada:    'Confirmada',
  realizada:     'Realizada',
  cancelada:     'Cancelada',
  reprogramada:  'Reprogramada',
  pendiente:     'Pendiente',
  solicitado:    'Solicitado',
  procesando:    'Procesando',
  requiere_accion: 'Requiere accion',
  pagado:        'Pagado',
  validado:      'Validado',
  vencido:       'Vencido',
  rechazado:     'Rechazado',
  fallido:       'Fallido',
  devuelto:      'Devuelto',
  disputado:     'Disputado',
  cancelado:     'Cancelado',
  nueva:         'Nueva',
  asignada:      'Asignada',
  completada:    'Completada',
  abierta:       'Abierta',
  en_proceso:    'En proceso',
  resuelta:      'Resuelta',
  cerrada:       'Cerrada',
  nuevo:         'Nuevo',
  contactado:    'Contactado',
  cerrado:       'Cerrado',
  spam:          'Spam',
  contacto:      'Contacto',
  familia:       'Familia',
  profesor:      'Profesor',
  verificado:    'Verificado',
};
const BADGE_MAPA = {
  programada: 'badge-info', confirmada: 'badge-info', realizada: 'badge-success',
  cancelada: 'badge-danger', reprogramada: 'badge-warning',
  pendiente: 'badge-warning', solicitado: 'badge-warning', procesando: 'badge-info', requiere_accion: 'badge-warning',
  pagado: 'badge-success', validado: 'badge-success', vencido: 'badge-danger', rechazado: 'badge-danger',
  fallido: 'badge-danger', devuelto: 'badge-gray', disputado: 'badge-danger', cancelado: 'badge-gray',
  nueva: 'badge-info', asignada: 'badge-gold', completada: 'badge-success',
  abierta: 'badge-danger', en_proceso: 'badge-warning', resuelta: 'badge-success', cerrada: 'badge-gray',
  nuevo: 'badge-info', contactado: 'badge-warning', cerrado: 'badge-success', spam: 'badge-danger',
  contacto: 'badge-info', familia: 'badge-gold', profesor: 'badge-success',
  verificado: 'badge-success',
};

export function badgeEstado(estado) {
  const cls   = BADGE_MAPA[estado]  || 'badge-gray';
  const label = LABEL_ESTADO[estado] || estado;
  return `<span class="badge ${cls}">${label}</span>`;
}
