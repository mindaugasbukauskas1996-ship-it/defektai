// =====================================================================
// Programėlės branduolys: maršrutai, prisijungimas, užduočių sąrašas,
// užduoties forma ir nustatymai.
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import {
  $, $$, esc, toast, confirmDialog, today, fmtDate, STATUSES, statusLabel,
  PRIORITIES, priorityLabel, buildingSummary, parseCsv, readTextFile, parseReports, extractPhone, shortProblem, splitAddress
} from './util.js';
import { renderTask } from './task.js';
import { renderPrint } from './print.js';
import { renderAnnualList } from './annual.js';

const view = () => document.getElementById('view');
let user = null;
let listFilter = { status: 'aktyvios', q: '', who: 'all' };

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
    <a href="#/metine" data-nav="annual">${icon('file')}<span>Metinė</span></a>
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
    if (!db.isDemo) {                               // neaktyvuota paskyra duomenų nemato
      const me = await db.getProfile();
      if (!me.active) return renderPending(me);
    }
    if (parts[0] === 'nauja') { setActiveNav('new'); return await renderTaskForm(null); }
    if (parts[0] === 'metine') { setActiveNav('annual'); return await renderAnnualList(view(), go); }
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

function renderPending(me) {
  document.body.classList.remove('logged');
  view().innerHTML = `
    <div class="login card">
      <h1>Laukiama aktyvavimo</h1>
      <p class="muted">Paskyra <b>${esc(me.email || '')}</b> sukurta, bet dar neaktyvuota. Kreipkitės į administratorių, kad ją aktyvuotų.</p>
      <button class="btn primary block" id="pend-retry" type="button">Patikrinti dar kartą</button>
      <button class="btn ghost block" id="pend-out" type="button" style="margin-top:8px">Atsijungti</button>
    </div>`;
  $('#pend-retry').addEventListener('click', async () => { await db.getProfile(true); route(); });
  $('#pend-out').addEventListener('click', async () => { await db.signOut(); user = null; route(); });
}

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
  const [tasks, me] = await Promise.all([db.listTasks(), db.getProfile()]);
  const isAdmin = me.role === 'admin';
  const people = isAdmin ? await db.listProfiles() : [];
  const pname = id => db.profileName(people.find(p => p.id === id));
  const chips = [{ id: 'aktyvios', label: 'Aktyvios' }, ...STATUSES, { id: 'neatiktys', label: 'Neatiktys' }, { id: 'metines', label: 'Metinės' }, { id: 'visos', label: 'Visos' }];

  const counts = {};
  tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  counts.aktyvios = tasks.filter(t => t.status !== 'baigta').length;
  counts.neatiktys = tasks.filter(t => t.kind === 'nonconformity').length;
  counts.metines = tasks.filter(t => t.kind === 'annual').length;
  counts.visos = tasks.length;

  view().innerHTML = `
    <div class="page-head">
      <h1>Užduotys</h1>
      <span class="head-btns hide-mobile">
        <a class="btn" href="#/neatiktis">${icon('alert')} Nauja neatiktis</a>
        <a class="btn" href="#/metine">${icon('file')} Nauja metinė apžiūra</a>
        <a class="btn primary" href="#/nauja">${icon('plus')} Nauja užduotis</a>
      </span>
    </div>
    <div class="list-tools">
      <div class="search">${icon('search')}<input id="q" type="search" placeholder="Ieškoti: adresas, problema, telefonas..." value="${esc(listFilter.q)}"></div>
      ${isAdmin && people.length > 1 ? `
      <select id="who" class="who-sel" title="Atsakingas">
        <option value="all" ${listFilter.who === 'all' ? 'selected' : ''}>Visi darbuotojai</option>
        <option value="${esc(me.id)}" ${listFilter.who === me.id ? 'selected' : ''}>Mano užduotys</option>
        ${people.filter(p => p.id !== me.id).map(p => `<option value="${esc(p.id)}" ${listFilter.who === p.id ? 'selected' : ''}>${esc(db.profileName(p))}</option>`).join('')}
      </select>` : ''}
      <div class="chips" id="chips">
        ${chips.map(c => `<button class="chip ${listFilter.status === c.id ? 'on' : ''}" data-st="${c.id}">${esc(c.label)} <span>${counts[c.id] || 0}</span></button>`).join('')}
      </div>
    </div>
    <div id="task-list" class="task-list"></div>`;

  const draw = () => {
    const q = listFilter.q.trim().toLowerCase();
    let arr = tasks.filter(t => {
      if (isAdmin && listFilter.who !== 'all' && t.assigned_to !== listFilter.who) return false;
      if (listFilter.status === 'aktyvios' && t.status === 'baigta') return false;
      if (listFilter.status === 'neatiktys' && t.kind !== 'nonconformity') return false;
      if (listFilter.status === 'metines' && t.kind !== 'annual') return false;
      if (!['aktyvios', 'visos', 'neatiktys', 'metines'].includes(listFilter.status) && t.status !== listFilter.status) return false;
      if (!q) return true;
      return [t.address, t.city, t.problem, t.contact_name, t.contact_phone, t.stairwell, t.act_number, t.service_type, t.contractor, t.report_no]
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
            ${t.kind === 'annual' ? '<span class="tag">Metinė apžiūra</span>' : ''}
            ${t.stairwell ? `<span class="tag">${esc(t.stairwell)} laipt.</span>` : ''}
            ${t.apartment ? `<span class="tag">bt. ${esc(t.apartment)}</span>` : ''}
          </div>
          <div class="tc-problem">${esc(t.problem || 'Problema neaprašyta')}</div>
          <div class="tc-meta">
            ${isAdmin && t.assigned_to && t.assigned_to !== me.id ? `<span class="assignee">${esc(pname(t.assigned_to))}</span>` : ''}
            ${t.report_no ? `<span>Pr. ${esc(t.report_no)}</span>` : ''}
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
  const who = $('#who');
  if (who) who.addEventListener('change', e => { listFilter.who = e.target.value; draw(); });
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

const reportsDatalist = reports => `<datalist id="rep-list">${reports.map(r =>
  `<option value="${esc(r.reg_no)}" label="${esc([r.address, shortProblem(r.description, r.work_label || '')].filter(Boolean).join(' – ').slice(0, 110))}"></option>`).join('')}</datalist>`;

/** Pasirinkus pranešimą pagal registracijos nr., užpildo likusius užduoties laukus. */
function bindReportPicker(form, reports, used, objects) {
  const inp = $('#report-no');
  if (!inp) return;
  const hint = $('#rep-hint');
  const byNo = new Map(reports.map(r => [r.reg_no.toLowerCase(), r]));
  const el = n => form.elements[n];
  const flash = e => { if (e) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); } };
  const set = (name, v) => { const e = el(name); if (e && v) { e.value = v; flash(e); } };

  const matchService = want => {
    const sel = el('service_type');
    const w = String(want || '').trim();
    if (!sel || !w) return;
    const toks = s => String(s).toLowerCase().split(/[^a-ząčęėįšųūž]+/).filter(x => x.length > 3);
    const wt = toks(w);
    let best = null, score = 0;
    [...sel.options].filter(o => o.value).forEach(o => {
      const sc = toks(o.value).filter(x => wt.includes(x)).length;
      if (sc > score) { score = sc; best = o; }
    });
    if (best) sel.value = best.value;
    else { sel.add(new Option(w, w)); sel.value = w; }
    flash(sel);
  };

  const apply = async r => {
    const a = splitAddress(r.address || '');
    el('address').value = [a.street, a.house].filter(Boolean).join(' ') || a.address;
    el('city').value = a.city || r.city || el('city').value;
    flash(el('address'));
    el('address').dispatchEvent(new Event('change'));            // suranda objektą ir laiptinių kodus
    await form._objReady;                                        // palaukiam, kol užsikraus laiptinių kodai
    if (r.stairwell && el('stairwell')) {
      el('stairwell').value = r.stairwell; flash(el('stairwell'));
      el('stairwell').dispatchEvent(new Event('input', { bubbles: true }));   // užpildo laiptinės kodą
    }
    set('apartment', r.apartment);
    set('manager', r.manager);
    setTimeout(() => {                                           // jei pranešime vadybininko nėra – iš objekto
      const o = objects.find(x => x.id === el('object_id').value);
      if (!el('manager').value && o && o.manager) set('manager', o.manager);
    }, 700);
    matchService(r.service_type);
    // „Vardo“ stulpelyje kartais įrašytas el. paštas ar telefonas – tada tai kontaktas, o ne vardas
    const cn = String(r.contact_name || '').trim();
    const nameIsEmail = /@/.test(cn), nameIsPhone = /^[+\d\s-]{6,}$/.test(cn);
    const email = /@/.test(r.contact || '') ? r.contact.trim() : (nameIsEmail ? cn : '');
    set('description', [r.description, email ? `El. paštas: ${email}` : ''].filter(Boolean).join('\n\n'));
    set('problem', shortProblem(r.description, r.work_label || r.act_type || ''));
    if (!nameIsEmail && !nameIsPhone) set('contact_name', cn);
    set('contact_phone', extractPhone(r.contact) || (nameIsPhone ? cn : '') || extractPhone(r.description));
    el('report_no').value = r.reg_no;
    let am = form.querySelector('input[name=act_mode]');
    if (!am) { am = document.createElement('input'); am.type = 'hidden'; am.name = 'act_mode'; form.appendChild(am); }
    am.value = /su kiekiais/i.test(r.act_type || '') ? 'full' : 'defect';
    const bits = [r.report_type, r.registered_at ? String(r.registered_at).slice(0, 10) : '', r.act_type ? `prašomas aktas: ${r.act_type}` : '',
      r.engineer ? `inžinierius: ${r.engineer}` : '', used.has(r.reg_no) ? 'DĖMESIO: šiam pranešimui užduotis jau sukurta' : ''].filter(Boolean);
    if (hint) { hint.textContent = bits.join(' · '); hint.classList.toggle('warn', used.has(r.reg_no)); }
  };

  inp.addEventListener('input', () => {
    const r = byNo.get(inp.value.trim().toLowerCase());
    if (r) apply(r);
    else { el('report_no').value = inp.value.trim() ? '' : ''; if (hint) { hint.textContent = ''; hint.classList.remove('warn'); } }
  });
}

const objDatalist = objects => `<datalist id="obj-list">${objects.map(o => `<option value="${esc(o.address)}">`).join('')}</datalist>`;

/** Objekto pasirinkimas iš sąrašo: užpildo adresą, miestą, vadybininką, laiptinių kodus. */
function bindObjectPicker(form, objects, t, withCodes) {
  if (!objects.length) return;
  const byAddr = new Map(objects.map(o => [o.address.toLowerCase(), o]));
  const byId = new Map(objects.map(o => [o.id, o]));
  const el = n => form.elements[n];
  const hint = $('#obj-hint');
  const stairList = $('#stair-list');
  let codes = [];

  const flash = input => { if (input) { input.classList.remove('flash'); void input.offsetWidth; input.classList.add('flash'); } };
  const fillStair = c => {
    if (el('stairwell')) { el('stairwell').value = c.stairwell; flash(el('stairwell')); }
    if (el('entry_code') && c.code) { el('entry_code').value = c.code; flash(el('entry_code')); }
  };

  const apply = async (o, fill) => {
    el('object_id').value = o.id;
    if (fill) {
      el('address').value = [o.street, o.house].filter(Boolean).join(' ') || o.address;
      if (o.city) el('city').value = o.city;
      if (el('manager') && o.manager) { el('manager').value = o.manager; flash(el('manager')); }
    }
    codes = withCodes ? await db.codesFor(o).catch(() => []) : [];
    if (stairList) stairList.innerHTML = codes.map(c => `<option value="${esc(c.stairwell)}">${esc(c.code)}</option>`).join('');
    const parts = [];
    const sum = buildingSummary(o);
    parts.push(sum ? `Pastatas: ${sum}` : 'Pastato duomenų (stogas, konstruktyvas...) dar nėra.');
    if (withCodes) parts.push(codes.length ? `Laiptinių kodai: ${codes.map(c => `${c.stairwell || '–'} → ${c.code}`).join('; ')}` : 'Laiptinių kodų šiam namui nerasta.');
    if (hint) hint.textContent = parts.join(' · ');
    if (withCodes && fill && codes.length === 1) fillStair(codes[0]);
  };

  el('address').addEventListener('input', () => {
    const o = byAddr.get(el('address').value.replace(/\s+/g, ' ').trim().toLowerCase());
    if (o) apply(o, true);
  });
  el('address').addEventListener('change', () => {
    // form._objReady – kad kiti (pvz. pranešimo pasirinkimas) galėtų palaukti, kol bus užkrauti laiptinių kodai
    form._objReady = (async () => {
      const o = await db.findObject(el('address').value, el('city').value);
      if (o) { if (el('object_id').value !== o.id) await apply(o, false); }
      else { el('object_id').value = ''; if (hint) hint.textContent = ''; codes = []; if (stairList) stairList.innerHTML = ''; }
    })();
  });
  if (el('stairwell')) {
    const fromStair = () => {
      const c = codes.find(x => x.stairwell === el('stairwell').value.trim());
      if (c && c.code && el('entry_code')) { el('entry_code').value = c.code; flash(el('entry_code')); }
    };
    el('stairwell').addEventListener('input', fromStair);
    el('stairwell').addEventListener('change', fromStair);
  }

  if (t.object_id && byId.has(t.object_id)) apply(byId.get(t.object_id), false);
  else if (t.address) db.findObject(t.address, t.city).then(o => { if (o) apply(o, false); });
}
async function renderTaskForm(id, kind = 'defect') {
  const s = await db.getSettings();
  const t = id ? await db.getTask(id) : { city: s.city, priority: 'iprastas', status: 'nauja', kind };
  if (id && !t) throw new Error('Užduotis nerasta');
  const me = await db.getProfile();
  const objects = await db.listObjects().catch(() => []);
  const reports = id ? [] : await db.listReports().catch(() => []);
  const usedNos = reports.length ? await db.usedReportNos().catch(() => new Set()) : new Set();
  const people = me.role === 'admin' ? await db.listProfiles() : [];
  const assignee = people.length > 1 ? `
      <label class="span2">Atsakingas darbuotojas<select name="assigned_to">
        ${people.map(p => `<option value="${esc(p.id)}" ${p.id === (t.assigned_to || me.id) ? 'selected' : ''}>${esc(db.profileName(p))}${p.id === me.id ? ' (aš)' : ''}</option>`).join('')}
      </select></label>` : '';
  if (t.kind === 'nonconformity') return renderNcForm(id, t, s, assignee, objects);

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

    ${reports.length ? `
    <div class="card report-pick">
      <div class="card-title">Pranešimas</div>
      <p class="muted small">Įveskite arba pasirinkite pranešimo registracijos Nr. – užduoties laukai užsipildys automatiškai (adresas, butas, paslauga, aprašymas, kontaktai, vadybininkas, laiptinių kodai).</p>
      <input id="report-no" list="rep-list" autocomplete="off" placeholder="Registracijos Nr., pvz. V26-0332167">
      ${reportsDatalist(reports)}
      <div class="muted small" id="rep-hint"></div>
    </div>` : ''}
    <div class="card ai-fill">
      <div class="card-title">${icon('spark')} Greitas užpildymas su DI</div>
      <p class="muted small">Įklijuokite gyventojo laišką ar vadybininko pranešimą – DI užpildys adresą, telefoną, problemą ir kt.</p>
      <textarea id="raw-msg" rows="4" placeholder="Sveiki, Taikos pr. 55-103, Klaipėda. Vakar per lietų laiptinėje per elektros skydinę bėgo vanduo...">${esc(id ? '' : '')}</textarea>
      <button class="btn" id="btn-parse" type="button">${icon('spark')} Užpildyti laukus</button>
    </div>

    <form id="task-form" class="card form-grid">
      <label class="span2">Adresas *<input name="address" required autocomplete="off" list="obj-list" value="${esc(t.address)}" placeholder="${objects.length ? 'Pradėkite rašyti ir pasirinkite objektą iš sąrašo' : 'Taikos pr. 55'}">${objDatalist(objects)}</label>
      <input type="hidden" name="object_id" value="${esc(t.object_id)}">
      <input type="hidden" name="report_no" value="${esc(t.report_no)}">
      <div class="span4 obj-hint muted small" id="obj-hint"></div>
      <label>Miestas<input name="city" value="${esc(t.city)}"></label>
      <label>Laiptinė<input name="stairwell" list="stair-list" autocomplete="off" value="${esc(t.stairwell)}" placeholder="7"><datalist id="stair-list"></datalist></label>
      <label>Butas<input name="apartment" value="${esc(t.apartment)}"></label>
      <label>Laiptinės kodas<input name="entry_code" value="${esc(t.entry_code)}" placeholder="pvz. 1234#"></label>
      <label>Kontaktinis asmuo<input name="contact_name" value="${esc(t.contact_name)}"></label>
      <label>Telefonas<input name="contact_phone" type="tel" value="${esc(t.contact_phone)}" placeholder="+370..."></label>
      <label class="span2">Paslauga / sritis<select name="service_type"><option value="">— pasirinkite —</option>${opt(services, t.service_type)}</select></label>
      <label>Prioritetas<select name="priority">${opt(PRIORITIES, t.priority)}</select></label>
      <label>Atlikti iki<input name="due_date" type="date" value="${esc(fmtDate(t.due_date))}"></label>
      ${id ? `<label>Būsena<select name="status">${opt(STATUSES, t.status)}</select></label>` : ''}
      <label class="${id ? '' : 'span2'}">Pastatų administravimo vadybininkas<input name="manager" value="${esc(t.manager)}" placeholder="V. Pavardė, tel."></label>
      ${assignee}
      <label class="span4">Problema (trumpai) *<input name="problem" required value="${esc(t.problem)}" placeholder="Pratekėjimas per lietų į 7 laiptinės el. skydinę"></label>
      <label class="span4">Pranešimo tekstas / aprašymas<textarea name="description" rows="5">${esc(t.description)}</textarea></label>
      <div class="span4 form-actions">
        <a class="btn ghost" href="${id ? `#/u/${id}` : '#/'}">Atšaukti</a>
        <button class="btn primary" type="submit">${icon('check')} Išsaugoti</button>
      </div>
    </form>`;

  const form = $('#task-form');
  bindObjectPicker(form, objects, t, true);
  bindReportPicker(form, reports, usedNos, objects);

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

function renderNcForm(id, t, s, assignee = '', objects = []) {
  const back = id ? `#/u/${id}` : '#/';
  view().innerHTML = `
    <div class="page-head">
      <a class="btn ghost" href="${back}">${icon('back')} Atgal</a>
      <h1>${id ? 'Redaguoti neatiktį' : 'Nauja neatiktis'}</h1>
    </div>
    <form id="task-form" class="card form-grid">
      <label class="span2">Objekto adresas *<input name="address" required autocomplete="off" list="obj-list" value="${esc(t.address)}" placeholder="${objects.length ? 'Pradėkite rašyti ir pasirinkite objektą iš sąrašo' : 'Taikos pr. 55'}">${objDatalist(objects)}</label>
      <input type="hidden" name="object_id" value="${esc(t.object_id)}">
      <label>Miestas<input name="city" value="${esc(t.city)}"></label>
      <label>Laiptinė<input name="stairwell" value="${esc(t.stairwell)}"></label>
      <label class="span2">Rangovas *<input name="contractor" required value="${esc(t.contractor)}" placeholder="UAB „Statyba“"></label>
      <label class="span2">Kokius darbus atlieka<input name="service_type" list="nc-works" value="${esc(t.service_type)}" placeholder="Stogo dangos remontas">
        <datalist id="nc-works">${s.service_types.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label>Pašalinti iki<input name="due_date" type="date" value="${esc(fmtDate(t.due_date))}"></label>
      ${id ? `<label>Būsena<select name="status">${STATUSES.map(o => `<option value="${o.id}" ${o.id === t.status ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>` : ''}
      ${assignee}
      <label class="span4">Neatikties santrauka (galima palikti tuščią – DI parašys)<input name="problem" value="${esc(t.problem)}" placeholder="Neteisingai sumontuota įlaja"></label>
      <label class="span4">Papildoma informacija<textarea name="description" rows="3">${esc(t.description)}</textarea></label>
      <input type="hidden" name="kind" value="nonconformity">
      <div class="span4 form-actions">
        <a class="btn ghost" href="${back}">Atšaukti</a>
        <button class="btn primary" type="submit">${icon('check')} ${id ? 'Išsaugoti' : 'Toliau – nuotraukos'}</button>
      </div>
    </form>`;

  const form = $('#task-form');
  bindObjectPicker(form, objects, t, false);
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
// Objektų ir laiptinių kodų importas (tik admin)
// ---------------------------------------------------------------------

const CODES_REPO_URL = 'https://raw.githubusercontent.com/mindaugasbukauskas1996-ship-it/laiptiniu-kodai/main/index.html';

async function renderImport() {
  const box = $('#import-card');
  const [objs, nCodes, nReports, people] = await Promise.all([db.listObjects(true), db.countCodes(), db.countReports(), db.listProfiles()]);
  const me = await db.getProfile();
  box.innerHTML = `
    <div class="card import-card">
      <div class="card-title">Objektai ir laiptinių kodai</div>
      <p class="muted small">Objektai pasirenkami iš sąrašo kuriant užduotį, o DI gauna pastato informaciją (konstruktyvas, stogas, plotai, šilumos punktas). Bazėje dabar: <b>${objs.length}</b> objektų, <b>${nCodes}</b> laiptinių kodų, <b>${nReports}</b> pranešimų.</p>

      <div class="imp-block">
        <div class="lbl">Objektų CSV</div>
        <p class="muted small">Stulpeliai (kaip sistemos eksporte, skirtukas „;“): Adresas; PA vadybininkas; Projektas; Butų sk.; Konstruktyvas; Laiptinių sk.; Naudingas plotas; Plotas; Rūsio plotas; Renovacijos būklė; Statybos metai; Stogo būklė; Stogo danga; Stogo plotas; Stogo tipas; Šilumos punkto tipas. Pakartotinis importas atnaujina objektus pagal adresą (tuščios reikšmės perrašo senas).</p>
        <div class="imp-row"><input type="file" id="imp-obj-file" accept=".csv,text/csv"><button class="btn" id="imp-obj" type="button">Importuoti objektus</button></div>
      </div>

      <div class="imp-block">
        <div class="lbl">Laiptinių kodai</div>
        <p class="muted small">Importas pakeičia visą kodų sąrašą. Šaltinis: repozitorija „laiptiniu-kodai“ arba CSV (Miestas; Gatvė; Namo nr.; Laiptinė; Kodas).</p>
        <div class="imp-row"><button class="btn" id="imp-codes-repo" type="button">Importuoti iš „laiptiniu-kodai“</button></div>
        <div class="imp-row"><input type="file" id="imp-codes-file" accept=".csv,text/csv"><button class="btn" id="imp-codes" type="button">Importuoti iš CSV</button></div>
      </div>
      <div class="imp-block">
        <div class="lbl">Pranešimai (inžinieriaus)</div>
        <p class="muted small">Sistemos eksporto CSV (pirmas stulpelis – registracijos Nr., pvz. V26-0332167). Pakartotinis importas atnaujina pagal registracijos Nr. Pranešimus mato tik pasirinkta paskyra (ir admin); kuriant užduotį jie pasirenkami pagal Nr.</p>
        <div class="imp-row">
          <select id="imp-rep-user">${people.map(p => `<option value="${esc(p.id)}" ${p.id === me.id ? 'selected' : ''}>${esc(db.profileName(p))}${p.id === me.id ? ' (aš)' : ''}</option>`).join('')}</select>
          <input type="file" id="imp-rep-file" accept=".csv,text/csv"><button class="btn" id="imp-rep" type="button">Importuoti pranešimus</button>
        </div>
      </div>
      <div id="imp-msg" class="muted small"></div>
    </div>`;

  const msg = t => { $('#imp-msg').textContent = t; };
  const run = async (btn, label, fn) => {
    btn.disabled = true; const old = btn.textContent; btn.textContent = label;
    try { const n = await fn(); msg(n); toast(n, 'ok', 5000); await renderImport(); }
    catch (e) { console.error(e); msg('Klaida: ' + (e.message || e)); toast(e.message || String(e), 'error', 8000); btn.disabled = false; btn.textContent = old; }
  };

  $('#imp-obj').addEventListener('click', () => {
    const f = $('#imp-obj-file').files[0];
    if (!f) return toast('Pasirinkite CSV failą', 'error');
    run($('#imp-obj'), 'Importuojama...', async () => `Importuota objektų: ${await db.importObjects(parseCsv(await readTextFile(f)))}`);
  });
  $('#imp-codes').addEventListener('click', () => {
    const f = $('#imp-codes-file').files[0];
    if (!f) return toast('Pasirinkite CSV failą', 'error');
    run($('#imp-codes'), 'Importuojama...', async () => `Importuota kodų: ${await db.importCodes(parseCsv(await readTextFile(f)))}`);
  });
  $('#imp-rep').addEventListener('click', () => {
    const f = $('#imp-rep-file').files[0];
    if (!f) return toast('Pasirinkite CSV failą', 'error');
    run($('#imp-rep'), 'Importuojama...', async () => `Importuota pranešimų: ${await db.importReports(parseReports(await readTextFile(f)), $('#imp-rep-user').value)}`);
  });
  $('#imp-codes-repo').addEventListener('click', () => {
    run($('#imp-codes-repo'), 'Kraunama...', async () => {
      const res = await fetch(CODES_REPO_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Nepavyko atsisiųsti kodų repozitorijos (' + res.status + ')');
      const m = /EMBEDDED_CSV\s*=\s*`([\s\S]*?)`/.exec(await res.text());
      if (!m) throw new Error('Repozitorijoje nerasta kodų lentelės (EMBEDDED_CSV)');
      return `Importuota kodų: ${await db.importCodes(parseCsv(m[1]))}`;
    });
  });
}
// ---------------------------------------------------------------------
// DI išmoktos taisyklės (Nustatymuose)
// ---------------------------------------------------------------------

async function renderLessons(account) {
  const box = $('#lessons-card');
  const isAdmin = account.role === 'admin';
  const [items, people] = await Promise.all([db.listLessons(), isAdmin ? db.listProfiles() : []]);
  const owner = id => db.profileName(people.find(p => p.id === id));
  const KIND = { defect: 'Defektų aktai', nonconformity: 'Neatiktys' };

  box.innerHTML = `
    <div class="card lessons-card">
      <div class="card-title">${icon('spark')} DI išmoktos taisyklės</div>
      <p class="muted small">Kai „Pataisyti su DI“ nurodymas tinka ir kitiems aktams, DI jį įsimena ir taiko kuriant naujus aktus. Čia galite taisyklę pakeisti, išjungti ar ištrinti.${isAdmin ? ' Kaip administratorius matote ir kitų paskyrų taisykles.' : ''}</p>
      ${items.length ? `<ul class="lessons">${items.map(l => `
        <li data-id="${esc(l.id)}" class="${l.active ? '' : 'off'}">
          <label class="chk" title="Naudoti"><input type="checkbox" data-l="active" ${l.active ? 'checked' : ''}></label>
          <span class="tag">${esc(KIND[l.kind] || l.kind)}</span>
          ${isAdmin && l.user_id && l.user_id !== account.id ? `<span class="tag">${esc(owner(l.user_id))}</span>` : ''}
          <input class="les-txt" data-l="text" value="${esc(l.text)}">
          <button class="btn icon-only small danger-ghost" data-l="del" type="button" title="Ištrinti">${icon('trash')}</button>
        </li>`).join('')}</ul>` : '<div class="muted small">Taisyklių dar nėra. Jos atsiras po pirmų pataisymų su DI.</div>'}
      <div class="les-add">
        <select id="les-kind"><option value="defect">Defektų aktai</option><option value="nonconformity">Neatiktys</option></select>
        <input id="les-new" placeholder="Pridėti taisyklę ranka, pvz.: Visada įtrauk statybinių atliekų išvežimą">
        <button class="btn" id="les-add" type="button">${icon('plus')} Pridėti</button>
      </div>
    </div>`;

  box.onchange = async e => {
    const el = e.target.closest('[data-l]');
    if (!el) return;
    const li = el.closest('li');
    try {
      if (el.dataset.l === 'active') { await db.updateLesson(li.dataset.id, { active: el.checked }); li.classList.toggle('off', !el.checked); }
      else if (el.dataset.l === 'text') {
        const v = el.value.trim();
        if (!v) return renderLessons(account);
        await db.updateLesson(li.dataset.id, { text: v });
        toast('Taisyklė išsaugota', 'ok', 1500);
      }
    } catch (err) { toast(err.message, 'error'); }
  };
  box.onclick = async e => {
    const b = e.target.closest('[data-l="del"]');
    if (b) {
      if (!await confirmDialog('Ištrinti šią taisyklę?', 'Ištrinti')) return;
      try { await db.deleteLesson(b.closest('li').dataset.id); renderLessons(account); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('#les-add')) {
      const txt = $('#les-new').value.trim();
      if (!txt) return toast('Įrašykite taisyklę', 'error');
      try {
        await db.addLesson($('#les-kind').value, txt);
        renderLessons(account);
      } catch (err) { toast(err.message, 'error'); }
    }
  };
}

// ---------------------------------------------------------------------
// Nustatymai
// ---------------------------------------------------------------------

async function renderSettings() {
  const s = await db.getSettings(true);
  const account = await db.getProfile(true);
  const accounts = account.role === 'admin' ? await db.listProfiles(true) : [];
  const comm =(s.commission || []).concat([{ position: '', name: '' }]).slice(0, 4);

  view().innerHTML = `
    <div class="page-head"><h1>Nustatymai</h1>
      ${db.isDemo ? '' : `<button class="btn ghost" id="btn-logout">${icon('logout')} Atsijungti</button>`}
    </div>
    <form id="set-form">
      ${account.email === 'demo' ? '' : `
      <div class="card form-grid">
        <div class="card-title span4">Paskyra</div>
        <div class="span4 acct">
          <b>${esc(account.email)}</b> <span class="tag ${account.role === 'admin' ? 'nc' : ''}">${account.role === 'admin' ? 'Administratorius' : 'Darbuotojas'}</span>
          <div class="muted small">Šie nustatymai (vardas, parašas, akto numeracija) galioja tik šiai paskyrai.</div>
        </div>
        ${account.role === 'admin' ? `
        <div class="span4">
          <div class="lbl">Paskyros (užduotis skirstote užduoties kortelėje)</div>
          <ul class="acct-list">${accounts.map(p => `<li><b>${esc(db.profileName(p))}</b> <span class="muted small">${esc(p.email || '')}${p.role === 'admin' ? ' · admin' : ''}</span>
            ${p.id === account.id ? '' : `<label class="chk" title="Ar paskyra gali naudotis programa"><input type="checkbox" data-acc="${esc(p.id)}" ${p.active ? 'checked' : ''}> aktyvi</label>`}
            ${p.active ? '' : '<span class="tag nc">laukia aktyvavimo</span>'}</li>`).join('')}</ul>
          <div class="muted small">Nauja paskyra kuriama Supabase: Authentication → Users → Add user (Auto Confirm User). Ji atsiras čia po pirmo prisijungimo ir veiks tik kai pažymėsite „aktyvi“. Nepažįstamų paskyrų neaktyvuokite.</div>
        </div>` : ''}
      </div>`}
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
        <label>Metinės apžiūros Nr. prefiksas<input name="annual_prefix" value="${esc(s.annual_prefix)}" placeholder="MBB"></label>
        <label class="span2">Kvalifikacijos atestato Nr. (metinėse apžiūrose)<input name="inspector_cert" value="${esc(s.inspector_cert)}" placeholder="35236"></label>
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
    </form>
    <div id="lessons-card"></div>
    ${account.role === 'admin' && !db.isDemo ? '<div id="import-card"></div>' : ''}`;
  if (account.role === 'admin' && !db.isDemo) renderImport().catch(e => { $('#import-card').innerHTML = `<div class="card error">Importo skiltis neįkrauta: ${esc(e.message)}</div>`; });
  renderLessons(account).catch(e => { $('#lessons-card').innerHTML = `<div class="card error">Nepavyko įkelti DI taisyklių: ${esc(e.message)}</div>`; });

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

  $('#set-form').addEventListener('change', async e => {          // paskyrų aktyvavimas (admin)
    const cb = e.target.closest('[data-acc]');
    if (!cb) return;
    try {
      await db.setProfileActive(cb.dataset.acc, cb.checked);
      toast(cb.checked ? 'Paskyra aktyvuota' : 'Paskyra išjungta', 'ok');
    } catch (err) { toast(err.message, 'error'); cb.checked = !cb.checked; }
  });

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
