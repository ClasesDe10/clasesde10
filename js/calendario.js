/**
 * ClasesDe10 — Módulo Calendario
 * Renderiza un calendario mensual con clases por día.
 */

import { nombreMes, nombreDia, formatHora } from './utils.js';
import { classStatusForBadge, normalizeClassStatus } from './calendar-engine.js?v=20260816-teacher-attendance-lock';

export class Calendario {
  constructor({ contenedor, onDiaClick, onMesChange, classDotClass, classIndicatorPriority, legendItems, dayIndicatorMode, daySummaryLabel, daySummaryItems }) {
    this.contenedor  = contenedor;
    this.onDiaClick  = onDiaClick || (() => {});
    this.onMesChange = onMesChange || (() => {});
    this.classDotClass = classDotClass || ((classData) => this.coloresPorEstado(classStatusForBadge(classData)));
    this.classIndicatorPriority = classIndicatorPriority || null;
    this.dayIndicatorMode = dayIndicatorMode || 'dots';
    this.daySummaryLabel = daySummaryLabel || ((classData, items) => this.defaultDaySummaryLabel(classData, items));
    this.daySummaryItems = typeof daySummaryItems === 'function' ? daySummaryItems : null;
    this.legendItems = Array.isArray(legendItems) && legendItems.length
      ? legendItems
      : [
          { className: 'dot-red', label: 'Revisar ahora' },
          { className: 'dot-amber', label: 'Acción pendiente' },
          { className: 'dot-blue', label: 'Programada o en curso' },
          { className: 'dot-emerald', label: 'Finalizada' },
          { className: 'dot-gray', label: 'Cancelada' },
        ];

    const hoy = new Date();
    this.anio = hoy.getFullYear();
    this.mes  = hoy.getMonth();
    this.clasesPorFecha = {};
    this.diaSeleccionado = null;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  defaultDaySummaryLabel(classData = {}, items = []) {
    if (classData.calendarEventType === 'family_payment_due') return classData.overdue ? 'Vencido' : 'Pago';
    if (classData.calendarEventType === 'teacher_payout_day') return 'Cobro';
    return formatHora(classData.hora_inicio || classData.startTime || '') || `${items.length || 1} evento`;
  }

  indicatorPriority(classData = {}) {
    const customPriority = Number(this.classIndicatorPriority?.(classData));
    if (Number.isFinite(customPriority)) return customPriority;
    const tone = this.classDotClass(classData);
    return {
      'dot-red': 100,
      'dot-rose': 100,
      'dot-amber': 80,
      'dot-gold': 80,
      'dot-blue': 60,
      'dot-navy': 60,
      'dot-cyan': 60,
      'dot-purple': 90,
      'dot-indigo': 50,
      'dot-emerald': 30,
      'dot-teal': 30,
      'dot-gray': 10,
    }[tone] || 20;
  }

  renderDayIndicators(clases = []) {
    if (!clases.length) return '';
    const ordered = [...clases].sort((a, b) => this.indicatorPriority(b) - this.indicatorPriority(a));
    if (this.dayIndicatorMode === 'summary') {
      const summaries = this.daySummaryItems?.(ordered);
      if (Array.isArray(summaries) && summaries.length) {
        const visible = summaries.slice(0, 3);
        const extraCount = Math.max(0, summaries.length - visible.length);
        return `<div class="day-event-summary is-multiple">${visible.map((summary) => {
          const tone = summary.className || 'dot-navy';
          return `<span class="day-chip ${this.escapeHtml(tone)}">${this.escapeHtml(summary.label || 'Evento')}</span>`;
        }).join('')}${extraCount ? `<span class="day-count">+${extraCount}</span>` : ''}</div>`;
      }
      const first = ordered[0];
      const tone = this.classDotClass(first);
      const label = this.daySummaryLabel(first, ordered);
      const extra = ordered.length > 1 ? `<span class="day-count">+${ordered.length - 1}</span>` : '';
      return `<div class="day-event-summary"><span class="day-chip ${this.escapeHtml(tone)}">${this.escapeHtml(label)}</span>${extra}</div>`;
    }
    const dots = ordered.slice(0,4).map(c =>
      `<div class="day-dot ${this.escapeHtml(this.classDotClass(c))}"></div>`
    ).join('');
    return `<div class="day-dots">${dots}</div>`;
  }

  dayStatusSummary(clases = []) {
    if (!clases.length) return 'Sin eventos';
    const ordered = [...clases].sort((a, b) => this.indicatorPriority(b) - this.indicatorPriority(a));
    const summaries = this.daySummaryItems?.(ordered);
    const labels = (Array.isArray(summaries) && summaries.length
      ? summaries.map((item) => item.label)
      : ordered.map((item) => this.daySummaryLabel(item, ordered)))
      .map((label) => String(label || '').trim())
      .filter((label, index, list) => label && list.indexOf(label) === index);
    return `${clases.length} evento(s): ${labels.slice(0, 4).join(', ')}`;
  }

  setClases(clases) {
    this.clasesPorFecha = {};
    clases.forEach(c => {
      const fecha = c.fecha || c.date;
      if (!fecha) return;
      if (!this.clasesPorFecha[fecha]) this.clasesPorFecha[fecha] = [];
      this.clasesPorFecha[fecha].push({ ...c, fecha, date: c.date || fecha });
    });
    this.render();
    if (this.diaSeleccionado) {
      this.onDiaClick(this.diaSeleccionado, this.clasesPorFecha[this.diaSeleccionado] || []);
    }
  }

  anterior() {
    if (this.mes === 0) { this.mes = 11; this.anio--; }
    else this.mes--;
    this.render();
    this.onMesChange(this.anio, this.mes);
  }

  siguiente() {
    if (this.mes === 11) { this.mes = 0; this.anio++; }
    else this.mes++;
    this.render();
    this.onMesChange(this.anio, this.mes);
  }

  primerDia() {
    const d = new Date(this.anio, this.mes, 1).getDay();
    return d === 0 ? 6 : d - 1;
  }

  diasEnMes() {
    return new Date(this.anio, this.mes + 1, 0).getDate();
  }

  fechaStr(dia) {
    return `${this.anio}-${String(this.mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
  }

  hoyStr() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  }

  coloresPorEstado(estado) {
    return {
      pendiente: 'dot-amber',
      programada: 'dot-blue',
      confirmada: 'dot-blue',
      realizada: 'dot-emerald',
      cancelada: 'dot-gray',
      reprogramada: 'dot-blue',
      pagada: 'dot-emerald',
    }[normalizeClassStatus(estado)] || 'dot-navy';
  }

  render() {
    if (!this.contenedor) return;

    const offsetInicio = this.primerDia();
    const totalDias = this.diasEnMes();
    const hoy = this.hoyStr();

    const diasNombres = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

    let diasHTML = '';
    for (let i = 0; i < offsetInicio; i++) {
      diasHTML += `<div class="calendar-day other-month"></div>`;
    }

    for (let d = 1; d <= totalDias; d++) {
      const fecha = this.fechaStr(d);
      const clases = this.clasesPorFecha[fecha] || [];
      const esHoy = fecha === hoy;
      const esSel = fecha === this.diaSeleccionado;

      const indicators = this.renderDayIndicators(clases);
      const statusSummary = this.dayStatusSummary(clases);

      diasHTML += `
        <div class="calendar-day ${clases.length ? 'has-events' : ''} ${esHoy ? 'today' : ''} ${esSel ? 'selected' : ''}"
             data-fecha="${fecha}" role="button" tabindex="0"
             aria-label="${this.escapeHtml(`${fecha}. ${statusSummary}`)}"
             title="${this.escapeHtml(statusSummary)}">
          <span class="day-num">${d}</span>
          ${indicators}
        </div>`;
    }

    this.contenedor.innerHTML = `
      <div class="calendar-wrapper">
        <div class="calendar-header">
          <span class="calendar-title">${nombreMes(this.mes)} ${this.anio}</span>
          <div class="calendar-nav">
            <button id="cal-prev" aria-label="Mes anterior">‹</button>
            <button id="cal-next" aria-label="Mes siguiente">›</button>
          </div>
        </div>
        <div class="calendar-legend">
          ${this.legendItems.map((item) => `<span class="calendar-legend-item"><span class="calendar-legend-dot ${this.escapeHtml(item.className)}"></span>${this.escapeHtml(item.label)}</span>`).join('')}
        </div>
        <div class="calendar-grid">
          <div class="calendar-days-header">
            ${diasNombres.map(n => `<div class="calendar-day-name">${n}</div>`).join('')}
          </div>
          <div class="calendar-days">${diasHTML}</div>
        </div>
      </div>`;

    this.contenedor.querySelector('#cal-prev').addEventListener('click', () => this.anterior());
    this.contenedor.querySelector('#cal-next').addEventListener('click', () => this.siguiente());
    this.contenedor.querySelectorAll('.calendar-day[data-fecha]').forEach(el => {
      const selectDay = () => {
        this.diaSeleccionado = el.dataset.fecha;
        this.render();
        this.onDiaClick(el.dataset.fecha, this.clasesPorFecha[el.dataset.fecha] || []);
      };
      el.addEventListener('click', selectDay);
      el.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        selectDay();
      });
    });
  }
}
