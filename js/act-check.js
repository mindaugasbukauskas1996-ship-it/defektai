// Akto patikra prieš eksportą ir taisymų sekimas.
//  - checkAct(): STR nuorodos (ar yra žinyne), nuotraukos prie objektų, kiekiai, mato vienetai, DI prielaidos;
//  - diffAct(): kuo galutinis aktas skiriasi nuo DI sugeneruoto varianto (iš akto versijų).
// Žinynas imamas iš supabase/functions/ai/prompt.js (STR_REFERENCE) – vienas šaltinis, kaip ir DI.

let refCache = null;

/** Žinyno punktai: Set { 'STR 1.07.03:2017|12.2' } ir normų žymos (be punktų). */
async function strRefs() {
  if (refCache) return refCache;
  const pts = new Set(), norms = new Set();
  try {
    const { STR_REFERENCE, UNITS } = await import('../supabase/functions/ai/prompt.js');
    let cur = '';
    for (const ln of String(STR_REFERENCE).split('\n')) {
      const h = /^[A-D]\)\s*(STR\s[\d.]+(?:\(\d\))?:\d{4})/.exec(ln);
      if (h) { cur = h[1]; norms.add(cur); continue; }
      const m = /^\s*-\s*([\d.]+)\s*p\./.exec(ln);
      if (m && cur) pts.add(cur + '|' + m[1].replace(/\.$/, ''));
      const d = /(STR\s2\.01\.01\(\d\):\d{4})/.exec(ln);
      if (d) norms.add(d[1]);
    }
    refCache = { pts, norms, units: new Set(UNITS) };
  } catch (_) { refCache = { pts, norms, units: null }; }
  return refCache;
}

const CITE = /(STR\s[\d.]+(?:\(\d\))?:\d{4})\s*([\d.]*\d)?\s*(p\.)?/g;

/**
 * Patikra. Grąžina [{ level: 'err' | 'warn' | 'info', text, where? }].
 * kind: 'defect' | 'nc'. t – užduotis; photos – nuotraukos aktui.
 */
export async function checkAct(kind, t, photos = []) {
  const out = [];
  const R = await strRefs();
  const nPh = photos.length;
  const objs = kind === 'nc' ? ((t.nc_act || {}).items || []) : ((t.defect_act || {}).objects || []);
  if (!objs.length) return [{ level: 'err', text: 'Akte nėra nė vieno įrašo.' }];

  const seenCite = {};
  objs.forEach((o, i) => {
    const name = kind === 'nc' ? `Neatitiktis ${i + 1}` : (o.system || `Objektas ${i + 1}`);
    const body = kind === 'nc' ? (o.requirement || '') : (o.defects || '');
    const main = kind === 'nc' ? o.description : o.defects;
    if (!String(main || '').trim()) out.push({ level: 'err', where: name, text: 'tuščias defekto / neatitikties aprašas' });
    if (kind === 'defect' && !String(o.works || '').trim()) out.push({ level: 'warn', where: name, text: 'nėra rekomenduojamų darbų' });
    if (kind === 'defect' && !String(o.system || '').trim()) out.push({ level: 'warn', where: name, text: 'nenurodytas objektas / sistema' });
    const ph = (o.photos || []).filter(n => Number.isInteger(+n));
    if (nPh && !ph.length) out.push({ level: 'warn', where: name, text: 'neprijungta nė viena nuotrauka' });
    const bad = ph.filter(n => +n < 1 || +n > nPh);
    if (bad.length) out.push({ level: 'err', where: name, text: `nuorodos į neegzistuojančias nuotraukas: ${bad.join(', ')}` });
    // STR nuorodos
    if (R.pts.size) {
      let m, any = false;
      CITE.lastIndex = 0;
      while ((m = CITE.exec(body))) {
        any = true;
        const norm = m[1].replace(/\s+/, ' '), pt = (m[2] || '').replace(/\.$/, '');
        seenCite[norm + (pt ? ' ' + pt + ' p.' : '')] = (seenCite[norm + (pt ? ' ' + pt + ' p.' : '')] || 0) + 1;
        if (!R.norms.has(norm)) out.push({ level: 'err', where: name, text: `norma „${norm}“ nėra STR žinyne – patikrinkite` });
        else if (pt && !R.pts.has(norm + '|' + pt)) out.push({ level: 'err', where: name, text: `punkto „${norm} ${pt} p.“ nėra žinyne – gali būti išgalvotas` });
      }
      if (kind === 'defect' && !any) out.push({ level: 'warn', where: name, text: 'nėra STR pagrindo skliaustuose' });
    }
  });
  if (objs.length >= 3) {
    const top = Object.entries(seenCite).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] === objs.length) out.push({ level: 'info', text: `Visur ta pati nuoroda (${top[0]}) – ar tikrai tinka kiekvienam objektui?` });
  }

  // Numatomų darbų lentelė
  const rows = kind === 'defect' && t.works_act ? (t.works_act.rows || []) : [];
  rows.forEach((r, i) => {
    const nm = `Darbų eilutė ${i + 1}`;
    if (!String(r.description || '').trim()) out.push({ level: 'err', where: nm, text: 'tuščias darbo aprašas' });
    if (r.qty === null || r.qty === undefined || r.qty === '') out.push({ level: 'warn', where: nm, text: 'nenurodytas kiekis' });
    else if (!(Number(r.qty) > 0)) out.push({ level: 'err', where: nm, text: 'kiekis turi būti didesnis už 0' });
    if (R.units && r.unit && !R.units.has(r.unit)) out.push({ level: 'err', where: nm, text: `mato vienetas „${r.unit}“ nėra įmonės sąraše` });
  });
  const prelim = rows.filter(r => /preliminar/i.test(r.notes || '')).length;
  if (prelim) out.push({ level: 'info', text: `${prelim} iš ${rows.length} kiekių – preliminarūs (rangovas tikslins vietoje).` });

  for (const a of [].concat(t.ai_assumptions || []).map(String).filter(Boolean)) out.push({ level: 'warn', where: 'DI prielaida', text: a });
  return out;
}

// ---------------------------------------------------------------------
// Taisymų sekimas
// ---------------------------------------------------------------------

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** Teksto laukų sąrašas aktui: [{ key, label, value }] */
function fields(kind, snap) {
  const out = [];
  if (kind === 'nc') {
    const a = snap.nc_act || {};
    out.push({ key: 'summary', label: 'Išvada', value: a.summary });
    (a.items || []).forEach((x, i) => {
      out.push({ key: `i${i}d`, label: `Neatitiktis ${i + 1}: aprašas`, value: x.description });
      out.push({ key: `i${i}r`, label: `Neatitiktis ${i + 1}: reikalavimas`, value: x.requirement });
      out.push({ key: `i${i}a`, label: `Neatitiktis ${i + 1}: veiksmai`, value: x.action });
    });
    return out;
  }
  const a = snap.defect_act || {};
  out.push({ key: 'problem', label: 'Problema', value: a.problem });
  out.push({ key: 'summary', label: 'Išvada', value: a.summary });
  (a.objects || []).forEach((o, i) => {
    out.push({ key: `o${i}d`, label: `${o.system || 'Objektas ' + (i + 1)}: defektai`, value: o.defects });
    out.push({ key: `o${i}w`, label: `${o.system || 'Objektas ' + (i + 1)}: darbai`, value: o.works });
  });
  ((snap.works_act || {}).rows || []).forEach((r, i) => out.push({ key: `r${i}`, label: `Darbų eilutė ${i + 1}`, value: r.description }));
  return out;
}

/** Paskutinė DI sugeneruota versija (provider ≠ manual). */
export function lastGenerated(t, kind) {
  const vs = (Array.isArray(t.act_versions) ? t.act_versions : []).filter(v => v.kind === kind && v.provider !== 'manual');
  return vs.length ? vs[vs.length - 1] : null;
}

/** Skirtumai tarp DI varianto ir dabartinio akto: [{ field, before, after }] (tik pakeisti, ne tušti→tušti). */
export function diffAct(kind, t) {
  const gen = lastGenerated(t, kind);
  if (!gen) return [];
  const before = new Map(fields(kind, gen.snap).map(f => [f.key, f]));
  const diffs = [];
  for (const f of fields(kind, kind === 'nc' ? { nc_act: t.nc_act } : { defect_act: t.defect_act, works_act: t.works_act })) {
    const b = before.get(f.key);
    if (!b) continue;
    if (clean(b.value) !== clean(f.value)) diffs.push({ field: f.label, before: clean(b.value), after: clean(f.value) });
  }
  return diffs;
}
