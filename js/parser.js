// Offline-Spracherkennung: macht aus einem gesprochenen deutschen Satz einen Auftrag.
// Reine Funktion ohne Seiteneffekte – wird in tests/ geprüft.
//
// analyze("Trag jeden Montag um acht Uhr Treppenhaus bei Mainz plus ein", ctx) ->
//   { dateKey, time, endTime, text, customerId, employeeIds, repeat: {freq, interval, weekdays} | null }

import { MONTHS, pad, toKey } from './dates.js';

const WEEKDAY_MAP = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };
const WEEKDAY_PLURAL = { sonntags: 7, montags: 1, dienstags: 2, mittwochs: 3, donnerstags: 4, freitags: 5, samstags: 6 };

const ORD_STEMS = {
  erst: 1, zweit: 2, dritt: 3, viert: 4, 'fünft': 5, funft: 5, sechst: 6, siebt: 7, siebent: 7, acht: 8, neunt: 9,
  zehnt: 10, elft: 11, 'zwölft': 12, zwoelft: 12, dreizehnt: 13, vierzehnt: 14, 'fünfzehnt': 15, funfzehnt: 15,
  sechzehnt: 16, siebzehnt: 17, achtzehnt: 18, neunzehnt: 19, zwanzigst: 20, einundzwanzigst: 21,
  zweiundzwanzigst: 22, dreiundzwanzigst: 23, vierundzwanzigst: 24, 'fünfundzwanzigst': 25, funfundzwanzigst: 25,
  sechsundzwanzigst: 26, siebenundzwanzigst: 27, achtundzwanzigst: 28, neunundzwanzigst: 29, 'dreißigst': 30,
  dreissigst: 30, 'einunddreißigst': 31, einunddreissigst: 31,
};
const ORD_END = ['e', 'en', 'er', 'em', 'es', ''];

const ONES = { eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const TEENS = { zehn: 10, elf: 11, 'zwölf': 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, 'fünfzehn': 15, funfzehn: 15,
  sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const TENS = { zwanzig: 20, 'dreißig': 30, dreissig: 30, vierzig: 40, 'fünfzig': 50, funfzig: 50 };
const COMPOUND_TENS = /und(zwanzig|dreißig|dreissig|vierzig|fünfzig|funfzig)$/;

const FILLER = new Set(['mach', 'mache', 'machen', 'mal', 'bitte', 'schreib', 'schreibe', 'schreiben', 'reinschreiben',
  'trag', 'trage', 'tragen', 'eintragen', 'eintrage', 'notier', 'notiere', 'notieren', 'füg', 'füge', 'fügen', 'hinzu',
  'hinzufügen', 'erinnere', 'erinner', 'pack', 'packe', 'setz', 'setze', 'kannst', 'könntest', 'würdest', 'du', 'mir',
  'mich', 'noch', 'den', 'dem', 'der', 'die', 'das', 'ein', 'eine', 'einen', 'auftrag', 'aufträge', 'auftraege', 'termin',
  'aufgabe', 'rein', 'raus', 'hallo', 'hey', 'so', 'ja', 'ok', 'okay', 'für', 'fürs', 'fuer', 'am', 'um', 'folgenden',
  'folgender', 'folgende', 'folgendes', 'nämlich', 'naemlich', 'ist', 'von', 'bis', 'ab', 'soll', 'sollen', 'muss']);
const PREPOSITIONS = '(?:bei|beim|für|fuer|an|am|im|in|von|vom|mit|durch)';

function ordinalToNum(w) {
  w = (w || '').toLowerCase().replace(/[.,;:!?]/g, '');
  for (const [stem, n] of Object.entries(ORD_STEMS)) {
    for (const end of ORD_END) if (w === stem + end) return n;
  }
  return null;
}

export function wordToNumber(w) {
  if (w == null) return null;
  w = String(w).toLowerCase().replace(/[.,;:!?]/g, '');
  if (/^\d{1,2}$/.test(w)) return parseInt(w, 10);
  if (TEENS[w] != null) return TEENS[w];
  if (TENS[w] != null) return TENS[w];
  if (ONES[w] != null) return ONES[w];
  const m = w.match(/^(.+?)und(zwanzig|dreißig|dreissig|vierzig|fünfzig|funfzig)$/);
  if (m && ONES[m[1]] != null && TENS[m[2]] != null) return TENS[m[2]] + ONES[m[1]];
  return null;
}

const isMinuteWord = (t) => t && (/^\d{1,2}$/.test(t) || TENS[t] != null || TEENS[t] != null || COMPOUND_TENS.test(t));

// ---------- Wiederholung ("jeden Montag", "alle zwei Wochen", "täglich") ----------
function detectRepeat(toks, consumed) {
  let interval = 1;
  let freq = null;
  const weekdays = [];
  const eat = (i) => { consumed[i] = true; };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'täglich' || t === 'taeglich') { freq = 'daily'; eat(i); }
    else if (t === 'wöchentlich' || t === 'woechentlich') { freq = freq || 'weekly'; eat(i); }
    else if (t === 'monatlich') { freq = 'monthly'; eat(i); }
    else if (WEEKDAY_PLURAL[t]) { freq = 'weekly'; weekdays.push(WEEKDAY_PLURAL[t]); eat(i); }
    else if (['jeden', 'jede', 'jedem'].includes(t)) {
      const next = toks[i + 1];
      if (WEEKDAY_MAP[next] != null) {
        freq = 'weekly'; eat(i);
        // "jeden Montag und Donnerstag"
        for (let j = i + 1; j < toks.length; j++) {
          if (WEEKDAY_MAP[toks[j]] != null) { weekdays.push(WEEKDAY_MAP[toks[j]] || 7); eat(j); }
          else if (toks[j] === 'und' && WEEKDAY_MAP[toks[j + 1]] != null) eat(j);
          else break;
        }
      } else if (next === 'tag' || next === 'werktag') {
        if (next === 'werktag') { freq = 'weekly'; weekdays.push(1, 2, 3, 4, 5); } else freq = 'daily';
        eat(i); eat(i + 1);
      } else if (next === 'woche') { freq = freq || 'weekly'; eat(i); eat(i + 1); }
      else if (next === 'monat') { freq = 'monthly'; eat(i); eat(i + 1); }
    } else if (t === 'alle' && ['zwei', '2'].includes(toks[i + 1]) && toks[i + 2] === 'wochen') {
      freq = 'weekly'; interval = 2; eat(i); eat(i + 1); eat(i + 2);
    }
  }
  if (!freq) return null;
  // "alle zwei Wochen am Dienstag" – Wochentag ohne "jeden"
  if (freq === 'weekly' && !weekdays.length) {
    toks.forEach((t, i) => {
      if (!consumed[i] && WEEKDAY_MAP[t] != null) {
        weekdays.push(WEEKDAY_MAP[t] || 7); eat(i);
        if (toks[i - 1] === 'am') eat(i - 1);
      }
    });
  }
  return { freq, interval, weekdays: [...new Set(weekdays)].sort() };
}

// ---------- Datum ----------
function detectDate(toks, consumed, today) {
  const rel = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return toKey(d); };
  for (let i = 0; i < toks.length; i++) {
    if (consumed[i]) continue;
    const t = toks[i];
    if (t === 'übermorgen' || t === 'uebermorgen') { consumed[i] = true; return rel(2); }
    if (t === 'morgen') { consumed[i] = true; return rel(1); }
    if (t === 'heute') { consumed[i] = true; return rel(0); }
    if (WEEKDAY_MAP[t] != null) {
      consumed[i] = true;
      if (toks[i - 1] === 'am') consumed[i - 1] = true;
      let diff = (WEEKDAY_MAP[t] - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return rel(diff);
    }
  }
  let monthName = null;
  let monthIdx = -1;
  toks.forEach((t, i) => MONTHS.forEach((mn, mi) => {
    if (mn.toLowerCase() === t && !consumed[i]) { monthName = mi; monthIdx = i; }
  }));
  let dayNum = null;
  let monthNum = null;
  for (let i = 0; i < toks.length; i++) {
    if (consumed[i] || toks[i + 1] === 'uhr') continue;
    let n = ordinalToNum(toks[i]);
    if (n == null) {
      const dm = toks[i].match(/^(\d{1,2})(ter|ten|te)?$/);
      if (dm) n = parseInt(dm[1], 10);
    }
    if (n == null) continue;
    if (dayNum == null && n >= 1 && n <= 31) {
      dayNum = n; consumed[i] = true;
      if (['am', 'den', 'dem'].includes(toks[i - 1])) consumed[i - 1] = true;
    } else if (monthNum == null && n >= 1 && n <= 12) {
      monthNum = n; consumed[i] = true; break;
    }
  }
  // "am 12.11." als ein Wort
  if (dayNum == null) {
    for (let i = 0; i < toks.length; i++) {
      const m = !consumed[i] && toks[i].match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
      if (m) {
        consumed[i] = true;
        if (toks[i - 1] === 'am') consumed[i - 1] = true;
        dayNum = +m[1]; monthNum = +m[2];
        break;
      }
    }
  }
  if (dayNum == null && monthName == null) return null;
  if (monthIdx >= 0) consumed[monthIdx] = true;
  const day = dayNum ?? 1;
  const month = monthNum != null ? monthNum - 1 : (monthName ?? today.getMonth());
  let d = new Date(today.getFullYear(), month, day);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d < midnight) d = new Date(today.getFullYear() + 1, month, day);
  return toKey(d);
}

// ---------- Uhrzeit ----------
const toClock = (tok) => (tok == null ? null : /^\d{1,2}$/.test(tok) ? parseInt(tok, 10) : wordToNumber(tok));

function detectTimes(toks, consumed) {
  const bisIdx = toks.indexOf('bis');
  if (bisIdx > 0) {
    const eatVon = (i) => { if (['von', 'um', 'ab'].includes(toks[i])) consumed[i] = true; };
    const parseLeft = (b) => {
      const j = b - 1;
      const mm = toks[j]?.match(/^(\d{1,2})[:.](\d{2})$/);
      if (mm) { consumed[j] = true; eatVon(j - 1); return pad(mm[1]) + ':' + mm[2]; }
      if (toClock(toks[j]) != null && toks[j - 1] === 'uhr' && toClock(toks[j - 2]) != null) {
        consumed[j] = consumed[j - 1] = consumed[j - 2] = true; eatVon(j - 3);
        return pad(toClock(toks[j - 2])) + ':' + pad(toClock(toks[j]));
      }
      if (toks[j] === 'uhr' && toClock(toks[j - 1]) != null) {
        consumed[j] = consumed[j - 1] = true; eatVon(j - 2); return pad(toClock(toks[j - 1])) + ':00';
      }
      if (toks[j - 1] === 'halb' && toClock(toks[j]) != null) {
        consumed[j] = consumed[j - 1] = true; eatVon(j - 2); return pad((toClock(toks[j]) + 23) % 24) + ':30';
      }
      if (toClock(toks[j]) != null) { consumed[j] = true; eatVon(j - 1); return pad(toClock(toks[j])) + ':00'; }
      return '';
    };
    const parseRight = (b) => {
      let j = b + 1;
      if (toks[j] === 'um') { consumed[j] = true; j++; }
      if (toks[j] === 'halb' && toClock(toks[j + 1]) != null) {
        consumed[j] = consumed[j + 1] = true;
        if (toks[j + 2] === 'uhr') consumed[j + 2] = true;
        return pad((toClock(toks[j + 1]) + 23) % 24) + ':30';
      }
      const mm = toks[j]?.match(/^(\d{1,2})[:.](\d{2})$/);
      if (mm) { consumed[j] = true; if (toks[j + 1] === 'uhr') consumed[j + 1] = true; return pad(mm[1]) + ':' + mm[2]; }
      const h = toClock(toks[j]);
      if (h != null) {
        consumed[j] = true;
        let m = 0;
        let k = j + 1;
        if (toks[k] === 'uhr') { consumed[k] = true; k++; }
        if (isMinuteWord(toks[k]) && !FILLER.has(toks[k])) { m = toClock(toks[k]); consumed[k] = true; }
        return pad(h) + ':' + pad(m);
      }
      return '';
    };
    const start = parseLeft(bisIdx);
    let end = parseRight(bisIdx);
    if (start && end) {
      const [sh, sm] = start.split(':').map(Number);
      let [eh, em] = end.split(':').map(Number);
      // "von acht bis zwei" -> 14 Uhr
      if (eh * 60 + em <= sh * 60 + sm && eh < 12) { eh += 12; end = pad(eh) + ':' + pad(em); }
    }
    if (start || end) { consumed[bisIdx] = true; return { time: start, endTime: end }; }
  }
  return { time: detectSingleTime(toks, consumed), endTime: '' };
}

function detectSingleTime(toks, consumed) {
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i].match(/^(\d{1,2})[:](\d{2})$/) || (toks[i + 1] === 'uhr' && toks[i].match(/^(\d{1,2})[.](\d{2})$/));
    if (m) {
      consumed[i] = true;
      if (toks[i + 1] === 'uhr') consumed[i + 1] = true;
      if (['um', 'ab'].includes(toks[i - 1])) consumed[i - 1] = true;
      return pad(m[1]) + ':' + m[2];
    }
  }
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== 'uhr') continue;
    const h = wordToNumber(toks[i - 1]);
    if (h == null || h > 24) continue;
    consumed[i] = consumed[i - 1] = true;
    if (['um', 'ab'].includes(toks[i - 2])) consumed[i - 2] = true;
    let min = 0;
    const nt = toks[i + 1];
    const mn = wordToNumber(nt);
    if (mn != null && mn < 60 && !FILLER.has(nt) && isMinuteWord(nt)) { min = mn; consumed[i + 1] = true; }
    return pad(h) + ':' + pad(min);
  }
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i] !== 'halb') continue;
    const h = wordToNumber(toks[i + 1]);
    if (h == null) continue;
    consumed[i] = consumed[i + 1] = true;
    if (toks[i - 1] === 'um') consumed[i - 1] = true;
    return pad((h + 23) % 24) + ':30';
  }
  for (let i = 0; i < toks.length - 2; i++) {
    if (toks[i] !== 'viertel' || !['nach', 'vor'].includes(toks[i + 1])) continue;
    const h = wordToNumber(toks[i + 2]);
    if (h == null) continue;
    consumed[i] = consumed[i + 1] = consumed[i + 2] = true;
    if (toks[i - 1] === 'um') consumed[i - 1] = true;
    return toks[i + 1] === 'nach' ? pad(h) + ':15' : pad((h + 23) % 24) + ':45';
  }
  return '';
}

// ---------- Namen (Kunden / Mitarbeiter) ----------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findNames(people, lowerSentence) {
  return people
    .filter((p) => new RegExp(`(^|[^\\p{L}])${escapeRe(p.name.toLowerCase())}($|[^\\p{L}])`, 'u').test(lowerSentence))
    .sort((a, b) => b.name.length - a.name.length);
}

function stripName(text, name) {
  return text
    .replace(new RegExp(`(?:${PREPOSITIONS}\\s+)?${escapeRe(name)}`, 'ig'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Hauptfunktion ----------
function normalizeToken(raw) {
  const t = raw.toLowerCase().replace(/^[«»„"'(]+/, '').replace(/[,;:!?»«"')]+$/, '');
  if (/^\d{1,2}\.\d{1,2}\.(\d{2,4})?$/.test(t)) return t; // Datum wie 12.11. behalten
  return t.replace(/\.+$/, '');
}

export function analyze(transcript, { customers = [], employees = [], today = new Date(), fallbackDate } = {}) {
  const rawToks = transcript.trim().split(/\s+/).filter(Boolean);
  const toks = rawToks.map(normalizeToken);
  const consumed = new Array(toks.length).fill(false);

  const repeat = detectRepeat(toks, consumed);
  const dateKey = detectDate(toks, consumed, today) || fallbackDate || toKey(today);
  const { time, endTime } = detectTimes(toks, consumed);

  let boundary = 0;
  for (let i = 0; i < toks.length; i++) {
    if (['folgenden', 'folgender', 'folgende', 'folgendes', 'nämlich', 'naemlich'].includes(toks[i])) boundary = i + 1;
    if (toks[i] === 'zwar' && toks[i - 1] === 'und') boundary = i + 1;
    if (toks[i] === 'auftrag' && ['rein', 'ein', 'hinzu'].includes(toks[i + 1] || '')) boundary = i + 2;
    if (toks[i] === 'rein' && i > 0) boundary = Math.max(boundary, i + 1);
  }
  const build = (from) => {
    const words = [];
    for (let i = from; i < toks.length; i++) {
      if (consumed[i] || !toks[i] || FILLER.has(toks[i])) continue;
      words.push(rawToks[i].replace(/^[«»„"'(]+/, '').replace(/[»«"')]+$/, ''));
    }
    return words.join(' ').trim();
  };
  let text = build(boundary);
  if (!text && boundary > 0) text = build(0);

  const lower = transcript.toLowerCase();
  const customer = findNames(customers, lower)[0];
  if (customer) text = stripName(text, customer.name);
  const foundEmployees = findNames(employees, lower).filter((e) => !customer || e.name.toLowerCase() !== customer.name.toLowerCase());
  for (const e of foundEmployees) text = stripName(text, e.name);

  text = text
    .replace(new RegExp(`(\\s+${PREPOSITIONS}|\\s+und)+\\s*$`, 'i'), '')
    .replace(/[.,;:\s]+$/, '')
    .trim();
  if (text) text = text.charAt(0).toUpperCase() + text.slice(1);

  return {
    dateKey, time, endTime, text,
    customerId: customer?.id || '',
    employeeIds: foundEmployees.map((e) => e.id),
    repeat,
  };
}
