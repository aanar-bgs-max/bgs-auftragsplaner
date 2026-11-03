// Spracheingabe: Mikrofon -> Text -> Auftrag (KI-Modus oder Offline-Erkennung)
import { state, save, addOrder, getApiKey, findCustomer, findEmployee } from './store.js';
import { analyze } from './parser.js';
import { analyzeWithAI } from './ai.js';
import { createSeries, describe } from './recurrence.js';
import { formatLong } from './dates.js';
import { goToDate } from './view-state.js';
import { esc, toast, topModal } from './ui.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function initVoice(buttons) {
  let recognition = null;
  let listening = false;

  const setListening = (on) => {
    listening = on;
    buttons.forEach((b) => b.classList.toggle('listening', on));
    const label = document.getElementById('micLabel');
    if (label) label.textContent = on ? 'Ich höre …' : 'Sprechen';
  };

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => handleTranscript(e.results[0][0].transcript);
    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      toast(`🎤 Mikrofon-Fehler (${esc(e.error)}) – bitte Mikrofon erlauben.`, 'warn');
    };
    recognition.onend = () => setListening(false);
  }

  const toggle = () => {
    if (!recognition) {
      toast('⚠️ Spracheingabe geht in Chrome, Edge oder Safari – dieser Browser kann es nicht.', 'warn');
      return;
    }
    if (listening) { recognition.stop(); return; }
    setListening(true);
    toast('🎤 Sprich jetzt – z. B. „Morgen von acht bis zwölf Treppenhaus bei Mainz plus, Ahmet“', '', 5600);
    try { recognition.start(); } catch { setListening(false); }
  };
  buttons.forEach((b) => b.addEventListener('click', toggle));
}

export async function handleTranscript(transcript) {
  // Ist gerade ein Tag offen, gilt er als Standard-Datum
  const fallbackDate = topModal()?.dayKey;
  const ctx = { customers: state.customers, employees: state.employees, today: new Date(), fallbackDate };
  const apiKey = getApiKey();
  let result;
  if (apiKey) {
    toast('🧠 Ich verstehe deinen Auftrag …', 'think', 15000);
    try {
      result = await analyzeWithAI(transcript, { ...ctx, apiKey });
    } catch (err) {
      toast(`⚠️ KI nicht erreichbar (${esc(err.message)}) – nutze Offline-Erkennung.`, 'warn');
      result = analyze(transcript, ctx);
    }
  } else {
    result = analyze(transcript, ctx);
  }

  if (!result.text) {
    toast(`🤔 Ich habe „${esc(transcript)}“ gehört, aber keine Aufgabe erkannt. Bitte nochmal.`, 'warn', 6000);
    return;
  }

  const fields = {
    text: result.text, time: result.time, endTime: result.endTime,
    customerId: result.customerId, employeeIds: result.employeeIds,
  };
  let where;
  if (result.repeat) {
    const series = createSeries(fields, result.repeat, result.dateKey);
    const first = state.orders.filter((o) => o.seriesId === series.id).map((o) => o.date).sort()[0] || result.dateKey;
    where = `↻ <b>${esc(describe(series))}</b>`;
    goToDate(first);
  } else {
    addOrder({ ...fields, date: result.dateKey });
    where = `am <b>${esc(formatLong(result.dateKey))}</b>`;
    goToDate(result.dateKey);
  }
  save();

  const time = result.time ? ` — ${esc(result.endTime ? `${result.time}–${result.endTime}` : result.time)} Uhr` : '';
  const customer = findCustomer(result.customerId);
  const emps = result.employeeIds.map(findEmployee).filter(Boolean).map((e) => e.name);
  toast(`✅ Eingetragen ${where}:<br>„${esc(result.text)}“${time}`
    + (customer ? ` · ${esc(customer.name)}` : '')
    + (emps.length ? ` · 👤 ${esc(emps.join(', '))}` : ''), 'ok', 6500);
}
