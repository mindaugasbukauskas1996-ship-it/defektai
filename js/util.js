// Pagalbinės funkcijos

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function nl2br(v) { return esc(v).replace(/\n/g, '<br>'); }

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return `${fmtDate(d.toISOString())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtQty(q) {
  if (q === null || q === undefined || q === '') return '';
  const n = Number(q);
  if (isNaN(n)) return esc(q);
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function parseQty(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function debounce(fn, ms = 800) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  return d;
}

let toastTimer;
export function toast(msg, type = 'info', ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, ms);
}

export function confirmDialog(message, okText = 'Taip', cancelText = 'Atšaukti') {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal small" role="dialog" aria-modal="true">
      <p class="modal-msg">${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn ghost" data-r="0">${esc(cancelText)}</button>
        <button class="btn danger" data-r="1">${esc(okText)}</button>
      </div></div>`;
    wrap.addEventListener('click', e => {
      const r = e.target.closest('[data-r]');
      if (r || e.target === wrap) {
        wrap.remove();
        resolve(r ? r.dataset.r === '1' : false);
      }
    });
    root.appendChild(wrap);
  });
}

// Statusai ir prioritetai
export const STATUSES = [
  { id: 'nauja', label: 'Nauja' },
  { id: 'planuota', label: 'Suplanuota' },
  { id: 'apziureta', label: 'Apžiūrėta' },
  { id: 'aktas', label: 'Aktas paruoštas' },
  { id: 'baigta', label: 'Baigta' }
];
export const statusLabel = id => (STATUSES.find(s => s.id === id) || { label: id || '' }).label;

export const PRIORITIES = [
  { id: 'skubus', label: 'Skubus' },
  { id: 'iprastas', label: 'Įprastas' },
  { id: 'zemas', label: 'Žemas' }
];
export const priorityLabel = id => (PRIORITIES.find(s => s.id === id) || { label: id || '' }).label;

export const PURPOSES = ['Neeilinė', 'Kasmetinė', 'Kita papildoma'];

// Nuotraukos sumažinimas prieš įkeliant (taupo vietą ir DI kainą)
export async function processImage(file, maxSide = 1800, quality = 0.84) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = bmp.width, h0 = bmp.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
  return { blob, width: w, height: h };
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export function telHref(phone) {
  return 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
}

export function mapsHref(address, city) {
  const q = [address, city].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
