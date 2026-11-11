// =====================================================================
// Šilumos punktų (ŠP) aprašų modulis: ŠP sąrašas, priskyrimas šilumininkams
// ir šilumininko vedlys (klausimynas + nuotraukos). Modelis – heat-model.js.
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import { $, esc, toast, confirmDialog, debounce, processImage, buildingSummary, fmtDate } from './util.js';
import {
  STEPS, HP_STATUS, QUESTIONS, SLOTS, KINDS, GROUP_LABEL, expectedItems, itemLabel, itemFilled, computeProgress
} from './heat-model.js';

const LF = { q: '', st: 'visi', who: 'all', picked: new Set() };
const ST_CLASS = { nauja: 'st-nauja', pradeta: 'st-planuota', grazinta: 'st-apziureta', pateikta: 'st-aktas', parengta: 'st-baigta' };
const TYPE_KEYS = ['sildymas', 'sild_siurblys', 'kv', 'kv_cirkuliacija'];

export async function renderHeat(el, parts, go) {
  if (db.isDemo) { el.innerHTML = '<div class="card">Šilumos punktų modulis veikia tik prisijungus prie duomenų bazės.</div>'; return; }
  const me = await db.getProfile();
  if (me.role !== 'admin' && me.role !== 'heat') {
    el.innerHTML = '<div class="card">Šilumos punktų modulis jūsų paskyrai neįjungtas.</div>';
    return;
  }
  document.title = 'Šilumos punktai';
  if (parts[1]) return renderPoint(el, parts[1], parts[2] || '', me, go);
  return renderList(el, me);
}

// ---------------------------------------------------------------------
// Sąrašas
// ---------------------------------------------------------------------

async function renderList(el, me) {
  const isAdmin = me.role === 'admin';
  const [rows, people] = await Promise.all([db.listHeatPoints(), isAdmin ? db.listProfiles() : []]);
  const techs = people.filter(p => p.role === 'heat');
  const nameOf = id => db.profileName(people.find(p => p.id === id)) || '';
  const started = r => r.status === 'pradeta' || r.status === 'grazinta';
  const sent = r => r.status === 'pateikta' || r.status === 'parengta';

  el.innerHTML = `
    <div class="page-head"><h1>Šilumos punktai</h1></div>
    <div id="hp-sum"></div>
    <div class="list-tools">
      <div class="search">${icon('search')}<input id="hp-q" placeholder="Ieškoti pagal adresą, miestą ar tipą" value="${esc(LF.q)}" autocomplete="off"></div>
      <div class="chips" id="hp-chips"></div>
      ${isAdmin ? `<div class="hp-who"><span class="lbl">Šilumininkas:</span> <select id="hp-who"><option value="all">Visi</option>${techs.map(p => `<option value="${esc(p.id)}" ${LF.who === p.id ? 'selected' : ''}>${esc(db.profileName(p))}</option>`).join('')}</select></div>` : ''}
    </div>
    <div id="hp-bulk"></div>
    <div class="task-list" id="hp-list"></div>`;

  const filtered = () => {
    const q = LF.q.trim().toLowerCase();
    return rows.filter(r => {
      if (LF.st === 'isbraukti') { if (!r.excluded) return false; } else if (r.excluded) return false;
      if (LF.st === 'nauja' && r.status !== 'nauja') return false;
      if (LF.st === 'pradeta' && !started(r)) return false;
      if (LF.st === 'pateikta' && !sent(r)) return false;
      if (LF.st === 'nepriskirti' && r.assigned_to) return false;
      if (isAdmin && LF.who !== 'all' && r.assigned_to !== LF.who) return false;
      if (q && !`${r.address} ${r.city || ''} ${r.registry_type || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const draw = () => {
    const active = rows.filter(r => !r.excluded);
    const avg = list => list.length ? Math.round(list.reduce((a, r) => a + (r.progress || 0), 0) / list.length) : 0;
    const cnt = {
      visi: active.length, nauja: active.filter(r => r.status === 'nauja').length, pradeta: active.filter(started).length,
      pateikta: active.filter(sent).length, nepriskirti: active.filter(r => !r.assigned_to).length, isbraukti: rows.filter(r => r.excluded).length
    };
    $('#hp-sum').innerHTML = `<div class="card hp-sum">
      <div class="hp-sum-row"><b>${cnt.visi}</b> šilumos punktai · pateikta <b>${cnt.pateikta}</b> · pradėta <b>${cnt.pradeta}</b> · nepradėta <b>${cnt.nauja}</b> · vidutiniškai surinkta <b>${avg(active)} %</b></div>
      <div class="hp-bar big"><i style="width:${cnt.visi ? Math.round(cnt.pateikta * 100 / cnt.visi) : 0}%"></i></div>
      ${isAdmin && techs.length ? `<table class="hp-tech"><tr><th>Šilumininkas</th><th>Priskirta</th><th>Pradėta</th><th>Pateikta</th><th>Surinkta</th></tr>
        ${techs.map(p => { const mine = active.filter(r => r.assigned_to === p.id);
          return `<tr><td>${esc(db.profileName(p))}</td><td>${mine.length}</td><td>${mine.filter(started).length}</td><td>${mine.filter(sent).length}</td><td>${avg(mine)} %</td></tr>`; }).join('')}
        <tr><td class="muted">Nepriskirta</td><td>${cnt.nepriskirti}</td><td></td><td></td><td></td></tr></table>` : ''}
      ${isAdmin && !techs.length ? '<div class="muted small">Šilumininkų paskyrų dar nėra. Sukurkite jas: Nustatymai → Paskyros → Naujas vartotojas (rolė „Šilumininkas“).</div>' : ''}
    </div>`;

    const chips = [['visi', 'Visi'], ['nauja', 'Nepradėti'], ['pradeta', 'Pradėti'], ['pateikta', 'Pateikti']]
      .concat(isAdmin ? [['nepriskirti', 'Nepriskirti'], ['isbraukti', 'Išbraukti']] : []);
    $('#hp-chips').innerHTML = chips.map(([k, l]) => `<button class="chip ${LF.st === k ? 'on' : ''}" data-st="${k}">${l} <span>${cnt[k]}</span></button>`).join('');

    const shown = filtered();
    if (isAdmin) {
      const n = LF.picked.size;
      $('#hp-bulk').innerHTML = `<div class="hp-bulk">
        <button class="btn small" data-b="all">Pažymėti rodomus (${shown.length})</button>
        ${n ? `<button class="btn small ghost" data-b="none">Nuimti žymėjimą</button>
          <b>Pažymėta: ${n}</b>
          <select id="hp-assign"><option value="">— šilumininkas —</option>${techs.map(p => `<option value="${esc(p.id)}">${esc(db.profileName(p))}</option>`).join('')}</select>
          <button class="btn small primary" data-b="assign">Priskirti</button>
          <button class="btn small ghost" data-b="unassign">Nuimti priskyrimą</button>
          <button class="btn small ghost" data-b="${LF.st === 'isbraukti' ? 'include' : 'exclude'}">${LF.st === 'isbraukti' ? 'Grąžinti į sąrašą' : 'Išbraukti (neprižiūrimi)'}</button>` : '<span class="muted small">Pažymėkite šilumos punktus, kad priskirtumėte juos šilumininkui.</span>'}
      </div>`;
    }
    $('#hp-list').innerHTML = shown.length ? shown.map(r => `
      <a class="task-card hp-card ${ST_CLASS[r.status] || ''}${LF.picked.has(r.id) ? ' picked' : ''}" href="#/sp/${r.id}">
        ${isAdmin ? `<span class="hp-pick" data-pick="${r.id}" title="Pažymėti">${LF.picked.has(r.id) ? icon('check') : ''}</span>` : ''}
        <div class="tc-addr">${esc(r.address)}${r.seq > 1 ? ` · ŠP ${r.seq}` : ''}</div>
        <div class="muted small">${esc([r.city, r.registry_type, isAdmin ? (nameOf(r.assigned_to) || 'nepriskirta') : ''].filter(Boolean).join(' · '))}</div>
        <div class="hp-bar"><i style="width:${r.progress || 0}%"></i></div>
        <div class="hp-meta"><span class="tag">${esc(HP_STATUS[r.status] || r.status)}</span>
          <span class="muted small">${r.status === 'nauja' ? '' : `${r.progress || 0} % · trūksta ${r.missing || 0}`}</span></div>
      </a>`).join('') : `<div class="empty">${rows.length ? 'Pagal filtrą šilumos punktų nėra.' : isAdmin ? 'Šilumos punktų sąrašas tuščias.' : 'Jums dar nepriskirta šilumos punktų.'}</div>`;
  };
  draw();

  $('#hp-q').addEventListener('input', e => { LF.q = e.target.value; draw(); });
  $('#hp-chips').addEventListener('click', e => {
    const b = e.target.closest('[data-st]');
    if (b) { LF.st = b.dataset.st; LF.picked.clear(); draw(); }
  });
  const who = $('#hp-who');
  if (who) who.addEventListener('change', () => { LF.who = who.value; draw(); });
  $('#hp-list').addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (!p) return;
    e.preventDefault();
    if (LF.picked.has(p.dataset.pick)) LF.picked.delete(p.dataset.pick); else LF.picked.add(p.dataset.pick);
    draw();
  });
  $('#hp-bulk').addEventListener('click', async e => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const act = b.dataset.b, ids = [...LF.picked];
    if (act === 'all') { filtered().forEach(r => LF.picked.add(r.id)); return draw(); }
    if (act === 'none') { LF.picked.clear(); return draw(); }
    try {
      if (act === 'assign' || act === 'unassign') {
        const uid = act === 'assign' ? $('#hp-assign').value : null;
        if (act === 'assign' && !uid) return toast('Pasirinkite šilumininką', 'error');
        await db.assignHeatPoints(ids, uid);
        rows.forEach(r => { if (LF.picked.has(r.id)) r.assigned_to = uid; });
        toast(act === 'assign' ? `Priskirta: ${ids.length}` : `Priskyrimas nuimtas: ${ids.length}`, 'ok');
      } else {
        const ex = act === 'exclude';
        if (ex && !await confirmDialog(`Išbraukti ${ids.length} šilumos punktus iš sąrašo? Juos bet kada galėsite grąžinti (filtras „Išbraukti“).`, 'Išbraukti')) return;
        await db.setHeatPointsExcluded(ids, ex);
        rows.forEach(r => { if (LF.picked.has(r.id)) r.excluded = ex; });
        toast(ex ? 'Išbraukta' : 'Grąžinta į sąrašą', 'ok');
      }
      LF.picked.clear();
      draw();
    } catch (err) { toast(err.message || String(err), 'error', 6000); }
  });
}

// ---------------------------------------------------------------------
// Vieno ŠP vedlys
// ---------------------------------------------------------------------

async function renderPoint(el, id, stepId, me, go) {
  const isAdmin = me.role === 'admin';
  const [hp, items, photos] = await Promise.all([db.getHeatPoint(id), db.listHpItems(id), db.listHpPhotos(id)]);
  const S = { hp, items, photos, obj: null, techs: [] };
  S.hp.survey = S.hp.survey || {};
  if (S.hp.object_id) S.obj = await db.getObject(S.hp.object_id).catch(() => null);
  if (isAdmin) S.techs = (await db.listProfiles()).filter(p => p.role === 'heat');

  const prog = () => computeProgress(S.hp, S.items, S.photos);
  const typed = () => !!(S.hp.survey.sildymas && S.hp.survey.kv);
  const visSteps = () => STEPS.filter(st => (isAdmin || !st.office) && (!st.grp || !typed() || S.items.some(i => i.grp === st.id)));
  let step = visSteps().some(s => s.id === stepId) ? stepId : 'tipas';
  if (!stepId && typed()) {                                   // tęsiam nuo pirmo nebaigto žingsnio
    const first = prog().checks.find(c => !c.ok);
    step = first ? first.step : 'pabaiga';
  }

  el.innerHTML = `
    <div class="page-head">
      <a class="btn ghost" href="#/sp">${icon('back')} Sąrašas</a>
      <h1>${esc(S.hp.address)}${S.hp.seq > 1 ? ` · ŠP ${S.hp.seq}` : ''}</h1>
    </div>
    <div id="hp-top"></div>
    <div class="chips hp-steps" id="hp-steps"></div>
    <div id="hp-body"></div>
    <div class="hp-nav"><button class="btn" id="hp-prev">${icon('back')} Atgal</button><button class="btn primary" id="hp-next">Toliau</button></div>`;
  const body = $('#hp-body');

  // ---- saugojimas ----
  const meta = () => {
    const p = prog();
    return { progress: p.percent, missing: p.missing, status: S.hp.status === 'nauja' ? 'pradeta' : S.hp.status, visited_at: S.hp.visited_at || new Date().toISOString() };
  };
  const push = async patch => {
    try {
      const r = await db.updateHeatPoint(id, { ...meta(), ...patch });
      S.hp = { ...r, survey: S.hp.survey };                   // vietiniai atsakymai gali būti naujesni
    } catch (err) { toast('Nepavyko išsaugoti: ' + (err.message || err), 'error', 6000); }
  };
  const saveSurvey = debounce(() => push({ survey: S.hp.survey }), 700);
  const touch = debounce(() => { push({}); drawTop(); drawSteps(); }, 500);
  const refresh = debounce(() => { drawSteps(); }, 400);     // rašant tekstą – tik žingsnių žymos

  let syncChain = Promise.resolve();
  const syncItems = () => (syncChain = syncChain.then(async () => {
    const exp = expectedItems(S.hp.survey);
    const key = x => x.grp + '/' + x.kind;
    const have = S.items.filter(i => i.sort < 1000);
    const drop = have.filter(h => !exp.some(e => key(e) === key(h)) && !itemFilled(h) && !S.photos.some(p => p.item_id === h.id));
    for (const d of drop) await db.deleteHpItem(d, S.photos);
    for (const [i, e] of exp.entries()) {                      // esamų eilės tvarka pagal naują tipą
      const h = have.find(x => key(x) === key(e));
      if (h && h.sort !== i) { h.sort = i; await db.updateHpItem(h.id, { sort: i }); }
    }
    const add = exp.map((e, i) => ({ ...e, sort: i })).filter(e => !have.some(h => key(h) === key(e)));
    const created = await db.addHpItems(add.map(e => ({
      heat_point_id: id, grp: e.grp, kind: e.kind, label: e.label, sort: e.sort, owner: KINDS[e.kind].owner || 'Bendraturčiai'
    })));
    S.items = S.items.filter(i => !drop.includes(i)).concat(created).sort((a, b) => a.sort - b.sort);
  }).catch(err => toast('Nepavyko atnaujinti įrenginių sąrašo: ' + (err.message || err), 'error', 6000)));

  // ---- piešimas ----
  function drawTop() {
    const p = prog();
    $('#hp-top').innerHTML = `<div class="card hp-top">
      <div class="hp-topline"><span class="tag">${esc(HP_STATUS[S.hp.status] || S.hp.status)}</span>${S.hp.excluded ? '<span class="tag nc">išbrauktas</span>' : ''}
        <span><b>${p.percent} %</b> surinkta${p.total ? ` · trūksta <b>${p.missing}</b>` : ''}</span></div>
      <div class="hp-bar big"><i style="width:${p.percent}%"></i></div>
      ${S.hp.status === 'grazinta' && S.hp.note ? `<div class="hp-return">${icon('alert')} <b>Biuro pastaba:</b> ${esc(S.hp.note)}</div>` : ''}
      <div class="muted small">${esc([S.hp.city, S.hp.registry_type ? 'registre: ' + S.hp.registry_type : '', buildingSummary(S.obj ? { ...S.obj, heat_point: '', roof_type: '', roof_cover: '', roof_area: '', roof_condition: '' } : null)].filter(Boolean).join(' · '))}</div>
      ${isAdmin ? `<details class="hp-admin"><summary>Administravimas</summary><div class="form-grid">
        <label class="span2">Šilumininkas<select data-adm="assigned_to"><option value="">— nepriskirta —</option>${S.techs.map(t => `<option value="${esc(t.id)}" ${S.hp.assigned_to === t.id ? 'selected' : ''}>${esc(db.profileName(t))}</option>`).join('')}</select></label>
        <label class="span2">Būsena<select data-adm="status">${Object.entries(HP_STATUS).map(([k, l]) => `<option value="${k}" ${S.hp.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="span4">Pastaba šilumininkui (rodoma, kai būsena „Grąžinta taisyti“)<input data-adm="note" value="${esc(S.hp.note || '')}"></label>
        <label class="chk span2"><input type="checkbox" data-adm="excluded" ${S.hp.excluded ? 'checked' : ''}> Išbrauktas (neprižiūrimas, aprašo nereikia)</label>
        <div class="span2"><button class="btn small" type="button" id="hp-copy">${icon('plus')} Pridėti dar vieną ŠP šiame name</button></div>
      </div></details>` : ''}
    </div>`;
  }

  function drawSteps() {
    const p = prog();
    $('#hp-steps').innerHTML = visSteps().map((st, i) => {
      const miss = p.checks.filter(c => c.step === st.id && !c.ok).length;
      const any = p.checks.some(c => c.step === st.id);
      return `<button class="chip ${step === st.id ? 'on' : ''}${any && !miss ? ' done' : ''}" data-step="${st.id}">${i + 1}. ${esc(st.label)} ${miss ? `<span>${miss}</span>` : any ? '<span>✓</span>' : ''}</button>`;
    }).join('');
    const vs = visSteps(), ix = vs.findIndex(s => s.id === step);
    $('#hp-prev').style.visibility = ix > 0 ? '' : 'hidden';
    $('#hp-next').style.visibility = ix < vs.length - 1 ? '' : 'hidden';
  }

  const qHtml = q => {
    const s = S.hp.survey;
    if (q.show && !q.show(s)) return '';
    if (q.head) return `<div class="hp-head">${esc(q.head)}</div>`;
    const v = s[q.key];
    const lab = `<div class="hp-ql">${esc(q.label)}${q.req ? ' <span class="hp-req">*</span>' : ''}${q.unit ? ` <span class="muted small">(${esc(q.unit)})</span>` : ''}</div>${q.hint ? `<div class="muted small">${esc(q.hint)}</div>` : ''}`;
    if (q.type === 'one' || q.type === 'many') {
      const on = x => q.type === 'many' ? (v || []).includes(x) : v === x;
      return `<div class="hp-q">${lab}<div class="hp-opts">${q.options.map(o => Array.isArray(o) ? o : [o, o]).map(([val, l]) =>
        `<button type="button" class="hp-opt${on(val) ? ' on' : ''}" data-q="${q.key}" data-v="${esc(val)}"${q.type === 'many' ? ' data-many="1"' : ''}>${esc(l)}</button>`).join('')}</div></div>`;
    }
    if (q.type === 'area') return `<div class="hp-q">${lab}<textarea data-qi="${q.key}" rows="3" placeholder="${esc(q.ph || '')}">${esc(v || '')}</textarea></div>`;
    return `<div class="hp-q${q.type === 'num' ? ' num' : ''}">${lab}<input data-qi="${q.key}" ${q.type === 'num' ? 'inputmode="decimal"' : ''} value="${esc(v ?? '')}" placeholder="${esc(q.ph || '')}" autocomplete="off"></div>`;
  };

  const slotHtml = ({ slot, item_id = null, title, hint, req }) => {
    const ph = S.photos.filter(p => (p.item_id || null) === item_id && p.slot === slot);
    return `<div class="hp-slot${req && !ph.length ? ' need' : ''}">
      <div class="hp-ql">${esc(title)}${req ? ' <span class="hp-req">*</span>' : ''}</div>
      ${hint ? `<div class="muted small">${esc(hint)}</div>` : ''}
      <div class="hp-thumbs">${ph.map(p => `<div class="hp-thumb"><img data-ph="${p.id}" alt="nuotrauka"><button type="button" class="hp-del" data-delph="${p.id}" title="Ištrinti nuotrauką">${icon('x')}</button></div>`).join('')}
        <label class="btn small primary">${icon('camera')} Fotografuoti<input type="file" accept="image/*" capture="environment" hidden data-up="${slot}" data-item="${item_id || ''}"></label>
        <label class="btn small">${icon('image')} Iš galerijos<input type="file" accept="image/*" multiple hidden data-up="${slot}" data-item="${item_id || ''}"></label>
      </div></div>`;
  };

  const fld = (attr, key, label, val, unit, opts, cls = '') => `<label class="${cls}">${esc(label)}${unit ? ` <span class="muted small">(${esc(unit)})</span>` : ''}${opts
    ? `<select ${attr}="${key}"><option value=""></option>${opts.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input ${attr}="${key}" value="${esc(val ?? '')}" autocomplete="off">`}</label>`;

  const itemHtml = it => {
    const k = KINDS[it.kind] || KINDS.kita, sp = it.specs || {};
    return `<div class="card hp-item${it.absent ? ' absent' : ''}" data-item="${it.id}">
      <div class="hp-item-head"><b>${esc(itemLabel(it))}</b>
        <label class="chk"><input type="checkbox" data-absent ${it.absent ? 'checked' : ''}> Šio įrenginio nėra</label>
        ${it.sort >= 1000 ? `<button type="button" class="btn small ghost" data-delitem title="Pašalinti įrenginį">${icon('trash')}</button>` : ''}</div>
      ${it.absent ? '' : `
      ${k.hint ? `<div class="muted small">${esc(k.hint)}</div>` : ''}
      ${k.plate ? slotHtml({ slot: 'plate', item_id: it.id, title: 'Gamyklinė lentelė', req: true, hint: 'Visa lentelė kadre, ryški, be blizgesio – kad būtų įskaitomi visi skaičiai.' }) : ''}
      ${slotHtml({ slot: 'general', item_id: it.id, title: k.plate ? 'Bendra įrenginio nuotrauka' : 'Nuotrauka', req: !k.plate })}
      <details class="hp-manual" ${itemFilled(it) ? 'open' : ''}><summary>Įvesti duomenis ranka</summary>
        <div class="form-grid">
          ${it.kind === 'kita' ? fld('data-f', 'label', 'Įrenginio pavadinimas', it.label, '', null, 'span2') : ''}
          ${fld('data-f', 'manufacturer', 'Gamintojas', it.manufacturer)}
          ${fld('data-f', 'model', 'Modelis / tipas', it.model)}
          ${k.fields.map(([key, label, unit, opts]) => fld('data-s', key, label, sp[key], unit, opts)).join('')}
          ${k.qty ? fld('data-f', 'qty', 'Kiekis', it.qty, 'vnt.') : ''}
          ${fld('data-f', 'tag', 'Žymuo schemoje', it.tag)}
          ${fld('data-f', 'condition', 'Būklė', it.condition, '', ['Gera', 'Patenkinama', 'Bloga'])}
          ${fld('data-f', 'note', 'Pastaba', it.note, '', null, 'span4')}
        </div></details>`}
    </div>`;
  };

  function drawBody() {
    const s = S.hp.survey;
    const st = STEPS.find(x => x.id === step);
    const qs = (QUESTIONS[step] || []).map(qHtml).join('');
    const slots = (SLOTS[step] || []).filter(sl => !sl.show || sl.show(s)).map(sl => slotHtml({ ...sl, req: sl.min > 0 })).join('');
    let html = '';
    if (st.grp) {
      const list = S.items.filter(i => i.grp === step);
      html = !typed()
        ? `<div class="card">Pirmiausia 1 žingsnyje pasirinkite šildymo ir karšto vandens tipą – tada čia atsiras įrenginių sąrašas.</div>`
        : `<div class="hp-intro muted small">${esc(GROUP_LABEL[step])}: kiekvienam įrenginiui nufotografuokite gamyklinę lentelę. Jei įrenginio nėra – pažymėkite „Šio įrenginio nėra“. Duomenis iš nuotraukų vėliau nuskaitys sistema; jei lentelė neįskaitoma, įveskite ranka.</div>
          ${list.map(itemHtml).join('')}
          <div class="card hp-add"><span class="lbl">Yra dar vienas įrenginys?</span>
            <select id="hp-addkind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
            <button class="btn small" type="button" data-additem>${icon('plus')} Pridėti</button></div>`;
    } else if (step === 'pabaiga') {
      const p = prog();
      const miss = p.checks.filter(c => !c.ok);
      html = `<div class="card">${qs}${slots}</div>
        <div class="card"><div class="card-title">${miss.length ? `Dar trūksta: ${miss.length}` : 'Viskas surinkta'}</div>
          ${miss.length ? visSteps().map(v => { const m = miss.filter(c => c.step === v.id);
            return m.length ? `<div class="hp-miss"><button class="btn small ghost" type="button" data-step="${v.id}">${esc(v.label)}</button><ul>${m.map(c => `<li>${esc(c.label)}</li>`).join('')}</ul></div>` : ''; }).join('') : '<p class="muted">Galite pateikti duomenis biurui.</p>'}
          <div class="hp-submit">
            ${S.hp.submitted_at ? `<span class="muted small">Pateikta ${esc(fmtDate(S.hp.submitted_at))}. Duomenis galite toliau papildyti.</span>` : ''}
            <button class="btn primary big" type="button" id="hp-submit">${icon('check')} ${S.hp.status === 'pateikta' || S.hp.status === 'parengta' ? 'Pateikti iš naujo' : 'Pateikti biurui'}</button>
          </div></div>`;
    } else {
      html = `<div class="card">${step === 'rodmenys' && s.matavimo_data ? `<div class="muted small">Rodmenys užrašyti: ${esc(fmtDate(s.matavimo_data))}</div>` : ''}
        ${step === 'rodmenys' ? '<div class="muted small">Užrašykite tai, ką matote prietaisuose. Ko nėra ar nematyti – palikite tuščia.</div>' : ''}
        <div class="${step === 'rodmenys' ? 'hp-grid' : ''}">${qs}</div>${slots}</div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('img[data-ph]').forEach(async img => {
      const p = S.photos.find(x => x.id === img.dataset.ph);
      try { img.src = await db.hpPhotoUrl(p); } catch (_) { /* nuotrauka nepasiekiama */ }
    });
  }

  const setStep = (sid, scroll = true) => {
    step = sid;
    history.replaceState(null, '', `#/sp/${id}/${sid}`);
    drawSteps(); drawBody();
    if (scroll) $('#hp-steps').scrollIntoView({ block: 'start' });
  };

  // ---- įvykiai ----
  $('#hp-steps').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) setStep(b.dataset.step, false); });
  const move = d => { const vs = visSteps(); const i = vs.findIndex(s => s.id === step) + d; if (vs[i]) setStep(vs[i].id); };
  $('#hp-prev').addEventListener('click', () => move(-1));
  $('#hp-next').addEventListener('click', () => move(1));

  body.addEventListener('click', async e => {
    const opt = e.target.closest('[data-q]');
    if (opt) {
      const s = S.hp.survey, k = opt.dataset.q, v = opt.dataset.v;
      if (opt.dataset.many) { const a = new Set(s[k] || []); if (a.has(v)) a.delete(v); else a.add(v); s[k] = [...a]; }
      else s[k] = s[k] === v ? '' : v;
      saveSurvey();
      if (TYPE_KEYS.includes(k)) await syncItems();
      drawTop(); drawSteps(); drawBody();
      return;
    }
    const go2 = e.target.closest('[data-step]');
    if (go2) return setStep(go2.dataset.step);
    const img = e.target.closest('img[data-ph]');
    if (img && img.src) return window.open(img.src, '_blank', 'noopener');
    const del = e.target.closest('[data-delph]');
    if (del) {
      const p = S.photos.find(x => x.id === del.dataset.delph);
      if (!p || !await confirmDialog('Ištrinti šią nuotrauką?', 'Ištrinti')) return;
      try { await db.deleteHpPhoto(p); S.photos = S.photos.filter(x => x !== p); drawBody(); touch(); }
      catch (err) { toast(err.message || String(err), 'error'); }
      return;
    }
    if (e.target.closest('[data-additem]')) {
      const kind = $('#hp-addkind').value;
      try {
        const [it] = await db.addHpItems([{ heat_point_id: id, grp: step, kind, sort: 1000 + S.items.length, owner: KINDS[kind].owner || 'Bendraturčiai' }]);
        S.items.push(it); drawBody(); touch();
      } catch (err) { toast(err.message || String(err), 'error'); }
      return;
    }
    const delItem = e.target.closest('[data-delitem]');
    if (delItem) {
      const it = S.items.find(x => x.id === delItem.closest('[data-item]').dataset.item);
      if (!it || !await confirmDialog(`Pašalinti „${itemLabel(it)}“ su jo nuotraukomis?`, 'Pašalinti')) return;
      try { await db.deleteHpItem(it, S.photos); S.items = S.items.filter(x => x !== it); S.photos = S.photos.filter(p => p.item_id !== it.id); drawBody(); touch(); }
      catch (err) { toast(err.message || String(err), 'error'); }
      return;
    }
    if (e.target.closest('#hp-submit')) {
      const p = prog();
      if (p.missing && !await confirmDialog(`Dar trūksta ${p.missing} punktų. Vis tiek pateikti biurui?`, 'Pateikti')) return;
      await push({ survey: S.hp.survey, status: 'pateikta', submitted_at: new Date().toISOString() });
      if (S.hp.status === 'pateikta') toast('Pateikta biurui', 'ok');
      drawTop(); drawBody();
    }
  });

  body.addEventListener('input', e => {
    const k = e.target.dataset.qi;
    if (!k) return;
    const s = S.hp.survey;
    s[k] = e.target.value;
    if (k.startsWith('r_') && e.target.value && !s.matavimo_data) s.matavimo_data = new Date().toISOString();
    saveSurvey();
    refresh();
  });

  body.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.up !== undefined && t.files && t.files.length) {
      const slot = t.dataset.up, item_id = t.dataset.item || null, files = [...t.files];
      const box = t.closest('.hp-slot');
      if (box) box.classList.add('busy');
      let ok = 0;
      for (const f of files) {
        try {
          const im = await processImage(f, 2000, 0.82);
          S.photos.push(await db.addHpPhoto(id, im.blob, { slot, item_id, width: im.width, height: im.height }));
          ok++;
        } catch (err) { toast('Nuotraukos įkelti nepavyko: ' + (err.message || err), 'error', 6000); }
      }
      if (ok) toast(ok > 1 ? `Įkelta nuotraukų: ${ok}` : 'Nuotrauka įkelta', 'ok');
      drawBody(); touch();
      return;
    }
    const card = t.closest('[data-item]');
    if (!card) return;
    const it = S.items.find(x => x.id === card.dataset.item);
    if (!it) return;
    let patch = null;
    if (t.dataset.absent !== undefined) patch = { absent: t.checked };
    else if (t.dataset.f) patch = { [t.dataset.f]: t.dataset.f === 'qty' ? (parseInt(t.value, 10) || null) : (t.value.trim() || null) };
    else if (t.dataset.s) patch = { specs: { ...(it.specs || {}), [t.dataset.s]: t.value.trim() } };
    if (!patch) return;
    try {
      Object.assign(it, await db.updateHpItem(it.id, patch));
      if (patch.absent !== undefined) drawBody();
      touch();
    } catch (err) { toast('Nepavyko išsaugoti: ' + (err.message || err), 'error', 6000); }
  });

  $('#hp-top').addEventListener('change', async e => {
    const k = e.target.dataset.adm;
    if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : (e.target.value || null);
    try {
      const r = await db.updateHeatPoint(id, { [k]: v });
      S.hp = { ...r, survey: S.hp.survey };
      toast('Išsaugota', 'ok');
      if (k === 'status' || k === 'excluded') { const open = $('#hp-top details'); drawTop(); if (open) $('#hp-top details').open = true; }
    } catch (err) { toast(err.message || String(err), 'error', 6000); }
  });
  $('#hp-top').addEventListener('click', async e => {
    if (!e.target.closest('#hp-copy')) return;
    if (!await confirmDialog('Pridėti dar vieną šilumos punktą šiam namui?', 'Pridėti')) return;
    try { const n = await db.addHeatPointCopy(S.hp); go(`#/sp/${n.id}`); }
    catch (err) { toast(err.message || String(err), 'error', 6000); }
  });

  if (typed() && !S.items.length) await syncItems();
  drawTop(); drawSteps(); drawBody();
}

// ---------------------------------------------------------------------
// Šilumininko paskyra (vietoj bendrų Nustatymų)
// ---------------------------------------------------------------------

export async function renderHeatAccount(el, onLogout) {
  const me = await db.getProfile(true);
  const s = await db.getSettings(true);
  el.innerHTML = `
    <div class="page-head"><h1>Mano paskyra</h1><button class="btn ghost" id="hp-logout">${icon('logout')} Atsijungti</button></div>
    <form id="hp-acc" class="card form-grid">
      <div class="card-title span4">Šilumininko duomenys (rašomi į aprašą)</div>
      <div class="span4 muted small">${esc(me.email || '')}</div>
      <label class="span2">Vardas, pavardė<input name="engineer_name" value="${esc(s.engineer_name || '')}"></label>
      <label class="span2">Telefonas<input name="engineer_phone" type="tel" value="${esc(s.engineer_phone || '')}" placeholder="+370..."></label>
      <label class="span2">Kvalifikacijos dokumento Nr.<input name="hp_dok_nr" value="${esc(s.hp_dok_nr || '')}"></label>
      <label>Kas išdavė<input name="hp_dok_isdave" value="${esc(s.hp_dok_isdave || '')}"></label>
      <label>Galioja iki<input name="hp_dok_iki" type="date" value="${esc(s.hp_dok_iki || '')}"></label>
      <div class="span4 form-actions"><button class="btn primary" type="submit">${icon('check')} Išsaugoti</button></div>
    </form>
    <div class="card">
      <div class="card-title">Pakeisti slaptažodį</div>
      <div class="pw-row"><input type="password" id="hp-pw" autocomplete="new-password" placeholder="Naujas slaptažodis (bent 8 simboliai)">
        <button class="btn small" type="button" id="hp-pw-save">Išsaugoti</button></div>
    </div>`;
  $('#hp-acc').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await db.saveSettings({ ...s, ...f }); toast('Išsaugota', 'ok'); }
    catch (err) { toast(err.message || String(err), 'error', 6000); }
  });
  $('#hp-pw-save').addEventListener('click', async () => {
    const pw = $('#hp-pw').value;
    if (pw.length < 8) return toast('Slaptažodis per trumpas (bent 8 simboliai)', 'error');
    try { await db.changeMyPassword(pw); $('#hp-pw').value = ''; toast('Slaptažodis pakeistas', 'ok'); }
    catch (err) { toast(err.message || String(err), 'error', 6000); }
  });
  $('#hp-logout').addEventListener('click', async () => {
    if (await confirmDialog('Atsijungti?', 'Atsijungti')) { await db.signOut(); onLogout(); }
  });
}
