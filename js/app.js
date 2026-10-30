// =====================================================================
// Programėlės branduolys: maršrutai, prisijungimas, užduočių sąrašas,
// užduoties forma ir nustatymai.
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import {
  $, $$, esc, toast, confirmDialog, today, fmtDate, STATUSES, statusLabel,
  PRIORITIES, priorityLabel
} from './util.js';
import { renderTask } from './task.js';
import { renderPrint } from './print.js';

const view = () => document.getElementById('view');
let user = null;
let listFilter = { status: 'aktyvios', q: '' };

// ---------------------------------------------------------------------
// Paleidimas
// ---------------------------------------------------------------------

async function start() {
  try {
    await db.init();
  } catch (e) {
    view().innerHTML = `<div class="card error">Nepavyko prisijungti prie duomenų bazės: ${esc(e.message)}</div>`;
    return;
  }
  if (db.isDemo) document.body.classList.add('demo');
  user = await db.getUser();
  db.onAuthChange(u => { const was = !!user; user = u; if (was !== !!u) route(); });
  window.addEventListener('hashchange', route);
  renderShell();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function renderShell() {
  $('#nav-top').innerHTML = `
    <a href="#/" data-nav="list">${icon('list')}<span>Užduotys</span></a>
    <a href="#/nauja" data-nav="new">${icon('plus')}<span>Nauja</span></a>
    <a href="#/neatiktis" data-nav="nc">${icon('alert')}<span>Neatiktis</span></a>
    <a href="#/nustatymai" data-nav="settings">${icon('settings')}<span>Nustatymai</span></a>`;
  $('#nav-bottom').innerHTML = $('#nav-top').innerHTML;
  $('#demo-banner').innerHTML = db.isDemo
    ? 'DEMO režimas – duomenys saugomi tik šioje naršyklėje. Prijunkite Supabase (žr. README).' : '';
}

function setActiveNav(name) {
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
}

export function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  document.body.classList.remove('print-mode');
  document.title = 'Defektų aktai';
  window.scrollTo(0, 0);

  if (!user && !db.isDemo) { setActiveNav(''); return renderLogin(); }
  document.body.classList.toggle('logged', true);

  try {
    if (parts[0] === 'nauja') { setActiveNav('new'); return await renderTaskForm(null); }
    if (parts[0] === 'neatiktis') { setActiveNav('nc'); return await renderTaskForm(null, 'nonconformity'); }
    if (parts[0] === 'nustatymai') { setActiveNav('settings'); return await renderSettings(); }
    if (parts[0] === 'u' && parts[1]) {
      setActiveNav('list');
      if (parts[2] === 'redaguoti') return await renderTaskForm(parts[1]);
      return await renderTask(view(), parts[1], parts[2] || 'info');
    }
    if (parts[0] === 'spausdinti' && parts[1]) {
      document.body.classList.add('print-mode');
      return await renderPrint(view(), parts[1], parts[2] || 'defect');
    }
    setActiveNav('list');
    return await renderList();
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="card error"><b>Klaida:</b> ${esc(e.message || e)}</div>`;
  }
}

// ---------------------------------------------------------------------
// Prisijungimas
// ---------------------------------------------------------------------

function renderLogin() {
  document.body.classList.remove('logged');
  view().innerHTML = `
    <div class="login card">
      <h1>Defektų aktai</h1>
      <p class="muted">Prisijunkite savo paskyra</p>
      <form id="login-form">
        <label>El. paštas<input type="email" name="email" autocomplete="username" required></label>
        <label>Slaptažodis<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary block" type="submit">Prisijungti</button>
      </form>
    </div>`;
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Jungiamasi...';
    try {
      await db.signIn(f.get('email'), f.get('password'));
      user = await db.getUser();
      route();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Prisijungti';
    }
  });
}

// ---------------------------------------------------------------------
// Užduočių sąrašas
// ---------------------------------------------------------------------

const PRIO_ORDER = { skubus: 0, iprastas: 1, zemas: 2 };
const STATUS_ORDER = { nauja: 0, planuota: 1, apziureta: 2, aktas: 3, baigta: 4 };

async function renderList() {
  view().innerHTML = `<div class="loading">Kraunama...</div>`;
  const tasks = await db.listTasks();
  const chips = [{ id: 'aktyvios', label: 'Aktyvios' }, ...STATUSES, { id: 'neatiktys', label: 'Neatiktys' }, { id: 'visos', label: 'Visos' }];

  const counts = {};
  tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  counts.aktyvios = tasks.filter(t => t.status !== 'baigta').length;
  counts.neatiktys = tasks.filter(t => t.kind === 'nonconformity').length;
  counts.visos = tasks.length;

  view().innerHTML = `
    <div class="page-head">
      <h1>Užduotys</h1>
      <span class="head-btns hide-mobile">
        <a class="btn" href="#/neatiktis">${icon('alert')} Nauja neatiktis</a>
        <a class="btn primary" href="#/nauja">${icon('plus')} Nauja užduotis</a>
      </span>
    </div>
    <div class="list-tools">
      <div class="search">${icon('search')}<input id="q" type="search" placeholder="Ieškoti: adresas, problema, telefonas..." value="${esc(listFilter.q)}"></div>
      <div class="chips" id="chips">
        ${chips.map(c => `<button class="chip ${listFilter.status === c.id ? 'on' : ''}" data-st="${c.id}">${esc(c.label)} <span>${counts[c.id] || 0}</span></button>`).join('')}
      </div>
    </div>
    <div id="task-list" class="task-list"></div>`;

  const draw = () => {
    const q = listFilter.q.trim().toLowerCase();
    let arr = tasks.filter(t => {
      if (listFilter.status === 'aktyvios' && t.status === 'baigta') return false;
      if (listFilter.status === 'neatiktys' && t.kind !== 'nonconformity') return false;
      if (!['aktyvios', 'visos', 'neatiktys'].includes(listFilter.status) && t.status !== listFilter.status) return false;
      if (!q) return true;
      return [t.address, t.city, t.problem, t.contact_name, t.contact_phone, t.stairwell, t.act_number, t.service_type, t.contractor]
        .some(v => v && String(v).toLowerCase().includes(q));
    });
    arr.sort((a, b) =>
      (STATUS_ORDER[a.status] === 4) - (STATUS_ORDER[b.status] === 4) ||
      (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1) ||
      String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) ||
      String(b.created_at).localeCompare(String(a.created_at)));

    const el = $('#task-list');
    if (!arr.length) {
      el.innerHTML = `<div class="empty card">${tasks.length ? 'Pagal filtrą užduočių nėra.' :
        'Užduočių dar nėra. <a href="#/nauja">Sukurkite pirmąją užduotį</a>.'}</div>`;
      return;
    }
    const overdue = d => d && d < today();
    el.innerHTML = arr.map(t => `
      <a class="task-card st-${esc(t.status)}" href="#/u/${t.id}">
        <div class="tc-main">
          <div class="tc-addr">${esc(t.address || '(be adreso)')}${t.city ? `, ${esc(t.city)}` : ''}
            ${t.kind === 'nonconformity' ? `<span class="tag nc">${icon('alert')} Neatiktis</span>` : ''}
            ${t.stairwell ? `<span class="tag">${esc(t.stairwell)} laipt.</span>` : ''}
            ${t.apartment ? `<span class="tag">bt. ${esc(t.apartment)}</span>` : ''}
          </div>
          <div class="tc-problem">${esc(t.problem || 'Problema neaprašyta')}</div>
          <div class="tc-meta">
            ${t.contractor ? `<span>Rangovas: ${esc(t.contractor)}</span>` : ''}
            ${t.service_type ? `<span>${esc(t.service_type)}</span>` : ''}
            ${t.contact_name || t.contact_phone ? `<span>${esc([t.contact_name, t.contact_phone].filter(Boolean).join(' · '))}</span>` : ''}
            ${t.act_number ? `<span>Aktas ${esc(t.act_number)}</span>` : ''}
          </div>
        </div>
        <div class="tc-side">
          <span class="badge st-${esc(t.status)}">${esc(statusLabel(t.status))}</span>
          ${t.priority === 'skubus' ? `<span class="badge prio">Skubus</span>` : ''}
          ${t.due_date ? `<span class="due ${overdue(t.due_date) && t.status !== 'baigta' ? 'late' : ''}">iki ${esc(fmtDate(t.due_date))}</span>` : ''}
        </div>
      </a>`).join('');
  };
  draw();

  $('#q').addEventListener('input', e => { listFilter.q = e.target.value; draw(); });
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    listFilter.status = b.dataset.st;
    $$('#chips .chip').forEach(c => c.classList.toggle('on', c === b));
    draw();
  });
}

// ---------------------------------------------------------------------
// Užduoties forma (nauja / redagavimas)
// ---------------------------------------------------------------------

async function renderTaskForm(id, kind = 'defect') {
  const s = await db.getSettings();
  const t = id ? await db.getTask(id) : { city: s.city, priority: 'iprastas', status: 'nauja', kind };
  if (id && !t) throw new Error('Užduotis nerasta');
  if (t.kind === 'nonconformity') return renderNcForm(id, t, s);

  const opt = (list, val) => list.map(o => {
    const v = typeof o === 'string' ? o : o.id;
    const l = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('');
  const services = s.service_types.includes(t.service_type) || !t.service_type
    ? s.service_types : [...s.service_types, t.service_type];

  view().innerHTML = `
    <div class="page-head">
      <a class="btn ghost" href="${id ? `#/u/${id}` : '#/'}">${icon('back')} Atgal</a>
      <h1>${id ? 'Redaguoti užduotį' : 'Nauja užduotis'}</h1>
    </div>

    <div class="card ai-fill">
      <div class="card-title">${icon('spark')} Greitas užpildymas su DI</div>
      <p class="muted small">Įklijuokite gyventojo laišką ar vadybininko pranešimą – DI užpildys adresą, telefoną, problemą ir kt.</p>
      <textarea id="raw-msg" rows="4" placeholder="Sveiki, Taikos pr. 55-103, Klaipėda. Vakar per lietų laiptinėje per elektros skydinę bėgo vanduo...">${esc(id ? '' : '')}</textarea>
      <button class="btn" id="btn-parse" type="button">${icon('spark')} Užpildyti laukus</button>
    </div>

    <form id="task-form" class="card form-grid">
      <label class="span2">Adresas *<input name="address" required value="${esc(t.address)}" placeholder="Taikos pr. 55"></label>
      <label>Miestas<input name="city" value="${esc(t.city)}"></label>
      <label>Laiptinė<input name="stairwell" value="${esc(t.stairwell)}" placeholder="7"></label>
      <label>Butas<input name="apartment" value="${esc(t.apartment)}"></label>
      <label>Laiptinės kodas<input name="entry_code" value="${esc(t.entry_code)}" placeholder="pvz. 1234#"></label>
      <label>Kontaktinis asmuo<input name="contact_name" value="${esc(t.contact_name)}"></label>
      <label>Telefonas<input name="contact_phone" type="tel" value="${esc(t.contact_phone)}" placeholder="+370..."></label>
      <label class="span2">Paslauga / sritis<select name="service_type"><option value="">— pasirinkite —</option>${opt(services, t.service_type)}</select></label>
      <label>Prioritetas<select name="priority">${opt(PRIORITIES, t.priority)}</select></label>
      <label>Atlikti iki<input name="due_date" type="date" value="${esc(fmtDate(t.due_date))}"></label>
      ${id ? `<label>Būsena<select name="status">${opt(STATUSES, t.status)}</select></label>` : ''}
      <label class="${id ? '' : 'span2'}">Pastatų administravimo vadybininkas<input name="manager" value="${esc(t.manager)}" placeholder="V. Pavardė, tel."></label>
      <label class="span4">Problema (trumpai) *<input name="problem" required value="${esc(t.problem)}" placeholder="Pratekėjimas per lietų į 7 laiptinės el. skydinę"></label>
      <label class="span4">Pranešimo tekstas / aprašymas<textarea name="description" rows="5">${esc(t.description)}</textarea></label>
      <div class="span4 form-actions">
        <a class="btn ghost" href="${id ? `#/u/${id}` : '#/'}">Atšaukti</a>
        <button class="btn primary" type="submit">${icon('check')} Išsaugoti</button>
      </div>
    </form>`;

  const form = $('#task-form');

  $('#btn-parse').addEventListener('click', async () => {
    const text = $('#raw-msg').value.trim();
    if (!text) return toast('Pirmiausia įklijuokite pranešimą', 'error');
    const btn = $('#btn-parse');
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> DI skaito...`;
    try {
      const r = await db.ai('parse_task', { text, service_types: s.service_types });
      let n = 0;
      for (const [k, v] of Object.entries(r || {})) {
        const inp = form.elements[k];
        if (!inp || !v) continue;
        if (inp.tagName === 'SELECT' && ![...inp.options].some(o => o.value === v)) continue;
        if (!inp.value || ['problem', 'priority', 'city'].includes(k)) { inp.value = v; n++; inp.classList.add('flash'); }
      }
      if (!form.elements.description.value) form.elements.description.value = text;
      toast(`Užpildyta laukų: ${n}. Patikrinkite.`, 'ok');
    } catch (e) {
      toast(e.message, 'error', 6000);
    } finally {
      btn.disabled = false; btn.innerHTML = `${icon('spark')} Užpildyti laukus`;
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    for (const k of Object.keys(data)) if (data[k] === '') data[k] = null;
    data.address = data.address || '';
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const saved = id ? await db.updateTask(id, data) : await db.createTask(data);
      toast('Išsaugota', 'ok');
      go(`#/u/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Neatikties forma (nauja / redagavimas)
// ---------------------------------------------------------------------

function renderNcForm(id, t, s) {
  const back = id ? `#/u/${id}` : '#/';
  view().innerHTML = `
    <div class="page-head">
      <a class="btn ghost" href="${back}">${icon('back')} Atgal</a>
      <h1>${id ? 'Redaguoti neatiktį' : 'Nauja neatiktis'}</h1>
    </div>
    <form id="task-form" class="card form-grid">
      <label class="span2">Objekto adresas *<input name="address" required value="${esc(t.address)}" placeholder="Taikos pr. 55"></label>
      <label>Miestas<input name="city" value="${esc(t.city)}"></label>
      <label>Laiptinė<input name="stairwell" value="${esc(t.stairwell)}"></label>
      <label class="span2">Rangovas *<input name="contractor" required value="${esc(t.contractor)}" placeholder="UAB „Statyba“"></label>
      <label class="span2">Kokius darbus atlieka<input name="service_type" list="nc-works" value="${esc(t.service_type)}" placeholder="Stogo dangos remontas">
        <datalist id="nc-works">${s.service_types.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label>Pašalinti iki<input name="due_date" type="date" value="${esc(fmtDate(t.due_date))}"></label>
      ${id ? `<label>Būsena<select name="status">${STATUSES.map(o => `<option value="${o.id}" ${o.id === t.status ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>` : ''}
      <label class="span4">Neatikties santrauka (galima palikti tuščią – DI parašys)<input name="problem" value="${esc(t.problem)}" placeholder="Neteisingai sumontuota įlaja"></label>
      <label class="span4">Papildoma informacija<textarea name="description" rows="3">${esc(t.description)}</textarea></label>
      <input type="hidden" name="kind" value="nonconformity">
      <div class="span4 form-actions">
        <a class="btn ghost" href="${back}">Atšaukti</a>
        <button class="btn primary" type="submit">${icon('check')} ${id ? 'Išsaugoti' : 'Toliau – nuotraukos'}</button>
      </div>
    </form>`;

  const form = $('#task-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    for (const k of Object.keys(data)) if (data[k] === '') data[k] = null;
    data.address = data.address || '';
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const saved = id ? await db.updateTask(id, data) : await db.createTask(data);
      toast('Išsaugota', 'ok');
      go(id ? `#/u/${saved.id}` : `#/u/${saved.id}/foto`);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Nustatymai
// ---------------------------------------------------------------------

async function renderSettings() {
  const s = await db.getSettings(true);
  const comm = (s.commission || []).concat([{ position: '', name: '' }]).slice(0, 4);

  view().innerHTML = `
    <div class="page-head"><h1>Nustatymai</h1>
      ${db.isDemo ? '' : `<button class="btn ghost" id="btn-logout">${icon('logout')} Atsijungti</button>`}
    </div>
    <form id="set-form">
      <div class="card form-grid">
        <div class="card-title span4">Akto rengėjas ir organizacija</div>
        <label class="span2">Vardas, pavardė<input name="engineer_name" value="${esc(s.engineer_name)}"></label>
        <label>Pareigos<input name="engineer_position" value="${esc(s.engineer_position)}"></label>
        <label>Telefonas<input name="engineer_phone" value="${esc(s.engineer_phone)}"></label>
        <label class="span2">Organizacija (akto viršuje)<input name="org_name" value="${esc(s.org_name)}"></label>
        <label class="span2">Užsakovas (numatomų darbų akte)<input name="customer_name" value="${esc(s.customer_name)}"></label>
        <label>Sudarymo vieta (miestas)<input name="city" value="${esc(s.city)}"></label>
        <label>Formos kodas<input name="form_code" value="${esc(s.form_code)}"></label>
        <label>Skyrius<input name="department" value="${esc(s.department)}"></label>
        <label>Akto Nr. prefiksas<input name="act_prefix" value="${esc(s.act_prefix)}"></label>
        <label>Kitas akto Nr.<input name="next_act_no" type="number" min="1" value="${esc(s.next_act_no)}"></label>
        <label>Neatikties akto Nr. prefiksas<input name="nc_prefix" value="${esc(s.nc_prefix)}"></label>
        <label>Kitas neatikties akto Nr.<input name="next_nc_no" type="number" min="1" value="${esc(s.next_nc_no)}"></label>
        <div class="span4 sig-row">
          <div>
            <div class="lbl">Parašas / spaudas (PNG, nebūtina)</div>
            <input type="file" id="sig-file" accept="image/*">
            ${s.signature ? `<button class="btn ghost small" type="button" id="sig-del">Pašalinti</button>` : ''}
          </div>
          <div class="sig-prev">${s.signature ? `<img src="${s.signature}" alt="parašas">` : '<span class="muted small">nėra</span>'}</div>
        </div>
      </div>

      <div class="card form-grid">
        <div class="card-title span4">Komisijos nariai (parašų eilutės defektavimo akte)</div>
        <p class="muted small span4">Pirmoji eilutė visada – akto rengėjas. Čia įrašykite kitus narius (neprivaloma, tuščios eilutės paliekamos pasirašymui ranka).</p>
        ${comm.map((c, i) => `
          <label class="span2">Pareigos<input name="cpos_${i}" value="${esc(c.position)}"></label>
          <label class="span2">Vardas, pavardė<input name="cname_${i}" value="${esc(c.name)}"></label>`).join('')}
      </div>

      <div class="card form-grid">
        <div class="card-title span4">Tekstai ir sąrašai</div>
        <label class="span4">Komisijos išvados tekstas (defektavimo akte)<textarea name="conclusion_text" rows="6">${esc(s.conclusion_text)}</textarea></label>
        <label class="span4">Pastaba po numatomų darbų lentele<input name="works_note" value="${esc(s.works_note)}"></label>
        <label class="span4">Paslaugos / darbų sritys (po vieną eilutėje)<textarea name="service_types" rows="9">${esc((s.service_types || []).join('\n'))}</textarea></label>
      </div>

      ${db.isDemo ? `
      <div class="card form-grid">
        <div class="card-title span4">${icon('key')} Demo režimas: DI testavimui</div>
        <p class="muted small span4">Tik bandymui savo kompiuteryje. Raktas saugomas tik šioje naršyklėje. Tikrame diegime raktas laikomas Supabase paslaptyse ir čia nevedamas.</p>
        <label class="span3">Anthropic API raktas<input name="demo_api_key" type="password" value="${esc(s.demo_api_key)}" placeholder="sk-ant-..."></label>
        <label>Modelis<input name="demo_model" value="${esc(s.demo_model || '')}" placeholder="claude-sonnet-5-5"></label>
      </div>` : ''}

      <div class="form-actions sticky-actions">
        <button class="btn primary" type="submit">${icon('check')} Išsaugoti nustatymus</button>
      </div>
    </form>`;

  let signature = s.signature || '';
  $('#sig-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const { blobToDataURL } = await import('./util.js');
    // sumažinam parašą
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 500 / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    signature = await blobToDataURL(await new Promise(r => c.toBlob(r, 'image/png')));
    $('.sig-prev').innerHTML = `<img src="${signature}" alt="parašas">`;
  });
  const del = $('#sig-del');
  if (del) del.addEventListener('click', () => { signature = ''; $('.sig-prev').innerHTML = '<span class="muted small">nėra</span>'; });

  const lo = $('#btn-logout');
  if (lo) lo.addEventListener('click', async () => {
    if (await confirmDialog('Atsijungti?', 'Atsijungti')) { await db.signOut(); user = null; route(); }
  });

  $('#set-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const commission = [];
    for (let i = 0; i < 4; i++) {
      if (f[`cpos_${i}`] === undefined) continue;
      if (f[`cpos_${i}`] || f[`cname_${i}`]) commission.push({ position: f[`cpos_${i}`], name: f[`cname_${i}`] });
      delete f[`cpos_${i}`]; delete f[`cname_${i}`];
    }
    const data = {
      ...s, ...f, commission, signature,
      next_act_no: Number(f.next_act_no) || 1,
      next_nc_no: Number(f.next_nc_no) || 1,
      service_types: String(f.service_types || '').split('\n').map(x => x.trim()).filter(Boolean)
    };
    try {
      await db.saveSettings(data);
      toast('Nustatymai išsaugoti', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
}

start();
