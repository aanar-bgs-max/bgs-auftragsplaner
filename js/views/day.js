// Tagesfenster: Aufträge eines Tages anlegen, bearbeiten, abhaken, löschen.
import { formatLong, formatTimeRange, ISO_DAYS_SHORT, isoWeekday } from '../dates.js';
import { state, save, ordersOn, addOrder, findOrder, updateOrder, removeOrder, findCustomer, findEmployee } from '../store.js';
import { REPEAT_OPTIONS, ruleFromRepeat, repeatFromRule, findSeries, createSeries, splitSeries,
  endSeriesFrom, skipOccurrence, describe } from '../recurrence.js';
import { esc, tint, toast, openModal, modalHead, choose, refreshModal } from '../ui.js';
import { peopleView } from './people.js';

export function openDay(dayKey) {
  openModal(dayView(dayKey));
}

function emptyForm(dayKey) {
  return {
    editingId: null, text: '', time: '', endTime: '', customerId: '', employeeIds: new Set(),
    repeat: 'none', weekdays: new Set([isoWeekday(dayKey)]), until: '', focus: true,
  };
}

function dayView(dayKey) {
  let form = emptyForm(dayKey);

  const view = {
    dayKey,
    render(el) {
      el.innerHTML = modalHead(formatLong(dayKey), 'Aufträge für diesen Tag') + formHtml(form) + listHtml(dayKey, form)
        + `<div class="hint">💡 Auftrag antippen = <b>bearbeiten</b>. Kreis = <b>erledigt</b>. ↻ = wiederkehrender Auftrag.</div>`;
      bind(el);
      if (form.focus) {
        form.focus = false;
        // Auf dem Handy nicht automatisch die Tastatur öffnen
        if (window.matchMedia('(min-width: 761px)').matches) el.querySelector('#fText')?.focus();
      }
    },
  };

  function sync(el) {
    form.text = el.querySelector('#fText').value;
    form.time = el.querySelector('#fTime').value;
    form.endTime = el.querySelector('#fEnd').value;
    form.customerId = el.querySelector('#fCustomer').value;
    form.repeat = el.querySelector('#fRepeat').value;
    form.until = el.querySelector('#fUntil')?.value || '';
  }

  function bind(el) {
    el.querySelector('#fText').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(el); });
    el.querySelectorAll('input, select').forEach((inp) => inp.addEventListener('change', () => sync(el)));
    el.querySelector('#fRepeat').addEventListener('change', () => { sync(el); refreshModal(); });
    el.querySelector('#fSave').onclick = () => submit(el);
    el.querySelector('#fCancel')?.addEventListener('click', () => { form = emptyForm(dayKey); refreshModal(); });
    el.querySelectorAll('[data-emp]').forEach((b) => b.onclick = () => {
      sync(el);
      const id = b.dataset.emp;
      form.employeeIds.has(id) ? form.employeeIds.delete(id) : form.employeeIds.add(id);
      refreshModal();
    });
    el.querySelectorAll('[data-wd]').forEach((b) => b.onclick = () => {
      sync(el);
      const wd = Number(b.dataset.wd);
      if (form.weekdays.has(wd) && form.weekdays.size > 1) form.weekdays.delete(wd); else form.weekdays.add(wd);
      refreshModal();
    });
    el.querySelectorAll('[data-manage]').forEach((b) => b.onclick = () => { sync(el); openModal(peopleView(b.dataset.manage)); });

    el.querySelectorAll('.item').forEach((row) => {
      const order = findOrder(row.dataset.id);
      if (!order) return;
      row.querySelector('.check').onclick = () => { order.done = !order.done; save(); };
      row.querySelector('.item-body').onclick = () => startEdit(order);
      row.querySelector('.del').onclick = () => remove(order);
    });
  }

  function startEdit(order) {
    const series = findSeries(order.seriesId);
    form = {
      editingId: order.id, text: order.text, time: order.time, endTime: order.endTime, customerId: order.customerId,
      employeeIds: new Set(order.employeeIds),
      repeat: repeatFromRule(series),
      weekdays: new Set(series?.weekdays?.length ? series.weekdays : [isoWeekday(dayKey)]),
      until: series?.until || '', focus: true,
    };
    refreshModal();
  }

  async function submit(el) {
    sync(el);
    const fields = {
      text: form.text.trim(), time: form.time, endTime: form.endTime,
      customerId: form.customerId, employeeIds: [...form.employeeIds],
    };
    if (!fields.text) { el.querySelector('#fText').focus(); return; }
    const rule = ruleFromRepeat(form.repeat, [...form.weekdays], dayKey);
    const until = rule ? form.until : '';

    if (!form.editingId) {
      if (rule) {
        const series = createSeries(fields, rule, dayKey, until);
        const count = state.orders.filter((o) => o.seriesId === series.id).length;
        toast(`↻ Wiederkehrender Auftrag angelegt: <b>${esc(describe(series))}</b> (${count} Termine)`, 'ok');
      } else {
        addOrder({ ...fields, date: dayKey });
      }
    } else {
      const order = findOrder(form.editingId);
      if (!order) return;
      const series = findSeries(order.seriesId);
      if (series) {
        const scope = await choose('Das ist ein <b>wiederkehrender Auftrag</b>. Was soll geändert werden?', [
          { label: 'Nur diesen Termin', value: 'one', style: 'secondary' },
          { label: 'Diesen und alle folgenden', value: 'following' },
        ]);
        if (!scope) return;
        if (scope === 'one') updateOrder(order.id, fields);
        else if (rule) splitSeries(series.id, order.date, fields, rule, until);
        else {
          // Wiederholung abgeschaltet: Serie endet, dieser Termin bleibt als Einzelauftrag
          const wasDone = order.done;
          endSeriesFrom(series.id, order.date);
          removeOrder(order.id);
          addOrder({ ...fields, date: order.date, done: wasDone });
        }
      } else if (rule) {
        removeOrder(order.id);
        createSeries(fields, rule, order.date, until);
      } else {
        updateOrder(order.id, fields);
      }
    }
    // Kunde/Mitarbeiter bleiben für den nächsten Auftrag vorausgewählt
    const keep = { customerId: form.customerId, employeeIds: form.employeeIds };
    form = { ...emptyForm(dayKey), ...(form.editingId ? {} : keep) };
    save();
  }

  async function remove(order) {
    const series = findSeries(order.seriesId);
    if (series) {
      const scope = await choose('Wiederkehrenden Auftrag löschen:', [
        { label: 'Nur diesen Termin', value: 'one', style: 'secondary' },
        { label: 'Diesen und alle folgenden', value: 'following', style: 'danger' },
      ]);
      if (!scope) return;
      if (scope === 'one') skipOccurrence(order); else endSeriesFrom(series.id, order.date);
    } else {
      removeOrder(order.id);
      toast('🗑 Auftrag gelöscht.', '', 5000, {
        label: 'Rückgängig',
        run: () => { state.orders.push(order); save(); },
      });
    }
    if (form.editingId === order.id) form = emptyForm(dayKey);
    save();
  }

  return view;
}

// ---------- HTML ----------
function formHtml(form) {
  const editing = !!form.editingId;
  const customerOptions = ['<option value="">— kein Kunde —</option>']
    .concat(state.customers.map((c) => `<option value="${esc(c.id)}"${c.id === form.customerId ? ' selected' : ''}>${esc(c.name)}</option>`))
    .join('');
  const customer = findCustomer(form.customerId);

  const employees = state.employees.length
    ? state.employees.map((e) => {
      const on = form.employeeIds.has(e.id);
      return `<button type="button" class="pill${on ? ' on' : ''}" data-emp="${esc(e.id)}"
        style="${on ? `background:${e.color};border-color:${e.color}` : ''}">
        <span class="swatch" style="background:${on ? '#fff' : e.color}"></span>${esc(e.name)}</button>`;
    }).join('')
    : '<span class="muted">Noch keine Mitarbeiter angelegt.</span>';

  const repeatOptions = REPEAT_OPTIONS.map((r) => `<option value="${r.value}"${r.value === form.repeat ? ' selected' : ''}>${r.label}</option>`).join('');
  const weekly = form.repeat === 'weekly' || form.repeat === 'biweekly';
  const weekdayPills = Object.entries(ISO_DAYS_SHORT).map(([n, label]) =>
    `<button type="button" class="pill day${form.weekdays.has(Number(n)) ? ' on' : ''}" data-wd="${n}">${label}</button>`).join('');

  return `<div class="form-card${editing ? ' editing' : ''}">
    <div class="form-title"><span>${editing ? '✏️ Auftrag bearbeiten' : 'Neuer Auftrag'}</span></div>
    <input class="input input-main" id="fText" type="text" placeholder="Was ist zu tun? z. B. Treppenhaus reinigen" value="${esc(form.text)}" autocomplete="off">
    <div class="field-row">
      <span class="field-label">Zeit</span>
      <input class="input input-time" id="fTime" type="time" value="${esc(form.time)}">
      <span class="muted">bis</span>
      <input class="input input-time" id="fEnd" type="time" value="${esc(form.endTime)}">
    </div>
    <div class="field-row">
      <span class="field-label">Kunde</span>
      <select class="select" id="fCustomer" style="border-color:${customer ? customer.color : ''}">${customerOptions}</select>
      <button type="button" class="link-btn" data-manage="customers">verwalten</button>
    </div>
    <div class="field-row">
      <span class="field-label">Mitarbeiter</span>
      <div class="pill-group">${employees}</div>
      <button type="button" class="link-btn" data-manage="employees">verwalten</button>
    </div>
    <div class="field-row">
      <span class="field-label">Wiederholung</span>
      <select class="select" id="fRepeat">${repeatOptions}</select>
    </div>
    ${weekly ? `<div class="field-row"><span class="field-label">An</span><div class="pill-group">${weekdayPills}</div></div>` : ''}
    ${form.repeat !== 'none' ? `<div class="field-row"><span class="field-label">Endet am</span>
      <input class="input" id="fUntil" type="date" value="${esc(form.until)}"><span class="muted">(leer = ohne Ende)</span></div>` : ''}
    <div class="form-actions">
      <button type="button" class="btn grow" id="fSave">${editing ? '✓ Änderungen speichern' : '+ Auftrag hinzufügen'}</button>
      ${editing ? '<button type="button" class="btn secondary" id="fCancel">Abbrechen</button>' : ''}
    </div>
  </div>`;
}

function listHtml(dayKey, form) {
  const orders = ordersOn(dayKey);
  if (!orders.length) return '<div class="list"><div class="empty-note">Noch keine Aufträge an diesem Tag.</div></div>';
  return '<div class="list">' + orders.map((o) => {
    const customer = findCustomer(o.customerId);
    const color = customer?.color || '#94a3b8';
    const emps = o.employeeIds.map(findEmployee).filter(Boolean);
    const series = findSeries(o.seriesId);
    const meta = [
      o.time ? `<span>🕒 ${esc(formatTimeRange(o))} Uhr</span>` : '',
      customer ? `<span class="tag"><span class="swatch" style="background:${color}"></span>${esc(customer.name)}</span>` : '',
      emps.length ? `<span class="tag">👤 ${emps.map((e) => `<span style="color:${e.color}">${esc(e.name)}</span>`).join(', ')}</span>` : '',
      series ? `<span>↻ ${esc(describe(series))}</span>` : '',
    ].filter(Boolean).join('');
    return `<div class="item${o.done ? ' done' : ''}${o.id === form.editingId ? ' editing' : ''}" data-id="${esc(o.id)}"
      style="border-left-color:${color};${o.done ? '' : `background:${tint(color, '14')}`}">
      <button class="check" aria-label="Erledigt umschalten">${o.done ? '✓' : ''}</button>
      <button class="item-body"><div class="item-title">${esc(o.text)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</button>
      <button class="del" aria-label="Löschen">🗑</button>
    </div>`;
  }).join('') + '</div>';
}
