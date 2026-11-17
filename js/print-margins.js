// Spausdinant (PDF) naršyklė puslapio apačioje ir viršuje deda savo antraštę / poraštę (adresą, datą, pavadinimą).
// Jos rodomos puslapio paraštėje, todėl spausdinimo metu paraštę nustatome 0, o tuos tarpus sukuriame patys:
// kiekvieno lapo turinys įdedamas į lentelę, kurios viršutinė ir apatinė eilutės kartojamos kiekviename puslapyje.
// Jei kas nors nepavyktų, lieka įprastas elgesys (paraštės iš css/print.css).

const MARGINS = { portrait: { top: 12, bottom: 14, side: 12 }, landscape: { top: 10, bottom: 12, side: 12 } };
let wrapped = [], styleEl = null;

function wrapSheets() {
  for (const sheet of document.querySelectorAll('.sheet')) {
    if (sheet.querySelector(':scope > table.pg-wrap')) continue;
    const m = sheet.classList.contains('sheet-annual') ? MARGINS.landscape : MARGINS.portrait;
    const kids = [...sheet.childNodes];
    const t = document.createElement('table');
    t.className = 'pg-wrap';
    t.style.cssText = `width:100%;border-collapse:collapse;border:0;--pg-side:${m.side}mm`;
    t.innerHTML = `<thead><tr><td><div style="height:${m.top}mm"></div></td></tr></thead>
      <tbody><tr><td class="pg-body"></td></tr></tbody>
      <tfoot><tr><td><div style="height:${m.bottom}mm"></div></td></tr></tfoot>`;
    const body = t.querySelector('.pg-body');
    for (const k of kids) body.appendChild(k);
    sheet.appendChild(t);
    wrapped.push({ sheet, t, kids });
  }
}

function unwrapSheets() {
  for (const { sheet, t, kids } of wrapped) {
    for (const k of kids) sheet.insertBefore(k, t);
    t.remove();
  }
  wrapped = [];
}

function before() {
  if (!document.querySelector('.sheet')) return;
  try {
    styleEl = document.createElement('style');
    styleEl.textContent = '@page { size: A4; margin: 0 } @page annual { size: A4 landscape; margin: 0 } .pg-wrap td { padding: 0 var(--pg-side, 12mm); vertical-align: top }';
    document.head.appendChild(styleEl);
    wrapSheets();
  } catch (_) { after(); }
}
function after() {
  try { unwrapSheets(); } catch (_) { /* ignore */ }
  if (styleEl) { styleEl.remove(); styleEl = null; }
}

let on = false;
export function initPrintMargins() {
  if (on) return;
  on = true;
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
}
