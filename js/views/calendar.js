// Monatskalender
import { MONTHS, DAYS, toKey, todayKey, daysInMonth, formatTimeRange } from '../dates.js';
import { state, findCustomer } from '../store.js';
import { view, visible } from '../view-state.js';
import { $, esc, tint } from '../ui.js';

const MAX_CHIPS = 3;
const NEUTRAL = '#94a3b8';

const customerColor = (o) => findCustomer(o.customerId)?.color || NEUTRAL;

export function renderCalendar(onOpenDay) {
  const y = view.month.getFullYear();
  const m = view.month.getMonth();
  const now = new Date();
  const today = todayKey();
  $('#monthLabel').textContent = `${MONTHS[m]} ${y}`;
  $('#todayLabel').textContent = `Heute: ${DAYS[now.getDay()]}, ${now.getDate()}. ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // Aufträge des Monats einmal gruppieren
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const byDay = new Map();
  for (const o of state.orders) {
    if (!o.date.startsWith(prefix) || !visible(o)) continue;
    if (!byDay.has(o.date)) byDay.set(o.date, []);
    byDay.get(o.date).push(o);
  }

  const grid = $('#grid');
  const frag = document.createDocumentFragment();
  const leading = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < leading; i++) {
    const empty = document.createElement('div');
    empty.className = 'cell empty';
    frag.appendChild(empty);
  }
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const date = new Date(y, m, d);
    const key = toKey(date);
    const wd = date.getDay();
    const orders = (byDay.get(key) || []).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const cell = document.createElement('button');
    cell.className = 'cell'
      + (key === today ? ' today' : '')
      + (key < today ? ' past' : '')
      + (wd === 0 || wd === 6 ? ' weekend' : '')
      + (key === view.flashKey ? ' flash' : '');
    cell.dataset.key = key;
    cell.setAttribute('aria-label', `${d}. ${MONTHS[m]}, ${orders.length} Aufträge`);
    cell.onclick = () => onOpenDay(key);

    const chips = orders.slice(0, MAX_CHIPS).map((o) => {
      const col = customerColor(o);
      const time = o.time ? `<span class="chip-time">${esc(o.time)}</span>` : '';
      const rec = o.seriesId ? '↻ ' : '';
      return `<div class="chip${o.done ? ' done' : ''}" style="border-left-color:${col};background:${tint(col)}"
        title="${esc(formatTimeRange(o) + ' ' + o.text)}">${time}${rec}${esc(o.text)}</div>`;
    }).join('');
    const more = orders.length > MAX_CHIPS ? `<div class="more">+${orders.length - MAX_CHIPS} weitere</div>` : '';
    const dots = orders.slice(0, 8).map((o) => `<span class="dot${o.done ? ' done' : ''}" style="background:${customerColor(o)}"></span>`).join('');
    const allDone = orders.length && orders.every((o) => o.done);
    cell.innerHTML = `<div class="cell-num">${d}</div><div class="chips">${chips}${more}</div><div class="dots">${dots}</div>`
      + (orders.length ? `<div class="count-badge${allDone ? ' all-done' : ''}">${allDone ? '✓' : orders.length}</div>` : '');
    frag.appendChild(cell);
  }
  grid.replaceChildren(frag);

  if (view.flashKey) {
    grid.querySelector(`[data-key="${view.flashKey}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    view.flashKey = '';
  }
}
