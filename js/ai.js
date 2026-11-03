// KI-Modus: Claude wandelt den gesprochenen Satz in einen Auftrag um.
// Läuft direkt aus dem Browser; der API-Schlüssel bleibt nur auf diesem Gerät.

import { DAYS, toKey } from './dates.js';

const MODEL = 'claude-haiku-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'time', 'endTime', 'text', 'customer', 'employees', 'repeat'],
  properties: {
    date: { type: 'string', description: 'YYYY-MM-DD' },
    time: { type: 'string', description: 'Startzeit HH:MM oder leer' },
    endTime: { type: 'string', description: 'Endzeit HH:MM oder leer' },
    text: { type: 'string' },
    customer: { type: 'string', description: 'Exakter Name eines bekannten Kunden oder leer' },
    employees: { type: 'array', items: { type: 'string' } },
    repeat: {
      type: 'object',
      additionalProperties: false,
      required: ['freq', 'interval', 'weekdays'],
      properties: {
        freq: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'] },
        interval: { type: 'integer' },
        weekdays: { type: 'array', items: { type: 'integer' } },
      },
    },
  },
};

function systemPrompt({ customers, employees, today }) {
  return [
    'Du wandelst einen gesprochenen deutschen Satz in einen Kalender-Auftrag einer Gebäudereinigungsfirma um.',
    `Heute ist ${DAYS[today.getDay()]}, der ${toKey(today)}.`,
    '"text" enthält nur die eigentliche Aufgabe – ohne Befehlswörter wie "trag ein", ohne Datum, Uhrzeit, Wiederholung, Kunden- und Mitarbeiternamen.',
    'Rechne relative Angaben (heute, morgen, übermorgen, Wochentage, "zehnten Achten") in ein echtes Datum um; ohne Angabe gilt heute.',
    '"time"/"endTime": Zeitspannen wie "von acht bis zwölf" ergeben Start und Ende, sonst bleibt endTime leer.',
    '"repeat": bei "jeden Montag", "täglich", "alle zwei Wochen", "monatlich" usw. die Regel setzen (weekdays: Mo=1 … So=7, interval 2 = alle zwei Wochen), sonst freq "none".',
    `Bekannte Kunden: ${customers.map((c) => c.name).join(', ') || '(keine)'}. Nur exakt diese Namen in "customer" verwenden.`,
    `Bekannte Mitarbeiter: ${employees.map((e) => e.name).join(', ') || '(keine)'}. Nur exakt diese Namen in "employees" verwenden.`,
  ].join('\n');
}

export async function analyzeWithAI(transcript, { apiKey, customers = [], employees = [], today = new Date(), fallbackDate }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt({ customers, employees, today }),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: transcript }],
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('API-Schlüssel ungültig');
    if (res.status === 429) throw new Error('zu viele Anfragen');
    throw new Error('HTTP ' + res.status);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('Anfrage abgelehnt');
  const block = (data.content || []).find((b) => b.type === 'text');
  if (!block) throw new Error('keine Antwort');
  const obj = JSON.parse(block.text);

  const byName = (list, name) => list.find((p) => p.name.toLowerCase() === String(name || '').toLowerCase());
  const freq = obj.repeat?.freq;
  return {
    dateKey: /^\d{4}-\d{2}-\d{2}$/.test(obj.date) ? obj.date : (fallbackDate || toKey(today)),
    time: /^\d{2}:\d{2}$/.test(obj.time) ? obj.time : '',
    endTime: /^\d{2}:\d{2}$/.test(obj.endTime) ? obj.endTime : '',
    text: String(obj.text || '').trim(),
    customerId: byName(customers, obj.customer)?.id || '',
    employeeIds: (obj.employees || []).map((n) => byName(employees, n)?.id).filter(Boolean),
    repeat: freq && freq !== 'none'
      ? { freq, interval: Math.max(1, obj.repeat.interval || 1), weekdays: (obj.repeat.weekdays || []).filter((d) => d >= 1 && d <= 7) }
      : null,
  };
}
