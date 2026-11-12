// =====================================================================
// ŠP aprašų suvestinė (#/sp/suvestine) – tik admin: pažanga, ko trūksta
// aprašams ir kam reikia dėmesio.
// =====================================================================

import * as db from './data.js';
import { icon } from './icons.js';
import { esc } from './util.js';
import { HP_STATUS } from './heat-model.js';

const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const REQ = [['unikalus_nr', 'Unikalus numeris'], ['sildomas_plotas', 'Šildomų patalpų plotas'], ['turis', 'Pastato tūris']];
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;

export async function renderSummary(el) {
  el.innerHTML = '<div class="card muted">Kraunama…</div>';
  let rows, people, bad;
  try { [rows, people, bad] = await Promise.all([db.listHeatPointsFull(), db.listProfiles(), db.listUnreadablePlates()]); }
  catch (err) { el.innerHTML = `<div class="card">Nepavyko įkelti suvestinės: ${esc(err.message || String(err))}</div>`; return; }

  const act = rows.filter(r => !r.excluded);
  const nameOf = id => db.profileName(people.find(p => p.id === id)) || 'Nepriskirta';
  const cnt = st => act.filter(r => r.status === st).length;
  const sent = act.filter(r => r.status === 'pateikta' || r.status === 'parengta');
  const miss = r => REQ.filter(([k]) => !has((r.office || {})[k]));
  const ready = act.filter(r => !miss(r).length && (r.status === 'pateikta' || r.status === 'parengta'));
  const avg = list => list.length ? Math.round(list.reduce((a, r) => a + (r.progress || 0), 0) / list.length) : 0;
  const group = keyFn => {
    const m = new Map();
    for (const r of act) { const k = keyFn(r); (m.get(k) || m.set(k, []).get(k)).push(r); }
    return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'lt'));
  };
  const link = r => `<a href="#/sp/${r.id}">${esc(r.address)}${r.seq > 1 ? ` · ŠP ${r.seq}` : ''}</a>`;
  const badBy = new Map(bad.map(b => [b.heat_point_id, b.n]));

  const attention = [
    ...act.filter(r => r.status === 'grazinta').map(r => ({ r, why: 'Grąžinta šilumininkui taisyti' + (r.note ? `: ${r.note}` : '') })),
    ...act.filter(r => badBy.has(r.id)).map(r => ({ r, why: `Neįskaitomų gamyklinių lentelių: ${badBy.get(r.id)}` })),
    ...sent.filter(r => miss(r).length).map(r => ({ r, why: 'Pateikta, bet apraše trūksta: ' + miss(r).map(x => x[1].toLowerCase()).join(', ') }))
  ];

  el.innerHTML = `
    <div class="page-head"><a class="btn ghost" href="#/sp">${icon('back')} Sąrašas</a><h1>ŠP suvestinė</h1></div>
    <div class="card hp-sum">
      <div class="hp-sum-row"><b>${act.length}</b> aktyvūs šilumos punktai · pateikta <b>${sent.length}</b> (${pct(sent.length, act.length)} %) · aprašui visiškai paruošta <b>${ready.length}</b> · vidutiniškai surinkta <b>${avg(act)} %</b></div>
      <div class="hp-bar big"><i style="width:${pct(sent.length, act.length)}%"></i></div>
      <table class="of-table"><tr>${Object.entries(HP_STATUS).map(([k, l]) => `<th>${esc(l)}</th>`).join('')}</tr>
        <tr>${Object.keys(HP_STATUS).map(k => `<td><b>${cnt(k)}</b></td>`).join('')}</tr></table>
    </div>

    <div class="card"><div class="card-title">Ko trūksta aprašams (privalomi biuro duomenys)</div>
      <table class="of-table"><tr><th>Duomuo</th><th>Turi</th><th>Trūksta</th></tr>
        ${REQ.map(([k, l]) => { const n = act.filter(r => has((r.office || {})[k])).length; return `<tr><td>${esc(l)}</td><td>${n}</td><td class="${act.length - n ? 'of-bad' : ''}">${act.length - n}</td></tr>`; }).join('')}
      </table>
      <details class="of-group"><summary>ŠP be bent vieno privalomo duomens: ${act.filter(r => miss(r).length).length}</summary>
        <ul class="of-gaps">${act.filter(r => miss(r).length).map(r => `<li>${link(r)} – ${esc(miss(r).map(x => x[1].toLowerCase()).join(', '))}</li>`).join('') || '<li>Visi turi</li>'}</ul></details>
    </div>

    <div class="card"><div class="card-title">Pagal šilumininką</div>
      <table class="of-table"><tr><th>Šilumininkas</th><th>Priskirta</th><th>Pradėta</th><th>Pateikta</th><th>Surinkta</th></tr>
        ${group(r => r.assigned_to || '').map(([id, l]) => `<tr><td>${esc(id ? nameOf(id) : 'Nepriskirta')}</td><td>${l.length}</td><td>${l.filter(r => r.status === 'pradeta' || r.status === 'grazinta').length}</td><td>${l.filter(r => r.status === 'pateikta' || r.status === 'parengta').length}</td><td>${avg(l)} %</td></tr>`).join('')}
      </table></div>

    <div class="card"><div class="card-title">Pagal miestą ir ŠP tipą</div>
      <table class="of-table"><tr><th>Miestas</th><th>ŠP</th><th>Pateikta</th><th>Surinkta</th></tr>
        ${group(r => r.city || '—').map(([c, l]) => `<tr><td>${esc(c)}</td><td>${l.length}</td><td>${l.filter(r => r.status === 'pateikta' || r.status === 'parengta').length}</td><td>${avg(l)} %</td></tr>`).join('')}
      </table>
      <table class="of-table"><tr><th>Registro tipas</th><th>ŠP</th><th>Nuotoliniu būdu valdomi</th></tr>
        ${group(r => r.registry_type || '—').map(([c, l]) => `<tr><td>${esc(c)}</td><td>${l.length}</td><td>${l.filter(r => (r.office || {}).nuotolinis === 'taip').length}</td></tr>`).join('')}
      </table></div>

    <div class="card"><div class="card-title">Reikia dėmesio (${attention.length})</div>
      ${attention.length ? `<table class="of-table"><tr><th>Šilumos punktas</th><th>Kas</th></tr>${attention.map(a => `<tr><td>${link(a.r)}</td><td>${esc(a.why)}</td></tr>`).join('')}</table>` : '<p class="muted">Nieko, kas reikalautų dėmesio.</p>'}
    </div>`;
}
