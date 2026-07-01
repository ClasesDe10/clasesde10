/**
 * ClasesDe10 — Módulo Calendario
 * Renderiza un calendario mensual con clases por día.
 */

import { nombreMes, nombreDia, formatHora } from './utils.js';
import { classStatusForBadge, normalizeClassStatus } from './calendar-engine.js';

export class Calendario {
  constructor({ contenedor, onDiaClick, onMesChange, classDotClass, legendItems }) {
    this.contenedor  = contenedor;
    this.onDiaClick  = onDiaClick || (() => {});
    this.onMesChange = onMesChange || (() => {});
    this.classDotClass = classDotClass || ((classData) => this.coloresPorEstado(classStatusForBadge(classData)));
    this.legendItems = Array.isArray(legendItems) && legendItems.length
      ? legendItems
      : [
          { className: 'dot-gold', label: 'Pendiente/Reprogramada' },
          { className: 'dot-navy', label: 'Confirmada' },
          { className: 'dot-teal', label: 'Realizada' },
          { className: 'dot-red', label: 'Cancelada' },
        ];

    const hoy = new Date();
    this.anio = hoy.getFullYear();
    this.mes  = hoy.getMonth();
    this.clasesPorFecha = {};
    this.diaSeleccionado = null;
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
      pendiente: 'dot-gold',
      programada: 'dot-navy',
      confirmada: 'dot-navy',
      realizada: 'dot-teal',
      cancelada: 'dot-red',
      reprogramada: 'dot-gold',
      pagada: 'dot-teal',
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

      const dots = clases.slice(0,4).map(c =>
        `<div class="day-dot ${this.classDotClass(c)}"></div>`
      ).join('');

      diasHTML += `
        <div class="calendar-day ${esHoy ? 'today' : ''} ${esSel ? 'selected' : ''}"
             data-fecha="${fecha}" title="${clases.length} clase(s)">
          <span class="day-num">${d}</span>
          <div class="day-dots">${dots}</div>
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
        <div class="calendar-grid">
          <div class="calendar-days-header">
            ${diasNombres.map(n => `<div class="calendar-day-name">${n}</div>`).join('')}
          </div>
          <div class="calendar-days">${diasHTML}</div>
        </div>
        <div class="calendar-legend" style="padding:0 16px 14px;display:flex;gap:14px;font-size:.72rem;color:#8a8478">
          ${this.legendItems.map((item) => `<span><span class="day-dot ${item.className}" style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle"></span>${item.label}</span>`).join('')}
        </div>
      </div>`;

    this.contenedor.querySelector('#cal-prev').addEventListener('click', () => this.anterior());
    this.contenedor.querySelector('#cal-next').addEventListener('click', () => this.siguiente());
    this.contenedor.querySelectorAll('.calendar-day[data-fecha]').forEach(el => {
      el.addEventListener('click', () => {
        this.diaSeleccionado = el.dataset.fecha;
        this.render();
        this.onDiaClick(el.dataset.fecha, this.clasesPorFecha[el.dataset.fecha] || []);
      });
    });
  }
}
