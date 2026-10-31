// =====================================================================
// Metinė (kasmetinė) statinio apžiūra: šablonas, namų sąrašas, greita apžiūros lentelė,
// DI aktas. Peržiūra / Word – print.js ir docx.js (doc = 'annual').
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import { $, $$, esc, toast, today, fmtDate, debounce, processImage, confirmDialog } from './util.js';

const OK_TEXT = 'Apžiūros metu defektų nenustatyta.';
const OK_REC = 'Vykdyti tolimesnius priežiūros darbus.';
const isOk = t => /^Apžiūros metu defektų nenustatyta/.test(t || '');

/** Pagrindinis šablonas (pagal 2026-05 pavyzdį). Galima pridėti / išmesti elementus kiekvienoje apžiūroje. */
export const ANNUAL_TEMPLATE = [
  { title: 'Laikančios konstrukcijos / išorės atitvaros', items: [
    { id: 'perdangos', name: 'Perdangos / grindys', str: '' },
    { id: 'sienos', name: 'Sienos', str: '13.5–13.7, 97 p.' },
    { id: 'stogas', name: 'Stogas', str: '13.1, 13.2 p.' },
    { id: 'ventiliacija', name: 'Natūrali ventiliacija', str: '97 p. 1 d.' },
    { id: 'cokolis', name: 'Pamatai / cokolis / nuogrinda', str: '14.2 p.' },
    { id: 'balkonai', name: 'Balkonai', str: '24 p.' }
  ] },
  { title: 'Durys / langai', items: [
    { id: 'langai', name: 'Langai', str: '97 p.' },
    { id: 'durys', name: 'Durys', str: '97 p.' }
  ] },
  { title: 'Inžinerinės sistemos', items: [
    { id: 'vamzdynai', name: 'Vamzdynai (šaltas, karštas vanduo)', str: '' },
    { id: 'silumos_punktas', name: 'Šilumos punktas', str: '' },
    { id: 'sildymas', name: 'Šildymo sistema', str: '' },
    { id: 'elektra', name: 'Elektros sistema', str: '' }
  ] },
  { title: 'Kiti pastebėjimai', items: [
    { id: 'laiptines', name: 'Laiptinės patalpos', str: '97 p.' }
  ] }
];

export const DEFAULT_CONCLUSIONS = [
  'Atlikus pastato apžiūrą pagrindinėse laikančiose konstrukcijose deformacijų, pažeidimų, susilpnėjimų ar griūties pavojaus nėra. Esamos būklės statinio laikančios konstrukcijos atitinka esminius statinio reikalavimus ir yra patikimos toliau eksploatuoti.',
  'Pastato konstrukcijų (dalių) tyrinėjimui poreikio nėra.',
  'Nuolatinių stebėjimų dažninti, nei numatyta STR 1.07.03:2017 88.1 punkte, nėra poreikio.',
  'Visi kiekiai, darbų apimtys tikslinami darbų suderinamumo eigoje.',
  'Vykdyti tolimesnius nuolatinius priežiūros darbus (STR 1.07.03:2017 88.1 p.).'
];

const baseLetter = s => String(s || '').trim().charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const fmtNum = n => (n === null || n === undefined || n === '') ? '' : String(n).replace('.', ',');

export function annualNumber(s, object) {
  return `${(s.annual_prefix || 'MBB').trim()}-${baseLetter(object.street)}-${object.house || ''}`;
}

/** Nauja metinės apžiūros duomenų struktūra (su praėjusių metų tekstais, jei yra). */
export function newAnnualAct(s, object, prev) {
  const org = object.project || s.org_name || '';
  const g = prev && prev.general ? prev.general : {};
  const prevItems = {};
  if (prev) prev.sections.forEach(sec => sec.items.forEach(it => { prevItems[it.id] = { it, sec }; }));
  const sections = ANNUAL_TEMPLATE.map((sec, si) => ({
    no: String(si + 1), title: sec.title,
    items: sec.items.map((it, ii) => {
      const p = prevItems[it.id];
      return { id: it.id, no: `${si + 1}.${ii + 1}`, name: it.name, str: it.str, status: 'ok', brief: '', text: OK_TEXT, rec: OK_REC,
        prev: p && p.it.status !== 'skip' ? (p.it.text || '') : '', prevRec: p && p.it.status !== 'skip' ? (p.it.rec || '') : '' };
    })
  }));
  if (prev) {                                                         // praėjusių metų papildomi elementai
    prev.sections.forEach((psec, si) => psec.items.filter(it => String(it.id).startsWith('x_')).forEach(it => {
      const sec = sections[si] || sections[sections.length - 1];
      sec.items.push({ id: it.id, no: `${sec.no}.${sec.items.length + 1}`, name: it.name, str: it.str || '', status: 'ok', brief: '', text: OK_TEXT, rec: OK_REC, prev: it.text || '', prevRec: it.rec || '' });
    }));
  }
  return {
    general: {
      address: [object.street, object.house].filter(Boolean).join(' ') + (object.city ? `, ${object.city}` : ''),
      unique_no: g.unique_no || '', built_year: object.built_year || g.built_year || '',
      total_area: fmtNum(object.area || object.usable_area || ''),
      purpose: g.purpose || 'gyvenamoji (6.3 punktas STR 1.01.03:2017)',
      inspector: `inžinierius ${s.engineer_name || ''}${s.inspector_cert ? ` (kv. atestato Nr. ${s.inspector_cert})` : ''}`.trim(),
      category: 'periodinė (kasmetinė)',
      basis: `${org} techninės priežiūros apimtyje (STR 1.07.03:2017 reikalavimais)`,
      method: 'vizualus', date: today(), org
    },
    sections, conclusions: DEFAULT_CONCLUSIONS.slice(), assumptions: []
  };
}

// Defektų aktų defektai → metinės apžiūros elementai (pagal raktažodžius; svarbi tvarka)
const DEFECT_KEYS = [
  ['stogas', /stog|čerp|lietvamz|skardin|parapet/i], ['balkonai', /balkon|lodž/i], ['ventiliacija', /ventil|kamin|ištraukim/i],
  ['cokolis', /pamat|cokol|nuogrind|rūsi/i], ['silumos_punktas', /šilumos (punkt|mazg)/i], ['sildymas', /šildym|radiator/i],
  ['elektra', /elektr|apšvietim|skydin|šviestuv/i], ['vamzdynai', /vamzd|vanden|kanaliz|nuotek/i],
  ['langai', /lang/i], ['durys', /duri/i], ['laiptines', /laiptin|laiptų|laiptai|turėkl/i],
  ['perdangos', /perdang|grind/i], ['sienos', /sien|fasad|siūl|plyš|tink|apdail|mūr/i]
];
const defectItemId = d => {
  for (const txt of [d.system, d.defects]) {
    const k = DEFECT_KEYS.find(([, re]) => re.test(txt || ''));
    if (k) return k[0];
  }
  return '';
};

/** Visi užfiksuoti defektai iš objekto defektų aktų (plokščias sąrašas). */
async function collectDefects(object) {
  const acts = await db.findDefectActs(object);
  const out = [];
  for (const t of acts) {
    const objs = (t.defect_act.objects || []).filter(o => (o.defects || '').trim());
    // „N pav.“ defektų akte = N-oji į aktą įtraukta nuotrauka
    const figs = objs.some(o => (o.photos || []).length) ? (await db.listPhotos(t.id)).filter(p => p.include_in_act) : [];
    objs.forEach(o => out.push({ system: (o.system || '').trim(), defects: noFigRefs(o.defects), works: noFigRefs(o.works),
      actNo: t.act_number || '', date: t.act_date || t.created_at,
      photos: (o.photos || []).map(n => figs[n - 1]).filter(Boolean) }));
  }
  return out;
}

/** Išmeta nuorodas į defektų akto paveikslėlius „(žr. 3, 7 pav.)“ – metinėje numeracija kita. */
const noFigRefs = s => String(s || '').replace(/\s*\((?:žr\.?|pav\.)[^)]*\)/gi, '').replace(/\s+([.,;])/g, '$1').trim();

/** Siūlo pasirinkti, kuriuos ankstesnių aktų defektus įtraukti. Grąžina pasirinktus (tuščią – jei praleista). */
function pickDefects(list) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>Rasti ankstesni defektai</h3>
      <p class="muted small">Šio namo defektų aktuose jau užfiksuota ${list.length} defektų. Pažymėtieji bus perkelti į metinę apžiūrą.</p>
      <div class="an-pick">${list.map((d, i) => `<label class="an-pick-row"><input type="checkbox" data-i="${i}" checked>
        <span><b>${esc(d.system || 'Defektas')}</b> <span class="muted small">${esc(fmtDate(d.date))}${d.actNo ? ' · ' + esc(d.actNo) : ''}</span><br>${esc(d.defects.length > 220 ? d.defects.slice(0, 220) + '…' : d.defects)}</span></label>`).join('')}</div>
      <div class="modal-actions"><button class="btn ghost" data-r="0">Be defektų</button><button class="btn primary" data-r="1">Įtraukti pažymėtus</button></div></div>`;
    wrap.addEventListener('click', e => {
      const r = e.target.closest('[data-r]');
      if (!r) return;
      const chosen = r.dataset.r === '1' ? $$('input[data-i]', wrap).filter(c => c.checked).map(c => list[+c.dataset.i]) : [];
      wrap.remove(); resolve(chosen);
    });
    document.getElementById('modal-root').appendChild(wrap);
  });
}

/** Pažymi atitinkamus elementus „Yra defektų“ ir įrašo pastabą iš defektų akto. */
function applyDefects(act, defects) {
  defects.forEach(d => {
    const note = `Pagal defektų aktą${d.actNo ? ' Nr. ' + d.actNo : ''} (${fmtDate(d.date)}): ${d.defects}${d.works ? `\nNumatyti darbai: ${d.works}` : ''}`;
    const id = defectItemId(d);
    let item = id && act.sections.flatMap(sec => sec.items).find(it => it.id === id);
    if (!item) {                                                       // neatpažinta sistema – atskiras elementas
      const sec = act.sections[act.sections.length - 1];
      item = { id: 'x_' + Math.random().toString(36).slice(2, 8), no: `${sec.no}.${sec.items.length + 1}`, name: d.system || 'Kitas defektas',
        str: '', status: 'ok', brief: '', text: OK_TEXT, rec: OK_REC, prev: '', prevRec: '' };
      sec.items.push(item);
    }
    item.status = 'defects';
    d.itemId = item.id;
    item.brief = item.brief ? `${item.brief}\n${note}` : note;
  });
}

/** Sukuria metinės apžiūros užduotį pasirinktam objektui ir grąžina jos id. */
export async function startAnnual(object) {
  const s = await db.getSettings();
  const prevTask = await db.findPreviousAnnual(object.id);
  const act = newAnnualAct(s, object, prevTask && prevTask.annual_act);
  const found = await collectDefects(object).catch(() => []);
  const chosen = found.length ? await pickDefects(found) : [];
  applyDefects(act, chosen);
  const t = await db.createTask({
    kind: 'annual', address: [object.street, object.house].filter(Boolean).join(' '), city: object.city, object_id: object.id,
    manager: object.manager, problem: 'Kasmetinė apžiūra', service_type: 'Statinio periodinė apžiūra',
    act_number: annualNumber(s, object), act_date: today(), inspection_date: today(), status: 'planuota', annual_act: act
  });
  const seen = new Set(); let n = 0, failed = 0;                      // defektų akto nuotraukos → metinės elementams
  for (const d of chosen) for (const p of d.photos || []) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    try { await db.copyPhoto(p, t.id, { ref: d.itemId, sort: n++ }); } catch (e) { failed++; console.warn(e); }
  }
  if (failed) toast(`Nepavyko perkelti ${failed} nuotraukų`, 'error');
  return t.id;
}

// ---------------------------------------------------------------------
// Namų sąrašas („Metinės apžiūros“)
// ---------------------------------------------------------------------

const listState = { q: '', f: 'todo', who: 'all' };

export async function renderAnnualList(view, go) {
  view.innerHTML = '<div class="loading">Kraunama...</div>';
  const [objects, tasks, me] = await Promise.all([db.listObjects(), db.listTasks(), db.getProfile()]);
  const year = String(new Date().getFullYear());
  const byObj = new Map();
  tasks.filter(t => t.kind === 'annual' && t.object_id).forEach(t => {
    const cur = byObj.get(t.object_id);
    if (!cur || String(t.act_date || t.created_at) > String(cur.act_date || cur.created_at)) byObj.set(t.object_id, t);
  });
  const done = o => { const t = byObj.get(o.id); return t && String(t.act_date || t.created_at).slice(0, 4) === year; };
  const managers = [...new Set(objects.map(o => o.manager).filter(Boolean))].sort();
  const nDone = objects.filter(done).length;

  view.innerHTML = `
    <div class="page-head"><h1>Metinės apžiūros ${year}</h1><span class="muted">Apžiūrėta ${nDone} iš ${objects.length}</span></div>
    <div class="list-tools">
      <div class="search">${icon('search')}<input id="an-q" type="search" placeholder="Ieškoti adreso..." value="${esc(listState.q)}"></div>
      <select id="an-who" class="who-sel"><option value="all">Visi vadybininkai</option>${managers.map(m => `<option ${listState.who === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <div class="chips" id="an-chips">
        ${[['todo', 'Neapžiūrėti'], ['done', 'Apžiūrėti'], ['all', 'Visi']].map(([id, l]) => `<button class="chip ${listState.f === id ? 'on' : ''}" data-f="${id}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="an-list" class="task-list"></div>`;

  const draw = () => {
    const q = listState.q.trim().toLowerCase();
    let arr = objects.filter(o => {
      if (listState.f === 'todo' && done(o)) return false;
      if (listState.f === 'done' && !done(o)) return false;
      if (listState.who !== 'all' && o.manager !== listState.who) return false;
      return !q || o.address.toLowerCase().includes(q);
    });
    const shown = arr.slice(0, 200);
    $('#an-list').innerHTML = (shown.map(o => {
      const t = byObj.get(o.id);
      return `<div class="task-card an-obj ${done(o) ? 'st-baigta' : 'st-nauja'}">
        <div class="tc-main"><div class="tc-addr">${esc([o.street, o.house].filter(Boolean).join(' '))}, ${esc(o.city || '')}</div>
          <div class="tc-meta">${o.manager ? `<span>${esc(o.manager)}</span>` : ''}${o.construction ? `<span>${esc(o.construction)}</span>` : ''}${o.built_year ? `<span>${o.built_year} m.</span>` : ''}
          ${t ? `<span>Paskutinė: ${esc(fmtDate(t.act_date || t.created_at))}${t.act_number ? ' · ' + esc(t.act_number) : ''}</span>` : '<span>Dar nebuvo</span>'}</div></div>
        <div class="tc-side">${t && done(o)
          ? `<a class="btn small" href="#/u/${t.id}/aktai">Atidaryti</a>`
          : `<button class="btn primary small" data-start="${esc(o.id)}">${icon('plus')} ${t ? 'Nauja' : 'Pradėti'}</button>${t ? `<a class="btn ghost small" href="#/u/${t.id}/aktai">Pernai</a>` : ''}`}</div>
      </div>`;
    }).join('') || '<div class="empty card">Pagal filtrą namų nėra.</div>') + (arr.length > shown.length ? `<div class="muted small" style="padding:8px">Rodoma ${shown.length} iš ${arr.length}. Siaurinkite paiešką.</div>` : '');
  };
  draw();

  $('#an-q').addEventListener('input', e => { listState.q = e.target.value; draw(); });
  $('#an-who').addEventListener('change', e => { listState.who = e.target.value; draw(); });
  $('#an-chips').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    listState.f = b.dataset.f; $$('#an-chips .chip').forEach(c => c.classList.toggle('on', c === b)); draw();
  });
  $('#an-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-start]'); if (!b) return;
    b.disabled = true; b.textContent = 'Kuriama...';
    try { go(`#/u/${await startAnnual(objects.find(o => o.id === b.dataset.start))}/apziura`); }
    catch (err) { toast(err.message, 'error'); b.disabled = false; }
  });
}

// ---------------------------------------------------------------------
// Greita apžiūros lentelė
// ---------------------------------------------------------------------

const allItems = a => a.sections.flatMap(s => s.items);
const SEG = [['ok', 'Defektų nėra'], ['defects', 'Yra defektų'], ['skip', 'Praleisti']];

export function drawAnnualInspection(body, ctx) {
  const { S, save, draw } = ctx;
  const t = S.task, a = t.annual_act;
  const persist = debounce(() => save({ annual_act: t.annual_act }), 700);
  const photosOf = id => S.photos.filter(p => p.ref === id);
  const counts = () => { const it = allItems(a).filter(x => x.status !== 'skip'); return `${it.filter(x => x.status === 'defects').length} su defektais iš ${it.length}`; };

  const row = it => `
    <div class="an-row st-${it.status}" data-id="${esc(it.id)}">
      <div class="an-top"><b>${esc(it.no)} ${esc(it.name)}</b>
        ${String(it.id).startsWith('x_') ? `<button class="btn icon-only small danger-ghost" data-an="del" title="Pašalinti elementą">${icon('trash')}</button>` : ''}</div>
      <div class="seg">${SEG.map(([v, l]) => `<label class="${it.status === v ? 'on ' + v : ''}"><input type="radio" name="st_${esc(it.id)}" value="${v}" ${it.status === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
      ${it.status === 'defects' ? `
        <textarea rows="2" data-f="brief" placeholder="Trumpai: kas matoma, kur, kokio masto (galite diktuoti)">${esc(it.brief)}</textarea>` : ''}
      ${it.status !== 'skip' ? `
        <div class="an-tools">
          ${it.status === 'defects' ? `<button class="btn small" type="button" data-an="dictate">${icon('mic')} Diktuoti</button>` : ''}
          <label class="btn small">${icon('camera')} Fotografuoti<input type="file" accept="image/*" capture="environment" hidden data-up></label>
          <label class="btn small">${icon('image')} Iš galerijos<input type="file" accept="image/*" multiple hidden data-up></label>
        </div>
        ${photosOf(it.id).length ? `<div class="an-thumbs">${photosOf(it.id).map(p => `<span class="an-th"><img alt="" data-src="${p.id}"><button type="button" data-an="delph" data-pid="${p.id}" title="Ištrinti">×</button></span>`).join('')}</div>` : ''}
        ${it.prev ? `<details class="an-prev"><summary>Praėjusių metų tekstas</summary><div class="muted small pre">${esc(it.prev)}${it.prevRec ? esc("\nRekomendacijos: " + it.prevRec) : ""}</div>
          <button class="btn small" type="button" data-an="useprev">Naudoti kaip pernai</button></details>` : ''}` : ''}
      ${it.keep ? '<div class="muted small">✓ Bus naudojamas praėjusių metų tekstas (DI jo nekeis).</div>' : ''}
    </div>`;

  body.innerHTML = `
    <div class="card"><div class="card-title">${esc(a.general.address)}</div>
      <div class="muted small">Kiekvienam elementui pasirinkite būseną. „Defektų nėra“ – įrašomas standartinis tekstas. „Yra defektų“ – trumpai aprašykite (galima diktuoti) ir pridėkite nuotraukų, o DI parašys aktą.
      <br><b>${counts()}</b></div></div>
    ${a.sections.map(sec => `
      <div class="card an-sec"><div class="card-title">${esc(sec.no)}. ${esc(sec.title)}</div>
        ${sec.items.map(row).join('')}
        <button class="btn small" type="button" data-an="add" data-sec="${esc(sec.no)}">${icon('plus')} Pridėti elementą</button></div>`).join('')}
    <div class="row-actions"><a class="btn primary big" href="#/u/${t.id}/aktai">${icon('spark')} Toliau – aktas</a></div>`;

  photosOf; allItems(a).forEach(it => photosOf(it.id).forEach(p =>
    db.photoUrl(p).then(u => { const img = body.querySelector(`img[data-src="${p.id}"]`); if (img) img.src = u; })));

  const find = el => allItems(a).find(x => x.id === el.closest('.an-row').dataset.id);

  body.onchange = async e => {
    const el = e.target;
    if (el.matches('input[type=radio]')) {
      const it = find(el); it.status = el.value; it.keep = false;
      if (it.status === 'ok') { it.text = OK_TEXT; it.rec = OK_REC; }
      await save({ annual_act: a }); return draw();
    }
    if (el.matches('[data-up]')) {
      const it = find(el);
      const files = Array.from(el.files || []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      toast('Įkeliama...', 'info', 1500);
      let sort = S.photos.reduce((m, p) => Math.max(m, p.sort || 0), -1) + 1;
      for (const f of files) {
        try { const { blob, width, height } = await processImage(f); S.photos.push(await db.addPhoto(t.id, blob, { width, height, sort: sort++, ref: it.id, caption: it.name })); }
        catch (err) { toast('Nepavyko įkelti: ' + err.message, 'error'); }
      }
      draw();
    }
  };
  body.oninput = e => {
    if (e.target.matches('textarea[data-f=brief]')) { find(e.target).brief = e.target.value; persist(); }
  };
  body.onclick = async e => {
    const b = e.target.closest('[data-an]'); if (!b) return;
    const act = b.dataset.an;
    if (act === 'add') {
      const name = (window.prompt('Naujo elemento pavadinimas (pvz. „Lauko durys“):') || '').trim();
      if (!name) return;
      const sec = a.sections.find(s => s.no === b.dataset.sec);
      sec.items.push({ id: 'x_' + Date.now().toString(36), no: `${sec.no}.${sec.items.length + 1}`, name, str: '', status: 'ok', brief: '', text: OK_TEXT, rec: OK_REC, prev: '', prevRec: '' });
      await save({ annual_act: a }); return draw();
    }
    if (act === 'del') {
      const it = find(b);
      if (!await confirmDialog(`Pašalinti elementą „${it.name}“?`, 'Pašalinti')) return;
      a.sections.forEach(s => { s.items = s.items.filter(x => x !== it); s.items.forEach((x, i) => { x.no = `${s.no}.${i + 1}`; }); });
      await save({ annual_act: a }); return draw();
    }
    if (act === 'useprev') {
      const it = find(b); it.text = it.prev; it.rec = it.prevRec || ''; it.keep = true; it.status = isOk(it.prev) ? 'ok' : 'defects';
      await save({ annual_act: a }); return draw();
    }
    if (act === 'delph') {
      if (!await confirmDialog('Ištrinti nuotrauką?', 'Ištrinti')) return;
      const p = S.photos.find(x => x.id === b.dataset.pid);
      await db.deletePhoto(p); S.photos = S.photos.filter(x => x !== p); return draw();
    }
    if (act === 'dictate') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return toast('Naršyklė nepalaiko diktavimo (naudokite Chrome)', 'error');
      const ta = b.closest('.an-row').querySelector('textarea[data-f=brief]'), it = find(b);
      const rec = new SR(); rec.lang = 'lt-LT'; rec.continuous = false; rec.interimResults = false;
      b.classList.add('rec');
      rec.onresult = ev => {
        const txt = ev.results[0][0].transcript.trim();
        ta.value = (ta.value ? ta.value.replace(/\s*$/, ' ') : '') + txt.charAt(0).toUpperCase() + txt.slice(1) + '.';
        it.brief = ta.value; persist();
      };
      rec.onend = () => b.classList.remove('rec');
      rec.onerror = ev => toast('Diktavimo klaida: ' + ev.error, 'error');
      rec.start();
    }
  };
}

// ---------------------------------------------------------------------
// Aktas: bendri duomenys, DI generavimas, redaktorius
// ---------------------------------------------------------------------

const fit = ta => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; };

export function drawAnnualActTab(body, ctx) {
  const { S, save, draw, showBusy, downloadDocx } = ctx;
  const t = S.task, a = t.annual_act, g = a.general;
  const persist = debounce(() => save({ annual_act: a, act_number: t.act_number, act_date: t.act_date }), 800);
  const gf = (k, label, span = '') => `<label class="${span}">${label}<input data-g="${k}" value="${esc(g[k] ?? '')}"></label>`;
  // kol DI neparašė – defektų elementuose rodome inžinieriaus pastabą (ir rankiniam užpildymui)
  allItems(a).forEach(it => { if (it.status === 'defects' && !it.keep && isOk(it.text)) { it.text = it.brief || ''; it.rec = ''; } });
  const used = allItems(a).filter(x => x.status !== 'skip');
  const nDef = used.filter(x => x.status === 'defects').length;

  body.innerHTML = `
    <div class="card">
      <div class="card-title">Metinės apžiūros aktas</div>
      <div class="form-grid">
        <label>Akto Nr.<input data-t="act_number" value="${esc(t.act_number)}"></label>
        <label>Data<input type="date" data-t="act_date" value="${esc(fmtDate(t.act_date))}"></label>
        ${gf('unique_no', 'Unikalus Nr.')}${gf('built_year', 'Statybos metai')}${gf('total_area', 'Bendras plotas, m²')}
        ${gf('date', 'Pastato apžiūros data')}${gf('purpose', 'Statinio paskirtis', 'span2')}
        ${gf('inspector', 'Apžiūros vadovas', 'span2')}${gf('category', 'Apžiūros kategorija')}${gf('method', 'Metodas')}
        ${gf('basis', 'Apžiūros pagrindas', 'span4')}
      </div>
      <div class="gen-info muted small">DI gaus: ${used.length} elementų (${nDef} su defektais), jūsų pastabas, nuotraukas ir praėjusių metų tekstus, pastato kontekstą.
        ${nDef ? '' : '<b>Defektų nepažymėta – aktas bus sudarytas iš standartinių tekstų.</b>'}</div>
      <div class="gen-actions"><button class="btn primary big" id="an-gen">${icon('spark')} ${t.status === 'aktas' ? 'Generuoti iš naujo' : 'Generuoti su DI'}</button></div>
    </div>

    <div class="card act-ed">
      <div class="act-ed-head"><div class="card-title">Elementų tekstai</div><span class="save-ind" id="act-save"></span></div>
      ${a.sections.map(sec => {
        const its = sec.items.filter(x => x.status !== 'skip');
        return its.length ? `<div class="an-sec-h"><b>${esc(sec.no)}. ${esc(sec.title)}</b></div>` + its.map(it => `
          <div class="block-lbl">${esc(it.no)} ${esc(it.name)} <span class="tag ${it.status === 'defects' ? 'nc' : ''}">${it.status === 'defects' ? 'yra defektų' : 'defektų nėra'}</span>
            <div class="an-two"><label>Pastebėti defektai<textarea data-i="${esc(it.id)}">${esc(it.text)}</textarea></label>
              <label>Rekomendacijos<textarea data-r="${esc(it.id)}">${esc(it.rec || '')}</textarea></label></div></div>`).join('') : '';
      }).join('')}
      <div class="an-sec-h"><b>Bendros išvados / rekomendacijos</b></div>
      ${a.conclusions.map((c, i) => `<div class="an-concl"><span>${i + 1}.</span><textarea data-c="${i}">${esc(c)}</textarea><button class="btn icon-only small danger-ghost" data-an="delc" data-i="${i}" title="Pašalinti">${icon('trash')}</button></div>`).join('')}
      <button class="btn small" data-an="addc">${icon('plus')} Pridėti išvadą</button>
    </div>

    ${(a.assumptions || []).length ? `<div class="card assumptions"><div class="card-title">DI prielaidos (į aktą nepatenka – patikrinkite)</div><ul>${a.assumptions.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

    <div class="card print-box">
      <div class="card-title">${icon('print')} Peržiūra, redagavimas, Word ir PDF</div>
      <div class="gen-actions"><a class="btn primary" href="#/spausdinti/${t.id}/annual">${icon('file')} Metinės apžiūros aktas</a></div>
      <div class="gen-actions docx-row"><span class="muted small">Atsisiųsti Word (.docx):</span>
        <button class="btn" type="button" data-docx="annual">${icon('file')} Metinės apžiūros aktas</button></div>
    </div>`;

  $$('.act-ed textarea', body).forEach(fit);
  requestAnimationFrame(() => $$('.act-ed textarea', body).forEach(fit));

  body.oninput = e => {
    const el = e.target;
    if (el.dataset.g) g[el.dataset.g] = el.value;
    else if (el.dataset.t) t[el.dataset.t] = el.value || null;
    else if (el.dataset.i) { const it = allItems(a).find(x => x.id === el.dataset.i); it.text = el.value; it.keep = false; }
    else if (el.dataset.r) { const it = allItems(a).find(x => x.id === el.dataset.r); it.rec = el.value; it.keep = false; }
    else if (el.dataset.c !== undefined) a.conclusions[+el.dataset.c] = el.value;
    else return;
    if (el.tagName === 'TEXTAREA') fit(el);
    persist();
  };
  body.onclick = async e => {
    const b = e.target.closest('[data-an]');
    if (b) {
      if (b.dataset.an === 'delc') a.conclusions.splice(+b.dataset.i, 1);
      else if (b.dataset.an === 'addc') a.conclusions.push('');
      await persist.flush(); return draw();
    }
    const d = e.target.closest('[data-docx]');
    if (d) { await persist.flush(); downloadDocx(d.dataset.docx, d); }
  };

  $('#an-gen').addEventListener('click', () => generate(ctx));
}

async function generate(ctx) {
  const { S, save, draw, showBusy } = ctx;
  const t = S.task, a = t.annual_act;
  const overlay = showBusy('DI rengia aktą...');
  try {
    const used = allItems(a).filter(x => x.status !== 'skip');
    // nuotraukos tik elementams su defektais (iki 12)
    const photos = [];
    for (const it of used.filter(x => x.status === 'defects')) {
      for (const p of S.photos.filter(p => p.ref === it.id)) {
        if (photos.length >= 12) break;
        photos.push({ n: photos.length + 1, caption: it.name, element: it.name, _id: it.id, ...(await db.photoForAI(p)) });
      }
    }
    const building = ctx.building && ctx.building();
    const res = await db.aiAnnual({
      general: { address: a.general.address, built_year: a.general.built_year, date: a.general.date },
      building,
      items: used.filter(x => x.status === 'defects' && !x.keep).map(x => ({
        id: x.id, no: x.no, name: x.name, status: x.status, str: x.str, brief: x.brief, prev: x.prev + (x.prevRec ? `\nRekomendacijos: ${x.prevRec}` : ''),
        photos: photos.filter(p => p._id === x.id).map(p => p.n)
      })),
      photos: photos.map(({ _id, ...p }) => p)
    });
    const by = new Map((res.items || []).map(i => [i.id, i]));
    used.forEach(it => {
      if (it.status === 'ok') { it.text = OK_TEXT; it.rec = OK_REC; }
      else if (!it.keep && by.has(it.id)) { const r = by.get(it.id); it.text = r.defects || r.text || ''; it.rec = r.rec || ''; }
    });
    if ((res.conclusions || []).length) a.conclusions = res.conclusions;
    a.assumptions = res.assumptions || [];
    const patch = { annual_act: a, act_generated_at: new Date().toISOString() };
    if (['nauja', 'planuota', 'apziureta'].includes(t.status)) patch.status = 'aktas';
    await save(patch);
    toast('Aktas paruoštas – peržiūrėkite tekstus', 'ok', 4500);
  } catch (e) {
    console.error(e); toast(e.message || String(e), 'error', 8000);
  } finally { overlay.remove(); draw(); }
}
