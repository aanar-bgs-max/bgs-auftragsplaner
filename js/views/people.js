// Verwaltung von Kunden bzw. Mitarbeitern (Name, Farbe, hinzufügen, löschen)
import { state, save, addPerson, removePerson } from '../store.js';
import { esc, modalHead, confirmAction } from '../ui.js';

const TEXT = {
  customers: { title: 'Kunden verwalten', placeholder: 'Neuer Kunde …', one: 'Kunde',
    deleteHint: 'Bestehende Aufträge bleiben, verlieren aber die Kundenfarbe.' },
  employees: { title: 'Mitarbeiter verwalten', placeholder: 'Neuer Mitarbeiter …', one: 'Mitarbeiter',
    deleteHint: 'Er wird aus allen Aufträgen ausgetragen.' },
};

export function peopleView(kind) {
  const t = TEXT[kind];
  return {
    render(el) {
      const list = state[kind];
      const rows = list.length
        ? list.map((p) => `<div class="person" data-id="${esc(p.id)}">
            <input type="color" value="${esc(p.color)}" title="Farbe wählen">
            <input class="input" type="text" value="${esc(p.name)}" aria-label="Name">
            <button class="del" title="Löschen">🗑</button>
          </div>`).join('')
        : `<div class="empty-note">Noch keine ${kind === 'customers' ? 'Kunden' : 'Mitarbeiter'} – unten hinzufügen.</div>`;
      el.innerHTML = modalHead(t.title, 'Name und Farbe lassen sich direkt ändern.', { back: true })
        + `<div>${rows}</div>
        <div class="add-row">
          <input class="input" id="pNew" type="text" placeholder="${t.placeholder}" autocomplete="off">
          <button class="btn" id="pAdd">Hinzufügen</button>
        </div>`;

      el.querySelectorAll('.person').forEach((row) => {
        const person = list.find((p) => p.id === row.dataset.id);
        row.querySelector('input[type=color]').addEventListener('change', (e) => { person.color = e.target.value; save(); });
        row.querySelector('input[type=text]').addEventListener('change', (e) => {
          const name = e.target.value.trim();
          if (name) person.name = name; else e.target.value = person.name;
          save();
        });
        row.querySelector('.del').onclick = async () => {
          if (await confirmAction(`${t.one} „${esc(person.name)}“ löschen?<br><span class="muted">${t.deleteHint}</span>`)) {
            removePerson(kind, person.id);
            save();
          }
        };
      });
      const input = el.querySelector('#pNew');
      const add = () => {
        if (addPerson(kind, input.value)) save();
        el.querySelector('#pNew')?.focus();
      };
      el.querySelector('#pAdd').onclick = add;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    },
  };
}
