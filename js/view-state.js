// Ansichts-Zustand (welcher Monat, welcher Mitarbeiter-Filter) – wird nicht gespeichert,
// außer dem Filter, den sich das Gerät merkt.

const FILTER_KEY = 'bgs_app_employee_filter';
const listeners = new Set();

const now = new Date();
export const view = {
  month: new Date(now.getFullYear(), now.getMonth(), 1),
  employeeFilter: readFilter(),
  flashKey: '',
};

function readFilter() {
  try { return localStorage.getItem(FILTER_KEY) || ''; } catch { return ''; }
}

export function setView(patch) {
  Object.assign(view, patch);
  if ('employeeFilter' in patch) {
    try { localStorage.setItem(FILTER_KEY, view.employeeFilter); } catch { /* egal */ }
  }
  listeners.forEach((fn) => fn());
}

export function onViewChange(fn) {
  listeners.add(fn);
}

export function shiftMonth(n) {
  setView({ month: new Date(view.month.getFullYear(), view.month.getMonth() + n, 1) });
}

export function goToDate(key) {
  const [y, m] = key.split('-').map(Number);
  setView({ month: new Date(y, m - 1, 1), flashKey: key });
}

// Gilt ein Auftrag für den aktuellen Filter?
export function visible(order) {
  if (!view.employeeFilter) return true;
  if (view.employeeFilter === '__none') return order.employeeIds.length === 0;
  return order.employeeIds.includes(view.employeeFilter);
}
