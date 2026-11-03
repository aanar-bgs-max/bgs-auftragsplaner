// Einstellungen: KI-Modus, Kunden/Mitarbeiter, Sicherung & Import, App installieren
import { state, save, getApiKey, setApiKey, exportBackup, importData } from '../store.js';
import { extendAll } from '../recurrence.js';
import { todayKey } from '../dates.js';
import { esc, modalHead, openModal, refreshModal, toast } from '../ui.js';
import { peopleView } from './people.js';
import { APP_VERSION } from '../version.js';

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

export function settingsView({ onApiKeyChange }) {
  return {
    render(el) {
      const key = getApiKey();
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      el.innerHTML = modalHead('Einstellungen', `BGS Auftragsplaner · Version ${APP_VERSION}`)
        + `<div class="section">
          <h3>Kunden & Mitarbeiter</h3>
          <div class="desc">${state.customers.length} Kunden · ${state.employees.length} Mitarbeiter</div>
          <div class="btn-row">
            <button class="btn secondary" data-manage="customers">🏢 Kunden verwalten</button>
            <button class="btn secondary" data-manage="employees">👤 Mitarbeiter verwalten</button>
          </div>
        </div>

        <div class="section">
          <h3>KI-Sprachmodus <span class="badge ${key ? 'on' : 'off'}">${key ? 'an' : 'aus'}</span></h3>
          <div class="desc">Mit Schlüssel versteht die Spracheingabe auch komplizierte Sätze. Ohne Schlüssel arbeitet die
            Offline-Erkennung – kostenlos. Schlüssel gibt es unter
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>;
            er bleibt nur auf diesem Gerät gespeichert.</div>
          <div class="add-row">
            <input class="input" id="sKey" type="password" placeholder="Anthropic API-Schlüssel (sk-ant-…)" value="${esc(key)}" autocomplete="off">
            <button class="btn" id="sKeySave">Speichern</button>
          </div>
        </div>

        <div class="section">
          <h3>Daten sichern & übernehmen</h3>
          <div class="desc">Die Daten liegen nur auf diesem Gerät. Mach regelmäßig eine Sicherung –
            und nutze sie, um Daten auf ein anderes Gerät (z. B. Handy) zu übertragen.
            Hier kannst du auch den Export aus der alten Version importieren.</div>
          <div class="btn-row">
            <button class="btn green" id="sExport">⬇ Sicherung speichern</button>
            <button class="btn secondary" id="sImport">⬆ Daten importieren</button>
            <input type="file" id="sFile" accept=".json,application/json" hidden>
          </div>
          <div class="desc" style="margin-top:8px">${state.orders.length} Aufträge · ${state.series.length} wiederkehrende Serien gespeichert.</div>
        </div>

        <div class="section">
          <h3>Als App installieren</h3>
          <div class="desc">${standalone ? '✅ Läuft bereits als installierte App.'
            : 'Am PC: in Edge/Chrome oben in der Adressleiste auf „App installieren“. Am iPhone: Teilen → „Zum Home-Bildschirm“. Am Android-Handy: Menü ⋮ → „App installieren“.'}</div>
          ${installPrompt && !standalone ? '<button class="btn" id="sInstall">📲 Jetzt installieren</button>' : ''}
        </div>`;

      el.querySelectorAll('[data-manage]').forEach((b) => b.onclick = () => openModal(peopleView(b.dataset.manage)));

      el.querySelector('#sKeySave').onclick = () => {
        const value = el.querySelector('#sKey').value.trim();
        setApiKey(value);
        onApiKeyChange();
        toast(value ? '✅ KI-Modus aktiviert.' : 'ℹ️ KI-Modus aus – Offline-Erkennung ist aktiv.', 'ok');
        refreshModal();
      };

      el.querySelector('#sExport').onclick = () => {
        const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `BGS-Sicherung-${todayKey()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('✅ Sicherung gespeichert.', 'ok');
      };

      const fileInput = el.querySelector('#sFile');
      el.querySelector('#sImport').onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const counts = importData(JSON.parse(await file.text()));
          extendAll();
          save();
          toast(`✅ Importiert: ${counts.orders} Aufträge, ${counts.customers} Kunden, ${counts.employees} Mitarbeiter, ${counts.series} Serien.`, 'ok', 7000);
        } catch (err) {
          toast(`⚠️ Import fehlgeschlagen: ${esc(err.message)}`, 'warn', 7000);
        }
        fileInput.value = '';
      };

      el.querySelector('#sInstall')?.addEventListener('click', async () => {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        refreshModal();
      });
    },
  };
}
