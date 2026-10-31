// =====================================================================
// Aktų peržiūra (A4): spausdinimas / PDF, eksportas į Word ir redagavimas vietoje.
// Elementai su data-b="..." redaguojami tiesiai peržiūroje, o pakeitimai išsaugomi sistemoje.
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import { $$, esc, nl2br, fmtDate, fmtQty, toast, parseQty, debounce } from './util.js';

export async function renderPrint(el, id, doc) {
  el.innerHTML = `<div class="loading">Ruošiamas dokumentas...</div>`;
  const [t, photos, s] = await Promise.all([db.getTask(id), db.listPhotos(id), db.getSettings()]);
  if (!t) throw new Error('Užduotis nerasta');
  if (t.kind === 'nonconformity') doc = 'nc';
  if (doc === 'nc' ? !t.nc_act : !t.defect_act) throw new Error('Aktas dar neparuoštas');
  if ((doc === 'works' || doc === 'both') && !t.works_act) doc = 'defect';

  const actPhotos = photos.filter(p => p.include_in_act);
  const urls = await Promise.all(actPhotos.map(p => db.photoUrl(p, true)));
  const figs = actPhotos.map((p, i) => ({ n: i + 1, url: urls[i], caption: p.caption, w: p.width, h: p.height }));

  const parts = [];
  if (doc === 'nc') parts.push(ncSheet(t, s, figs.length));
  if (doc === 'defect' || doc === 'both') parts.push(defectSheet(t, s, figs.length));
  if (doc === 'works' || doc === 'both') parts.push(worksSheet(t, s));
  if (figs.length) parts.push(photoSheet(t, s, figs));

  const titles = { defect: 'defektavimo aktas', works: 'numatomų darbų aktas', both: 'aktai', nc: 'neatikties aktas' };
  document.title = `${t.act_number || ''} ${t.address || ''} ${titles[doc]}`.trim();

  el.innerHTML = `
    <div class="print-bar no-print">
      <a class="btn ghost" href="#/u/${t.id}/aktai">${icon('back')} Atgal</a>
      <div class="pb-docs">
        ${doc === 'nc' ? `<a class="chip on" href="#/spausdinti/${t.id}/nc">Neatikties aktas</a>` : `
        <a class="chip ${doc === 'defect' ? 'on' : ''}" href="#/spausdinti/${t.id}/defect">Defektavimo</a>
        ${t.works_act ? `<a class="chip ${doc === 'works' ? 'on' : ''}" href="#/spausdinti/${t.id}/works">Numatomų darbų</a>
        <a class="chip ${doc === 'both' ? 'on' : ''}" href="#/spausdinti/${t.id}/both">Abu</a>` : ''}`}
      </div>
      <div class="pb-actions">
        <span id="pv-save" class="muted small"></span>
        <button class="btn" id="pv-toggle" type="button" title="Įjungti / išjungti redagavimą">${icon('edit')} Redagavimas: įjungtas</button>
        <button class="btn" id="do-docx" type="button">${icon('file')} Word (.docx)</button>
        <button class="btn primary" id="do-print" type="button">${icon('print')} Spausdinti / PDF</button>
      </div>
    </div>
    <div class="print-hint no-print muted small">Spustelėkite bet kurį tekstą (paryškėja užvedus pelę), kad jį pataisytumėte – pakeitimai išsaugomi automatiškai ir matomi akto redaktoriuje. Spausdinimo lange pasirinkite „Išsaugoti kaip PDF“, rekomenduojama išjungti „Antraštės ir poraštės“.</div>
    <div class="sheets">${parts.join('')}</div>`;

  const editing = bindEditing(el, t);

  el.querySelector('#do-print').addEventListener('click', async () => {
    await editing.flush();
    const imgs = Array.from(el.querySelectorAll('.sheets img'));
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
    if (imgs.some(i => !i.naturalWidth)) toast('Kai kurios nuotraukos neužsikrovė', 'error');
    window.print();
  });

  el.querySelector('#do-docx').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Ruošiama...';
    try {
      await editing.flush();
      const { exportDocx } = await import('./docx.js');
      const name = await exportDocx({ t, s, doc, figs });
      toast(`Word failas paruoštas: ${name}`, 'ok', 5000);
    } catch (err) {
      console.error(err);
      toast('Nepavyko sukurti Word failo: ' + (err.message || err), 'error', 8000);
    } finally { btn.disabled = false; btn.innerHTML = old; }
  });
}

// ---------------------------------------------------------------------
// Redagavimas peržiūroje
// ---------------------------------------------------------------------

const ROOTS = { t: t => t, d: t => t.defect_act, w: t => t.works_act, nc: t => t.nc_act };
const DATE_PATHS = ['t.act_date', 't.due_date'];

/** Įrašo reikšmę į duomenis pagal kelią (pvz. d.objects.0.defects). Grąžina false, jei reikšmė netinkama. */
function setPath(t, path, raw) {
  const [root, ...keys] = path.split('.');
  let obj = ROOTS[root] && ROOTS[root](t);
  if (!obj) return false;
  for (let i = 0; i < keys.length - 1; i++) { obj = obj[keys[i]]; if (!obj) return false; }
  const last = keys[keys.length - 1];
  let v = raw;
  if (DATE_PATHS.includes(path)) {
    v = raw.trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    v = v || null;
  } else if (last === 'qty') v = parseQty(raw);
  else if (root === 't') v = raw.trim() || null;
  else if (el_single(path)) v = raw.trim();
  obj[last] = v;
  return true;
}
const el_single = path => /\.(system|unit|urgency|severity|purpose|problem|work)$/.test(path);

function bindEditing(root, t) {
  const ind = root.querySelector('#pv-save');
  const nodes = $$('[data-b]', root);
  let dirty = false;

  const text = n => n.innerText.replace(/ /g, ' ').replace(/\n+$/, '');
  const value = path => {                                    // dabartinė reikšmė (rodymui atstatyti)
    const [r, ...k] = path.split('.');
    let o = ROOTS[r](t);
    for (const x of k) { if (o == null) return ''; o = o[x]; }
    return o == null ? '' : (k[k.length - 1] === 'qty' ? fmtQty(o) : String(o));
  };

  const save = async () => {
    if (!dirty) return;
    dirty = false;
    ind.textContent = 'Saugoma...';
    const patch = {
      act_number: t.act_number, act_date: t.act_date, manager: t.manager, contractor: t.contractor, due_date: t.due_date,
      defect_act: t.defect_act, works_act: t.works_act, nc_act: t.nc_act
    };
    Object.keys(patch).forEach(k => { if (patch[k] === undefined) delete patch[k]; });
    try {
      await db.updateTask(t.id, patch);
      ind.textContent = 'Išsaugota ' + new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      dirty = true;
      ind.textContent = 'Klaida: ' + e.message;
      toast('Nepavyko išsaugoti: ' + e.message, 'error', 6000);
    }
  };
  const later = debounce(save, 900);

  const apply = on => {
    document.body.classList.toggle('pv-edit', on);
    nodes.forEach(n => {
      if (!on) { n.removeAttribute('contenteditable'); return; }
      n.contentEditable = 'plaintext-only';
      if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';   // senesnės naršyklės
      n.spellcheck = true;
    });
    const b = root.querySelector('#pv-toggle');
    if (b) b.innerHTML = `${icon('edit')} Redagavimas: ${on ? 'įjungtas' : 'išjungtas'}`;
  };

  nodes.forEach(n => {
    n.addEventListener('input', () => {
      const path = n.dataset.b;
      if (DATE_PATHS.includes(path)) return;                 // datos tikrinamos išėjus iš lauko
      if (setPath(t, path, text(n))) { dirty = true; ind.textContent = 'Keičiama...'; later(); }
    });
    n.addEventListener('blur', () => {
      const path = n.dataset.b;
      if (DATE_PATHS.includes(path)) {
        if (setPath(t, path, text(n))) { dirty = true; }
        else { toast('Data turi būti formato 2026-10-30', 'error'); n.textContent = value(path); }
      }
      if (dirty) later.flush();
    });
    n.addEventListener('keydown', e => {                     // vienos eilutės laukuose Enter neįveda naujos eilutės
      if (e.key === 'Enter' && n.hasAttribute('data-single')) { e.preventDefault(); n.blur(); }
    });
    n.addEventListener('paste', e => {                       // tik paprastas tekstas
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, n.hasAttribute('data-single') ? txt.replace(/\s*\n\s*/g, ' ') : txt);
    });
  });

  root.querySelector('#pv-toggle').addEventListener('click', () => apply(!document.body.classList.contains('pv-edit')));
  apply(true);
  return { flush: async () => { later.flush(); await save(); } };
}

// ---------------------------------------------------------------------
// Lapai. data-b = redaguojamas laukas; turinys be tarpų aplink (white-space: pre-wrap).
// ---------------------------------------------------------------------

function header(s, label) {
  return `<div class="form-code">${esc(s.form_code || '')}${s.form_code ? ' ' : ''}${esc(label)}</div>`;
}

function signLines(s, includeCommission = true) {
  const rows = [{ position: s.engineer_position, name: s.engineer_name, sig: s.signature }];
  if (includeCommission) (s.commission || []).forEach(c => rows.push({ position: c.position, name: c.name }));
  while (includeCommission && rows.length < 3) rows.push({ position: '', name: '' });
  return `<div class="signs">${rows.map(r => `
    <div class="sign-row">
      <div class="sign-cell wide"><div class="sign-val">${esc(r.position)}</div><div class="under">(apžiūros vykdytojo pareigos)</div></div>
      <div class="sign-cell"><div class="sign-val">${r.sig ? `<img class="sig" src="${r.sig}" alt="">` : ''}</div><div class="under">(parašas)</div></div>
      <div class="sign-cell"><div class="sign-val">${esc(r.name)}</div><div class="under">(vardas, pavardė)</div></div>
    </div>`).join('')}</div>`;
}

function defectSheet(t, s, nFigs) {
  const d = t.defect_act;
  const addr = [t.address, t.city].filter(Boolean).join(', ') + (t.stairwell ? `, ${t.stairwell} laiptinė` : '');
  const field = (l, v, path) => `<tr><th>${l}</th><td${path ? ` data-b="${path}"` : ''}>${v ? esc(v) : (path ? '' : '&nbsp;')}</td></tr>`;
  return `
  <section class="sheet">
    ${header(s, 'Statinio defektavimo aktas')}
    <div class="doc-top">
      <div class="lined">${esc(s.org_name)}</div><div class="under">(organizacijos pavadinimas)</div>
      <h2>Statinio numatomų atlikti darbų ir defektavimo aktas</h2>
      <div class="date-no"><span class="lined" data-b="t.act_date" data-single>${esc(fmtDate(t.act_date))}</span> Nr. <span class="lined" data-b="t.act_number" data-single>${esc(t.act_number || '')}</span></div>
      <div class="under">(data)</div>
      <div class="lined narrow">${esc(s.city || t.city || '')}</div><div class="under">(sudarymo vieta)</div>
    </div>
    <table class="fields">
      ${field('Statinio adresas', addr)}
      ${field('Apžiūros tikslas', d.purpose, 'd.purpose')}
      ${field('Problema', d.problem, 'd.problem')}
      ${t.service_type ? field('Darbų sritis', t.service_type) : ''}
      ${field('Pastatų administravimo vadybininkas', t.manager, 't.manager')}
      ${field('Darbų skubumas', d.urgency, 'd.urgency')}
    </table>
    <table class="grid defects">
      <thead><tr>
        <th class="no">Eil. Nr.</th>
        <th>Apžiūrėti objektai (sistemos)</th>
        <th>Pastebėti defektai, deformacijos, gedimai</th>
        <th>Rekomenduojami darbai defektams pašalinti</th>
      </tr></thead>
      <tbody>
        ${(d.objects || []).map((o, i) => `<tr>
          <td class="no">${i + 1}</td>
          <td><b data-b="d.objects.${i}.system">${esc(o.system)}</b>${(o.photos || []).length ? `<div class="ph-ref">Nuotr.: ${o.photos.map(n => `${n} pav.`).join(', ')}</div>` : ''}</td>
          <td data-b="d.objects.${i}.defects">${esc(o.defects)}</td>
          <td data-b="d.objects.${i}.works">${esc(o.works)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="summary"><b>Išvada.</b> <span data-b="d.summary">${esc(d.summary || '')}</span></p>
    <div class="conclusion">${nl2br(s.conclusion_text)}</div>
    <p class="attach">Pridedama:
      ${t.works_act ? `Numatomų atlikti darbų aktas Nr. ${esc(t.act_number || '')}${nFigs ? ';' : '.'}` : ''}
      ${nFigs ? ` nuotraukų fiksacija (${nFigs} nuotr.).` : ''}
      ${!t.works_act && !nFigs ? '—' : ''}
    </p>
    ${signLines(s, true)}
  </section>`;
}

function worksSheet(t, s) {
  const w = t.works_act;
  const d = t.defect_act || {};
  let lastSec = null, n = 0;
  const rows = (w.rows || []).map((r, idx) => ({ r, idx })).filter(x => (x.r.description || '').trim()).map(({ r, idx }) => {
    let out = '';
    if (r.section && r.section !== lastSec) {
      out += `<tr class="sec"><td></td><td colspan="4">${esc(r.section)}</td></tr>`;
      lastSec = r.section;
    }
    n++;
    out += `<tr><td class="no">${n}</td><td data-b="w.rows.${idx}.description">${esc(r.description)}</td><td class="c" data-b="w.rows.${idx}.unit" data-single>${esc(r.unit)}</td><td class="c b" data-b="w.rows.${idx}.qty" data-single>${r.qty === null || r.qty === undefined ? '' : fmtQty(r.qty)}</td><td data-b="w.rows.${idx}.notes">${esc(r.notes)}</td></tr>`;
    return out;
  }).join('');
  const kv = (l, v, path, single = true) => `<div class="kvp"><b>${l}:</b> <span class="lined-in"${path ? ` data-b="${path}"${single ? ' data-single' : ''}` : ''}>${esc(v || '')}</span></div>`;
  return `
  <section class="sheet">
    ${header(s, 'Numatomų atlikti darbų aktas')}
    <h2 class="up">Numatomų atlikti darbų ir defektavimo aktas</h2>
    <div class="kvs">
      ${kv('Akto Nr.', t.act_number, 't.act_number')}
      ${kv('Data', fmtDate(t.act_date), 't.act_date')}
      ${kv('Užsakovas', s.customer_name)}
      ${kv('Objektas', [t.address, t.city].filter(Boolean).join(' ') + (t.stairwell ? `, ${t.stairwell} laipt.` : ''))}
      ${kv('Problema', d.problem || t.problem, 'd.problem', false)}
      ${t.service_type ? kv('Darbų sritis', t.service_type) : ''}
    </div>
    <table class="grid works">
      <thead><tr>
        <th class="no">Eil. Nr.</th>
        <th>Numatomų darbų ir medžiagų aprašas</th>
        <th class="c">Mato vnt.</th>
        <th class="c">Preliminarus kiekis</th>
        <th>Pastabos</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${w.note ? `<p class="note"><b>Pastaba: <span data-b="w.note">${esc(w.note)}</span></b></p>` : ''}
    <div class="prepared">
      <b>Aktą paruošė:</b>
      <div class="prep-line">
        <span>${esc([s.engineer_position, s.engineer_name].filter(Boolean).join(' '))}</span>
        ${s.signature ? `<img class="sig" src="${s.signature}" alt="">` : ''}
      </div>
      <div class="under right">(pareigos, vardas, pavardė, parašas)</div>
    </div>
  </section>`;
}

function ncSheet(t, s, nFigs) {
  const a = t.nc_act;
  const addr = [t.address, t.city].filter(Boolean).join(', ') + (t.stairwell ? `, ${t.stairwell} laiptinė` : '');
  const field = (l, v, path) => `<tr><th>${l}</th><td${path ? ` data-b="${path}"` : ''}>${v ? esc(v) : (path ? '' : '&nbsp;')}</td></tr>`;
  const signRow = (pos, sig, name, posNote) => `
    <div class="sign-row">
      <div class="sign-cell wide"><div class="sign-val">${esc(pos)}</div><div class="under">${posNote}</div></div>
      <div class="sign-cell"><div class="sign-val">${sig ? `<img class="sig" src="${sig}" alt="">` : ''}</div><div class="under">(parašas)</div></div>
      <div class="sign-cell"><div class="sign-val">${esc(name)}</div><div class="under">(vardas, pavardė)</div></div>
    </div>`;
  return `
  <section class="sheet">
    ${header(s, 'Neatikties aktas')}
    <div class="doc-top">
      <div class="lined">${esc(s.org_name)}</div><div class="under">(organizacijos pavadinimas)</div>
      <h2>Neatikties aktas</h2>
      <div class="date-no"><span class="lined" data-b="t.act_date" data-single>${esc(fmtDate(t.act_date))}</span> Nr. <span class="lined" data-b="t.act_number" data-single>${esc(t.act_number || '')}</span></div>
      <div class="under">(data)</div>
      <div class="lined narrow">${esc(s.city || t.city || '')}</div><div class="under">(sudarymo vieta)</div>
    </div>
    <table class="fields">
      ${field('Objektas', addr)}
      ${field('Rangovas', t.contractor, 't.contractor')}
      ${field('Vertinami darbai', a.work || t.service_type, 'nc.work')}
      ${field('Neatitikties nustatymo data', fmtDate(t.inspection_date) || fmtDate(t.act_date))}
      ${field('Neatikties lygis', a.severity, 'nc.severity')}
      ${field('Pašalinti iki', fmtDate(t.due_date), 't.due_date')}
    </table>
    <table class="grid defects">
      <thead><tr>
        <th class="no">Eil. Nr.</th>
        <th>Nustatyta neatiktis</th>
        <th>Pažeidžiamas reikalavimas</th>
        <th>Rangovas privalo</th>
      </tr></thead>
      <tbody>
        ${(a.items || []).map((o, i) => `<tr>
          <td class="no">${i + 1}</td>
          <td><span data-b="nc.items.${i}.description">${esc(o.description)}</span>${(o.photos || []).length ? `<div class="ph-ref">Nuotr.: ${o.photos.map(n => `${n} pav.`).join(', ')}</div>` : ''}</td>
          <td data-b="nc.items.${i}.requirement">${esc(o.requirement)}</td>
          <td data-b="nc.items.${i}.action">${esc(o.action)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="summary"><b>Išvada.</b> <span data-b="nc.summary">${esc(a.summary || '')}</span></p>
    <p class="attach">Pridedama: ${nFigs ? `nuotraukų fiksacija (${nFigs} nuotr.).` : '—'}</p>
    <div class="signs">
      ${signRow(s.engineer_position, s.signature, s.engineer_name, '(aktą surašiusio asmens pareigos)')}
      ${signRow(t.contractor ? `Rangovo atstovas, ${t.contractor}` : 'Rangovo atstovas', '', '', '(rangovo atstovo pareigos; su aktu susipažinau)')}
    </div>
  </section>`;
}

function photoSheet(t, s, figs) {
  return `
  <section class="sheet photos-sheet">
    ${header(s, 'Nuotraukų fiksacija')}
    <h3>Nuotraukų fiksacija prie akto Nr. ${esc(t.act_number || '')}</h3>
    <div class="muted-p">${esc([t.address, t.city].filter(Boolean).join(', '))}${t.stairwell ? `, ${esc(t.stairwell)} laiptinė` : ''} · ${esc(fmtDate(t.act_date))}</div>
    <div class="figs">
      ${figs.map(f => `
        <figure class="${f.h && f.w && f.h > f.w ? 'portrait' : ''}">
          <img src="${f.url}" alt="">
          <figcaption><b>${f.n} pav.</b>${f.caption ? ' ' + esc(f.caption) : ''}</figcaption>
        </figure>`).join('')}
    </div>
  </section>`;
}
