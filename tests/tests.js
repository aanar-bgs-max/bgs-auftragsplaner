// Tests für Spracherkennung und wiederkehrende Aufträge.
// Aufruf im Browser: http://localhost:8765/tests/
// Arbeitet nur im Arbeitsspeicher – gespeicherte Daten werden nicht verändert.
import { analyze } from '../js/parser.js';
import { state } from '../js/store.js';
import { occurrences, createSeries, extendSeries, skipOccurrence, splitSeries, endSeriesFrom, ruleFromRepeat } from '../js/recurrence.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, err }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} erwartet ${e}, bekommen ${a}`);
}

// Fester "heute": Dienstag, 3. November 2026
const today = new Date(2026, 10, 3, 10, 0);
const customers = [{ id: 'c1', name: 'Schoko Pro' }, { id: 'c2', name: 'Mainz plus' }];
const employees = [{ id: 'e1', name: 'Ahmet' }, { id: 'e2', name: 'Maria' }];
const ctx = { customers, employees, today };
const run = (s, extra = {}) => analyze(s, { ...ctx, ...extra });

// ---------- Spracherkennung ----------
test('morgen + Uhrzeit + Kunde', () => {
  const r = run('Trag für morgen um achtzehn Uhr Fenster putzen bei Mainz plus ein');
  eq(r.dateKey, '2026-11-04', 'Datum'); eq(r.time, '18:00', 'Zeit'); eq(r.customerId, 'c2', 'Kunde'); eq(r.text, 'Fenster putzen', 'Text');
});
test('Zeitspanne von acht bis zwölf', () => {
  const r = run('übermorgen von acht bis zwölf Uhr Treppenhaus reinigen');
  eq(r.dateKey, '2026-11-05'); eq(r.time, '08:00'); eq(r.endTime, '12:00'); eq(r.text, 'Treppenhaus reinigen');
});
test('von acht bis zwei -> 14 Uhr', () => {
  const r = run('heute von 8 bis 2 Grundreinigung');
  eq([r.time, r.endTime], ['08:00', '14:00']);
});
test('halb neun', () => {
  eq(run('morgen um halb neun Büro saugen').time, '08:30');
});
test('Ordinal-Datum zehnten Dezember', () => {
  const r = run('am zehnten Dezember Glasreinigung');
  eq(r.dateKey, '2026-12-10'); eq(r.text, 'Glasreinigung');
});
test('Datum 12.11. als Zahl', () => {
  eq(run('am 12.11. Teppich shampoonieren').dateKey, '2026-11-12');
});
test('Wochentag = nächster Freitag', () => {
  eq(run('Freitag Fenster Schoko Pro').dateKey, '2026-11-06');
});
test('vergangenes Datum -> nächstes Jahr', () => {
  eq(run('am ersten März Bauendreinigung').dateKey, '2027-03-01');
});
test('Mitarbeiter wird erkannt und aus Text entfernt', () => {
  const r = run('morgen Treppenhaus putzen mit Ahmet und Maria');
  eq(r.employeeIds, ['e1', 'e2'], 'Mitarbeiter'); eq(r.text, 'Treppenhaus putzen', 'Text');
});
test('Mitarbeiter am Satzanfang', () => {
  const r = run('Ahmet soll morgen um 7 Uhr Büro Schoko Pro reinigen');
  eq(r.employeeIds, ['e1']); eq(r.customerId, 'c1'); eq(r.time, '07:00'); eq(r.text, 'Büro reinigen');
});
test('ohne Datum -> offener Tag', () => {
  eq(run('Müll rausbringen', { fallbackDate: '2026-11-20' }).dateKey, '2026-11-20');
});
test('jeden Montag', () => {
  const r = run('jeden Montag um acht Uhr Treppenhaus Mainz plus');
  eq(r.repeat, { freq: 'weekly', interval: 1, weekdays: [1] }); eq(r.text, 'Treppenhaus'); eq(r.time, '08:00');
});
test('jeden Montag und Donnerstag', () => {
  eq(run('jeden Montag und Donnerstag Büro reinigen').repeat.weekdays, [1, 4]);
});
test('alle zwei Wochen am Freitag', () => {
  eq(run('alle zwei Wochen am Freitag Fenster putzen').repeat, { freq: 'weekly', interval: 2, weekdays: [5] });
});
test('täglich', () => {
  const r = run('täglich Müll rausbringen');
  eq(r.repeat.freq, 'daily'); eq(r.text, 'Müll rausbringen');
});
test('mittwochs', () => {
  eq(run('mittwochs Treppenhaus').repeat.weekdays, [3]);
});
test('keine Wiederholung bei normalem Satz', () => {
  eq(run('morgen Fenster').repeat, null);
});

// ---------- Wiederholungen ----------
function reset() { state.orders = []; state.series = []; }
const fields = { text: 'Treppenhaus', time: '08:00', endTime: '10:00', customerId: '', employeeIds: [] };

test('wöchentlich Mo+Do Termine', () => {
  const s = { freq: 'weekly', interval: 1, weekdays: [1, 4], start: '2026-11-03', until: '' };
  eq(occurrences(s, '2026-11-01', '2026-11-15'), ['2026-11-05', '2026-11-09', '2026-11-12']);
});
test('alle 2 Wochen', () => {
  const s = { freq: 'weekly', interval: 2, weekdays: [2], start: '2026-11-03', until: '' };
  eq(occurrences(s, '2026-11-01', '2026-12-01'), ['2026-11-03', '2026-11-17', '2026-12-01']);
});
test('monatlich am 31. -> letzter Tag', () => {
  const s = { freq: 'monthly', interval: 1, weekdays: [], start: '2026-10-31', until: '' };
  eq(occurrences(s, '2026-10-01', '2027-01-31'), ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31']);
});
test('täglich mit Enddatum', () => {
  const s = { freq: 'daily', interval: 1, weekdays: [], start: '2026-11-03', until: '2026-11-05' };
  eq(occurrences(s, '2026-11-01', '2026-11-30'), ['2026-11-03', '2026-11-04', '2026-11-05']);
});
test('Serie anlegen erzeugt Aufträge, Nachziehen ist idempotent', () => {
  reset();
  const s = createSeries(fields, ruleFromRepeat('weekly', [2], '2026-11-03'), '2026-11-03', '2026-12-01');
  eq(state.orders.length, 5);
  s.generatedUntil = '';
  eq(extendSeries(s), 0, 'keine Doppelten');
});
test('einzelnen Termin löschen bleibt gelöscht', () => {
  reset();
  const s = createSeries(fields, ruleFromRepeat('weekly', [2], '2026-11-03'), '2026-11-03', '2026-12-01');
  skipOccurrence(state.orders.find((o) => o.date === '2026-11-10'));
  s.generatedUntil = '';
  extendSeries(s);
  eq(state.orders.map((o) => o.date).sort(), ['2026-11-03', '2026-11-17', '2026-11-24', '2026-12-01']);
});
test('ab Termin ändern teilt die Serie', () => {
  reset();
  const s = createSeries(fields, ruleFromRepeat('weekly', [2], '2026-11-03'), '2026-11-03', '2026-12-01');
  state.orders.find((o) => o.date === '2026-11-24').done = true;
  splitSeries(s.id, '2026-11-17', { ...fields, text: 'Neu' }, ruleFromRepeat('weekly', [2], '2026-11-17'), '2026-12-01');
  const byDate = Object.fromEntries(state.orders.map((o) => [o.date, o.text]));
  eq(byDate, { '2026-11-03': 'Treppenhaus', '2026-11-10': 'Treppenhaus', '2026-11-24': 'Treppenhaus', '2026-11-17': 'Neu', '2026-12-01': 'Neu' });
  eq(state.orders.length, 5, 'erledigter Termin nicht doppelt');
});
test('Serie ab Datum beenden', () => {
  reset();
  const s = createSeries(fields, ruleFromRepeat('daily', [], '2026-11-03'), '2026-11-03', '2026-11-10');
  endSeriesFrom(s.id, '2026-11-06');
  eq(state.orders.map((o) => o.date).sort(), ['2026-11-03', '2026-11-04', '2026-11-05']);
});

// ---------- Ausgabe ----------
const failed = results.filter((r) => !r.ok);
document.getElementById('summary').innerHTML = failed.length
  ? `<span class="fail">${failed.length} von ${results.length} Tests fehlgeschlagen</span>`
  : `<span class="pass">Alle ${results.length} Tests bestanden ✓</span>`;
document.getElementById('results').innerHTML = results.map((r) => r.ok
  ? `<li class="pass">✓ ${r.name}</li>`
  : `<li class="fail">✗ ${r.name}<pre>${r.err.message}</pre></li>`).join('');
window.__testResults = { total: results.length, failed: failed.map((f) => `${f.name}: ${f.err.message}`) };
