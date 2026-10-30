// =====================================================================
// Užduoties kortelė: informacija, nuotraukos, apžiūra, aktai (DI).
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import {
  $, $$, esc, nl2br, toast, confirmDialog, debounce, today, fmtDate, fmtDateTime,
  STATUSES, statusLabel, priorityLabel, PURPOSES, processImage, telHref, mapsHref,
  fmtQty, parseQty
} from './util.js';
import { openAnnotator } from './annotator.js';

const UNITS = ['Vnt.', 'm', 'm²', 'm³', 'Komplektas', 'val.', 'kg', 'T', 'Ltr', 'cm', 'para',
  'Kalendorinė diena', 'kWh', 'Suma (€)', 'Objektų skaičius', 'Butų skaičius', 'Patalpų skaičius', 'metras ir diena'];

let S = null; // dabartinės užduoties būsena

export async function renderTask(el, id, tab) {
  el.innerHTML = `<div class="loading">Kraunama...</div>`;
  const [task, photos, settings] = await Promise.all([db.getTask(id), db.listPhotos(id), db.getSettings()]);
  if (!task) throw new Error('Užduotis nerasta');
  S = { el, task, photos, settings, tab, saving: false };
  draw();
}

// ---------------------------------------------------------------------
// Bendras išdėstymas
// ---------------------------------------------------------------------

const TABS = [
  { id: 'info', label: 'Informacija' },
  { id: 'foto', label: 'Nuotraukos' },
  { id: 'apziura', label: 'Apžiūra' },
  { id: 'aktai', label: 'Aktai' }
];

const TABS_NC = [
  { id: 'info', label: 'Informacija' },
  { id: 'foto', label: 'Nuotraukos' },
  { id: 'apziura', label: 'Aprašymas' },
  { id: 'aktai', label: 'Aktas' }
];

const isNc = t => t.kind === 'nonconformity';

function draw() {
  const t = S.task;
  const nc = isNc(t);
  const actPhotos = S.photos.filter(p => p.include_in_act).length;
  S.el.innerHTML = `
    <div class="task-head">
      <a class="btn ghost icon-only" href="#/" title="Atgal">${icon('back')}</a>
      <div class="th-title">
        <h1>${esc(t.address || '(be adreso)')}${t.city ? `, ${esc(t.city)}` : ''}</h1>
        <div class="th-sub">
          ${nc ? `<span class="tag nc">${icon('alert')} Neatiktis</span>` : ''}
          ${nc && t.contractor ? `<span class="tag">${esc(t.contractor)}</span>` : ''}
          ${t.stairwell ? `<span class="tag">${esc(t.stairwell)} laiptinė</span>` : ''}
          ${t.apartment ? `<span class="tag">bt. ${esc(t.apartment)}</span>` : ''}
          ${t.priority === 'skubus' ? `<span class="badge prio">Skubus</span>` : ''}
          ${t.act_number ? `<span class="tag">Aktas ${esc(t.act_number)}</span>` : ''}
        </div>
      </div>
      <select id="st-sel" class="status-sel st-${esc(t.status)}" title="Būsena">
        ${STATUSES.map(s => `<option value="${s.id}" ${s.id === t.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
      </select>
    </div>
    <nav class="tabs" id="tabs">
      ${(nc ? TABS_NC : TABS).map(x => `<a href="#/u/${t.id}/${x.id}" class="${S.tab === x.id ? 'on' : ''}">${x.label}${x.id === 'foto' ? ` <span class="cnt">${S.photos.length}</span>` : ''}${x.id === 'aktai' && (t.defect_act || t.nc_act) ? ' <span class="dot"></span>' : ''}</a>`).join('')}
    </nav>
    <div id="tab-body"></div>`;

  $('#st-sel').addEventListener('change', async e => {
    await save({ status: e.target.value });
    e.target.className = `status-sel st-${e.target.value}`;
    toast(`Būsena: ${statusLabel(e.target.value)}`, 'ok');
  });

  const body = $('#tab-body');
  if (S.tab === 'foto') return drawPhotos(body);
  if (S.tab === 'apziura') return drawInspection(body);
  if (S.tab === 'aktai') return nc ? drawNcActs(body) : drawActs(body);
  return drawInfo(body, actPhotos);
}

// Pakeičia elementą nauju (be senų įvykių klausytojų)
function fresh(el) {
  const n = el.cloneNode(false);
  el.replaceWith(n);
  return n;
}

async function save(patch) {
  S.task = await db.updateTask(S.task.id, patch);
  return S.task;
}

// ---------------------------------------------------------------------
// Informacija
// ---------------------------------------------------------------------

function drawInfo(body) {
  const t = S.task;
  const row = (l, v) => v ? `<div class="kv"><span>${l}</span><b>${esc(v)}</b></div>` : '';
  body.innerHTML = `
    <div class="quick">
      ${t.contact_phone ? `<a class="btn big" href="${telHref(t.contact_phone)}">${icon('phone')} Skambinti</a>` : ''}
      ${t.address ? `<a class="btn big" target="_blank" rel="noopener" href="${mapsHref(t.address, t.city)}">${icon('map')} Navigacija</a>` : ''}
      ${t.entry_code ? `<button class="btn big code" id="copy-code" title="Kopijuoti">${icon('key')} Kodas: <b>${esc(t.entry_code)}</b></button>` : ''}
    </div>
    <div class="grid2">
      <div class="card">
        <div class="card-title">Užduotis</div>
        <div class="problem">${esc(t.problem || 'Problema neaprašyta')}</div>
        ${row(isNc(t) ? 'Rangovas' : '', isNc(t) ? t.contractor : '')}
        ${row(isNc(t) ? 'Darbai' : 'Paslauga', t.service_type)}
        ${isNc(t) ? '' : row('Prioritetas', priorityLabel(t.priority))}
        ${row(isNc(t) ? 'Pašalinti iki' : 'Atlikti iki', fmtDate(t.due_date))}
        ${row('Būsena', statusLabel(t.status))}
        ${row('Sukurta', fmtDateTime(t.created_at))}
      </div>
      <div class="card">
        <div class="card-title">Kontaktai ir prieiga</div>
        ${row('Kontaktinis asmuo', t.contact_name)}
        ${row('Telefonas', t.contact_phone)}
        ${row('Laiptinė', t.stairwell)}
        ${row('Butas', t.apartment)}
        ${row('Laiptinės kodas', t.entry_code)}
        ${row('Vadybininkas', t.manager)}
      </div>
    </div>
    ${t.description ? `<div class="card"><div class="card-title">Pranešimo tekstas</div><div class="msg">${nl2br(t.description)}</div></div>` : ''}
    <div class="card next-steps">
      <div class="card-title">Toliau</div>
      <div class="steps">
        <a class="step ${S.photos.length ? 'done' : ''}" href="#/u/${t.id}/foto">${icon('camera')}<span>1. Nufotografuoti ir pažymėti</span><small>${S.photos.length} nuotr.</small></a>
        <a class="step ${t.field_notes ? 'done' : ''}" href="#/u/${t.id}/apziura">${icon('edit')}<span>2. ${isNc(t) ? 'Aprašyti / padiktuoti neatitiktį' : 'Aprašyti situaciją'}</span><small>${t.field_notes ? 'aprašyta' : 'neaprašyta'}</small></a>
        <a class="step ${(isNc(t) ? t.nc_act : t.defect_act) ? 'done' : ''}" href="#/u/${t.id}/aktai">${icon('spark')}<span>3. Sugeneruoti ${isNc(t) ? 'neatikties ' : ''}aktą</span><small>${(isNc(t) ? t.nc_act : t.defect_act) ? 'paruoštas' : 'neparuoštas'}</small></a>
      </div>
    </div>
    <div class="row-actions">
      <a class="btn" href="#/u/${t.id}/redaguoti">${icon('edit')} Redaguoti užduotį</a>
      <button class="btn danger-ghost" id="del-task">${icon('trash')} Ištrinti</button>
    </div>`;

  const cc = $('#copy-code');
  if (cc) cc.addEventListener('click', () => {
    navigator.clipboard && navigator.clipboard.writeText(t.entry_code);
    toast('Kodas nukopijuotas', 'ok');
  });
  $('#del-task').addEventListener('click', async () => {
    if (!await confirmDialog('Ištrinti užduotį kartu su nuotraukomis ir aktais? Veiksmo atšaukti negalima.', 'Ištrinti')) return;
    await db.deleteTask(t.id);
    toast('Užduotis ištrinta', 'ok');
    location.hash = '#/';
  });
}

// ---------------------------------------------------------------------
// Nuotraukos
// ---------------------------------------------------------------------

async function drawPhotos(body) {
  body = fresh(body);
  const numbers = photoNumbers();
  body.innerHTML = `
    <div class="photo-actions">
      <label class="btn primary big">${icon('camera')} Fotografuoti<input type="file" accept="image/*" capture="environment" multiple hidden data-up></label>
      <label class="btn big">${icon('image')} Įkelti nuotraukas<input type="file" accept="image/*" multiple hidden data-up></label>
      <span class="muted small hide-mobile">arba nutempkite failus čia. Paspaudę ant nuotraukos galėsite pažymėti vietas.</span>
    </div>
    <div id="up-progress"></div>
    <div class="photo-grid" id="pgrid">
      ${S.photos.length ? S.photos.map((p, i) => `
        <div class="photo-card ${p.include_in_act ? '' : 'excluded'}" data-id="${p.id}">
          <div class="ph-img" data-a="annotate" title="Pažymėti">
            <img alt="" data-src="${p.id}">
            ${numbers[p.id] ? `<span class="ph-no">${numbers[p.id]} pav.</span>` : ''}
            ${p.annotated_path ? `<span class="ph-ann">${icon('pen')} pažymėta</span>` : ''}
          </div>
          <input class="ph-cap" data-a="caption" value="${esc(p.caption)}" placeholder="Aprašas, pvz. „Įlaja ant stogo“">
          <div class="ph-row">
            <label class="chk"><input type="checkbox" data-a="include" ${p.include_in_act ? 'checked' : ''}> Į aktą</label>
            <span class="sp"></span>
            <button class="btn icon-only small" data-a="annotate" title="Žymėti">${icon('pen')}</button>
            <button class="btn icon-only small" data-a="up" title="Aukštyn" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
            <button class="btn icon-only small" data-a="down" title="Žemyn" ${i === S.photos.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
            <button class="btn icon-only small danger-ghost" data-a="del" title="Ištrinti">${icon('trash')}</button>
          </div>
        </div>`).join('') : `<div class="empty card">Nuotraukų dar nėra.</div>`}
    </div>`;

  // užkraunam vaizdus
  for (const p of S.photos) {
    db.photoUrl(p).then(u => { const img = body.querySelector(`img[data-src="${p.id}"]`); if (img) img.src = u; });
  }

  $$('[data-up]', body).forEach(inp => inp.addEventListener('change', e => upload(e.target.files)));

  const grid = $('#pgrid');
  ['dragover', 'dragenter'].forEach(ev => body.addEventListener(ev, e => { e.preventDefault(); grid.classList.add('drop'); }));
  ['dragleave', 'drop'].forEach(ev => body.addEventListener(ev, e => { e.preventDefault(); grid.classList.remove('drop'); }));
  body.addEventListener('drop', e => { if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });

  grid.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const card = a.closest('.photo-card');
    const p = S.photos.find(x => x.id === card.dataset.id);
    const act = a.dataset.a;
    if (act === 'annotate') return annotate(p);
    if (act === 'del') {
      if (!await confirmDialog('Ištrinti nuotrauką?', 'Ištrinti')) return;
      await db.deletePhoto(p);
      S.photos = S.photos.filter(x => x.id !== p.id);
      return drawPhotos(body);
    }
    if (act === 'up' || act === 'down') {
      const i = S.photos.indexOf(p);
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= S.photos.length) return;
      [S.photos[i], S.photos[j]] = [S.photos[j], S.photos[i]];
      await Promise.all(S.photos.map((x, k) => x.sort === k ? null : db.updatePhoto(x.id, { sort: k }).then(n => { x.sort = n.sort; })));
      return drawPhotos(body);
    }
  });
  grid.addEventListener('change', async e => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const p = S.photos.find(x => x.id === a.closest('.photo-card').dataset.id);
    if (a.dataset.a === 'include') {
      Object.assign(p, await db.updatePhoto(p.id, { include_in_act: a.checked }));
      drawPhotos(body);
    } else if (a.dataset.a === 'caption') {
      Object.assign(p, await db.updatePhoto(p.id, { caption: a.value }));
      toast('Aprašas išsaugotas', 'ok', 1200);
    }
  });

  async function upload(files) {
    files = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const prog = $('#up-progress');
    let sort = S.photos.reduce((m, p) => Math.max(m, p.sort || 0), -1) + 1;
    let done = 0;
    for (const f of files) {
      prog.innerHTML = `<div class="progress"><span class="spinner"></span> Įkeliama ${done + 1} iš ${files.length}...</div>`;
      try {
        const { blob, width, height } = await processImage(f);
        const p = await db.addPhoto(S.task.id, blob, { width, height, sort: sort++ });
        S.photos.push(p);
        done++;
      } catch (err) {
        console.error(err);
        toast('Nepavyko įkelti: ' + (err.message || err), 'error');
      }
    }
    prog.innerHTML = '';
    if (done && ['nauja', 'planuota'].includes(S.task.status)) await save({ status: 'apziureta' });
    toast(`Įkelta nuotraukų: ${done}`, 'ok');
    draw();
  }
}

function photoNumbers() {
  const m = {};
  let n = 0;
  S.photos.forEach(p => { if (p.include_in_act) m[p.id] = ++n; });
  return m;
}

async function annotate(p) {
  const blob = await db.photoBlob(p);
  if (!blob) return toast('Nepavyko atidaryti nuotraukos', 'error');
  const res = await openAnnotator({ blob, shapes: p.annotations || [], title: p.caption || 'Nuotraukos žymėjimas' });
  if (!res) return;
  toast('Saugoma...', 'info', 1500);
  const n = await db.saveAnnotated(p, res.shapes.length ? res.blob : null, res.shapes);
  Object.assign(p, n);
  toast('Žymėjimai išsaugoti', 'ok');
  draw();
}

// ---------------------------------------------------------------------
// Apžiūra (inžinieriaus aprašymas)
// ---------------------------------------------------------------------

const HINTS = [
  'Kas pažeista ir kur (aukštas, laiptinė, stogas, rūsys)?',
  'Matmenys: plotas m², ilgis m, kiekis vnt.',
  'Galima priežastis',
  'Ar pavojinga / skubu?',
  'Ką rekomenduojate daryti?'
];

const HINTS_NC = [
  'Kas neatitinka ir kur?',
  'Koks reikalavimas pažeistas (projektas, instrukcija, norma)?',
  'Matmenys / apimtis',
  'Ar tai kelia pavojų?',
  'Ką rangovas turi pataisyti?'
];

function drawInspection(body) {
  body = fresh(body);
  const t = S.task;
  const nc = isNc(t);
  body.innerHTML = `
    <div class="card form-grid">
      <label>${nc ? 'Neatikties nustatymo data' : 'Apžiūros data'}<input type="date" name="inspection_date" value="${esc(fmtDate(t.inspection_date) || today())}"></label>
      ${nc ? '' : `<label>Apžiūros tikslas<select name="inspection_purpose">
        ${PURPOSES.map(p => `<option ${p === t.inspection_purpose ? 'selected' : ''}>${esc(p)}</option>`).join('')}
      </select></label>`}
      <div class="span2 save-ind" id="save-ind"></div>
      <div class="span4 notes-head">
        <span class="lbl">${nc ? 'Kokios neatitiktys nustatytos? Padiktuokite arba aprašykite laisvai – DI suformuluos aktą.' : 'Ką radote vietoje? Aprašykite laisvai – DI suformuluos aktą.'}</span>
        <button type="button" class="btn small" id="dictate" hidden>${icon('mic')} Diktuoti</button>
      </div>
      <textarea class="span4 notes" name="field_notes" rows="12" placeholder="${nc
        ? 'Pvz.: Rangovas sumontavo įlają be hidroizoliacijos prilydymo, aplink ją matomi tarpai. Bituminė danga klota ant drėgno pagrindo, susidariusios pūslės ~2 m². Nepašalintos statybinės atliekos.'
        : 'Pvz.: Ant stogo virš 7 laiptinės užakusi įlaja, aplink ją ~3 m² atšokusi bituminė danga. Šalia senas antenos stovas, prakiurusi danga aplink jį. Laiptinėje 5 aukšte ties el. skydine šlapios lubos ~2 m², nutekėjimo žymės ant sienos. El. skydinė drėgna...'}">${esc(t.field_notes)}</textarea>
      <div class="span4 hints">${(nc ? HINTS_NC : HINTS).map(h => `<span class="hint">${esc(h)}</span>`).join('')}</div>
    </div>
    <div class="row-actions">
      <a class="btn" href="#/u/${t.id}/foto">${icon('camera')} Nuotraukos (${S.photos.length})</a>
      <a class="btn primary" href="#/u/${t.id}/aktai" id="to-acts">${icon('spark')} Toliau – ${nc ? 'aktas' : 'aktai'}</a>
    </div>`;

  const ind = $('#save-ind');
  const doSave = debounce(async (patch) => {
    ind.textContent = 'Saugoma...';
    try { await save(patch); ind.textContent = 'Išsaugota ' + new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { ind.textContent = 'Klaida: ' + e.message; }
  }, 900);
  let pending = {};
  const collect = (e) => {
    const n = e.target.name;
    if (!n) return;
    pending[n] = e.target.value || null;
    doSave({ ...pending });
  };
  body.addEventListener('input', collect);
  body.addEventListener('change', collect);
  $('#to-acts').addEventListener('click', () => { if (Object.keys(pending).length) doSave.flush({ ...pending }); });
  if (!t.inspection_date) save({ inspection_date: today() });

  // Diktavimas (Chrome / Android / Edge)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#dictate');
  if (SR) {
    btn.hidden = false;
    let rec = null;
    btn.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'lt-LT';
      rec.continuous = true;
      rec.interimResults = false;
      const ta = body.querySelector('[name=field_notes]');
      rec.onresult = ev => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) {
            const txt = ev.results[i][0].transcript.trim();
            ta.value = (ta.value ? ta.value.replace(/\s*$/, ' ') : '') + txt.charAt(0).toUpperCase() + txt.slice(1) + '.';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      };
      rec.onend = () => { rec = null; btn.classList.remove('rec'); btn.innerHTML = `${icon('mic')} Diktuoti`; };
      rec.onerror = ev => toast('Diktavimo klaida: ' + ev.error, 'error');
      rec.start();
      btn.classList.add('rec');
      btn.innerHTML = `${icon('mic')} Klausoma... (stabdyti)`;
    });
  }
}

// ---------------------------------------------------------------------
// Aktai
// ---------------------------------------------------------------------

function drawActs(body) {
  body = fresh(body);
  const t = S.task;
  const pending = (t.ai_questions || []).filter(q => !q.done);
  const answered = (t.ai_questions || []).filter(q => q.done);
  const nPhotos = S.photos.filter(p => p.include_in_act).length;
  const hasInput = (t.field_notes || '').trim() || (t.description || '').trim();

  body.innerHTML = `
    <div class="card">
      <div class="card-title">Ką parengti?</div>
      <div class="mode-pick">
        <label class="mode ${t.act_mode !== 'full' ? 'on' : ''}">
          <input type="radio" name="mode" value="defect" ${t.act_mode !== 'full' ? 'checked' : ''}>
          <b>Defektinis aktas</b><span>Defektai ir rekomenduojami darbai, be kiekių</span>
        </label>
        <label class="mode ${t.act_mode === 'full' ? 'on' : ''}">
          <input type="radio" name="mode" value="full" ${t.act_mode === 'full' ? 'checked' : ''}>
          <b>Defektinis + numatomų darbų aktas</b><span>Papildomai darbų lentelė su mato vnt. ir kiekiais</span>
        </label>
      </div>
      <div class="gen-info muted small">
        DI gaus: užduoties duomenis, ${t.field_notes ? `jūsų aprašymą (${t.field_notes.length} simb.)` : '<b class="warn">aprašymo nėra</b>'},
        ${nPhotos} nuotr.${S.photos.some(p => p.annotated_path && p.include_in_act) ? ' (su žymėjimais)' : ''}${answered.length ? `, ${answered.length} atsakymus į klausimus` : ''}.
        ${!t.field_notes ? `<a href="#/u/${t.id}/apziura">Aprašyti situaciją</a>` : ''}
      </div>
      <div class="gen-actions">
        <button class="btn primary big" id="gen" ${hasInput || nPhotos ? '' : 'disabled'}>${icon('spark')} ${t.defect_act ? 'Generuoti iš naujo' : 'Generuoti su DI'}</button>
        ${!t.defect_act ? `<button class="btn ghost" id="manual">Pildyti rankiniu būdu</button>` : ''}
      </div>
    </div>

    ${pending.length ? drawQuestions(pending) : ''}
    ${t.defect_act ? drawActEditor() : ''}
    ${answered.length ? `
      <details class="card qa-hist">
        <summary>Atsakymai į DI klausimus (${answered.length})</summary>
        ${answered.map((q, i) => `<div class="qa"><b>${i + 1}. ${esc(q.question)}</b><div>${esc(q.answer || '— (neatsakyta)')}</div></div>`).join('')}
        <button class="btn ghost small" id="clear-qa">Išvalyti atsakymus</button>
      </details>` : ''}`;

  // Režimas
  $$('input[name=mode]', body).forEach(r => r.addEventListener('change', async e => {
    await save({ act_mode: e.target.value });
    drawActs(body);
  }));

  $('#gen').addEventListener('click', () => generate(body, {}));
  const man = $('#manual');
  if (man) man.addEventListener('click', async () => {
    const patch = {
      defect_act: { purpose: `${t.inspection_purpose || 'Neeilinė'} apžiūra`, problem: t.problem || '', urgency: 'Planinis', summary: '', objects: [{ system: '', defects: '', works: '', photos: [] }] },
      works_act: t.act_mode === 'full' ? { rows: [{ section: 'Atliekami darbai', description: '', unit: 'Vnt.', qty: null, notes: '' }], note: S.settings.works_note } : null
    };
    await ensureActNumber(patch);
    await save(patch);
    drawActs(body);
  });
  const cq = $('#clear-qa');
  if (cq) cq.addEventListener('click', async () => { await save({ ai_questions: [] }); drawActs(body); });

  if (pending.length) bindQuestions(body, pending);
  if (t.defect_act) bindActEditor(body);
}

// ---------- DI klausimai ----------

function drawQuestions(pending) {
  return `
    <div class="card questions">
      <div class="card-title">${icon('spark')} DI prašo patikslinti</div>
      <p class="muted small">Atsakykite trumpai (galite spausti pasiūlymus). Neatsakytus klausimus DI pakeis prielaidomis.</p>
      ${pending.map((q, i) => `
        <div class="q" data-i="${i}">
          <div class="q-text">${i + 1}. ${esc(q.question)}</div>
          ${q.why ? `<div class="q-why">${esc(q.why)}</div>` : ''}
          ${(q.suggestions || []).length ? `<div class="q-sugg">${q.suggestions.map(s => `<button class="chip" type="button" data-sugg="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
          <textarea rows="2" data-ans="${i}" placeholder="Atsakymas...">${esc(q.answer)}</textarea>
        </div>`).join('')}
      <div class="gen-actions">
        <button class="btn primary" id="answer-gen">${icon('spark')} Atsakyti ir generuoti</button>
        <button class="btn ghost" id="force-gen">Generuoti nepaisant klausimų</button>
      </div>
    </div>`;
}

function bindQuestions(body, pending) {
  const box = $('.questions', body);
  box.addEventListener('click', e => {
    const s = e.target.closest('[data-sugg]');
    if (!s) return;
    const ta = s.closest('.q').querySelector('textarea');
    ta.value = ta.value ? `${ta.value}; ${s.dataset.sugg}` : s.dataset.sugg;
  });
  const collect = () => {
    const all = S.task.ai_questions.slice();
    let k = 0;
    all.forEach(q => {
      if (q.done) return;
      const ta = box.querySelector(`[data-ans="${k++}"]`);
      q.answer = ta ? ta.value.trim() : q.answer;
      q.done = true;
    });
    return all;
  };
  $('#answer-gen').addEventListener('click', async () => {
    await save({ ai_questions: collect() });
    generate(body, {});
  });
  $('#force-gen').addEventListener('click', async () => {
    await save({ ai_questions: collect() });
    generate(body, { force: true });
  });
}

// ---------- Generavimas ----------

async function generate(body, { force = false, instruction = '' }) {
  const t = S.task;
  const mode = t.act_mode === 'full' ? 'full' : 'defect';
  const overlay = showBusy(instruction ? 'DI taiso aktą...' : 'DI analizuoja aprašymą ir nuotraukas...');
  try {
    const actPhotos = S.photos.filter(p => p.include_in_act);
    const photos = [];
    for (let i = 0; i < actPhotos.length; i++) {
      const p = actPhotos[i];
      photos.push({ n: i + 1, caption: p.caption || '', annotated: !!p.annotated_path, ...(await db.photoForAI(p)) });
    }
    const payload = {
      mode, force: force || !!instruction, instruction,
      task: {
        address: t.address, city: t.city, apartment: t.apartment, stairwell: t.stairwell,
        service_type: t.service_type, problem: t.problem, description: t.description,
        field_notes: t.field_notes, inspection_purpose: t.inspection_purpose, priority: priorityLabel(t.priority)
      },
      qa: (t.ai_questions || []).filter(q => q.done).map(q => ({ question: q.question, answer: q.answer })),
      current: instruction ? { defect_act: t.defect_act, works_act: t.works_act } : undefined,
      photos
    };
    const res = await db.ai('generate_act', payload);

    if (res.status === 'questions' && (res.questions || []).length && !force && !instruction) {
      const qs = (t.ai_questions || []).filter(q => q.done).concat(
        res.questions.map(q => ({ question: q.question, why: q.why || '', suggestions: q.suggestions || [], answer: '', done: false })));
      await save({ ai_questions: qs });
      toast('DI turi klausimų', 'info');
    } else {
      if (!res.defect_act) throw new Error('DI negrąžino akto. Bandykite dar kartą.');
      const patch = {
        defect_act: normalizeDefect(res.defect_act),
        works_act: mode === 'full' ? normalizeWorks(res.works_act) : null,
        ai_assumptions: res.assumptions || [],
        act_generated_at: new Date().toISOString()
      };
      if (['nauja', 'planuota', 'apziureta'].includes(t.status)) patch.status = 'aktas';
      await ensureActNumber(patch);
      await save(patch);
      toast(instruction ? 'Aktas pataisytas' : 'Aktas paruoštas – peržiūrėkite ir pataisykite, jei reikia', 'ok', 4500);
    }
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'error', 8000);
  } finally {
    overlay.remove();
    draw();
  }
}

async function ensureActNumber(patch) {
  if (!S.task.act_number) patch.act_number = await db.nextActNumber(S.task.kind);
  if (!S.task.act_date) patch.act_date = today();
}

function normalizeDefect(d) {
  return {
    purpose: d.purpose || '', problem: d.problem || '', urgency: d.urgency || 'Planinis', summary: d.summary || '',
    objects: (d.objects || []).map(o => ({ system: o.system || '', defects: o.defects || '', works: o.works || '', photos: o.photos || [] }))
  };
}

function normalizeWorks(w) {
  if (!w) return { rows: [], note: S.settings.works_note };
  return {
    note: w.note || S.settings.works_note,
    rows: (w.rows || []).map(r => ({
      section: r.section || 'Atliekami darbai', description: r.description || '', unit: r.unit || 'Vnt.',
      qty: r.qty === undefined ? null : r.qty, notes: r.notes || ''
    }))
  };
}

function showBusy(text) {
  const o = document.createElement('div');
  o.className = 'busy';
  o.innerHTML = `<div class="busy-box"><span class="spinner big"></span><div>${esc(text)}</div><small>Paprastai užtrunka 20–60 s</small></div>`;
  document.body.appendChild(o);
  return o;
}

// ---------- Akto redaktorius ----------

function drawActEditor() {
  const t = S.task;
  const d = t.defect_act;
  const w = t.works_act;
  const assumptions = t.ai_assumptions || [];
  const ta = (v, attrs, rows = 3) => `<textarea rows="${rows}" ${attrs}>${esc(v)}</textarea>`;

  return `
    <div class="card act-ed">
      <div class="act-ed-head">
        <div class="card-title">Defektavimo aktas</div>
        <span class="save-ind" id="act-save"></span>
      </div>
      <div class="form-grid">
        <label>Akto Nr.<input data-f="act_number" value="${esc(t.act_number)}"></label>
        <label>Data<input type="date" data-f="act_date" value="${esc(fmtDate(t.act_date))}"></label>
        <label>Skubumas<select data-d="urgency">${['Avarinis', 'Skubus', 'Planinis'].map(u => `<option ${u === d.urgency ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label>Apžiūros tikslas<input data-d="purpose" value="${esc(d.purpose)}"></label>
        <label class="span4">Problema<input data-d="problem" value="${esc(d.problem)}"></label>
      </div>
      <div class="obj-list">
        ${d.objects.map((o, i) => `
          <div class="obj" data-oi="${i}">
            <div class="obj-head">
              <input class="obj-sys" data-o="system" value="${esc(o.system)}" placeholder="Apžiūrėtas objektas / sistema">
              <input class="obj-ph" data-o="photos" value="${esc((o.photos || []).join(', '))}" placeholder="Nuotr. Nr." title="Susijusių nuotraukų numeriai">
              <button class="btn icon-only small danger-ghost" data-act="del-obj" title="Šalinti">${icon('trash')}</button>
            </div>
            <div class="obj-body">
              <label>Pastebėti defektai, deformacijos, gedimai${ta(o.defects, 'data-o="defects"')}</label>
              <label>Rekomenduojami darbai defektams pašalinti${ta(o.works, 'data-o="works"')}</label>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn small" data-act="add-obj">${icon('plus')} Pridėti objektą</button>
      <label class="block-lbl">Išvada / santrauka${ta(d.summary, 'data-d="summary"', 2)}</label>
    </div>

    ${w ? `
    <div class="card act-ed">
      <div class="card-title">Numatomų atlikti darbų aktas</div>
      <div class="works-table">
        <div class="wt-head"><span>Nr.</span><span>Skyrius</span><span>Darbų ir medžiagų aprašas</span><span>Mato vnt.</span><span>Kiekis</span><span>Pastabos</span><span></span></div>
        ${w.rows.map((r, i) => `
          <div class="wt-row" data-ri="${i}">
            <span class="wt-no">${i + 1}</span>
            <input data-r="section" value="${esc(r.section)}" placeholder="Skyrius">
            <textarea rows="2" data-r="description" placeholder="Darbo aprašas">${esc(r.description)}</textarea>
            <input data-r="unit" list="units" value="${esc(r.unit)}">
            <input data-r="qty" inputmode="decimal" value="${esc(fmtQty(r.qty))}" placeholder="?">
            <input data-r="notes" value="${esc(r.notes)}">
            <span class="wt-btns">
              <button class="btn icon-only small" data-act="row-up" title="Aukštyn">${icon('up')}</button>
              <button class="btn icon-only small danger-ghost" data-act="row-del" title="Šalinti">${icon('trash')}</button>
            </span>
          </div>`).join('')}
      </div>
      <datalist id="units">${UNITS.map(u => `<option value="${esc(u)}">`).join('')}</datalist>
      <button class="btn small" data-act="add-row">${icon('plus')} Pridėti eilutę</button>
      <label class="block-lbl">Pastaba po lentele<input data-w="note" value="${esc(w.note)}"></label>
    </div>` : (t.act_mode === 'full' ? `<div class="card muted">Numatomų darbų aktas dar nesugeneruotas – spauskite „Generuoti iš naujo“ arba <button class="linkbtn" data-act="add-works">sukurkite tuščią lentelę</button>.</div>` : '')}

    ${assumptions.length ? `
    <div class="card assumptions">
      <div class="card-title">DI prielaidos (į aktą nepatenka – patikrinkite)</div>
      <ul>${assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="card refine">
      <div class="card-title">${icon('spark')} Pataisyti su DI</div>
      <div class="refine-row">
        <input id="refine-txt" placeholder="Pvz.: pridėk pastolius ir šiukšlių išvežimą; įlajos skersmuo 100 mm">
        <button class="btn" id="refine-btn">Taisyti</button>
      </div>
    </div>

    <div class="card print-box">
      <div class="card-title">${icon('print')} Spausdinti / išsaugoti PDF</div>
      <div class="gen-actions">
        <a class="btn primary" href="#/spausdinti/${t.id}/defect">${icon('file')} Defektavimo aktas</a>
        ${w ? `<a class="btn" href="#/spausdinti/${t.id}/works">${icon('file')} Numatomų darbų aktas</a>
        <a class="btn" href="#/spausdinti/${t.id}/both">${icon('file')} Abu viename PDF</a>` : ''}
      </div>
    </div>`;
}

function bindActEditor(body) {
  const ind = () => $('#act-save', body);
  const persist = debounce(async () => {
    const i = ind(); if (i) i.textContent = 'Saugoma...';
    try {
      await save({ defect_act: S.task.defect_act, works_act: S.task.works_act, act_number: S.task.act_number, act_date: S.task.act_date });
      const j = ind(); if (j) j.textContent = 'Išsaugota';
    } catch (e) { toast(e.message, 'error'); }
  }, 900);

  body.addEventListener('input', e => {
    const el = e.target;
    const t = S.task;
    if (el.dataset.f) t[el.dataset.f] = el.value || null;
    else if (el.dataset.d) t.defect_act[el.dataset.d] = el.value;
    else if (el.dataset.o) {
      const o = t.defect_act.objects[+el.closest('[data-oi]').dataset.oi];
      o[el.dataset.o] = el.dataset.o === 'photos'
        ? el.value.split(/[ ,;]+/).map(Number).filter(n => n > 0) : el.value;
    } else if (el.dataset.r) {
      const r = t.works_act.rows[+el.closest('[data-ri]').dataset.ri];
      r[el.dataset.r] = el.dataset.r === 'qty' ? parseQty(el.value) : el.value;
    } else if (el.dataset.w) t.works_act[el.dataset.w] = el.value;
    else return;
    persist();
  });

  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const t = S.task;
    const a = b.dataset.act;
    if (a === 'add-obj') t.defect_act.objects.push({ system: '', defects: '', works: '', photos: [] });
    else if (a === 'del-obj') {
      if (!await confirmDialog('Pašalinti šį objektą iš akto?', 'Pašalinti')) return;
      t.defect_act.objects.splice(+b.closest('[data-oi]').dataset.oi, 1);
    } else if (a === 'add-row') {
      const last = t.works_act.rows[t.works_act.rows.length - 1];
      t.works_act.rows.push({ section: last ? last.section : 'Atliekami darbai', description: '', unit: 'Vnt.', qty: null, notes: '' });
    } else if (a === 'row-del') t.works_act.rows.splice(+b.closest('[data-ri]').dataset.ri, 1);
    else if (a === 'row-up') {
      const i = +b.closest('[data-ri]').dataset.ri;
      if (i > 0) [t.works_act.rows[i - 1], t.works_act.rows[i]] = [t.works_act.rows[i], t.works_act.rows[i - 1]];
    } else if (a === 'add-works') t.works_act = { rows: [{ section: 'Atliekami darbai', description: '', unit: 'Vnt.', qty: null, notes: '' }], note: S.settings.works_note };
    else return;
    await persist.flush();
    drawActs(body.closest('#tab-body') || body);
  });

  const rb = $('#refine-btn', body);
  rb.addEventListener('click', async () => {
    const txt = $('#refine-txt', body).value.trim();
    if (!txt) return toast('Įrašykite, ką pataisyti', 'error');
    await persist.flush();
    generate(body, { instruction: txt });
  });
}

// ---------------------------------------------------------------------
// Neatikties aktas (rangovo darbų neatitiktys)
// ---------------------------------------------------------------------

const SEVERITIES = ['Nežymi', 'Esminė', 'Kritinė'];

function emptyNcItem() { return { description: '', requirement: '', action: '', photos: [] }; }

function drawNcActs(body) {
  body = fresh(body);
  const t = S.task;
  const a = t.nc_act;
  const nPhotos = S.photos.filter(p => p.include_in_act).length;
  const hasInput = (t.field_notes || '').trim() || (t.problem || '').trim();

  body.innerHTML = `
    <div class="card">
      <div class="card-title">Neatikties aktas</div>
      <div class="gen-info muted small">
        DI gaus: objekto ir rangovo duomenis, ${t.field_notes ? `jūsų aprašymą (${t.field_notes.length} simb.)` : '<b class="warn">aprašymo nėra</b>'},
        ${nPhotos} nuotr.${S.photos.some(p => p.annotated_path && p.include_in_act) ? ' (su žymėjimais)' : ''}.
        ${!t.field_notes ? `<a href="#/u/${t.id}/apziura">Aprašyti neatitiktį</a>` : ''}
      </div>
      <div class="gen-actions">
        <button class="btn primary big" id="gen-nc" ${hasInput || nPhotos ? '' : 'disabled'}>${icon('spark')} ${a ? 'Generuoti iš naujo' : 'Generuoti su DI'}</button>
        ${!a ? `<button class="btn ghost" id="manual-nc">Pildyti rankiniu būdu</button>` : ''}
      </div>
    </div>
    ${a ? drawNcEditor() : ''}`;

  $('#gen-nc').addEventListener('click', () => generateNc(body, {}));
  const man = $('#manual-nc');
  if (man) man.addEventListener('click', async () => {
    const patch = { nc_act: { work: t.service_type || '', severity: 'Esminė', summary: '', items: [emptyNcItem()] } };
    await ensureActNumber(patch);
    await save(patch);
    drawNcActs(body);
  });
  if (a) bindNcEditor(body);
}

async function generateNc(body, { instruction = '' }) {
  const t = S.task;
  const overlay = showBusy(instruction ? 'DI taiso aktą...' : 'DI analizuoja aprašymą ir nuotraukas...');
  try {
    const actPhotos = S.photos.filter(p => p.include_in_act);
    const photos = [];
    for (let i = 0; i < actPhotos.length; i++) {
      const p = actPhotos[i];
      photos.push({ n: i + 1, caption: p.caption || '', annotated: !!p.annotated_path, ...(await db.photoForAI(p)) });
    }
    const res = await db.ai('generate_nc', {
      instruction,
      current: instruction ? t.nc_act : undefined,
      task: {
        address: t.address, city: t.city, stairwell: t.stairwell, contractor: t.contractor,
        work_name: t.service_type, problem: t.problem, description: t.description,
        field_notes: t.field_notes, inspection_date: t.inspection_date
      },
      photos
    });
    if (!(res.items || []).length) throw new Error('DI negrąžino neatikčių. Papildykite aprašymą ir bandykite dar kartą.');
    const patch = {
      nc_act: {
        work: res.work || t.service_type || '',
        severity: SEVERITIES.includes(res.severity) ? res.severity : 'Esminė',
        summary: res.summary || '',
        items: res.items.map(i => ({
          description: i.description || '', requirement: i.requirement || '', action: i.action || '', photos: i.photos || []
        }))
      },
      ai_assumptions: res.assumptions || [],
      act_generated_at: new Date().toISOString()
    };
    if (!t.problem && patch.nc_act.items[0]) patch.problem = patch.nc_act.items[0].description.slice(0, 140);
    if (['nauja', 'planuota', 'apziureta'].includes(t.status)) patch.status = 'aktas';
    await ensureActNumber(patch);
    await save(patch);
    toast(instruction ? 'Aktas pataisytas' : 'Aktas paruoštas – peržiūrėkite ir pataisykite, jei reikia', 'ok', 4500);
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'error', 8000);
  } finally {
    overlay.remove();
    draw();
  }
}

function drawNcEditor() {
  const t = S.task;
  const a = t.nc_act;
  const assumptions = t.ai_assumptions || [];
  const ta = (v, attrs, rows = 3) => `<textarea rows="${rows}" ${attrs}>${esc(v)}</textarea>`;
  return `
    <div class="card act-ed">
      <div class="act-ed-head">
        <div class="card-title">Neatikties aktas</div>
        <span class="save-ind" id="act-save"></span>
      </div>
      <div class="form-grid">
        <label>Akto Nr.<input data-f="act_number" value="${esc(t.act_number)}"></label>
        <label>Data<input type="date" data-f="act_date" value="${esc(fmtDate(t.act_date))}"></label>
        <label>Neatikties lygis<select data-n="severity">${SEVERITIES.map(s => `<option ${s === a.severity ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Pašalinti iki<input type="date" data-f="due_date" value="${esc(fmtDate(t.due_date))}"></label>
        <label class="span2">Rangovas<input data-f="contractor" value="${esc(t.contractor)}"></label>
        <label class="span2">Vertinami darbai<input data-n="work" value="${esc(a.work)}"></label>
      </div>
      <div class="obj-list">
        ${a.items.map((o, i) => `
          <div class="obj" data-ii="${i}">
            <div class="obj-head">
              <b class="obj-no">${i + 1}.</b>
              <input class="obj-ph" data-i="photos" value="${esc((o.photos || []).join(', '))}" placeholder="Nuotr. Nr." title="Susijusių nuotraukų numeriai">
              <button class="btn icon-only small danger-ghost" data-act="del-item" title="Šalinti">${icon('trash')}</button>
            </div>
            <div class="obj-body">
              <label>Nustatyta neatiktis${ta(o.description, 'data-i="description"')}</label>
              <label>Pažeidžiamas reikalavimas${ta(o.requirement, 'data-i="requirement"')}</label>
              <label>Rangovas privalo${ta(o.action, 'data-i="action"')}</label>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn small" data-act="add-item">${icon('plus')} Pridėti neatiktį</button>
      <label class="block-lbl">Išvada / reikalavimas rangovui${ta(a.summary, 'data-n="summary"', 2)}</label>
    </div>

    ${assumptions.length ? `
    <div class="card assumptions">
      <div class="card-title">DI prielaidos (į aktą nepatenka – patikrinkite)</div>
      <ul>${assumptions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="card refine">
      <div class="card-title">${icon('spark')} Pataisyti su DI</div>
      <div class="refine-row">
        <input id="refine-txt" placeholder="Pvz.: pridėk, kad nepateikti paslėptų darbų aktai; terminas 5 darbo dienos">
        <button class="btn" id="refine-btn">Taisyti</button>
      </div>
    </div>

    <div class="card print-box">
      <div class="card-title">${icon('print')} Spausdinti / išsaugoti PDF</div>
      <div class="gen-actions">
        <a class="btn primary" href="#/spausdinti/${t.id}/nc">${icon('file')} Neatikties aktas</a>
      </div>
    </div>`;
}

function bindNcEditor(body) {
  const ind = () => $('#act-save', body);
  const persist = debounce(async () => {
    const i = ind(); if (i) i.textContent = 'Saugoma...';
    try {
      const t = S.task;
      await save({ nc_act: t.nc_act, act_number: t.act_number, act_date: t.act_date, due_date: t.due_date, contractor: t.contractor });
      const j = ind(); if (j) j.textContent = 'Išsaugota';
    } catch (e) { toast(e.message, 'error'); }
  }, 900);

  body.addEventListener('input', e => {
    const el = e.target;
    const t = S.task;
    if (el.dataset.f) t[el.dataset.f] = el.value || null;
    else if (el.dataset.n) t.nc_act[el.dataset.n] = el.value;
    else if (el.dataset.i) {
      const o = t.nc_act.items[+el.closest('[data-ii]').dataset.ii];
      o[el.dataset.i] = el.dataset.i === 'photos'
        ? el.value.split(/[ ,;]+/).map(Number).filter(n => n > 0) : el.value;
    } else return;
    persist();
  });

  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const t = S.task;
    if (b.dataset.act === 'add-item') t.nc_act.items.push(emptyNcItem());
    else if (b.dataset.act === 'del-item') {
      if (!await confirmDialog('Pašalinti šią neatiktį iš akto?', 'Pašalinti')) return;
      t.nc_act.items.splice(+b.closest('[data-ii]').dataset.ii, 1);
    } else return;
    await persist.flush();
    drawNcActs(body.closest('#tab-body') || body);
  });

  $('#refine-btn', body).addEventListener('click', async () => {
    const txt = $('#refine-txt', body).value.trim();
    if (!txt) return toast('Įrašykite, ką pataisyti', 'error');
    await persist.flush();
    generateNc(body, { instruction: txt });
  });
}
