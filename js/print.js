// =====================================================================
// Aktų spausdinimo / PDF vaizdas (A4)
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import { esc, nl2br, fmtDate, fmtQty, toast } from './util.js';

export async function renderPrint(el, id, doc) {
  el.innerHTML = `<div class="loading">Ruošiamas dokumentas...</div>`;
  const [t, photos, s] = await Promise.all([db.getTask(id), db.listPhotos(id), db.getSettings()]);
  if (!t) throw new Error('Užduotis nerasta');
  if (!t.defect_act) throw new Error('Aktas dar neparuoštas');
  if ((doc === 'works' || doc === 'both') && !t.works_act) doc = 'defect';

  const actPhotos = photos.filter(p => p.include_in_act);
  const urls = await Promise.all(actPhotos.map(p => db.photoUrl(p, true)));
  const figs = actPhotos.map((p, i) => ({ n: i + 1, url: urls[i], caption: p.caption, w: p.width, h: p.height }));

  const parts = [];
  if (doc === 'defect' || doc === 'both') parts.push(defectSheet(t, s, figs.length));
  if (doc === 'works' || doc === 'both') parts.push(worksSheet(t, s));
  if (figs.length) parts.push(photoSheet(t, s, figs));

  const titles = { defect: 'defektavimo aktas', works: 'numatomų darbų aktas', both: 'aktai' };
  document.title = `${t.act_number || ''} ${t.address || ''} ${titles[doc]}`.trim();

  el.innerHTML = `
    <div class="print-bar no-print">
      <a class="btn ghost" href="#/u/${t.id}/aktai">${icon('back')} Atgal</a>
      <div class="pb-docs">
        <a class="chip ${doc === 'defect' ? 'on' : ''}" href="#/spausdinti/${t.id}/defect">Defektavimo</a>
        ${t.works_act ? `<a class="chip ${doc === 'works' ? 'on' : ''}" href="#/spausdinti/${t.id}/works">Numatomų darbų</a>
        <a class="chip ${doc === 'both' ? 'on' : ''}" href="#/spausdinti/${t.id}/both">Abu</a>` : ''}
      </div>
      <button class="btn primary" id="do-print">${icon('print')} Spausdinti / PDF</button>
    </div>
    <div class="print-hint no-print muted small">Spausdinimo lange pasirinkite „Išsaugoti kaip PDF“. Rekomenduojama išjungti „Antraštės ir poraštės“.</div>
    <div class="sheets">${parts.join('')}</div>`;

  el.querySelector('#do-print').addEventListener('click', async () => {
    const imgs = Array.from(el.querySelectorAll('.sheets img'));
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
    if (imgs.some(i => !i.naturalWidth)) toast('Kai kurios nuotraukos neužsikrovė', 'error');
    window.print();
  });
}

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
  const field = (l, v) => `<tr><th>${l}</th><td>${v ? esc(v) : '&nbsp;'}</td></tr>`;
  return `
  <section class="sheet">
    ${header(s, 'Statinio defektavimo aktas')}
    <div class="doc-top">
      <div class="lined">${esc(s.org_name)}</div><div class="under">(organizacijos pavadinimas)</div>
      <h2>Statinio numatomų atlikti darbų ir defektavimo aktas</h2>
      <div class="date-no"><span class="lined">${esc(fmtDate(t.act_date))}</span> Nr. <span class="lined">${esc(t.act_number || '')}</span></div>
      <div class="under">(data)</div>
      <div class="lined narrow">${esc(s.city || t.city || '')}</div><div class="under">(sudarymo vieta)</div>
    </div>
    <table class="fields">
      ${field('Statinio adresas', addr)}
      ${field('Apžiūros tikslas', d.purpose)}
      ${field('Problema', d.problem)}
      ${t.service_type ? field('Darbų sritis', t.service_type) : ''}
      ${field('Pastatų administravimo vadybininkas', t.manager)}
      ${field('Darbų skubumas', d.urgency)}
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
          <td><b>${esc(o.system)}</b>${(o.photos || []).length ? `<div class="ph-ref">Nuotr.: ${o.photos.map(n => `${n} pav.`).join(', ')}</div>` : ''}</td>
          <td>${nl2br(o.defects)}</td>
          <td>${nl2br(o.works)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${d.summary ? `<p class="summary"><b>Išvada.</b> ${esc(d.summary)}</p>` : ''}
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
  const rows = (w.rows || []).filter(r => (r.description || '').trim()).map(r => {
    let out = '';
    if (r.section && r.section !== lastSec) {
      out += `<tr class="sec"><td></td><td colspan="4">${esc(r.section)}</td></tr>`;
      lastSec = r.section;
    }
    n++;
    out += `<tr><td class="no">${n}</td><td>${esc(r.description)}</td><td class="c">${esc(r.unit)}</td><td class="c b">${r.qty === null || r.qty === undefined ? '' : fmtQty(r.qty)}</td><td>${esc(r.notes)}</td></tr>`;
    return out;
  }).join('');
  const kv = (l, v) => `<div class="kvp"><b>${l}:</b> <span class="lined-in">${esc(v || '')}</span></div>`;
  return `
  <section class="sheet">
    ${header(s, 'Numatomų atlikti darbų aktas')}
    <h2 class="up">Numatomų atlikti darbų ir defektavimo aktas</h2>
    <div class="kvs">
      ${kv('Akto Nr.', t.act_number)}
      ${kv('Data', fmtDate(t.act_date))}
      ${kv('Užsakovas', s.customer_name)}
      ${kv('Objektas', [t.address, t.city].filter(Boolean).join(' ') + (t.stairwell ? `, ${t.stairwell} laipt.` : ''))}
      ${kv('Problema', d.problem || t.problem)}
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
    ${w.note ? `<p class="note"><b>Pastaba: ${esc(w.note)}</b></p>` : ''}
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
