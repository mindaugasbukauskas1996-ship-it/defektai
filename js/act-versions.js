// Akto versijos: kiekvienas DI sugeneruotas variantas (Claude ar ChatGPT) išsaugomas ir nieko neištrina –
// galima grįžti prie bet kurios versijos. Saugoma tasks.act_versions (jsonb sąrašas).
//   { id, kind: 'defect' | 'nc' | 'annual', at, provider: 'anthropic' | 'openai' | 'manual', note?, snap }

import { esc, confirmDialog, toast } from './util.js';

const PROVIDER = { anthropic: 'Claude (Anthropic)', openai: 'ChatGPT (OpenAI)', manual: 'Redaguota ranka' };
const MAX_PER_KIND = 8;

const clone = x => (x == null ? x : JSON.parse(JSON.stringify(x)));

/** Dabartinio akto turinys, kuris keičiasi generuojant. */
export function snapOf(t, kind) {
  if (kind === 'defect') return clone({ defect_act: t.defect_act, works_act: t.works_act, ai_assumptions: t.ai_assumptions || [] });
  if (kind === 'nc') return clone({ nc_act: t.nc_act, ai_assumptions: t.ai_assumptions || [] });
  return clone({ annual_act: t.annual_act });
}

const hasAct = (snap, kind) => kind === 'defect' ? !!snap.defect_act : kind === 'nc' ? !!snap.nc_act : !!snap.annual_act;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const versionsOf = (t, kind) => (Array.isArray(t.act_versions) ? t.act_versions : []).filter(v => v.kind === kind);

/** Prideda versiją; to paties tipo senesnes, viršijančias ribą, išmeta. */
function add(list, kind, snap, provider, note = '') {
  const out = [...list, { id: Math.random().toString(36).slice(2, 10), kind, at: new Date().toISOString(), provider, note, snap }];
  const mine = out.filter(v => v.kind === kind);
  if (mine.length <= MAX_PER_KIND) return out;
  const drop = new Set(mine.slice(0, mine.length - MAX_PER_KIND).map(v => v.id));
  return out.filter(v => !drop.has(v.id));
}

/**
 * Prieš perrašant aktą: jei dabartinis aktas dar neišsaugotas kaip versija (pvz. redaguotas ranka), jį išsaugo.
 * Grąžina naują sąrašą (nesaugo į DB).
 */
export function keepCurrent(t, kind, before = snapOf(t, kind)) {
  let list = Array.isArray(t.act_versions) ? t.act_versions : [];
  if (!hasAct(before, kind)) return list;
  const last = versionsOf(t, kind).slice(-1)[0];
  if (last && same(last.snap, before)) return list;
  return add(list, kind, before, 'manual', 'Prieš naują generavimą');
}

/** Naujai sugeneruotą aktą prideda prie sąrašo. */
export function addGenerated(list, kind, snap, provider, note = '') {
  return add(list, kind, snap, provider, note);
}

const fmt = iso => { try { return new Date(iso).toLocaleString('lt-LT', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };

/** Versijų kortelė (HTML). Jei versijų nėra – tuščia. */
export function versionsHtml(t, kind) {
  const list = versionsOf(t, kind);
  if (!list.length) return '';
  const cur = snapOf(t, kind);
  return `<div class="card act-vers" data-vers="${kind}">
    <div class="card-title">Akto versijos (${list.length})</div>
    <div class="muted small">Kiekvienas sugeneruotas variantas išsaugomas. Galite grįžti prie bet kurio – dabartinis, jei jį redagavote, taip pat nedingsta.</div>
    <ul class="ver-list">${[...list].reverse().map(v => {
      const isCur = same(v.snap, cur);
      return `<li class="${isCur ? 'on' : ''}"><div><b>${esc(PROVIDER[v.provider] || v.provider)}</b> · ${esc(fmt(v.at))}${v.note ? ` · <span class="muted">${esc(v.note)}</span>` : ''}${isCur ? ' <span class="tag">dabartinė</span>' : ''}</div>
        <div class="ver-actions">${isCur ? '' : `<button class="btn small" type="button" data-ver="use" data-id="${esc(v.id)}">Naudoti šią</button>`}
        <button class="btn small ghost" type="button" data-ver="del" data-id="${esc(v.id)}" title="Ištrinti versiją">×</button></div></li>`;
    }).join('')}</ul></div>`;
}

/** Prijungia versijų kortelės mygtukus. save(patch) – išsaugo užduotį, redraw() – perpiešia. */
export function bindVersions(root, t, kind, { save, redraw }) {
  const card = root.querySelector(`.act-vers[data-vers="${kind}"]`);
  if (!card) return;
  card.addEventListener('click', async e => {
    const b = e.target.closest('[data-ver]');
    if (!b) return;
    const v = (t.act_versions || []).find(x => x.id === b.dataset.id);
    if (!v) return;
    try {
      if (b.dataset.ver === 'del') {
        if (!await confirmDialog('Ištrinti šią versiją?', 'Ištrinti')) return;
        await save({ act_versions: t.act_versions.filter(x => x.id !== v.id) });
      } else {
        const list = keepCurrent({ ...t, act_versions: t.act_versions }, kind);          // dabartinis (jei redaguotas) – į versijas
        await save({ ...clone(v.snap), act_versions: list });
        toast('Atkurta pasirinkta versija', 'ok');
      }
    } catch (err) { toast('Nepavyko: ' + (err.message || err), 'error', 6000); }
    redraw();
  });
}
