// =====================================================================
// ŠP aprašų modulio biuro (admin) dalis: DI gamyklinių lentelių skaitymas,
// biuro laukai, ko trūksta aprašui, aprašo atsisiuntimas (PDF / Word / zip)
// ir bendri ŠP nustatymai. Turinys – heat-doc.js, eksportas – heat-export.js.
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import { $, esc, toast, confirmDialog, debounce, blobToDataURL } from './util.js';
import { KINDS, GROUP_LABEL, itemLabel } from './heat-model.js';
import { OFFICE, COMPANY, DEFAULT_TEXTS, makeCtx, buildAprasas, aprasasMissing, specsText } from './heat-doc.js';
import { aprasasDocx, aprasasPdf, zipBlobs, saveBlob } from './heat-export.js';

const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const AI_LABEL = { gera: 'nuskaityta', dalinai: 'nuskaityta iš dalies', neiskaitoma: 'neįskaitoma' };
const PRICE = { in: 2, out: 10 };                          // $ už 1 mln. žetonų (claude-sonnet-5-5) – tik apytiksliam skaičiavimui

// ---------------------------------------------------------------------
// DI: gamyklinių lentelių skaitymas
// ---------------------------------------------------------------------

export const aiReadable = S => S.items.filter(it => !it.absent && S.photos.some(p => p.item_id === it.id));

/** Nuskaito vieno įrenginio nuotraukas ir įrašo rezultatą. Ranka įvestų reikšmių neperrašo. */
export async function readItem(S, it) {
  const k = KINDS[it.kind] || KINDS.kita;
  const ph = S.photos.filter(p => p.item_id === it.id)
    .sort((a, b) => (a.slot === 'plate' ? 0 : 1) - (b.slot === 'plate' ? 0 : 1)).slice(0, 4);
  if (!ph.length) throw new Error('Įrenginys neturi nuotraukų.');
  const s = S.hp.survey || {};
  const res = await db.hpAi({
    sp_type: `šildymas – ${s.sildymas || '?'}, karštas vanduo – ${s.kv || '?'}`,
    item: {
      name: itemLabel(it), group: GROUP_LABEL[it.grp] || '', hint: k.hint || '',
      fields: k.fields.map(([key, label, unit, options]) => ({ key, label, unit: unit || '', options }))
    },
    photos: await Promise.all(ph.map(db.hpPhotoForAI))
  });
  const prev = (it.ai && it.ai.values) || {};
  const take = (cur, old, neu) => (has(neu) && (!has(cur) || cur === old)) ? neu : cur;   // DI perrašo tik tuščią arba savo ankstesnę reikšmę
  const specs = { ...(it.specs || {}) };
  for (const [key] of k.fields) {
    const v = take(specs[key], (prev.specs || {})[key], (res.specs || {})[key]);
    if (has(v)) specs[key] = v;
  }
  const u = res.usage || {};
  const patch = {
    manufacturer: take(it.manufacturer, prev.manufacturer, res.manufacturer) || null,
    model: take(it.model, prev.model, res.model) || null,
    specs,
    ai: {
      at: new Date().toISOString(), readable: res.readable, uncertain: res.uncertain || [], comment: res.comment || '', extra: res.extra || '',
      values: { manufacturer: res.manufacturer || '', model: res.model || '', specs: res.specs || {} }, model_id: res.model_id || '',
      usage: { in: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), out: u.output_tokens || 0 }
    }
  };
  Object.assign(it, await db.updateHpItem(it.id, patch));
  return it;
}

/** Trumpa DI būsenos eilutė įrenginio kortelei (rodoma ir šilumininkui). */
export function aiBadge(it) {
  const a = it.ai;
  if (!a) return '';
  const k = KINDS[it.kind] || KINDS.kita;
  const names = (a.uncertain || []).map(key => key === 'manufacturer' ? 'gamintojas' : key === 'model' ? 'modelis' : ((k.fields.find(f => f[0] === key) || [])[1] || '').toLowerCase()).filter(Boolean);
  return `<div class="hp-ai ${esc(a.readable || '')}">${icon(a.readable === 'gera' ? 'check' : 'alert')}<div><b>Sistema: ${esc(AI_LABEL[a.readable] || 'nuskaityta')}</b>${a.readable === 'neiskaitoma' ? ' – perfotografuokite arba įveskite duomenis ranka' : ''}
    ${a.comment ? `<div>${esc(a.comment)}</div>` : ''}${names.length ? `<div class="muted small">Patikrinti: ${esc(names.join(', '))}</div>` : ''}${a.extra ? `<div class="muted small">Lentelėje dar: ${esc(a.extra)}</div>` : ''}</div></div>`;
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}

// ---------------------------------------------------------------------
// Aprašo sudarymas
// ---------------------------------------------------------------------

async function schemaImages(photos) {
  const out = [];
  for (const p of photos.filter(x => !x.item_id && x.slot === 'schema')) {
    try {
      const blob = await (await fetch(await db.hpPhotoUrl(p))).blob();
      out.push({ dataUrl: await blobToDataURL(blob), bytes: new Uint8Array(await blob.arrayBuffer()), width: p.width, height: p.height });
    } catch (_) { /* nuotrauka praleidžiama */ }
  }
  return out;
}

const operatorOf = async hp => hp.assigned_to ? db.getSettingsFor(hp.assigned_to).catch(() => ({})) : {};

async function makeFile(src, set, kind) {
  const images = await schemaImages(src.photos);
  const doc = buildAprasas(makeCtx({ ...src, set, op: await operatorOf(src.hp) }), images);
  const blob = kind === 'pdf' ? await aprasasPdf(doc, images) : await aprasasDocx(doc, images);
  return { name: `${doc.fileName}.${kind === 'pdf' ? 'pdf' : 'docx'}`, blob };
}

/** Admin: kelių ŠP aprašai (PDF) vienu zip failu. rows – ŠP sąrašo eilutės. */
export async function downloadZip(rows, onProgress = () => {}) {
  const set = await db.getHpSettings();
  const files = [];
  let n = 0;
  for (const r of rows) {
    onProgress(++n, rows.length, r.address);
    const [hp, items, photos] = await Promise.all([db.getHeatPoint(r.id), db.listHpItems(r.id), db.listHpPhotos(r.id)]);
    const obj = hp.object_id ? await db.getObject(hp.object_id).catch(() => null) : null;
    files.push(await makeFile({ hp, items, photos, obj }, set, 'pdf'));
    if (files.length === 60 || n === rows.length) {                // dalimis, kad naršyklei nepritrūktų atminties
      const part = Math.ceil(n / 60), parts = Math.ceil(rows.length / 60);
      saveBlob(await zipBlobs(files), `SP aprasai${parts > 1 ? ` ${part} is ${parts}` : ''}.zip`);
      files.length = 0;
    }
  }
}

// ---------------------------------------------------------------------
// Žingsnis „Aprašas (biuras)“ vieno ŠP vedlyje
// ---------------------------------------------------------------------

const inputHtml = (attr, f, value, ph) => {
  const a = `${attr}="${esc(f.k)}"`;
  if (f.type === 'area') return `<textarea ${a} rows="3" placeholder="${esc(ph || '')}">${esc(value || '')}</textarea>`;
  if (f.opts) return `<select ${a}><option value="">${ph ? esc('(' + ph + ')') : ''}</option>${f.opts.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  return `<input ${a} ${f.type === 'date' ? 'type="date"' : ''} value="${esc(value || '')}" placeholder="${esc(ph || f.ph || '')}" autocomplete="off">`;
};

export async function drawOffice(root, S, id, hooks = {}) {
  root.innerHTML = '<div class="card muted">Kraunama…</div>';
  let set = {}, op = {};
  try { [set, op] = await Promise.all([db.getHpSettings(), operatorOf(S.hp)]); }
  catch (err) { root.innerHTML = `<div class="card">Nepavyko įkelti ŠP nustatymų: ${esc(err.message || String(err))}</div>`; return; }
  S.hp.office = S.hp.office || {};
  const ctx = () => makeCtx({ hp: S.hp, items: S.items, photos: S.photos, obj: S.obj, set, op });
  let busy = false;

  root.innerHTML = `
    <div class="card" id="of-ai"></div>
    <div class="card" id="of-form"></div>
    <div class="card" id="of-out"></div>`;

  // ---- 1. DI ----
  function drawAi(progress = '') {
    const list = aiReadable(S);
    const read = list.filter(i => i.ai);
    const bad = read.filter(i => i.ai.readable === 'neiskaitoma').length;
    const tok = S.items.reduce((a, i) => { const u = (i.ai && i.ai.usage) || {}; return { in: a.in + (u.in || 0), out: a.out + (u.out || 0) }; }, { in: 0, out: 0 });
    const usd = (tok.in * PRICE.in + tok.out * PRICE.out) / 1e6;
    $('#of-ai', root).innerHTML = `
      <div class="card-title">1. Nuotraukų skaitymas (DI)</div>
      <div class="muted small">Sistema iš gamyklinių lentelių nuotraukų nuskaito gamintoją, modelį ir rodiklius. Ranka įvestų duomenų neperrašo. Rezultatą peržiūrėkite įrenginių žingsniuose.</div>
      <div class="of-line">Įrenginių su nuotraukomis: <b>${list.length}</b> · nuskaityta <b>${read.length}</b>${bad ? ` · neįskaitoma <b class="of-bad">${bad}</b>` : ''}${tok.in ? ` · DI sąnaudos apie <b>${usd.toFixed(2).replace('.', ',')} $</b>` : ''}</div>
      <div class="of-actions">
        <button class="btn primary" type="button" data-ai="new" ${busy || read.length === list.length ? 'disabled' : ''}>${icon('spark')} Nuskaityti nuotraukas${read.length ? ` (liko ${list.length - read.length})` : ''}</button>
        ${read.length ? `<button class="btn ghost small" type="button" data-ai="all" ${busy ? 'disabled' : ''}>Nuskaityti visus iš naujo</button>` : ''}
        <span class="muted small" id="of-ai-prog">${esc(progress)}</span>
      </div>
      ${read.length ? `<table class="of-table"><tr><th>Įrenginys</th><th>DI</th><th>Tipas, gamintojas</th><th>Rodikliai</th></tr>
        ${list.map(it => `<tr><td><button class="of-link" type="button" data-step="${it.grp}">${esc(itemLabel(it))}</button><div class="muted small">${esc(GROUP_LABEL[it.grp] || '')}</div></td>
          <td>${it.ai ? `<span class="tag of-${esc(it.ai.readable)}">${esc(AI_LABEL[it.ai.readable] || '')}</span>${it.ai.comment ? `<div class="muted small">${esc(it.ai.comment)}</div>` : ''}` : '<span class="muted small">—</span>'}</td>
          <td>${esc([it.manufacturer, it.model].filter(has).join(' ') || '—')}</td><td>${esc(specsText(it) || '—')}</td></tr>`).join('')}</table>` : ''}`;
  }

  async function runAi(all) {
    const list = aiReadable(S).filter(i => all || !i.ai);
    if (!list.length || busy) return;
    if (all && !await confirmDialog(`Iš naujo nuskaityti visus ${list.length} įrenginius? Tai kainuos tiek pat, kiek pirmas skaitymas.`, 'Nuskaityti')) return;
    busy = true;
    let done = 0, failed = 0, lastErr = '';
    drawAi(`0 / ${list.length}`);
    await pool(list, 3, async it => {
      try { await readItem(S, it); } catch (err) { failed++; lastErr = err.message || String(err); }
      done++;
      const el = $('#of-ai-prog', root);
      if (el) el.textContent = `${done} / ${list.length}`;
    });
    busy = false;
    if (failed) toast(`Nepavyko nuskaityti: ${failed}. ${lastErr}`, 'error', 9000);
    else toast('Nuotraukos nuskaitytos', 'ok');
    if (root.isConnected) { drawAi(); drawForm(); drawOut(); }
  }

  // ---- 2. Biuro laukai ----
  function drawForm() {
    const c = ctx(), o = S.hp.office, s = S.hp.survey || {};
    const bendri = set.bendri || {};
    const fb = k => c.pre(k) || (has(bendri[k]) ? String(bendri[k]) : '');
    const groups = OFFICE.map((g, gi) => {
      let inner = '';
      if (g.fields) {
        inner = `<div class="form-grid">${g.fields.map(f => {
          const hint = f.hint ? f.hint(c) : '';
          return `<label class="${f.span === 4 || f.type === 'area' ? 'span4' : f.span === 2 ? 'span2' : ''}"><span>${esc(f.l)}${f.u ? ` (${esc(f.u)})` : ''}${f.req ? ' <b class="hp-req">*</b>' : ''}</span>
            ${inputHtml('data-of', f, o[f.k], fb(f.k))}${hint ? `<span class="muted small">${esc(hint)}</span>` : ''}</label>`;
        }).join('')}</div>`;
      } else {
        const rows = g.rows.filter(r => !r.show || r.show(s));
        inner = `<table class="of-table of-matrix"><tr><th>Parametras</th><th>Vnt.</th>${g.cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr>
          ${rows.map(r => `<tr><td>${esc(r.l)}</td><td>${esc(r.u || '')}</td>${g.cols.map(([ck]) => (r.noCols || []).includes(ck) ? '<td class="muted">–</td>'
            : `<td>${inputHtml('data-of', { k: `${r.k}_${ck}` }, o[`${r.k}_${ck}`], fb(`${r.k}_${ck}`))}</td>`).join('')}</tr>`).join('')}</table>`;
      }
      return `<details class="of-group" ${gi < 2 ? 'open' : ''}><summary>${esc(g.title)}</summary>${inner}</details>`;
    }).join('');
    $('#of-form', root).innerHTML = `
      <div class="card-title">2. Biuro duomenys</div>
      <div class="muted small">Pilkai rodoma reikšmė – iš registro, klausimyno ar bendrų nustatymų; ji bus įrašyta į aprašą, jei lauko nepakeisite. Tuščias laukas apraše virs „duomenų nėra“.
        Visiems ŠP vienodas reikšmes patogiau įrašyti vieną kartą: <a href="#/sp/nustatymai">ŠP nustatymai</a>.</div>
      ${groups}`;
  }

  const saveOffice = debounce(async () => {
    try {
      const r = await db.updateHeatPoint(id, { office: S.hp.office });
      S.hp = { ...r, survey: S.hp.survey, office: S.hp.office };
      if (root.isConnected) drawOut();
    } catch (err) { toast('Nepavyko išsaugoti: ' + (err.message || err), 'error', 6000); }
  }, 700);

  // ---- 3. Aprašas ----
  function drawOut() {
    const c = ctx();
    const miss = aprasasMissing(c);
    const gaps = buildAprasas(c, S.photos.filter(p => !p.item_id && p.slot === 'schema')).gaps;
    $('#of-out', root).innerHTML = `
      <div class="card-title">3. Aprašas</div>
      ${miss.length ? `<div class="hp-miss"><b>Prieš baigiant reikia sutvarkyti (${miss.length}):</b><ul>${miss.map(m => `<li>${esc(m.label)}${m.step ? ` <button class="of-link" type="button" data-step="${m.step}">atidaryti</button>` : ''}</li>`).join('')}</ul></div>`
        : '<p><b>Privalomi duomenys surinkti.</b></p>'}
      ${gaps.length ? `<details class="of-group"><summary>Apraše bus įrašyta „duomenų nėra“ arba „–“: ${gaps.length} vietose</summary><ul class="of-gaps">${gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul></details>` : ''}
      <div class="of-actions">
        <button class="btn primary big" type="button" data-dl="pdf">${icon('file')} Atsisiųsti PDF</button>
        <button class="btn big" type="button" data-dl="docx">${icon('file')} Atsisiųsti Word</button>
        ${S.hp.status !== 'parengta' ? `<button class="btn ghost" type="button" data-ready>${icon('check')} Pažymėti „Aprašas parengtas“</button>` : '<span class="tag">Aprašas parengtas</span>'}
      </div>
      <div class="muted small">Aprašą galima atsisiųsti bet kada – ir kaip juodraštį. Schema kol kas dedama kaip nuotrauka (1 priedas).</div>`;
  }

  root.addEventListener('click', async e => {
    const ai = e.target.closest('[data-ai]');
    if (ai) return runAi(ai.dataset.ai === 'all');
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      dl.disabled = true;
      try {
        const f = await makeFile({ hp: S.hp, items: S.items, photos: S.photos, obj: S.obj }, set, dl.dataset.dl);
        saveBlob(f.blob, f.name);
        toast('Aprašas paruoštas: ' + f.name, 'ok', 5000);
      } catch (err) { toast('Nepavyko sudaryti aprašo: ' + (err.message || err), 'error', 8000); }
      dl.disabled = false;
      return;
    }
    if (e.target.closest('[data-ready]')) {
      const miss = aprasasMissing(ctx());
      if (miss.length && !await confirmDialog(`Dar nesutvarkyta: ${miss.length}. Vis tiek pažymėti, kad aprašas parengtas?`, 'Pažymėti')) return;
      try {
        const r = await db.updateHeatPoint(id, { status: 'parengta' });
        S.hp = { ...r, survey: S.hp.survey };
        toast('Pažymėta: aprašas parengtas', 'ok');
        drawOut();
        if (hooks.onStatus) hooks.onStatus();
      } catch (err) { toast(err.message || String(err), 'error', 6000); }
    }
  });
  root.addEventListener('input', e => {
    const k = e.target.dataset.of;
    if (!k) return;
    const v = e.target.value.trim();
    if (v) S.hp.office[k] = v; else delete S.hp.office[k];
    saveOffice();
  });

  drawAi(); drawForm(); drawOut();
}

// ---------------------------------------------------------------------
// Bendri ŠP nustatymai (#/sp/nustatymai) – tik admin
// ---------------------------------------------------------------------

const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, path, v) {
  const ks = path.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => (a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}), o);
  if (has(v)) t[last] = v; else delete t[last];
}

export async function renderHpSettings(el) {
  const set = await db.getHpSettings();
  set.bendri = set.bendri || {};
  const common = OFFICE.map(g => g.fields ? { ...g, fields: g.fields.filter(f => f.common) } : g).filter(g => g.rows ? g.common : g.fields.length);
  el.innerHTML = `<div id="hs-root">
    <div class="page-head"><a class="btn ghost" href="#/sp">${icon('back')} Sąrašas</a><h1>ŠP aprašų nustatymai</h1>
      <button class="btn primary" type="button" id="hs-save">${icon('check')} Išsaugoti</button></div>
    <div class="muted small" style="margin-bottom:12px">Šie duomenys įrašomi į visus aprašus. Pakeitus – atsisiųskite aprašą iš naujo.</div>
    ${COMPANY.map(g => `<div class="card"><div class="card-title">${esc(g.title)}</div><div class="form-grid">${g.fields.map(f =>
      `<label class="${f.span === 4 || f.type === 'area' ? 'span4' : f.span === 2 ? 'span2' : ''}">${esc(f.l)}${inputHtml('data-hs', f, getPath(set, f.k), DEFAULT_TEXTS[f.k] || '')}</label>`).join('')}</div></div>`).join('')}
    <div class="card"><div class="card-title">Bendros reikšmės visiems ŠP</div>
      <div class="muted small">Naudojamos, kai konkretaus ŠP biuro laukas paliktas tuščias (pvz. projektinės temperatūros, šilumos tiekėjo sąlygos, leistinos ribos).</div>
      ${common.map(g => `<details class="of-group"><summary>${esc(g.title)}</summary>${g.fields
        ? `<div class="form-grid">${g.fields.map(f => `<label class="${f.span === 4 || f.type === 'area' ? 'span4' : f.span === 2 ? 'span2' : ''}"><span>${esc(f.l)}${f.u ? ` (${esc(f.u)})` : ''}</span>${inputHtml('data-hb', f, set.bendri[f.k], '')}</label>`).join('')}</div>`
        : `<table class="of-table of-matrix"><tr><th>Parametras</th><th>Vnt.</th>${g.cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr>
          ${g.rows.map(r => `<tr><td>${esc(r.l)}</td><td>${esc(r.u || '')}</td>${g.cols.map(([ck]) => (r.noCols || []).includes(ck) ? '<td class="muted">–</td>'
            : `<td>${inputHtml('data-hb', { k: `${r.k}_${ck}` }, set.bendri[`${r.k}_${ck}`], '')}</td>`).join('')}</tr>`).join('')}</table>`}</details>`).join('')}
    </div></div>`;
  $('#hs-root').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.hs) setPath(set, t.dataset.hs, t.value.trim());
    else if (t.dataset.hb) { if (has(t.value)) set.bendri[t.dataset.hb] = t.value.trim(); else delete set.bendri[t.dataset.hb]; }
  });
  $('#hs-save').addEventListener('click', async () => {
    try { await db.saveHpSettings(set); toast('Išsaugota', 'ok'); }
    catch (err) { toast(err.message || String(err), 'error', 6000); }
  });
}
