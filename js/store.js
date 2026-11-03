// Datenhaltung: ein einziger Zustand, der im Browser (localStorage) gespeichert wird.
//
// Auftrag:  { id, date, text, time, endTime, done, customerId, employeeIds[], seriesId }
// Kunde / Mitarbeiter: { id, name, color }
// Serie (wiederkehrend): siehe recurrence.js

const STATE_KEY = 'bgs_app_state_v3';
const API_KEY = 'bgs_app_api_key';
const SCHEMA_VERSION = 3;

export const COLORS = ['#128a9e', '#3eb49a', '#f2b01e', '#e2683c', '#8b5cf6',
  '#ec4899', '#0ea5e9', '#d97706', '#f43f5e', '#0d9488', '#64748b', '#65a30d'];

const listeners = new Set();

function emptyState() {
  return { version: SCHEMA_VERSION, orders: [], customers: [], employees: [], series: [] };
}

function normalizeOrder(o) {
  return {
    id: String(o.id ?? uid('o')),
    date: o.date,
    text: String(o.text ?? '').trim(),
    time: o.time || '',
    endTime: o.endTime || '',
    done: !!o.done,
    customerId: o.customerId || '',
    employeeIds: Array.isArray(o.employeeIds) ? o.employeeIds.map(String) : [],
    seriesId: o.seriesId || '',
  };
}

function normalizePerson(p, i) {
  return { id: String(p.id ?? uid('p')), name: String(p.name ?? '').trim(), color: p.color || COLORS[i % COLORS.length] };
}

function normalize(raw) {
  const s = { ...emptyState(), ...raw, version: SCHEMA_VERSION };
  s.orders = (s.orders || []).filter((o) => o && /^\d{4}-\d{2}-\d{2}$/.test(o.date)).map(normalizeOrder);
  s.customers = (s.customers || []).map(normalizePerson).filter((p) => p.name);
  s.employees = (s.employees || []).map(normalizePerson).filter((p) => p.name);
  s.series = s.series || [];
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.error('Daten konnten nicht geladen werden', err);
  }
  return emptyState();
}

export const state = load();

export function uid(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let saveError = null;
export function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    saveError = null;
  } catch (err) {
    saveError = err;
    console.error('Speichern fehlgeschlagen', err);
  }
  listeners.forEach((fn) => fn());
}
export const lastSaveError = () => saveError;

// Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf dem Handy)
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* nicht unterstützt */ }
}

// ---------- Aufträge ----------
export function ordersOn(dateKey) {
  return state.orders
    .filter((o) => o.date === dateKey)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.text.localeCompare(b.text));
}

export function addOrder(data) {
  const order = normalizeOrder({ ...data, id: uid('o') });
  if (!order.text) return null;
  state.orders.push(order);
  return order;
}

export function findOrder(id) {
  return state.orders.find((o) => o.id === id) || null;
}

export function updateOrder(id, patch) {
  const o = findOrder(id);
  if (o) Object.assign(o, patch);
  return o;
}

export function removeOrder(id) {
  state.orders = state.orders.filter((o) => o.id !== id);
}

// ---------- Kunden & Mitarbeiter ----------
const listOf = (kind) => (kind === 'employees' ? state.employees : state.customers);

export function findPerson(kind, id) {
  return listOf(kind).find((p) => p.id === id) || null;
}
export const findCustomer = (id) => findPerson('customers', id);
export const findEmployee = (id) => findPerson('employees', id);

export function addPerson(kind, name) {
  name = (name || '').trim();
  if (!name) return null;
  const list = listOf(kind);
  const existing = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const person = { id: uid(kind === 'employees' ? 'e' : 'c'), name, color: COLORS[list.length % COLORS.length] };
  list.push(person);
  return person;
}

export function removePerson(kind, id) {
  if (kind === 'employees') {
    state.employees = state.employees.filter((p) => p.id !== id);
    for (const o of state.orders) o.employeeIds = o.employeeIds.filter((e) => e !== id);
    for (const s of state.series) s.employeeIds = (s.employeeIds || []).filter((e) => e !== id);
  } else {
    state.customers = state.customers.filter((p) => p.id !== id);
  }
}

// ---------- KI-Schlüssel ----------
export const getApiKey = () => localStorage.getItem(API_KEY) || '';
export function setApiKey(key) {
  if (key) localStorage.setItem(API_KEY, key);
  else localStorage.removeItem(API_KEY);
}

// ---------- Sicherung / Import ----------
export function exportBackup() {
  return { format: 'bgs-app-backup', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: state };
}

// Nimmt eine Sicherung der neuen App oder einen Export der alten HTML-Version entgegen
// und ergänzt fehlende Einträge (vorhandene werden nicht überschrieben).
export function importData(file) {
  let incoming;
  if (file?.format === 'bgs-app-backup' && file.data) incoming = normalize(file.data);
  else if (file?.format === 'bgs-auftragsplaner-v2' || Array.isArray(file?.orders)) incoming = normalize(file);
  else throw new Error('Unbekanntes Dateiformat');

  const counts = { orders: 0, customers: 0, employees: 0, series: 0 };
  const idMap = { customers: {}, employees: {} };

  for (const kind of ['customers', 'employees']) {
    for (const p of incoming[kind]) {
      const byId = findPerson(kind, p.id);
      const byName = listOf(kind).find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (byId) continue;
      if (byName) { idMap[kind][p.id] = byName.id; continue; }
      listOf(kind).push(p);
      counts[kind]++;
    }
  }
  const mapCustomer = (id) => idMap.customers[id] || id;
  const mapEmployees = (ids) => (ids || []).map((id) => idMap.employees[id] || id);

  const seriesIds = new Set(state.series.map((s) => s.id));
  for (const s of incoming.series) {
    if (seriesIds.has(s.id)) continue;
    state.series.push({ ...s, customerId: mapCustomer(s.customerId), employeeIds: mapEmployees(s.employeeIds) });
    counts.series++;
  }
  const orderIds = new Set(state.orders.map((o) => o.id));
  for (const o of incoming.orders) {
    if (orderIds.has(o.id)) continue;
    state.orders.push({ ...o, customerId: mapCustomer(o.customerId), employeeIds: mapEmployees(o.employeeIds) });
    counts.orders++;
  }
  return counts;
}
