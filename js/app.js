// Einstiegspunkt: verbindet Daten, Ansichten und Bedienelemente.
import { state, subscribe, save, getApiKey, lastSaveError, requestPersistentStorage } from './store.js';
import { extendAll } from './recurrence.js';
import { view, setView, onViewChange, shiftMonth } from './view-state.js';
import { $, esc, toast, initModals, openModal, refreshModal, isModalOpen } from './ui.js';
import { renderCalendar } from './views/calendar.js';
import { openDay } from './views/day.js';
import { settingsView } from './views/settings.js';
import { reportView } from './views/report.js';
import { initVoice } from './voice.js';

function renderEmployeeFilter() {
  const select = $('#employeeFilter');
  const options = [['', 'Alle'], ...state.employees.map((e) => [e.id, e.name]), ['__none', 'Nicht zugewiesen']];
  if (view.employeeFilter && !options.some(([id]) => id === view.employeeFilter)) view.employeeFilter = '';
  select.innerHTML = options.map(([id, name]) =>
    `<option value="${esc(id)}"${id === view.employeeFilter ? ' selected' : ''}>${esc(name)}</option>`).join('');
  select.closest('.filter').classList.toggle('active', !!view.employeeFilter);
  const emp = state.employees.find((e) => e.id === view.employeeFilter);
  $('#brandSub').textContent = emp ? `Plan von ${emp.name}` : view.employeeFilter ? 'Nicht zugewiesen' : 'Übersicht';
}

function renderAll() {
  renderEmployeeFilter();
  renderCalendar(openDay);
  if (isModalOpen()) refreshModal();
}

function refreshAiBadge() {
  $('#aiBadge').hidden = !getApiKey();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Nur nach einem Update neu laden, nicht beim allerersten Start
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('✨ Neue Version verfügbar.', 'ok', 15000, { label: 'Aktualisieren', run: () => worker.postMessage('skipWaiting') });
        }
      });
    });
  }).catch((err) => console.warn('Service Worker nicht registriert', err));
}

function init() {
  // Wiederkehrende Aufträge bis zum Horizont nachziehen
  if (extendAll() > 0) save();

  initModals();
  subscribe(() => {
    renderAll();
    if (lastSaveError()) toast('⚠️ Speichern fehlgeschlagen – Speicher voll? Bitte Sicherung erstellen.', 'warn', 8000);
  });
  onViewChange(() => renderCalendar(openDay));

  $('#prevBtn').onclick = () => shiftMonth(-1);
  $('#nextBtn').onclick = () => shiftMonth(1);
  $('#todayBtn').onclick = () => { const n = new Date(); setView({ month: new Date(n.getFullYear(), n.getMonth(), 1) }); };
  $('#employeeFilter').onchange = (e) => { setView({ employeeFilter: e.target.value }); renderEmployeeFilter(); };
  $('#settingsBtn').onclick = () => openModal(settingsView({ onApiKeyChange: refreshAiBadge }));
  $('#hoursBtn').onclick = () => openModal(reportView());

  // Wischen links/rechts wechselt den Monat (Handy)
  let touchX = null;
  $('#grid').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#grid').addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) shiftMonth(dx < 0 ? 1 : -1);
    touchX = null;
  });

  // Tastatur: Pfeile = Monat wechseln
  document.addEventListener('keydown', (e) => {
    if (isModalOpen() || e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') shiftMonth(-1);
    if (e.key === 'ArrowRight') shiftMonth(1);
  });

  initVoice([$('#micBtn'), $('#fabMic')]);
  refreshAiBadge();
  renderAll();
  registerServiceWorker();
  requestPersistentStorage();
}

init();
