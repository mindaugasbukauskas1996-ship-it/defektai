// =====================================================================
// ŠP aprašo („Pastato šildymo ir karšto vandens sistemos aprašas“) turinys.
// Čia aprašyti biuro laukai (OFFICE), pastovių duomenų laukai (COMPANY) ir
// funkcija buildAprasas(), kuri iš surinktų duomenų sudaro dokumento blokus.
// Blokus į Word / PDF paverčia heat-export.js. Struktūra – pagal Word šabloną.
// =====================================================================

import { KINDS, GROUP_LABEL, itemLabel, computeProgress } from './heat-model.js';

export const ND = 'duomenų nėra';
const has = v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '';
const kvOn = s => ['lygiagreti', 'dvi_pakopos', 'kita'].includes(s.kv);
const heatOn = s => !!s.sildymas && s.sildymas !== 'nera';
const indep = s => s.sildymas === 'nepriklausoma';

// ---------------------------------------------------------------------
// Pastovūs įmonės duomenys (hp_settings) – redaguojami „ŠP nustatymuose“
// ---------------------------------------------------------------------
export const COMPANY = [
  { title: 'Prižiūrėtojas (aprašo rengėjas)', fields: [
    { k: 'rengejas', l: 'Pavadinimas' }, { k: 'rengejas_kodas', l: 'Įmonės kodas' },
    { k: 'buveine', l: 'Buveinė', span: 2 },
    { k: 'atestato_nr', l: 'Atestato vykdyti energetikos veiklą Nr.' }, { k: 'atestatas_galioja_iki', l: 'Atestatas galioja iki' },
    { k: 'tel', l: 'Telefonas' }, { k: 'el_pastas', l: 'El. paštas' }, { k: 'avarine_tel', l: 'Avarinė tarnyba (visą parą)' },
    { k: 'sudarymo_vieta', l: 'Aprašo sudarymo vieta' }] },
  { title: 'Asmenys', fields: [
    { k: 'tvirtina_pareigos', l: 'Aprašą tvirtina – pareigos' }, { k: 'tvirtina_vardas', l: 'Aprašą tvirtina – vardas, pavardė' },
    { k: 'apraso_autorius', l: 'Aprašą parengė (pareigos, vardas, pavardė)', span: 2 },
    { k: 'atsakingas.pareigos', l: 'Atsakingas už šilumos ūkį – pareigos' }, { k: 'atsakingas.vardas', l: 'Vardas, pavardė' },
    { k: 'atsakingas.dok', l: 'Kvalifikacijos dokumentas (Nr., kas išdavė, galioja iki)', span: 2 }, { k: 'atsakingas.tel', l: 'Telefonas' }] },
  { title: 'Savininkai, tiekėjas, valdytojai', fields: [
    { k: 'sp_savininkas', l: 'Šilumos punkto savininkas' }, { k: 'silumos_tiekejas', l: 'Šilumos tiekėjas' },
    { k: 'atsakomybes_riba', l: 'Nuosavybės ir priežiūros atsakomybės riba', span: 4 },
    { k: 'valdytojai', l: 'Valdytojų rekvizitai – po vieną eilutėje (pavadinimas, kodas, tel., el. paštas). Parenkama pagal registre nurodytą valdytoją.', type: 'area', span: 4 }] },
  { title: 'Bendri tekstai', fields: [
    { k: 'pasleptu_tekstas', l: '4.6. Paslėptų vamzdynų vietos (vienas tekstas visiems ŠP)', type: 'area', span: 4 }] }
];

export const DEFAULT_TEXTS = {
  pasleptu_tekstas: 'Dalis vamzdynų paslėpta statybinėse konstrukcijose: stovų perėjimai per perdangas, atskiri stovai ir atšakos į šildymo prietaisus – sienų vagose, šachtose ar po apdaila. Magistraliniai vamzdynai ir šilumos punkto vamzdynai sumontuoti atvirai.'
};

// ---------------------------------------------------------------------
// Biuro laukai vienam ŠP (heat_points.office). common: true – reikšmę galima
// nustatyti vieną kartą visiems ŠP (hp_settings.bendri); pre – paruošta reikšmė
// iš registro, klausimyno ar įrenginių (biuras gali perrašyti).
// ---------------------------------------------------------------------
const spec = (c, grp, kind, key) => { const it = c.items.find(i => !i.absent && i.grp === grp && i.kind === kind && has((i.specs || {})[key])); return it ? it.specs[key] : ''; };

const fl = c => Number(c.obj.floors) || 0;
const lowRise = c => fl(c) > 0 && fl(c) <= 5, highRise = c => fl(c) >= 9;     // 5 aukštų / 9 aukštų namai
const R7 = [  // 7 skyrius: [raktas, parametras, vnt., rodyti?, reikšmė iš surinktų duomenų, ar yra „leistinos ribos“]
  { head: 'Šildymo sistema', show: heatOn },
  ['sild_slegis', 'Darbinis slėgis (grąžinimo linijoje)', 'bar', heatOn, c => highRise(c) ? '5,5' : lowRise(c) ? '4' : '', true],
  ['statinis', 'Statinis (užpildymo) slėgis', 'bar', heatOn, null, true],
  ['max_slegis', 'Didžiausias leistinas slėgis', 'bar', heatOn, 'dash', true],
  ['sild_apsaug', 'Apsauginio vožtuvo suveikimo slėgis', 'bar', indep, c => '6', false],
  ['indas', 'Išsiplėtimo indo priešslėgis', 'bar', indep, c => highRise(c) ? '2,5' : lowRise(c) ? '1,5' : '', true],
  ['rele', 'Slėgio relės (apsaugos nuo sausos eigos) nustatymas', 'bar', indep, c => '1,5', false],
  ['max_temp', 'Didžiausia tiekiamo šilumnešio temperatūra', '°C', heatOn, c => '85', true],
  ['hidr', 'Hidraulinio bandymo slėgis', 'bar', heatOn, null, false],
  { head: 'Karšto vandens sistema', show: kvOn },
  ['kv_temp', 'Karšto vandens temperatūra po šilumokaičio', '°C', kvOn, 'dash', true],
  ['kv_vart', 'Karšto vandens temperatūra vartojimo vietose', '°C', kvOn, null, true],
  ['kv_cirk', 'Cirkuliacinio vandens temperatūra', '°C', s => kvOn(s) && s.kv_cirkuliacija === 'taip', 'dash', true],
  ['kv_apsaug', 'Apsauginio vožtuvo suveikimo slėgis', 'bar', kvOn, c => '8', false],
  { head: 'Šilumos punktas' },
  ['graz_temp', 'Grąžinamo į tinklus šilumnešio temperatūra', '°C', null, c => c.s.r_temp_graz, true]
];

const R42 = [
  ['p_tiek', 'Slėgis tiekimo linijoje', 'MPa'], ['p_graz', 'Slėgis grąžinimo linijoje', 'MPa'], ['dp', 'Slėgių skirtumas', 'MPa'],
  ['t_max', 'Didžiausia tiekiamo šilumnešio temperatūra', '°C'], ['t_min', 'Mažiausia tiekiamo šilumnešio temperatūra', '°C'],
  ['t_graz', 'Didžiausia grąžinamo šilumnešio temperatūra', '°C']
];

export const OFFICE = [
  { title: 'Aprašas', fields: [
    { k: 'apraso_data', l: 'Aprašo sudarymo data', type: 'date' },
    { k: 'op_vardas', l: 'ŠP operatorius – vardas, pavardė (jei ne priskirtas šilumininkas)' },
    { k: 'op_dok', l: 'ŠP operatoriaus kvalifikacijos dokumentas (Nr., kas išdavė, galioja iki)', span: 2 },
    { k: 'op_tel', l: 'ŠP operatoriaus telefonas' }] },
  { title: '1.1. Pastatas', fields: [
    { k: 'unikalus_nr', l: 'Unikalus numeris', req: true, ph: '0000-0000-0000' },
    { k: 'statybos_metai', l: 'Statybos metai', pre: c => c.obj.built_year },
    { k: 'aukstai', l: 'Aukštų skaičius', pre: c => c.obj.floors },
    { k: 'butai', l: 'Butų skaičius', pre: c => c.obj.apartments },
    { k: 'pastato_aukstis', l: 'Pastato aukštis', u: 'm' },
    { k: 'lubu_aukstis', l: 'Patalpų lubų aukštis (vyraujantis)', u: 'm', common: true },
    { k: 'sildomas_plotas', l: 'Bendras šildomų patalpų plotas', u: 'm²', req: true, hint: c => c.obj.usable_area ? `registre naudingas plotas ${c.obj.usable_area} m²` : '' },
    { k: 'turis', l: 'Pastato tūris', u: 'm³', req: true },
    { k: 'valdytojas', l: 'Bendrojo naudojimo objektų valdytojas', span: 2, pre: c => c.valdytojas }] },
  { title: '1.4 ir 2.2. Sistema', fields: [
    { k: 'montuotojas', l: 'ŠP sumontavusi įmonė (pavadinimas, buveinė)', span: 2, pre: c => c.s.montuotojas },
    { k: 'projektuotojas', l: 'Projektuotojas (pavadinimas, buveinė, projekto Nr. ir metai)', span: 2 },
    { k: 'apskaita_butuose', l: 'Šilumos apskaita butuose', opts: ['Nėra', 'Šilumos dalikliai', 'Butų šilumos skaitikliai'], common: true },
    { k: 'eksploatacijos_pradzia', l: 'Sistemos eksploatacijos pradžia (metai)', pre: c => c.obj.built_year },
    { k: 'sp_priemimo_data', l: 'ŠP priėmimo eksploatuoti data' },
    { k: 'rekonstrukcija', l: 'Paskutinė rekonstrukcija (metai, kas atlikta)', span: 2, hint: c => c.obj.renovation ? `registre: ${c.obj.renovation}` : '' },
    { k: 'balansiniai_sild', l: 'Šildymo balansiniai ventiliai (tipas, kiekis)' },
    { k: 'balansiniai_kv', l: 'KV termobalansiniai ventiliai (tipas, kiekis)' },
    { k: 'prietaisu_butuose', l: 'Šildymo prietaisų butuose kiekis', u: 'vnt.' },
    { k: 'voniu_sildytuvu', l: 'Vonių šildytuvų kiekis', u: 'vnt.' },
    { k: 'teises_aktai', l: '2.5. Teisės aktai (jei kitokie nei standartinis sąrašas) – po vieną eilutėje', type: 'area', span: 4, common: true }] },
  { title: '4.1. Projektiniai parametrai', fields: [
    { k: 'q_sild', l: 'Šilumos poreikis šildymui', u: 'kW', pre: c => spec(c, 'ivadas', 'agregatas', 'galia_sildymui') },
    { k: 'q_kv', l: 'Šilumos poreikis karštam vandeniui', u: 'kW', pre: c => spec(c, 'ivadas', 'agregatas', 'galia_kv') },
    { k: 'q_ved', l: 'Šilumos poreikis vėdinimui', u: 'kW', common: true },
    { k: 'q_sum', l: 'Suminis šilumos poreikis', u: 'kW' },
    { k: 'g_sild', l: 'Šilumnešio debitas šildymo sistemoje', u: 'm³/h' },
    { k: 'g_kv', l: 'Debitas karšto vandens sistemoje', u: 'm³/h' },
    { k: 'g_sum', l: 'Suminis debitas iš šilumos tinklų', u: 'm³/h' },
    { k: 'grafikas', l: 'Šildymo sistemos temperatūrinis grafikas', u: '°C', ph: '80/60', common: true },
    { k: 't_kv', l: 'Karšto vandens temperatūra', u: '°C', common: true },
    { k: 't_lauko', l: 'Projektinė lauko oro temperatūra', u: '°C', common: true },
    { k: 't_patalpu', l: 'Projektinė gyvenamųjų patalpų temperatūra', u: '°C', common: true },
    { k: 't_bendr', l: 'Projektinė bendrojo naudojimo patalpų temperatūra', u: '°C', common: true },
    { k: 'dp_sild', l: 'Slėgio nuostoliai šildymo sistemoje', u: 'kPa' },
    { k: 'dp_kv', l: 'Slėgio nuostoliai karšto vandens sistemoje', u: 'kPa' }] },
  { title: '4.2. Parametrai prijungimo prie šilumos tinklų taške (iš tiekėjo techninių sąlygų)', common: true,
    cols: [['z', 'Žiemą'], ['v', 'Vasarą'], ['n', 'Leistinas nuokrypis']],
    rows: R42.map(([k, l, u]) => ({ k: 'p42_' + k, l, u })) },
  { title: '5. Pripažinimo tinkama naudoti ir projekto duomenys', fields: [
    { k: 'projektas', l: 'Projekto pavadinimas, Nr., metai (arba „projektas neišlikęs“)', span: 2 },
    { k: 'tech_salygos', l: 'Šilumos tiekėjo techninės (prisijungimo) sąlygos (Nr., data)', span: 2 },
    { k: 'priemimo_aktas', l: 'ŠP priėmimo eksploatuoti aktas (Nr., data)', span: 2 },
    { k: 'hidraulinis_aktas', l: 'Paskutinis hidraulinio bandymo aktas (Nr., data, bandymo slėgis)', span: 2 },
    { k: 'parengties_aktas', l: 'Paskutinis parengties šildymo sezonui aktas (Nr., data)', span: 2 },
    { k: 'dok_vieta', l: 'Dokumentacijos saugojimo vieta (adresas, atsakingas asmuo)', span: 2, common: true }] },
  { title: '6. Garantijos', fields: [
    { k: 'garantija', l: 'Garantijos sąlygos (tekstas; pvz. „Sistemai garantija negalioja (eksploatuojama nuo … m.)“)', type: 'area', span: 4, common: true }] },
  { title: '7. Saugios būklės ir veikimo režimų ribos', common: true,
    cols: [['v', 'Nustatyta (darbinė) reikšmė'], ['r', 'Leistinos ribos']],
    rows: R7.filter(Array.isArray).map(([k, l, u, show, pre, hasR]) => ({ k: 'r7_' + k, l, u, show, noCols: [pre === 'dash' ? 'v' : '', hasR ? '' : 'r'].filter(Boolean), pre: typeof pre === 'function' ? { v: pre } : null })) },
  { title: '7–8. Priežiūros informacija ir susiję dokumentai', fields: [
    { k: 'tikrinimo_daznumas', l: 'Parametrų tikrinimo dažnumas', ph: 'kas savaitę', common: true },
    { k: 'instrukciju_vieta', l: 'Įrenginių gamintojų instrukcijų saugojimo vieta', common: true },
    { k: 'raktai', l: 'ŠP raktus turi', span: 2, common: true },
    { k: 'veikimo_instr', l: 'Sistemos veikimo instrukcija (dokumento Nr., data)', span: 2, common: true },
    { k: 'prieziuros_instr', l: 'Sistemos priežiūros instrukcija (dokumento Nr., data)', span: 2, common: true }] }
];

/** Visi vieno ŠP biuro laukai plokščiu sąrašu: { k, l, u, req, common, show, pre(c) }. */
export function officeFields() {
  const out = [];
  for (const g of OFFICE) {
    if (g.fields) for (const f of g.fields) out.push({ ...f, common: f.common || false, group: g.title });
    if (g.rows) for (const r of g.rows) for (const [ck, cl] of g.cols) {
      if ((r.noCols || []).includes(ck)) continue;
      out.push({ k: `${r.k}_${ck}`, l: `${r.l} – ${cl.toLowerCase()}`, u: r.u, show: r.show, common: true, group: g.title, pre: r.pre && r.pre[ck] });
    }
  }
  return out;
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/** Kontekstas reikšmėms skaičiuoti. */
export function makeCtx({ hp, items, photos, obj, set: baseSet, op }) {
  // kitų miestų (tiekėjų) ŠP: hp_settings.miestai[miestas] = { nuo: {laukai, kurie keičia pastovius}, bendri: {bendros reikšmės tam miestui} }
  const city = ((baseSet || {}).miestai || {})[hp.city];
  const set = city ? { ...baseSet, ...(city.nuo || {}), ...(city.bendri ? { bendri: city.bendri } : {}) } : (baseSet || {});
  const s = hp.survey || {};
  const c = { hp, s, items: items || [], photos: photos || [], obj: obj || {}, set: set || {}, op: op || {}, office: hp.office || {} };
  // valdytojas: registre nurodytas projektas + rekvizitai iš nustatymų
  const proj = String((c.office || {}).valdytojas_imone || c.obj.project || '').trim();   // tiekėjo (Klaipėdos energijos) duomenys tikslesni už registro
  const key = proj.replace(/,?\s*(UAB|AB)\b\.?/gi, '').replace(/[„“"]/g, '').trim().toLowerCase();
  const line = key ? String(c.set.valdytojai || '').split('\n').map(x => x.trim()).find(x => x.replace(/[„“"]/g, '').toLowerCase().includes(key)) : '';
  c.valdytojas = line || proj;
  const defs = officeFields();
  c.pre = k => { const f = defs.find(d => d.k === k); const v = f && f.pre ? f.pre(c) : ''; return has(v) ? String(v) : ''; };
  /** Galutinė lauko reikšmė: biuro įrašas → paruošta reikšmė → bendra visiems ŠP. */
  c.val = k => {
    if (has(c.office[k])) return String(c.office[k]).trim();
    const p = c.pre(k);
    if (p) return p;
    const b = (c.set.bendri || {})[k];
    return has(b) ? String(b).trim() : '';
  };
  return c;
}

// ---------------------------------------------------------------------
// Formatavimas
// ---------------------------------------------------------------------
/** Jungimo būdas pagal vamzdžių medžiagą (šilumininko neklausiama): plienas – suvirinti ir srieginiai, cinkuotas / daugiasluoksnis / nerūdijantis – presuoti, plastikas / PPR – lituoti. */
const JOIN = { 'Plienas': ['Suvirinti (dujiniu suvirinimu)', 'srieginiai'], 'Cinkuotas plienas': ['Presuoti'], 'Daugiasluoksniai': ['Presuoti'], 'Nerūdijantis plienas': ['Presuoti'], 'Plastikas': ['Lituoti'], 'PPR': ['Lituoti'] };
const joinBy = mats => [...new Set((mats || []).flatMap(m => JOIN[m] || []))].join(', ');
const fixDn = v => String(v).replace(/\bdn\s*(\d+)/gi, 'DN$1').replace(/\s*-\s*/g, ' – ');
const lc = a => (a || []).map(x => String(x).toLowerCase()).join(', ');
const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
const dateIso = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v || ''); };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Įrenginio techniniai rodikliai viena eilute (4.3 lentelei). */
export function specsText(it) {
  const k = KINDS[it.kind] || KINDS.kita, sp = it.specs || {};
  const parts = [];
  for (const [key, label, unit] of k.fields) {
    const v = sp[key];
    if (!has(v)) continue;
    if (unit === 'DN') parts.push('DN' + String(v).replace(/^dn\s*/i, '').trim());
    else parts.push(`${label}: ${String(v).trim()}${unit ? ' ' + unit : ''}`);
  }
  if (k.qty && it.qty) parts.push(`${it.qty} vnt.`);
  return parts.join('; ');
}
const typeText = it => [it.manufacturer, it.model].filter(has).join(' ');

// ---------------------------------------------------------------------
// Ko trūksta aprašui (rodoma biurui prieš atsisiunčiant)
// ---------------------------------------------------------------------
export function aprasasMissing(c) {
  const out = [];
  const p = computeProgress(c.hp, c.items, c.photos);
  if (p.missing) out.push({ kind: 'sp', label: `Šilumininko duomenys nebaigti: trūksta ${p.missing} (žr. žingsnį „Pateikimas“)` });
  for (const it of c.items) {
    if (it.absent) continue;
    const k = KINDS[it.kind] || KINDS.kita;
    const name = `${itemLabel(it)} (${(GROUP_LABEL[it.grp] || '').toLowerCase()})`;
    if (k.plate && !has(it.manufacturer) && !has(it.model)) {
      const bad = it.ai && it.ai.readable === 'neiskaitoma';
      out.push({ kind: 'item', step: it.grp, label: `${name}: ${bad ? 'lentelė neįskaitoma – perfotografuoti arba įvesti ranka' : it.ai ? 'DI nerado gamintojo ir modelio – įvesti ranka' : 'nėra gamintojo ir modelio – nuskaityti nuotraukas (DI) arba įvesti ranka'}` });
    }
  }
  if (c.s.schema_yra === 'taip' && !c.photos.some(x => x.slot === 'schema')) out.push({ kind: 'sp', step: 'bendra', label: 'Nėra schemos nuotraukos' });
  for (const f of officeFields()) if (f.req && !c.val(f.k)) out.push({ kind: 'office', label: `${f.l} (${f.group})` });
  if (!operatorRow(c)[1]) out.push({ kind: 'office', label: 'ŠP operatorius: priskirkite šilumininką (su užpildyta paskyra) arba įrašykite operatorių biuro laukuose' });
  return out;
}

function operatorRow(c) {
  const o = c.op || {};
  const name = c.val('op_vardas') || o.engineer_name || '';
  const dok = c.val('op_dok') || [o.hp_dok_nr, o.hp_dok_isdave, o.hp_dok_iki ? 'galioja iki ' + o.hp_dok_iki : ''].filter(has).join(', ');
  const tel = c.val('op_tel') || o.engineer_phone || '';
  return ['Šilumos punkto operatorius (šilumininkas)', name, dok, tel];
}

// ---------------------------------------------------------------------
// Dokumento blokai
// ---------------------------------------------------------------------
/**
 * Grąžina { title, header, fileName, blocks, gaps }.
 * images – schemos nuotraukos [{ dataUrl, bytes, width, height }].
 */
export function buildAprasas(input, images = []) {
  const c = input.val ? input : makeCtx(input);
  const { s, set, hp } = c;
  const gaps = [];
  const B = [];
  const V = (v, label) => { if (has(v)) return String(v); gaps.push(label); return ND; };      // tekstinė reikšmė arba „duomenų nėra“
  const D = (v, label) => { if (has(v)) return String(v); gaps.push(label); return '–'; };     // lentelių langeliams
  const O = (k, label, unit) => { const v = c.val(k); return has(v) ? v + (unit ? ' ' + unit : '') : V('', label); };
  const h1 = t => B.push({ t: 'h1', text: t });
  const h2 = t => B.push({ t: 'h2', text: t });
  const p = (text, o = {}) => B.push({ t: 'p', text, ...o });
  const kv = rows => B.push({ t: 'kv', rows });
  const table = (w, head, rows, o = {}) => B.push({ t: 'table', w, head, rows, ...o });

  const address = hp.address + (hp.seq > 1 ? ` (šilumos punktas Nr. ${hp.seq})` : '');
  const date = dateIso(c.val('apraso_data')) || todayIso();
  const rengejas = V(set.rengejas, 'Rengėjo pavadinimas');
  const autorius = String(set.apraso_autorius || '').trim();
  const aw = autorius.split(/\s+/);
  const autVardas = aw.length > 2 ? aw.slice(-2).join(' ') : autorius;
  const autPareigos = aw.length > 2 ? aw.slice(0, -2).join(' ') : '';

  // ---- titulinis ----
  B.push({ t: 'approve', lines: ['TVIRTINU', V(set.tvirtina_pareigos, 'Tvirtinančio asmens pareigos'), V(set.tvirtina_vardas, 'Tvirtinančio asmens vardas'), 'Parašas ______________', 'Data: ____________'] });
  B.push({ t: 'space', h: 60 });
  B.push({ t: 'center', text: rengejas, caption: '(rengėjo pavadinimas)' });
  B.push({ t: 'center', text: V(set.rengejas_kodas, 'Rengėjo kodas'), caption: '(rengėjo kodas)' });
  B.push({ t: 'space', h: 40 });
  B.push({ t: 'title', text: 'PASTATO ŠILDYMO IR KARŠTO VANDENS SISTEMOS APRAŠAS' });
  p('Parengta pagal Pastato šildymo ir karšto vandens sistemos priežiūros tvarkos aprašo, patvirtinto Lietuvos Respublikos energetikos ministro 2009 m. lapkričio 26 d. įsakymu Nr. 1-229, 13 punktą', { align: 'center' });
  B.push({ t: 'space', h: 30 });
  B.push({ t: 'center', text: address, caption: '(objekto adresas)', bold: true });
  B.push({ t: 'center', text: date, caption: '(sudarymo data)' });
  B.push({ t: 'center', text: set.sudarymo_vieta || hp.city || '', caption: '(sudarymo vieta)' });
  B.push({ t: 'break' });

  // ---- 1 ----
  h1('1. Bendrieji duomenys');
  h2('1.1. Pastatas');
  kv([
    ['Adresas', address],
    ['Paskirtis', 'Gyvenamasis daugiabutis namas'],
    ['Unikalus numeris', O('unikalus_nr', 'Unikalus numeris')],
    ['Statybos metai', O('statybos_metai', 'Statybos metai')],
    ['Aukštų / butų skaičius', `${O('aukstai', 'Aukštų skaičius')} / ${O('butai', 'Butų skaičius')}`],
    ['Pastato aukštis, m', O('pastato_aukstis', 'Pastato aukštis')],
    ['Patalpų lubų aukštis (vyraujantis), m', O('lubu_aukstis', 'Lubų aukštis')],
    ['Bendras šildomų patalpų plotas, m²', O('sildomas_plotas', 'Šildomų patalpų plotas')],
    ['Pastato tūris, m³', O('turis', 'Pastato tūris')]
  ]);
  h2('1.2. Savininkai, valdytojas ir šilumos tiekėjas');
  kv([
    ['Pastato ir sistemos savininkas', 'Butų ir kitų patalpų savininkai (bendraturčiai)'],
    ['Šilumos punkto savininkas', V(set.sp_savininkas, 'Šilumos punkto savininkas')],
    ['Bendrojo naudojimo objektų valdytojas', O('valdytojas', 'Valdytojas')],
    ['Šilumos tiekėjas', V(set.silumos_tiekejas, 'Šilumos tiekėjas')],
    ['Nuosavybės ir priežiūros atsakomybės riba', V(set.atsakomybes_riba, 'Atsakomybės riba')]
  ]);
  h2('1.3. Sistemos prižiūrėtojas');
  kv([
    ['Pavadinimas, kodas', [set.rengejas, set.rengejas_kodas].filter(has).join(', ') || ND],
    ['Atestato vykdyti energetikos veiklą Nr.', has(set.atestato_nr) ? `${set.atestato_nr}${has(set.atestatas_galioja_iki) ? ', galioja iki ' + set.atestatas_galioja_iki : ''}` : V('', 'Atestato Nr.')],
    ['Buveinė', V(set.buveine, 'Buveinė')],
    ['Telefonas, el. paštas', [set.tel, set.el_pastas].filter(has).join(', ') || V('', 'Telefonas, el. paštas')],
    ['Avarinė tarnyba (visą parą)', V(set.avarine_tel, 'Avarinė tarnyba')]
  ]);
  const ats = set.atsakingas || {};
  const op = operatorRow(c);
  table([0.26, 0.2, 0.36, 0.18], ['Pareigos', 'Vardas, pavardė', 'Kvalifikaciją įrodantis dokumentas (Nr., kas išdavė, galioja iki)', 'Telefonas'], [
    [ats.pareigos || 'Atsakingas už šilumos ūkį', V(ats.vardas, 'Atsakingo už šilumos ūkį vardas'), V(ats.dok, 'Atsakingo už šilumos ūkį kvalifikacijos dokumentas'), V(ats.tel, 'Atsakingo už šilumos ūkį telefonas')],
    [op[0], V(op[1], 'ŠP operatoriaus vardas'), V(op[2], 'ŠP operatoriaus kvalifikacijos dokumentas'), V(op[3], 'ŠP operatoriaus telefonas')]
  ]);
  h2('1.4. Sistemos montuotojas ir dokumentų rengėjas');
  kv([
    ['Sistemą (šilumos punktą) sumontavusi įmonė', O('montuotojas', 'ŠP sumontavusi įmonė')],
    ['Projektuotojas', O('projektuotojas', 'Projektuotojas')],
    ['Aprašo, veikimo ir priežiūros instrukcijų rengėjas', [set.rengejas, set.buveine].filter(has).join(', ') || ND],
    ['Aprašą parengė', V(autorius, 'Aprašą parengė')]
  ]);

  // ---- 2 ----
  h1('2. Bendras sistemos aprašymas');
  h2('2.1. Sistemos paskirtis');
  p('Šildymo sistema skirta šilumą perduoti į šildomas patalpas ir palaikyti jose higienos normų nustatytą temperatūrą šildymo sezono metu.');
  p('Karšto vandens sistema skirta šaltą geriamąjį vandenį pašildyti iki higienos normų nustatytos temperatūros ir tiekti jį į vandens ėmimo vietas.');
  h2('2.2. Pagrindiniai sistemos duomenys');
  const auto = s.sildymas === 'priklausoma' || s.sildymas === 'nepriklausoma' || (s.sildymas !== 'elevatorinis' && kvOn(s));
  const spTipas = s.sildymas === 'elevatorinis' ? (kvOn(s) ? 'Elevatorinis (karšto vandens ruošimas automatizuotas)' : 'Elevatorinis') : auto ? 'Automatizuotas' : '';
  const SILD = { nepriklausoma: 'Nepriklausoma (per šilumokaitį)', priklausoma: 'Priklausoma (be šilumokaičio, su pamaišymo siurbliu)', elevatorinis: 'Priklausoma (per elevatorių)', nera: 'Šildymas per šį šilumos punktą neprijungtas' };
  const KV = { lygiagreti: 'Lygiagreti (vienos pakopos)', dvi_pakopos: 'Dviejų pakopų', nera: 'Karštas vanduo šilumos punkte neruošiamas' };
  const yn = (v, yes = 'Yra', no = 'Nėra') => v === 'taip' ? yes : v === 'ne' ? no : '';
  const gyv = { kv: 'su vonių šildytuvais', sildymas: 'vonių šildytuvai prijungti prie šildymo sistemos', nera: 'be vonių šildytuvų' }[s.voniu_sildytuvai] || '';
  const bal = (v, k) => v === 'taip' ? ['Yra', c.val(k)].filter(has).join(', ') : v === 'ne' ? 'Nėra' : '';
  kv([
    ['Šilumos šaltinis', 'Centralizuoti šilumos tinklai'],
    ['Šilumos punkto tipas ir vieta', [V(spTipas, 'Šilumos punkto tipas'), V(s.sp_vieta, 'Šilumos punkto vieta')].join(', ')],
    ['Prijungimo schema šildymui', V(SILD[s.sildymas], 'Prijungimo schema šildymui')],
    ['Prijungimo schema karštam vandeniui', V(KV[s.kv], 'Prijungimo schema karštam vandeniui')],
    ...(heatOn(s) ? [
      ['Šildymo sistemos tipas', V({ vienvamzde: 'Vienvamzdė', dvivamzde: 'Dvivamzdė', kolektorine: 'Kolektorinė' }[s.sildymo_tipas], 'Šildymo sistemos tipas')],
      ['Šilumnešio paskirstymas', V({ apatinis: 'Apatinis', virsutinis: 'Viršutinis' }[s.paskirstymas], 'Šilumnešio paskirstymas')],
      ['Šildymo sistemos šilumnešis', 'Vanduo']] : []),
    ...(kvOn(s) ? [['Karšto vandens sistemos tipas', [yn(s.kv_cirkuliacija, 'Su cirkuliacija', 'Be cirkuliacijos') || V('', 'KV cirkuliacija'), gyv].filter(has).join(', ')]] : []),
    ['Balansiniai ventiliai stovuose', V(bal(s.sv_balansiniai, 'balansiniai_sild'), 'Balansiniai ventiliai stovuose')],
    ['Termostatiniai ventiliai prie šildymo prietaisų', V({ taip: 'Yra', dalinai: 'Yra dalyje prietaisų', ne: 'Nėra' }[s.termostatiniai], 'Termostatiniai ventiliai')],
    ['Šilumos apskaita butuose', O('apskaita_butuose', 'Šilumos apskaita butuose')],
    ['Sistemos eksploatacijos pradžia', O('eksploatacijos_pradzia', 'Sistemos eksploatacijos pradžia')],
    ['Šilumos punkto priėmimo eksploatuoti data', O('sp_priemimo_data', 'ŠP priėmimo eksploatuoti data')],
    ['Paskutinė rekonstrukcija (modernizavimas)', O('rekonstrukcija', 'Paskutinė rekonstrukcija')]
  ]);

  h2('2.3. Šildymo sistema');
  const hx = c.items.find(i => !i.absent && i.grp === 'sildymas' && i.kind === 'silumokaitis');
  const hxWord = t => /vamzdin/i.test(String(t || '')) ? 'vamzdinį (greitaeigį)' : 'plokštelinį';
  if (s.sildymas === 'nepriklausoma') {
    p(`Šildymo sistema prie šilumos tinklų prijungta pagal nepriklausomą schemą per ${hxWord(hx && (hx.specs || {}).tipas)} šilumokaitį su cirkuliaciniu siurbliu.`);
    p('Į sistemą tiekiamo šilumnešio temperatūra reguliuojama automatiškai pagal lauko oro temperatūrą.');
  } else if (s.sildymas === 'priklausoma') {
    p('Šildymo sistema prie šilumos tinklų prijungta pagal priklausomą schemą (be šilumokaičio) su pamaišymo cirkuliaciniu siurbliu ir reguliavimo vožtuvu.');
    p('Į sistemą tiekiamo šilumnešio temperatūra reguliuojama automatiškai pagal lauko oro temperatūrą.');
  } else if (s.sildymas === 'elevatorinis') {
    p(`Šildymo sistema prie šilumos tinklų prijungta pagal priklausomą schemą per elevatorių${s.sild_siurblys === 'taip' ? ' su cirkuliaciniu siurbliu' : ''}.`);
    p('Į sistemą tiekiamo šilumnešio temperatūra automatiškai nereguliuojama – ji priklauso nuo šilumos tinklų temperatūrinio grafiko.');
  } else if (s.sildymas === 'nera') {
    p('Šildymo sistema per šį šilumos punktą neprijungta.');
  } else p(V('', 'Šildymo sistemos aprašymas'));
  if (heatOn(s)) {
    const mag = lc(s.magistraliu_vieta), st = lc(s.stovu_vieta);
    p(`Magistraliniai vamzdynai išvedžioti ${mag || V('', 'Magistralių vieta')}, stovai – ${st || V('', 'Stovų vieta')}. Stovams atjungti ir vandeniui išleisti įrengta uždaromoji armatūra su išleidimo ventiliais.`);
    const nuor = (s.nuorinimas || []).map(x => /automatin/i.test(x) ? 'automatinius nuorintojus' : 'viršutinio aukšto šildymo prietaisų nuorinimo čiaupus');
    p(`Oras iš sistemos šalinamas per ${nuor.join(' ir ') || V('', 'Oro šalinimo būdas')}.`);
  }

  h2('2.4. Karšto vandens sistema');
  if (kvOn(s)) {
    const kx = c.items.find(i => !i.absent && i.grp === 'kv' && i.kind === 'silumokaitis');
    const shape = /vamzdin/i.test(String(kx && (kx.specs || {}).tipas || '')) ? 'vamzdiniame (greitaeigiame)' : 'plokšteliniame';
    const sch = s.kv === 'dvi_pakopos' ? ' pagal dviejų pakopų schemą' : s.kv === 'lygiagreti' ? ' pagal lygiagrečią schemą' : '';
    p(`Karštas vanduo ruošiamas šilumos punkte ${shape} šilumokaityje${sch}; temperatūra reguliuojama automatiškai.`);
    if (s.kv_cirkuliacija === 'taip') p(`Sistema su cirkuliacija stovuose${s.voniu_sildytuvai === 'kv' ? ' ir vonių šildytuvais' : ''}; cirkuliaciją palaiko cirkuliacinis siurblys.`);
    else if (s.kv_cirkuliacija === 'ne') p('Sistema be cirkuliacijos.');
    p('Stovams atjungti ir vandeniui išleisti įrengta uždaromoji armatūra su išleidimo ventiliais.');
  } else if (s.kv === 'nera') p('Karštas vanduo šiame šilumos punkte neruošiamas.');
  else p(V('', 'Karšto vandens sistemos aprašymas'));

  h2('2.5. Teisės aktai, pagal kuriuos sistema suprojektuota ir sumontuota');
  const acts = c.val('teises_aktai');
  if (!c.val('projektas')) p('Sistemos (šilumos punkto) projektas neišlikęs, todėl nurodomi teisės aktai, kuriais vadovaujamasi eksploatuojant sistemą:');
  B.push({ t: 'list', items: acts ? acts.split('\n').map(x => x.trim()).filter(Boolean) : [
    'Šilumos tiekimo tinklų ir šilumos punktų įrengimo taisyklės.',
    'Pastatų karšto vandens sistemų įrengimo taisyklės.',
    'Įrenginių ir šilumos perdavimo tinklų šilumos izoliacijos įrengimo taisyklės.',
    'STR 2.09.02:2005 „Šildymas, vėdinimas ir oro kondicionavimas“.',
    'STR 2.09.04:2008 „Pastato šildymo sistemos galia. Šilumos poreikis šildymui“.',
    'HN 42:2009 „Gyvenamųjų ir visuomeninių pastatų patalpų mikroklimatas“.',
    'RSN 156-94 „Statybinė klimatologija“.'] });

  // ---- 3 ----
  h1('3. Sistemos veikimo schema');
  p('Principinė šilumos punkto ir sistemos schema pateikta 1 priede. Schemoje pažymėta:');
  B.push({ t: 'list', items: [
    'tiekimo ir grąžinimo vamzdynai su sunumeruota uždaromąja ir reguliavimo armatūra;',
    'šildymo, karšto vandens ir kitų šilumą vartojančių įrenginių išdėstymas;',
    'kontrolės, matavimo, saugos ir apskaitos prietaisai;',
    'šilumnešio tekėjimo kryptys;',
    'nuosavybės ir priežiūros atsakomybės riba.'] });
  p('Schemos žymenys turi sutapti su 4.3 skyriaus lentelės žymenimis ir su žymenimis ant įrenginių šilumos punkte. Pakeitus įrenginį, schema ir lentelė atnaujinamos.');

  // ---- 4 ----
  h1('4. Svarbiausi sistemos komponentai ir jų charakteristikos');
  h2('4.1. Projektiniai parametrai');
  const g0 = gaps.length;
  const q = (k, l) => D(c.val(k), l);
  table([0.52, 0.16, 0.32], ['Parametras', 'Mato vnt.', 'Reikšmė'], [
    { group: 'Šilumos poreikis' },
    ['Šildymui', 'kW', q('q_sild', 'Šilumos poreikis šildymui')],
    ['Karštam vandeniui', 'kW', q('q_kv', 'Šilumos poreikis karštam vandeniui')],
    ['Vėdinimui', 'kW', c.val('q_ved') || 'nėra'],
    ['Suminis', 'kW', q('q_sum', 'Suminis šilumos poreikis')],
    { group: 'Šilumnešio debitas' },
    ['Šildymo sistemoje', 'm³/h', q('g_sild', 'Debitas šildymo sistemoje')],
    ['Karšto vandens sistemoje', 'm³/h', q('g_kv', 'Debitas karšto vandens sistemoje')],
    ['Suminis iš šilumos tinklų', 'm³/h', q('g_sum', 'Suminis debitas')],
    { group: 'Temperatūros' },
    ['Šildymo sistemos temperatūrinis grafikas', '°C', q('grafikas', 'Temperatūrinis grafikas')],
    ['Karšto vandens temperatūra', '°C', q('t_kv', 'Karšto vandens temperatūra (projektinė)')],
    ['Projektinė lauko oro temperatūra', '°C', q('t_lauko', 'Projektinė lauko oro temperatūra')],
    ['Projektinė gyvenamųjų patalpų temperatūra', '°C', q('t_patalpu', 'Projektinė gyvenamųjų patalpų temperatūra')],
    ['Projektinė bendrojo naudojimo patalpų temperatūra', '°C', q('t_bendr', 'Projektinė bendrojo naudojimo patalpų temperatūra')],
    ['Slėgio nuostoliai šildymo / karšto vandens sistemoje', 'kPa', `${q('dp_sild', 'Slėgio nuostoliai šildymo sistemoje')} / ${q('dp_kv', 'Slėgio nuostoliai KV sistemoje')}`]
  ], { center: [1, 2] });
  if (gaps.length > g0) p('„–“ – duomenų nėra (projektinė dokumentacija neišlikusi arba neperduota).', { small: true });

  h2('4.2. Parametrai prijungimo prie šilumos tinklų taške');
  const g1 = gaps.length;
  table([0.4, 0.12, 0.16, 0.16, 0.16], ['Parametras', 'Mato vnt.', 'Žiemą', 'Vasarą', 'Leistinas nuokrypis'],
    R42.map(([k, l, u]) => [l, u, D(c.val(`p42_${k}_z`), `${l} (žiemą)`), D(c.val(`p42_${k}_v`), `${l} (vasarą)`), D(c.val(`p42_${k}_n`), `${l} (nuokrypis)`)]), { center: [1, 2, 3, 4] });
  p(gaps.length > g1 ? 'Duomenys – iš šilumos tiekėjo techninių (prisijungimo) sąlygų. „–“ – duomenų nėra.' : 'Duomenys – iš šilumos tiekėjo techninių (prisijungimo) sąlygų.', { small: true });

  h2('4.3. Šilumos punkto įrenginiai');
  const rows43 = [];
  for (const grp of ['ivadas', 'sildymas', 'kv']) {
    const list = c.items.filter(i => i.grp === grp && !i.absent);
    if (!list.length) continue;
    rows43.push({ group: GROUP_LABEL[grp] });
    for (const it of list) {
      const k = KINDS[it.kind] || KINDS.kita;
      const type = typeText(it);
      rows43.push([
        it.tag || '–', itemLabel(it),
        type || (k.plate ? D('', `${itemLabel(it)} (${GROUP_LABEL[grp].toLowerCase()}): tipas, gamintojas`) : '–'),
        fixDn(specsText(it)) || '–',
        it.owner === 'Šilumos tiekėjas' ? (set.silumos_tiekejas || 'Šilumos tiekėjas') : (it.owner || 'Bendraturčiai')
      ]);
    }
  }
  table([0.1, 0.25, 0.21, 0.28, 0.16], ['Žymuo schemoje', 'Įrenginys', 'Tipas, gamintojas', 'Techniniai rodikliai', 'Savininkas'], rows43, { center: [0] });
  p('Rodikliai surašyti pagal įrenginių gamyklines lenteles.', { small: true });

  h2('4.4. Vamzdynai ir armatūra');
  const IZ = { gera: 'būklė gera', daline: 'izoliuota iš dalies', nera: 'izoliacijos nėra' };
  const izol = (tipas, bukle) => [tipas, IZ[bukle]].filter(has).join(', ');
  const kvc = fn => s.kv === 'nera' ? '–' : fn();
  table([0.3, 0.35, 0.35], ['Rodiklis', 'Šildymo sistema', 'Karšto vandens sistema'], [
    ['Vamzdžių medžiaga', cap(lc(s.sv_medziaga)) || D('', 'Šildymo vamzdžių medžiaga'), kvc(() => cap(lc(s.kv_medziaga)) || D('', 'KV vamzdžių medžiaga'))],
    ['Skersmenys (magistralės – stovai)', has(s.sv_skersmenys) ? fixDn(s.sv_skersmenys) : D('', 'Šildymo vamzdynų skersmenys'), kvc(() => has(s.kv_skersmenys) ? fixDn(s.kv_skersmenys) : D('', 'KV vamzdynų skersmenys'))],
    ['Jungimo būdas', joinBy(s.sv_medziaga) || D('', 'Šildymo vamzdynų jungimo būdas'), kvc(() => joinBy(s.kv_medziaga) || D('', 'KV vamzdynų jungimo būdas'))],
    ['Šilumos izoliacija', cap(izol(s.sv_izoliacija_tipas, s.sv_izoliacija_bukle)) || D('', 'Šildymo vamzdynų izoliacija'), kvc(() => cap(izol(s.kv_izoliacija_tipas, s.kv_izoliacija_bukle)) || D('', 'KV vamzdynų izoliacija'))],
    ['Uždaromoji armatūra', cap(lc(s.sv_armatura)) || D('', 'Šildymo uždaromoji armatūra'), kvc(() => cap(lc(s.kv_armatura)) || D('', 'KV uždaromoji armatūra'))],
    ['Stovų skaičius', has(s.sv_stovu_sk) ? `${s.sv_stovu_sk} vnt.` : D('', 'Šildymo stovų skaičius'),
      kvc(() => has(s.kv_stovu_tiek) || has(s.kv_stovu_cirk) ? `${has(s.kv_stovu_tiek) ? s.kv_stovu_tiek : '–'} tiekimo / ${has(s.kv_stovu_cirk) ? s.kv_stovu_cirk : '–'} cirkuliacijos` : D('', 'KV stovų skaičius'))],
    ['Balansiniai (termobalansiniai) ventiliai', bal(s.sv_balansiniai, 'balansiniai_sild') || D('', 'Šildymo balansiniai ventiliai'), kvc(() => bal(s.kv_balansiniai, 'balansiniai_kv') || D('', 'KV termobalansiniai ventiliai'))]
  ]);

  h2('4.5. Šildymo prietaisai');
  const VS = { kv: 'Prijungti prie karšto vandens sistemos', sildymas: 'Prijungti prie šildymo sistemos', nera: 'Nėra' };
  const bendr = (s.prietaisai_bendr || []).filter(x => x !== 'Nėra');
  table([0.32, 0.38, 0.14, 0.16], ['Prietaisas', 'Tipas', 'Kiekis, vnt.', 'Galia / pastabos'], [
    ['Šildymo prietaisai butuose', cap(lc(s.prietaisai_butuose)) || D('', 'Šildymo prietaisai butuose'), c.val('prietaisu_butuose') || '–', '–'],
    ['Šildymo prietaisai bendrojo naudojimo patalpose', bendr.length ? cap(lc(bendr)) : (s.prietaisai_bendr || []).includes('Nėra') ? 'Nėra' : D('', 'Šildymo prietaisai bendrose patalpose'), has(s.prietaisai_bendr_kiekis) ? String(s.prietaisai_bendr_kiekis) : '–', '–'],
    ['Vonių šildytuvai (gyvatukai)', VS[s.voniu_sildytuvai] || D('', 'Vonių šildytuvai'), c.val('voniu_sildytuvu') || '–', '–']
  ], { center: [2, 3] });

  h2('4.6. Paslėptų vamzdynų vietos');
  p(set.pasleptu_tekstas || DEFAULT_TEXTS.pasleptu_tekstas);

  h2('4.7. Bendrai naudojamos sistemos dalys');
  p('Bendroji dalinė nuosavybė: šilumos punkto įrenginiai, magistraliniai vamzdynai, stovai, uždaromoji ir balansinė armatūra, bendrojo naudojimo patalpų šildymo prietaisai.');
  p('Butų ir kitų patalpų savininkų asmeninė nuosavybė: šildymo prietaisai butuose, atšakos nuo stovų iki prietaisų.');

  h2('4.8. Vamzdynų žymėjimas');
  table([0.5, 0.5], ['Vamzdynas', 'Žymėjimo spalva'], [
    { group: 'Termofikacinis vanduo' }, ['Tiekiamas', 'Žalia–geltona'], ['Grąžinamas', 'Žalia–ruda–žalia'],
    { group: 'Geriamasis vanduo' }, ['Šaltas vanduo', 'Mėlyna'],
    { group: 'Karštas vanduo' }, ['Tiekiamas vartotojams', 'Mėlyna–oranžinė–mėlyna'], ['Cirkuliacinė linija', 'Mėlyna–balta–mėlyna']
  ]);

  // ---- 5 ----
  h1('5. Pripažinimo tinkama naudoti ir projekto duomenys');
  kv([
    ['Projekto pavadinimas, Nr., metai', O('projektas', 'Projekto pavadinimas, Nr., metai')],
    ['Projektuotojas', O('projektuotojas', 'Projektuotojas')],
    ['Šilumos tiekėjo techninės (prisijungimo) sąlygos', O('tech_salygos', 'Techninės (prisijungimo) sąlygos')],
    ['Šilumos punkto priėmimo eksploatuoti aktas', O('priemimo_aktas', 'ŠP priėmimo eksploatuoti aktas')],
    ['Paskutinis hidraulinio bandymo aktas', O('hidraulinis_aktas', 'Hidraulinio bandymo aktas')],
    ['Paskutinis parengties šildymo sezonui aktas', O('parengties_aktas', 'Parengties šildymo sezonui aktas')],
    ['Projektinės ir techninės dokumentacijos saugojimo vieta', O('dok_vieta', 'Dokumentacijos saugojimo vieta')]
  ]);

  // ---- 6 ----
  h1('6. Garantijos sąlygos');
  const gar = c.val('garantija');
  if (gar) gar.split('\n').map(x => x.trim()).filter(Boolean).forEach(x => p(x));
  else { gaps.push('Garantijos sąlygos'); p('Duomenų apie galiojančias garantijas nėra.'); }

  // ---- 7 ----
  h1('7. Saugios būklės ir veikimo režimų kriterijai bei ribos');
  const g7 = gaps.length;
  const rows7 = [];
  for (const r of R7) {
    if (!Array.isArray(r)) { if (!r.show || r.show(s)) rows7.push({ group: r.head }); continue; }
    const [k, l, u, show, pre, hasR] = r;
    if (show && !show(s)) continue;
    rows7.push([l, u, pre === 'dash' ? '–' : D(c.val(`r7_${k}_v`), `${l} (nustatyta reikšmė)`), hasR ? D(c.val(`r7_${k}_r`), `${l} (leistinos ribos)`) : '–']);
  }
  table([0.44, 0.12, 0.22, 0.22], ['Parametras', 'Mato vnt.', 'Nustatyta (darbinė) reikšmė', 'Leistinos ribos'], rows7, { center: [1, 2, 3] });
  if (gaps.length > g7) p('„–“ – netaikoma arba duomenų nėra.', { small: true });
  p('Kita priežiūrai ir parametrams reguliuoti svarbi informacija:', { bold: true });
  const nuot = { taip: 'yra', ne: 'nėra' }[s.nuotolinis];
  B.push({ t: 'list', items: [
    `Parametrų tikrinimo dažnumas ir nuotolinis stebėjimas: ${O('tikrinimo_daznumas', 'Parametrų tikrinimo dažnumas')}; nuotolinis valdymas ${nuot || V('', 'Nuotolinis valdymas')}.`,
    'Veiksmai parametrams išėjus už leistinų ribų aprašyti sistemos veikimo instrukcijoje.',
    `Įrenginių gamintojų instrukcijos saugomos: ${O('instrukciju_vieta', 'Gamintojų instrukcijų saugojimo vieta')}.`,
    `Šilumos punkto raktus turi: ${O('raktai', 'Kas turi ŠP raktus')}.`] });

  // ---- 8 ----
  h1('8. Susiję dokumentai');
  B.push({ t: 'list', items: [
    `Sistemos veikimo instrukcija (Priežiūros tvarkos aprašo 14 punktas) – ${O('veikimo_instr', 'Sistemos veikimo instrukcija')}.`,
    `Sistemos priežiūros instrukcija (Priežiūros tvarkos aprašo 15 punktas) – ${O('prieziuros_instr', 'Sistemos priežiūros instrukcija')}.`,
    'Šilumos punkto priežiūros žurnalas – saugomas šilumos punkte.'] });

  // ---- 9 ----
  h1('9. Aprašo pakeitimų registras');
  table([0.18, 0.47, 0.35], ['Data', 'Pakeitimas (kas pakeista, priežastis)', 'Pakeitė (pareigos, vardas, pavardė, parašas)'], [['', '', ''], ['', '', ''], ['', '', '']], { tall: true });
  B.push({ t: 'space', h: 24 });
  B.push({ t: 'sign', label: 'Aprašą parengė:', position: autPareigos, name: autVardas });

  // ---- 1 priedas ----
  B.push({ t: 'break' });
  h1('1 priedas. Principinė sistemos veikimo schema');
  if (images.length) images.forEach((im, i) => B.push({ t: 'image', index: i }));
  else { gaps.push('Principinė schema (1 priedas)'); p('Schemos šilumos punkte nėra; principinė schema rengiama pagal sumontuotus įrenginius.'); }
  h2('Schemos žymenų paaiškinimas');
  const tagRows = c.items.filter(i => !i.absent).map(it => [it.tag || '–', itemLabel(it) + (it.grp === 'ivadas' ? '' : ` (${it.grp === 'kv' ? 'karštas vanduo' : 'šildymas'})`), [typeText(it), fixDn(specsText(it))].filter(has).join('; ') || '–']);
  table([0.14, 0.4, 0.46], ['Žymuo', 'Pavadinimas', 'Tipas, parametrai'], tagRows, { center: [0] });
  if (c.items.some(i => !i.absent && !i.tag)) gaps.push('Schemos žymenys (bus užpildyti perbraižius schemą)');

  const safe = address.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    title: `Pastato šildymo ir karšto vandens sistemos aprašas – ${address}`,
    header: `Pastato šildymo ir karšto vandens sistemos aprašas · ${address}`,
    fileName: `SP aprasas - ${safe}`,
    blocks: B, gaps
  };
}
