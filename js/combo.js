// Išskleidžiamas sąrašas po laukeliu (vietoj naršyklės datalist, kuris telefone rodomas klaviatūros juostoje).
// getItems() grąžina [{ value, label? }]; pasirinkus įrašoma reikšmė ir iššaukiami input / change įvykiai.

import { esc } from './util.js';

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function combo(input, getItems, { max = 200 } = {}) {
  if (!input || input._combo) return;
  input._combo = true;
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.spellcheck = false;

  const host = input.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const menu = document.createElement('div');
  menu.className = 'cb-menu';
  menu.hidden = true;
  host.appendChild(menu);

  let shown = [], idx = -1, total = 0;

  const close = () => { menu.hidden = true; idx = -1; };
  const place = () => {
    menu.style.top = (input.offsetTop + input.offsetHeight + 2) + 'px';
    menu.style.left = input.offsetLeft + 'px';
    menu.style.width = input.offsetWidth + 'px';
  };
  const mark = () => menu.querySelectorAll('.cb-item').forEach((c, i) => {
    c.classList.toggle('on', i === idx);
    if (i === idx) c.scrollIntoView({ block: 'nearest' });
  });
  const pick = i => {
    const it = shown[i];
    if (!it) return;
    input.value = it.value;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const open = () => {
    const toks = norm(input.value).split(' ').filter(Boolean);
    const all = getItems() || [];
    const found = all.filter(it => {
      const hay = norm(it.value + ' ' + (it.label || ''));
      return toks.every(t => hay.includes(t));
    });
    total = found.length;
    shown = found.slice(0, max);
    // vienintelis atitikmuo, sutampantis su įvesta reikšme – sąrašo nerodome
    if (!shown.length || (shown.length === 1 && norm(shown[0].value) === norm(input.value))) return close();
    menu.innerHTML = (shown.length > 3 ? `<div class="cb-count">Rasta ${total} – slinkite žemyn</div>` : '') + shown.map((it, i) => `<div class="cb-item" data-i="${i}"><b>${esc(it.value)}</b>${it.label ? `<span>${esc(it.label)}</span>` : ''}</div>`).join('');
    place(); menu.hidden = false; idx = -1;
  };

  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('blur', () => setTimeout(close, 300));
  input.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, shown.length - 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && idx >= 0) { pick(idx); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  // kompiuteryje – mousedown neatima fokuso; pasirenkama paspaudimu (ne prisilietimu), kad telefone būtų galima slinkti
  menu.addEventListener('mousedown', e => e.preventDefault());
  menu.addEventListener('click', e => {
    const row = e.target.closest('.cb-item');
    if (row) pick(+row.dataset.i);
  });
}
