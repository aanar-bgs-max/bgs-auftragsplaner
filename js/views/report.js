// Stundenübersicht: geplante Stunden und Aufträge je Mitarbeiter und Monat
import { MONTHS, durationMinutes, formatHours, formatShort, formatTimeRange } from '../dates.js';
import { state, findCustomer } from '../store.js';
import { esc, modalHead } from '../ui.js';

export function reportView() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const expanded = new Set();

  return {
    wide: true,
    render(el) {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
      const orders = state.orders
        .filter((o) => o.date.startsWith(prefix))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

      const rows = [...state.employees.map((e) => ({ id: e.id, name: e.name, color: e.color })),
        { id: '__none', name: 'Nicht zugewiesen', color: '#94a3b8' }]
        .map((emp) => {
          const list = orders.filter((o) => (emp.id === '__none' ? !o.employeeIds.length : o.employeeIds.includes(emp.id)));
          const minutes = list.reduce((sum, o) => sum + durationMinutes(o.time, o.endTime), 0);
          const doneMinutes = list.filter((o) => o.done).reduce((sum, o) => sum + durationMinutes(o.time, o.endTime), 0);
          const withoutEnd = list.filter((o) => !o.endTime).length;
          return { ...emp, list, minutes, doneMinutes, withoutEnd };
        })
        .filter((r) => r.id !== '__none' || r.list.length);

      const total = rows.reduce((acc, r) => ({ count: acc.count + r.list.length, minutes: acc.minutes + r.minutes,
        done: acc.done + r.doneMinutes }), { count: 0, minutes: 0, done: 0 });

      const body = rows.map((r) => {
        const open = expanded.has(r.id);
        const details = open ? r.list.map((o) => {
          const c = findCustomer(o.customerId);
          const mins = durationMinutes(o.time, o.endTime);
          return `<tr class="detail"><td>${esc(formatShort(o.date))} ${o.time ? esc(formatTimeRange(o)) : ''} · ${esc(o.text)}${c ? ` · <b>${esc(c.name)}</b>` : ''}${o.done ? ' ✓' : ''}</td>
            <td></td><td class="num">${mins ? formatHours(mins) : '<span class="warn-text">ohne Endzeit</span>'}</td><td></td></tr>`;
        }).join('') : '';
        return `<tr class="emp-row" data-emp="${esc(r.id)}">
            <td><span class="tag"><span class="swatch" style="background:${r.color}"></span>${open ? '▾' : '▸'} ${esc(r.name)}</span>
              ${r.withoutEnd ? `<div class="warn-text">${r.withoutEnd === 1 ? '1 Auftrag' : `${r.withoutEnd} Aufträge`} ohne Endzeit (0 h gezählt)</div>` : ''}</td>
            <td class="num">${r.list.length}</td>
            <td class="num">${formatHours(r.minutes)}</td>
            <td class="num">${formatHours(r.doneMinutes)}</td>
          </tr>${details}`;
      }).join('');

      el.innerHTML = modalHead('Stundenübersicht', 'Geplante Stunden aus Start- und Endzeit der Aufträge')
        + `<div class="print-only"><h2>BGS Brillianta Gebäude Service – Stundenübersicht ${MONTHS[month]} ${year}</h2><br></div>
        <div class="report-nav no-print">
          <button class="nav-btn" id="rPrev" aria-label="Vorheriger Monat">‹</button>
          <strong>${MONTHS[month]} ${year}</strong>
          <button class="nav-btn" id="rNext" aria-label="Nächster Monat">›</button>
        </div>
        ${state.employees.length ? '' : '<div class="hint">Noch keine Mitarbeiter angelegt – unter ⚙️ Einstellungen → Mitarbeiter hinzufügen.</div>'}
        <table class="table">
          <thead><tr><th>Mitarbeiter</th><th class="num">Aufträge</th><th class="num">Geplant</th><th class="num">Erledigt</th></tr></thead>
          <tbody>${body}
            <tr class="total"><td>Gesamt</td><td class="num">${total.count}</td><td class="num">${formatHours(total.minutes)}</td><td class="num">${formatHours(total.done)}</td></tr>
          </tbody>
        </table>
        <p class="muted" style="margin-top:10px">Aufträge mit mehreren Mitarbeitern zählen bei jedem voll. Zeile antippen für Details.</p>
        <div class="form-actions no-print"><button class="btn secondary" id="rPrint">🖨 Drucken / als PDF speichern</button></div>`;

      const rerender = () => this.render(el);
      el.querySelector('#rPrev').onclick = () => { month--; if (month < 0) { month = 11; year--; } rerender(); };
      el.querySelector('#rNext').onclick = () => { month++; if (month > 11) { month = 0; year++; } rerender(); };
      el.querySelector('#rPrint').onclick = () => {
        rows.forEach((r) => expanded.add(r.id));
        rerender();
        setTimeout(() => window.print(), 50);
      };
      el.querySelectorAll('.emp-row').forEach((tr) => tr.onclick = () => {
        const id = tr.dataset.emp;
        expanded.has(id) ? expanded.delete(id) : expanded.add(id);
        rerender();
      });
    },
  };
}
