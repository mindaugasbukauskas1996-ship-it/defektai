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

// ---------------------------------------------------------------------
// Adresai ir CSV (objektų bei laiptinių kodų importui)
// ---------------------------------------------------------------------

/** Palyginimo raktas: be diakritikų, tarpų ir skyrybos („Vytauto g.“ → „vytautog“). */
export function normKey(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

/** „Gintaro Įlankos g.   14, Neringa“ → { address, street, house, city }. */
export function splitAddress(raw) {
  const clean = String(raw || '').replace(/\s+/g, ' ').trim();
  // „Gatvė NR, Miestas“ arba „Gatvė NR, Kaimas, Seniūnija, Rajonas“ – miestas / gyvenvietė yra po pirmo kablelio
  const i = clean.indexOf(',');
  const city = i >= 0 ? clean.slice(i + 1).split(',')[0].trim() : '';
  const left = (i >= 0 ? clean.slice(0, i) : clean).trim();
  const m = /^(.*\S)\s+(\d[\w\/\-]*(?:\s+[A-Za-z]\d+)?)$/.exec(left);   // „14C“, „10 K1“
  return { address: clean, city, street: m ? m[1] : left, house: m ? m[2] : '' };
}

/** Skaičius iš CSV langelio („1 234,5“ → 1234.5), tuščia → null. */
export function parseNum(v) {
  const s = String(v ?? '').replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** Paprastas CSV skaitytuvas su kabutėmis. Skirtukas nustatomas automatiškai (; arba ,). */
export function parseCsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const head = text.split(/\r?\n/, 1)[0] || '';
  const delim = (head.match(/;/g) || []).length >= (head.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

/** Failo turinys kaip tekstas: UTF-8, o jei sugadinta – Windows-1257 (Excel CSV). */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  const t = new TextDecoder('utf-8').decode(buf);
  return t.includes('\uFFFD') ? new TextDecoder('windows-1257').decode(buf) : t;
}

/** Trumpa pastato santrauka rodymui: „blokinis · 1985 m. · 60 butų · stogas: plokščias, bitumas“. */
export function buildingSummary(o) {
  if (!o) return '';
  const roof = [o.roof_type, o.roof_cover].filter(Boolean).join(', ');
  return [
    o.construction, o.built_year ? `${o.built_year} m.` : '', o.floors ? `${o.floors} aukšt.` : '', o.apartments ? `${o.apartments} butai` : '',
    o.stairwells ? `${o.stairwells} laipt.` : '', o.usable_area ? `naud. plotas ${o.usable_area} m²` : '',
    roof ? `stogas: ${roof}` : '', o.roof_area ? `stogo plotas ${o.roof_area} m²` : '',
    o.roof_condition ? `stogo būklė: ${o.roof_condition}` : '', o.heat_point ? `šilumos punktas: ${o.heat_point}` : ''
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------
// Pranešimai (importas iš sistemos eksporto)
// ---------------------------------------------------------------------

/**
 * Pranešimų CSV (be antraštės, skirtukas „;“). Aprašymai gali turėti eilučių lūžių ir „;“, todėl įrašai
 * atskiriami pagal pradžią „V26-0000000;YYYY-MM-DD HH:MM;“, o aprašymas imamas tarp 8 pirmųjų ir 17 paskutinių laukų.
 */
export function parseReports(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const recs = text.split(/\r?\n+(?=V\d\d-\d+(?:-\d+)?;\d{4}-\d\d-\d\d \d\d:\d\d;)/);
  const out = [];
  for (const rec of recs) {
    const p = rec.replace(/[\r\n\s]+$/, '').split(';');
    if (p.length < 26 || !/^V\d\d-/.test(p[0].trim())) continue;
    const t = p.slice(-17);
    out.push({
      reg_no: p[0].trim(), date: p[1].trim(), address: p[2], report_type: p[3], department: p[4], service_type: p[5],
      description: p.slice(8, p.length - 17).join(';').trim(),
      status: t[0], priority_code: t[3], engineer: t[4], manager: t[5], order_type: t[6], apartment: t[7],
      work_label: t[8], act_type: t[9], city: t[10], reporter: t[11], property_type: t[14], contact: t[16]
    });
  }
  return out;
}

/** Pirmas telefono numeris iš teksto (+370... arba 86...). */
export function extractPhone(s) {
  const m = /(\+?370[\s-]?\d[\d\s-]{6,}\d|\b8[\s-]?6\d{2}[\s-]?\d{5}\b)/.exec(String(s || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/** Trumpas problemos aprašas iš pranešimo teksto (pirmas sakinys be pasisveikinimo, iki ~140 simbolių). */
export function shortProblem(desc, fallback = '') {
  let clean = String(desc || '').replace(/\s+/g, ' ').trim()
    .replace(/^(laba diena|labas rytas|labas vakaras|labas|sveiki|sveikas|geros dienos)[\s,.!]*/i, '');
  if (!clean) return fallback;
  // sakinio pabaiga: ≥3 raidės + . ! ? ir didžioji raidė toliau (kad „g.“, „pr.“ neskaidytų)
  const first = clean.split(/(?<=[A-Za-ząčęėįšųūžĄČĘĖĮŠŲŪŽ]{3,}[.!?])\s+(?=[A-ZĄČĘĖĮŠŲŪŽ])/)[0] || clean;
  const out = first.charAt(0).toUpperCase() + first.slice(1);
  return out.length > 140 ? out.slice(0, 137).trimEnd() + '…' : out;
}