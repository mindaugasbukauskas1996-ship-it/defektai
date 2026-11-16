// Pranešimai programoje: varpelis su neperskaitytų skaičiumi, sąrašas, toast ir (jei leista) naršyklės pranešimas.
// Pranešimus kuria duomenų bazės trigeriai (paskyrimai, aktas paruoštas, ŠP pateiktas / grąžintas); čia tik rodoma.
// Fone (programa uždaryta) pranešimų nėra – tam reikėtų atskiro „push“ sprendimo.

import * as db from './data.js';
import { icon } from './icons.js';
import { esc, toast } from './util.js';

let timer = null, items = [], known = null, disabled = false, panel = false, isLogged = () => true;

const href = n => n.task_id ? `#/u/${n.task_id}` : n.hp_id ? `#/sp/${n.hp_id}` : '#/';
const ago = iso => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'ką tik' : m < 60 ? `prieš ${m} min.` : m < 1440 ? `prieš ${Math.round(m / 60)} val.` : new Date(iso).toLocaleDateString('lt-LT');
};

function mount() {
  let b = document.getElementById('bell');
  if (b) return b;
  const top = document.querySelector('.topbar');
  if (!top) return null;
  b = document.createElement('div');
  b.id = 'bell'; b.className = 'bell no-print';
  top.appendChild(b);
  b.addEventListener('click', e => {
    const it = e.target.closest('[data-n]');
    if (it) { markRead([it.dataset.n]); panel = false; return; }                      // nuoroda pati nuves į užduotį
    if (e.target.closest('[data-readall]')) { markRead(items.filter(x => !x.read_at).map(x => x.id)); return; }
    if (e.target.closest('[data-allow]')) { Notification.requestPermission().then(draw); return; }
    if (e.target.closest('.bell-btn')) { panel = !panel; draw(); }
  });
  // composedPath – nes paspaudus varpelį jo turinys perpiešiamas ir e.target jau nebe DOM medyje
  document.addEventListener('click', e => { if (panel && !e.composedPath().some(n => n && n.id === 'bell')) { panel = false; draw(); } });
  return b;
}

function draw() {
  const b = mount();
  if (!b) return;
  const unread = items.filter(x => !x.read_at).length;
  const canAsk = typeof Notification !== 'undefined' && Notification.permission === 'default';
  b.innerHTML = `<button type="button" class="bell-btn" aria-label="Pranešimai">${icon('bell')}${unread ? `<i class="bell-n">${unread > 9 ? '9+' : unread}</i>` : ''}</button>
    ${panel ? `<div class="bell-panel">
      <div class="bell-head"><b>Pranešimai</b>${unread ? '<button type="button" class="linkbtn" data-readall>Pažymėti visus perskaitytais</button>' : ''}</div>
      ${items.length ? items.map(n => `<a class="bell-item${n.read_at ? '' : ' unread'}" data-n="${esc(n.id)}" href="${esc(href(n))}"><span>${esc(n.text)}</span><small>${esc(ago(n.created_at))}</small></a>`).join('') : '<div class="muted small bell-empty">Pranešimų nėra.</div>'}
      ${canAsk ? '<button type="button" class="btn small" data-allow>Rodyti pranešimus ir telefono ekrane</button>' : ''}
    </div>` : ''}`;
}

async function markRead(ids) {
  items.forEach(x => { if (ids.includes(x.id)) x.read_at = new Date().toISOString(); });
  draw();
  try { await db.markNotificationsRead(ids); } catch (_) { /* bandysime kitą kartą */ }
}

async function poll() {
  if (disabled || !isLogged()) return;
  try {
    const list = await db.listNotifications(20);
    const fresh = known ? list.filter(n => !n.read_at && !known.has(n.id)) : [];
    known = new Set(list.map(n => n.id));
    items = list;
    draw();
    for (const n of fresh.slice(0, 3)) {
      toast(n.text, 'info', 7000);
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { (await navigator.serviceWorker.ready).showNotification('Mano BŪSTAS', { body: n.text, tag: n.id }); } catch (_) { /* ne visur palaikoma */ }
      }
    }
  } catch (e) {
    if (/relation|does not exist|schema cache|42P01|PGRST/i.test(String(e.message || e.code || e))) disabled = true;   // lentelės dar nėra – nerodome
  }
}

export function startNotify(loggedFn) {
  if (db.isDemo || timer) return;
  isLogged = loggedFn || isLogged;
  poll();
  timer = setInterval(poll, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}
