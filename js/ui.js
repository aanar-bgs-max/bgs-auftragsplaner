// Gemeinsame Oberflächen-Bausteine: Toast, Fenster-Stapel, Rückfrage-Dialog.

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function tint(hex, alpha = '22') {
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex + alpha : '#f1f5f9';
}

// ---------- Toast ----------
let toastTimer;
export function toast(html, type = '', ms = 4600, action) {
  const t = $('#toast');
  t.className = `toast show ${type}`;
  t.innerHTML = html;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { hideToast(); action.run(); };
    t.appendChild(b);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
const hideToast = () => { $('#toast').className = 'toast'; };

// ---------- Fenster ----------
// Fenster liegen auf einem Stapel: "Kunden verwalten" aus dem Tagesfenster heraus
// kehrt beim Schließen zum Tagesfenster zurück.
const stack = [];

export function openModal(view) {
  stack.push(view);
  showTop();
}

export function closeModal() {
  const view = stack.pop();
  view?.onClose?.();
  showTop();
}

export function closeAllModals() {
  while (stack.length) stack.pop().onClose?.();
  showTop();
}

export function refreshModal() {
  if (stack.length) stack[stack.length - 1].render($('#modal'));
}

export const isModalOpen = () => stack.length > 0;
export const topModal = () => stack[stack.length - 1] || null;

function showTop() {
  const overlay = $('#overlay');
  const modal = $('#modal');
  if (!stack.length) { overlay.hidden = true; modal.innerHTML = ''; return; }
  const view = stack[stack.length - 1];
  modal.className = 'modal' + (view.wide ? ' wide' : '');
  overlay.hidden = false;
  view.render(modal);
  modal.scrollTop = 0;
}

export function modalHead(title, sub = '', { back = false } = {}) {
  return `${back ? '<button class="back-btn no-print" data-action="back">‹ Zurück</button>' : ''}
    <div class="modal-head">
      <div><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <button class="close-x" data-action="close" aria-label="Schließen">×</button>
    </div>`;
}

export function initModals() {
  const overlay = $('#overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'back') closeModal();
    if (action === 'close') closeAllModals();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#dialogOverlay').hidden) return; // Dialog behandelt Escape selbst
    if (stack.length) closeModal();
  });
}

// ---------- Rückfrage ----------
// choose('Frage', [{label, value, style}]) -> Promise<value | null>
export function choose(text, options) {
  const overlay = $('#dialogOverlay');
  const box = $('#dialog');
  box.innerHTML = `<div class="dialog-text">${text}</div><div class="dialog-buttons"></div>`;
  const buttons = box.querySelector('.dialog-buttons');
  return new Promise((resolve) => {
    const finish = (value) => {
      overlay.hidden = true;
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(null); } };
    for (const opt of [...options, { label: 'Abbrechen', value: null, style: 'secondary' }]) {
      const b = document.createElement('button');
      b.className = `btn ${opt.style || ''}`;
      b.textContent = opt.label;
      b.onclick = () => finish(opt.value);
      buttons.appendChild(b);
    }
    overlay.onclick = (e) => { if (e.target === overlay) finish(null); };
    document.addEventListener('keydown', onKey, true);
    overlay.hidden = false;
    buttons.firstChild.focus();
  });
}

export async function confirmAction(text, label = 'Löschen') {
  return (await choose(text, [{ label, value: true, style: 'danger' }])) === true;
}
