// Wiederkehrende Aufträge.
//
// Eine Serie beschreibt die Regel; die einzelnen Termine werden als normale Aufträge
// (mit seriesId) bis HORIZON_MONTHS in die Zukunft angelegt und beim Start nachgezogen.
// So lässt sich jeder Termin einzeln abhaken, ändern oder löschen.
//
// Serie: { id, text, time, endTime, customerId, employeeIds[],
//          freq: 'daily'|'weekly'|'monthly', interval, weekdays[] (Mo=1…So=7),
//          start, until, skip[] (gelöschte Einzeltermine), generatedUntil }

import { addDays, addMonths, daysBetween, isoWeekday, parseKey, daysInMonth, todayKey,
  ISO_DAYS_SHORT, formatDate } from './dates.js';
import { state, uid } from './store.js';

export const HORIZON_MONTHS = 12;

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Einmalig' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'biweekly', label: 'Alle 2 Wochen' },
  { value: 'monthly', label: 'Monatlich' },
];

// Formularwert ("biweekly") <-> Regel ({freq:'weekly', interval:2})
export function ruleFromRepeat(repeat, weekdays, startKey) {
  if (!repeat || repeat === 'none') return null;
  const wd = weekdays?.length ? [...weekdays].sort() : [isoWeekday(startKey)];
  if (repeat === 'daily') return { freq: 'daily', interval: 1, weekdays: [] };
  if (repeat === 'weekly') return { freq: 'weekly', interval: 1, weekdays: wd };
  if (repeat === 'biweekly') return { freq: 'weekly', interval: 2, weekdays: wd };
  if (repeat === 'monthly') return { freq: 'monthly', interval: 1, weekdays: [] };
  return null;
}

export function repeatFromRule(series) {
  if (!series) return 'none';
  if (series.freq === 'weekly') return series.interval === 2 ? 'biweekly' : 'weekly';
  return series.freq;
}

export function matches(series, key) {
  if (key < series.start || (series.until && key > series.until)) return false;
  const interval = Math.max(1, series.interval || 1);
  if (series.freq === 'daily') {
    return daysBetween(series.start, key) % interval === 0;
  }
  if (series.freq === 'weekly') {
    const wd = isoWeekday(key);
    if (!series.weekdays.includes(wd)) return false;
    const startMonday = addDays(series.start, 1 - isoWeekday(series.start));
    const keyMonday = addDays(key, 1 - wd);
    return (daysBetween(startMonday, keyMonday) / 7) % interval === 0;
  }
  if (series.freq === 'monthly') {
    const s = parseKey(series.start);
    const d = parseKey(key);
    const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
    if (months % interval !== 0) return false;
    // Am 31. angelegt -> in kürzeren Monaten am letzten Tag
    const target = Math.min(s.getDate(), daysInMonth(d.getFullYear(), d.getMonth()));
    return d.getDate() === target;
  }
  return false;
}

export function occurrences(series, fromKey, toKey) {
  const out = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) {
    if (matches(series, k)) out.push(k);
  }
  return out;
}

const horizon = () => addMonths(todayKey(), HORIZON_MONTHS);

function orderFromSeries(series, date) {
  return {
    id: uid('o'), date, text: series.text, time: series.time || '', endTime: series.endTime || '',
    done: false, customerId: series.customerId || '', employeeIds: [...(series.employeeIds || [])], seriesId: series.id,
  };
}

// Legt fehlende Termine bis zum Horizont an. Gibt die Anzahl neuer Aufträge zurück.
export function extendSeries(series, until = horizon()) {
  const from = series.generatedUntil ? addDays(series.generatedUntil, 1) : series.start;
  const to = series.until && series.until < until ? series.until : until;
  if (from > to) return 0;
  const existing = new Set(state.orders.filter((o) => o.seriesId === series.id).map((o) => o.date));
  const skip = new Set(series.skip || []);
  let added = 0;
  for (const date of occurrences(series, from, to)) {
    if (existing.has(date) || skip.has(date)) continue;
    state.orders.push(orderFromSeries(series, date));
    added++;
  }
  series.generatedUntil = to;
  return added;
}

export function extendAll() {
  return state.series.reduce((sum, s) => sum + extendSeries(s), 0);
}

export function findSeries(id) {
  return state.series.find((s) => s.id === id) || null;
}

export function createSeries(fields, rule, startKey, untilKey = '', { extend = true } = {}) {
  const series = {
    id: uid('s'),
    text: fields.text, time: fields.time || '', endTime: fields.endTime || '',
    customerId: fields.customerId || '', employeeIds: [...(fields.employeeIds || [])],
    freq: rule.freq, interval: rule.interval || 1, weekdays: rule.weekdays || [],
    start: startKey, until: untilKey || '', skip: [], generatedUntil: '',
  };
  state.series.push(series);
  if (extend) extendSeries(series);
  return series;
}

// Einen einzelnen Termin löschen – er kommt beim Nachziehen nicht wieder.
export function skipOccurrence(order) {
  const series = findSeries(order.seriesId);
  if (series) series.skip = [...new Set([...(series.skip || []), order.date])];
  state.orders = state.orders.filter((o) => o.id !== order.id);
}

// Serie ab einem Datum beenden; offene Termine ab dort werden entfernt, erledigte bleiben.
export function endSeriesFrom(seriesId, fromKey) {
  const series = findSeries(seriesId);
  if (!series) return;
  state.orders = state.orders.filter((o) => !(o.seriesId === seriesId && o.date >= fromKey && !o.done));
  series.until = addDays(fromKey, -1);
  if (series.until < series.start) dropSeriesIfEmpty(series);
}

function dropSeriesIfEmpty(series) {
  if (!state.orders.some((o) => o.seriesId === series.id)) {
    state.series = state.series.filter((s) => s.id !== series.id);
  }
}

// "Diesen und alle folgenden ändern": alte Serie endet am Vortag, ab fromKey gilt eine neue.
export function splitSeries(seriesId, fromKey, fields, rule, untilKey) {
  const old = findSeries(seriesId);
  if (!old) return null;
  const doneLater = state.orders.filter((o) => o.seriesId === seriesId && o.date >= fromKey && o.done);
  endSeriesFrom(seriesId, fromKey);
  const next = createSeries(fields, rule, fromKey, untilKey, { extend: false });
  next.skip = (old.skip || []).filter((d) => d >= fromKey);
  // Bereits erledigte Termine gehören zur neuen Serie und werden nicht doppelt angelegt
  for (const o of doneLater) o.seriesId = next.id;
  extendSeries(next);
  dropSeriesIfEmpty(old);
  return next;
}

export function describe(series) {
  if (!series) return '';
  let text;
  if (series.freq === 'daily') text = 'Täglich';
  else if (series.freq === 'monthly') text = `Monatlich am ${parseKey(series.start).getDate()}.`;
  else {
    const days = series.weekdays.map((d) => ISO_DAYS_SHORT[d]).join(', ');
    text = (series.interval === 2 ? 'Alle 2 Wochen ' : 'Jeden ') + days;
  }
  if (series.until) text += ` · bis ${formatDate(series.until)}`;
  return text;
}
