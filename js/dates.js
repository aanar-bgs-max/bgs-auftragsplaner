// Datums-Hilfen. Ein Tag wird überall als Schlüssel "YYYY-MM-DD" (lokale Zeit) geführt.

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];
export const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
// Wochentage im Format Mo=1 … So=7 (ISO)
export const ISO_DAYS_SHORT = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So' };

export const pad = (n) => String(n).padStart(2, '0');

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key, n) {
  const d = parseKey(key);
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

// Ganze Tage zwischen zwei Schlüsseln (b - a), sommerzeitsicher
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// ISO-Wochentag: Mo=1 … So=7
export function isoWeekday(key) {
  const wd = parseKey(key).getDay();
  return wd === 0 ? 7 : wd;
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function formatLong(key) {
  const d = parseKey(key);
  return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatShort(key) {
  const d = parseKey(key);
  return `${DAYS[d.getDay()].slice(0, 2)}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

export function formatDate(key) {
  const d = parseKey(key);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Minuten zwischen "HH:MM"-Zeiten; über Mitternacht wird ein Tag addiert
export function durationMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}:${pad(m)} h` : `${h} h`;
}

export function formatTimeRange(order) {
  if (!order.time) return '';
  return order.endTime ? `${order.time}–${order.endTime}` : order.time;
}
