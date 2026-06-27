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

export function showToast(titulo, mensaje = '', tipo = 'info', duracion = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[tipo] || 'ℹ'}</div>
    <div>
      <div class="toast-title">${sanitize(titulo)}</div>
      ${mensaje ? `<div class="toast-msg">${sanitize(mensaje)}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all .3s';
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

// ─── MODAL ──────────────────────────────────────────────────────
export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

export function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.remove('open');
      document.body.style.overflow = '';
    });
  });
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

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay?.classList.toggle('open');
  });
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay?.classList.remove('open');
    });
  });
}

// ─── TOPBAR: NOTIFICACIONES ──────────────────────────────────────
export function initNotificacionesBadge(usuarioId, db) {
  const badge = document.querySelector('.topbar-btn .badge');
  if (!badge) return;

  return watchUnreadNotifications(db, usuarioId, (count) => {
    badge.style.display = count > 0 ? 'block' : 'none';
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
  realizada:     'Realizada',
  cancelada:     'Cancelada',
  reprogramada:  'Reprogramada',
  pendiente:     'Pendiente',
  validado:      'Validado',
  rechazado:     'Rechazado',
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
  programada: 'badge-info', realizada: 'badge-success',
  cancelada: 'badge-danger', reprogramada: 'badge-warning',
  pendiente: 'badge-warning', validado: 'badge-success', rechazado: 'badge-danger',
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
