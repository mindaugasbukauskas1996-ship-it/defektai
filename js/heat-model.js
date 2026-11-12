// =====================================================================
// Šilumos punktų (ŠP) aprašų modulio modelis: vedlio žingsniai, klausimai,
// įrenginių tipai, kurie įrenginiai tikėtini pagal ŠP tipą, ir pažangos
// (kiek dar trūksta) skaičiavimas. Čia keičiama, ko klausiama šilumininko.
// =====================================================================

export const STEPS = [
  { id: 'tipas', label: 'ŠP tipas' },
  { id: 'bendra', label: 'Nuotraukos ir schema' },
  { id: 'ivadas', label: 'Įvadas ir apskaita', grp: true },
  { id: 'sildymas', label: 'Šildymas', grp: true },
  { id: 'kv', label: 'Karštas vanduo', grp: true },
  { id: 'rodmenys', label: 'Rodmenys (biuras)', office: true },   // šilumininkai nepildo; mato tik admin, į „trūksta“ neskaičiuojama
  { id: 'namas', label: 'Vamzdynai ir prietaisai' },
  { id: 'pabaiga', label: 'Pateikimas' },
  { id: 'aprasas', label: 'Aprašas (biuras)', office: true }       // DI skaitymas, biuro laukai, aprašo atsisiuntimas – tik admin
];

export const HP_STATUS = {
  nauja: 'Nepradėta', pradeta: 'Pradėta', pateikta: 'Pateikta', grazinta: 'Grąžinta taisyti', parengta: 'Aprašas parengtas'
};

const YN = [['taip', 'Taip'], ['ne', 'Ne']];
const kvOn = s => ['lygiagreti', 'dvi_pakopos', 'kita'].includes(s.kv);
const autoSp = s => s.sildymas === 'priklausoma' || s.sildymas === 'nepriklausoma' || kvOn(s);

// Klausimo tipai: one – vienas pasirinkimas, many – keli, text, num, area (ilgas tekstas)
export const QUESTIONS = {
  tipas: [
    { key: 'sp_vieta', label: 'Kur yra šilumos punktas?', type: 'text', req: true, ph: 'pvz. rūsys, 2 laiptinė' },
    { key: 'sildymas', label: 'Koks šildymas šiame šilumos punkte?', type: 'one', req: true,
      hint: 'Jei jau pažymėta – taip nurodyta registre. Pakeiskite, jei vietoje yra kitaip.', options: [
      ['elevatorinis', 'Elevatorinis (be automatikos)'],
      ['priklausoma', 'Automatinis, šildymui šilumokaičio NĖRA'],
      ['nepriklausoma', 'Automatinis, šildymui YRA šilumokaitis'],
      ] },
    { key: 'sild_siurblys', label: 'Ar šildymo kontūre yra cirkuliacinis siurblys?', type: 'one', req: true, options: YN, show: s => s.sildymas === 'elevatorinis' },
    { key: 'kv', label: 'Kaip ruošiamas karštas vanduo?', type: 'one', req: true, options: [
      ['lygiagreti', 'Vienas karšto vandens šilumokaitis'],
      ['dvi_pakopos', 'Dviejų pakopų'],
      ['kita', 'Nežinau / kitaip'],
      ['nera', 'Karštas vanduo čia neruošiamas']] },
    { key: 'kv_cirkuliacija', label: 'Ar karšto vandens sistema su cirkuliacija?', type: 'one', req: true, options: YN, show: kvOn },
    { key: 'nuotolinis', label: 'Ar yra nuotolinis valdymas / stebėjimas?', type: 'one', options: [...YN, ['nezinau', 'Nežinau']], show: (s, o = {}) => !o.nuotolinis },   // jau žinoma – neklausiama
    { key: 'keli_sp', label: 'Ar šiame name yra daugiau nei vienas šilumos punktas?', type: 'one', options: YN,
      hint: 'Jei taip – praneškite biurui, kad sistemoje pridėtų antrą ŠP.' }
  ],
  bendra: [
    { key: 'schema_yra', label: 'Ar ŠP ant sienos kabo schema?', type: 'one', req: true, options: YN }
  ],
  rodmenys: [
    { key: 'lauko_temp', label: 'Lauko oro temperatūra matavimo metu', type: 'num', unit: '°C' },
    { head: 'Įvadas (šilumos tinklai)' },
    { key: 'r_slegis_tiek', label: 'Slėgis tiekimo linijoje', type: 'num', unit: 'bar', req: true, show: (s, o = {}) => !o.p42_p_tiek_z },   // jei slėgis žinomas (4.2 skyrius) – nebevedamas
    { key: 'r_slegis_graz', label: 'Slėgis grąžinimo linijoje', type: 'num', unit: 'bar', req: true, show: (s, o = {}) => !o.p42_p_graz_z },
    { key: 'r_temp_tiek', label: 'Tiekiamo šilumnešio temperatūra', type: 'num', unit: '°C', req: true },
    { key: 'r_temp_graz', label: 'Grąžinamo į tinklus šilumnešio temperatūra', type: 'num', unit: '°C', req: true }
  ],
  namas: [
    { head: 'Šildymo sistema name' },
    { key: 'sildymo_tipas', office: true, label: 'Šildymo sistemos tipas', type: 'one', options: [['vienvamzde', 'Vienvamzdė'], ['dvivamzde', 'Dvivamzdė'], ['kolektorine', 'Kolektorinė'], ['nezinau', 'Nežinau']] },
    { key: 'paskirstymas', office: true, label: 'Šilumnešio paskirstymas', type: 'one', options: [['apatinis', 'Apatinis'], ['virsutinis', 'Viršutinis'], ['nezinau', 'Nežinau']] },
    { key: 'magistraliu_vieta', label: 'Kur išvedžiotos magistralės?', type: 'many', options: ['Rūsyje', 'Palėpėje', 'Techniniame koridoriuje'] },
    { key: 'stovu_vieta', label: 'Kur yra stovai?', type: 'many', options: ['Butuose', 'Laiptinėse', 'Šachtose'] },
    { key: 'nuorinimas', office: true, label: 'Kaip šalinamas oras?', type: 'many', options: ['Nuorinimo čiaupai viršutinio aukšto prietaisuose', 'Automatiniai nuorintojai'] },
    { head: 'Šildymo vamzdynai' },
    { key: 'sv_medziaga', label: 'Vamzdžių medžiaga', type: 'many', req: true, options: ['Plienas', 'Cinkuotas plienas', 'Plastikas', 'Daugiasluoksniai'] },
    { key: 'sv_skersmenys', office: true, label: 'Skersmenys (magistralės – stovai)', type: 'text', ph: 'pvz. DN80 – DN15' },
    { key: 'sv_jungimas', label: 'Jungimo būdas', type: 'many', options: ['Suvirinti', 'Presuoti', 'Srieginiai'] },
    { key: 'sv_izoliacija_tipas', office: true, label: 'Šilumos izoliacija (tipas, storis)', type: 'text', ph: 'pvz. akmens vatos kevalai 30 mm' },
    { key: 'sv_izoliacija_bukle', label: 'Izoliacijos būklė', type: 'one', req: true, options: [['gera', 'Gera'], ['daline', 'Dalinė'], ['nera', 'Nėra']] },
    { key: 'sv_armatura', label: 'Uždaromoji armatūra', type: 'many', req: true, options: ['Rutuliniai ventiliai', 'Sklendės', 'Kūginiai ventiliai'] },
    { key: 'sv_stovu_sk', office: true, label: 'Stovų skaičius', type: 'num', unit: 'vnt.' },
    { key: 'sv_balansiniai', label: 'Balansiniai ventiliai stovuose', type: 'one', options: [...YN, ['nezinau', 'Nežinau']] },
    { head: 'Karšto vandens vamzdynai', show: s => s.kv !== 'nera' },
    { key: 'kv_medziaga', label: 'Vamzdžių medžiaga', type: 'many', req: true, options: ['Cinkuotas plienas', 'Nerūdijantis plienas', 'PPR', 'Plastikas', 'Daugiasluoksniai'], show: s => s.kv !== 'nera' },
    { key: 'kv_skersmenys', office: true, label: 'Skersmenys (magistralės – stovai)', type: 'text', ph: 'pvz. DN50 – DN15', show: s => s.kv !== 'nera' },
    { key: 'kv_jungimas', label: 'Jungimo būdas', type: 'many', options: ['Suvirinti', 'Lituoti', 'Presuoti', 'Srieginiai'], show: s => s.kv !== 'nera' },
    { key: 'kv_izoliacija_tipas', office: true, label: 'Šilumos izoliacija (tipas, storis)', type: 'text', show: s => s.kv !== 'nera' },
    { key: 'kv_izoliacija_bukle', label: 'Izoliacijos būklė', type: 'one', options: [['gera', 'Gera'], ['daline', 'Dalinė'], ['nera', 'Nėra']], show: s => s.kv !== 'nera' },
    { key: 'kv_armatura', label: 'Uždaromoji armatūra', type: 'many', options: ['Rutuliniai ventiliai', 'Sklendės', 'Kūginiai ventiliai'], show: s => s.kv !== 'nera' },
    { key: 'kv_stovu_tiek', office: true, label: 'Tiekimo stovų skaičius', type: 'num', unit: 'vnt.', show: s => s.kv !== 'nera' },
    { key: 'kv_stovu_cirk', office: true, label: 'Cirkuliacijos stovų skaičius', type: 'num', unit: 'vnt.', show: s => s.kv !== 'nera' && s.kv_cirkuliacija !== 'ne' },
    { key: 'kv_balansiniai', label: 'Termobalansiniai ventiliai cirkuliacijos stovuose', type: 'one', options: [...YN, ['nezinau', 'Nežinau']], show: s => s.kv !== 'nera' },
    { head: 'Šildymo prietaisai' },
    { key: 'prietaisai_butuose', label: 'Šildymo prietaisai butuose', type: 'many', req: true, options: ['Ketiniai radiatoriai', 'Plieniniai radiatoriai', 'Aliumininiai radiatoriai', 'Konvektoriai'] },
    { key: 'prietaisai_bendr', label: 'Šildymo prietaisai laiptinėse ir kitose bendrose patalpose', type: 'many', options: ['Ketiniai radiatoriai', 'Plieniniai radiatoriai', 'Konvektoriai', 'Registrai (vamzdiniai)', 'Nėra'] },
    { key: 'prietaisai_bendr_kiekis', label: 'Prietaisų bendrose patalpose kiekis', type: 'num', unit: 'vnt.' },
    { key: 'voniu_sildytuvai', label: 'Vonių šildytuvai (gyvatukai)', type: 'one', req: true, options: [['kv', 'Prijungti prie karšto vandens'], ['sildymas', 'Prijungti prie šildymo'], ['nera', 'Nėra'], ['nezinau', 'Nežinau']] },
    { key: 'termostatiniai', label: 'Termostatiniai ventiliai prie šildymo prietaisų', type: 'one', options: [['taip', 'Yra'], ['dalinai', 'Dalinai'], ['ne', 'Nėra'], ['nezinau', 'Nežinau']] }
  ],
  pabaiga: [
    { key: 'montuotojas', label: 'ŠP sumontavusi įmonė (jei yra lipdukas ar lentelė)', type: 'text', ph: 'pavadinimas, miestas' },
    { key: 'pastabos', label: 'Pastabos biurui', type: 'area', ph: 'Kas neaišku, ko nepavyko rasti ar nufotografuoti' }
  ]
};

// Nuotraukų vietos, nesusietos su konkrečiu įrenginiu
export const SLOTS = {
  bendra: [
    { slot: 'overview', title: 'Bendros ŠP nuotraukos', min: 2, hint: 'Nufotografuokite visą šilumos punktą iš kelių kampų (geriausia 4), kad matytųsi visi įrenginiai ir vamzdynai.' },
    { slot: 'schema', title: 'Schemos nuotrauka', min: 1, show: s => s.schema_yra === 'taip', hint: 'Fotografuokite tiesiai iš priekio, visa schema kadre, be blizgesio. Jei schema didelė – padarykite ir kelias nuotraukas iš arčiau.' }
  ],
  rodmenys: [
    { slot: 'readings', title: 'Valdiklio ekrano ir prietaisų rodmenų nuotraukos', min: 0, hint: 'Valdiklio nustatymai (šildymo kreivė, temperatūros), manometrai, termometrai.' }
  ],
  namas: [
    { slot: 'house', title: 'Vamzdynų ir stovų nuotraukos', min: 0, hint: 'Magistralės rūsyje, izoliacija, balansiniai ventiliai, radiatoriai laiptinėje.' }
  ],
  pabaiga: [
    { slot: 'docs', title: 'Dokumentai šilumos punkte', min: 0, hint: 'Priežiūros žurnalas, ant sienos kabantys aktai, instrukcijos, montuotojo lentelė ar lipdukas.' }
  ]
};

export const GROUP_LABEL = { ivadas: 'Įvadas ir apskaita', sildymas: 'Šildymo kontūras', kv: 'Karšto vandens kontūras' };

const SK = [['dn', 'Skersmuo', 'DN'], ['qnom', 'Nominalus debitas Qnom', 'm³/h'], ['gam_nr', 'Gamyklinis Nr.'], ['patikra', 'Patikros data']];

// Įrenginių tipai. plate: true – privaloma gamyklinės lentelės nuotrauka; kitiems pakanka bendros nuotraukos.
// fields: [raktas, pavadinimas, vienetas, pasirinkimai?]
export const KINDS = {
  agregatas: { label: 'Šilumos punkto agregatas (bendra gamyklinė lentelė)', plate: true,
    hint: 'Didelė lentelė ant ŠP rėmo: gamintojas, galia šildymui ir karštam vandeniui, gamyklinis Nr., pagaminimo data. Iš jos sužinoma daugiausia.',
    fields: [['galia_sildymui', 'Galia šildymui', 'kW'], ['galia_kv', 'Galia karštam vandeniui', 'kW'], ['max_temp', 'Maksimali temperatūra', '°C'], ['max_slegis', 'Maksimalus slėgis', 'bar'], ['gam_nr', 'Gamyklinis Nr.'], ['pagaminta', 'Pagaminimo data']] },
  silumos_skaitiklis: { label: 'Šilumos skaitiklis', plate: true, owner: 'Šilumos tiekėjas', fields: SK },
  slegio_reguliatorius: { label: 'Slėgio perkryčio (debito) reguliatorius', plate: true,
    fields: [['dn', 'Skersmuo', 'DN'], ['kvs', 'Kvs', 'm³/h'], ['diapazonas', 'Nustatymo diapazonas'], ['nustatyta', 'Nustatyta reikšmė']] },
  valdiklis: { label: 'Valdiklis (reguliatorius)', plate: true, hint: 'Nufotografuokite valdiklio priekį taip, kad matytųsi modelis.',
    fields: [['nuotolinis', 'Nuotolinis ryšys', '', ['Yra', 'Nėra']]] },
  lauko_jutiklis: { label: 'Lauko oro temperatūros jutiklis', plate: false, fields: [['tipas', 'Tipas'], ['vieta', 'Vieta (fasadas, pusė)']] },
  filtras: { label: 'Nuosėdų rinktuvas / filtras', plate: false, qty: true, fields: [['dn', 'Skersmuo', 'DN']] },
  elevatorius: { label: 'Elevatorius', plate: false, hint: 'Nufotografuokite elevatorių ir, jei yra, lentelę ar užrašą su numeriu.',
    fields: [['numeris', 'Elevatoriaus Nr.'], ['tuta', 'Tūtos (antgalio) skersmuo', 'mm'], ['dn', 'Skersmuo', 'DN']] },
  silumokaitis: { label: 'Šilumokaitis', plate: true,
    fields: [['ploksteles', 'Plokštelių skaičius', 'vnt.'], ['galia', 'Galia', 'kW'], ['pn', 'Slėgio klasė PN', 'bar'], ['tipas', 'Tipas', '', ['Plokštelinis lituotas', 'Plokštelinis surenkamas', 'Vamzdinis (greitaeigis)']], ['pakopos', 'Pakopų skaičius']] },
  siurblys: { label: 'Cirkuliacinis siurblys', plate: true,
    fields: [['q', 'Našumas Q', 'm³/h'], ['h', 'Slėgis H', 'm'], ['p', 'Galia P', 'W'], ['rezimas', 'Nustatytas režimas']] },
  reg_voztuvas: { label: 'Reguliavimo vožtuvas su pavara', plate: true, hint: 'Nufotografuokite ir vožtuvo, ir pavaros lenteles.',
    fields: [['dn', 'Skersmuo', 'DN'], ['kvs', 'Kvs', 'm³/h'], ['pavara', 'Pavaros modelis']] },
  ispletimo_indas: { label: 'Išsiplėtimo indas', plate: true, fields: [['turis', 'Tūris', 'l'], ['pn', 'Slėgio klasė PN', 'bar'], ['priesslegis', 'Priešslėgis', 'bar']] },
  apsauginis_voztuvas: { label: 'Apsauginis vožtuvas', plate: true, hint: 'Suveikimo slėgis būna užrašytas ant vožtuvo dangtelio.',
    fields: [['dn', 'Skersmuo', 'DN'], ['slegis', 'Suveikimo slėgis', 'bar']] },
  papildymas: { label: 'Papildymo linija (vožtuvas / siurblys, skaitiklis)', plate: false,
    fields: [['irenginys', 'Vožtuvas ar siurblys (modelis)'], ['skaitiklio_dn', 'Papildymo skaitiklio skersmuo', 'DN'], ['rodmuo', 'Skaitiklio rodmuo', 'm³']] },
  slegio_rele: { label: 'Slėgio relė', plate: true, fields: [['nustatymas', 'Nustatymas', 'bar']] },
  sv_skaitiklis: { label: 'Šalto vandens skaitiklis prieš šilumokaitį', plate: true, fields: SK },
  manometrai: { label: 'Manometrai', plate: false, qty: true, fields: [['skale', 'Skalė', 'bar'], ['patikra', 'Patikros žyma (metai)']] },
  termometrai: { label: 'Termometrai', plate: false, qty: true, fields: [['skale', 'Skalė', '°C']] },
  armatura: { label: 'Uždaromoji armatūra', plate: false, qty: true,
    fields: [['tipas', 'Tipas', '', ['Rutuliniai ventiliai', 'Sklendės', 'Kūginiai ventiliai']], ['dn', 'Skersmuo', 'DN'], ['numeriai', 'Numeriai pagal schemą']] },
  atbulinis: { label: 'Atbulinis vožtuvas', plate: false, qty: true, fields: [['dn', 'Skersmuo', 'DN']] },
  el_skydelis: { label: 'Elektros skydelis', plate: false, fields: [['automatas', 'Įvadinis automatas']] },
  kita: { label: 'Kitas įrenginys', plate: false, fields: [['rodikliai', 'Techniniai rodikliai']] }
};

/** Kurie įrenginiai tikėtini pagal klausimyno atsakymus (eilės tvarka = rodymo tvarka). */
export function expectedItems(s) {
  const out = [];
  const add = (grp, kind, label = null) => out.push({ grp, kind, label });
  if (!s.sildymas || !s.kv) return out;                    // tipas dar nepasirinktas
  add('ivadas', 'armatura', 'Įvadinės sklendės (atsakomybės riba)');
  if (autoSp(s)) add('ivadas', 'agregatas');
  add('ivadas', 'silumos_skaitiklis');
  add('ivadas', 'filtras');
  if (autoSp(s)) {
    add('ivadas', 'slegio_reguliatorius');
    add('ivadas', 'valdiklis');                           // lauko jutiklis neklausiamas – nustatomas pagal valdiklį
    add('ivadas', 'el_skydelis');
  }
  add('ivadas', 'manometrai');
  add('ivadas', 'termometrai');

  if (s.sildymas === 'elevatorinis') {
    add('sildymas', 'elevatorius');
    if (s.sild_siurblys === 'taip') add('sildymas', 'siurblys');
  } else if (s.sildymas === 'priklausoma') {
    add('sildymas', 'reg_voztuvas');
    add('sildymas', 'siurblys');
  } else if (s.sildymas === 'nepriklausoma') {
    add('sildymas', 'silumokaitis');
    add('sildymas', 'reg_voztuvas');
    add('sildymas', 'siurblys');
    add('sildymas', 'ispletimo_indas');
    add('sildymas', 'apsauginis_voztuvas');
    add('sildymas', 'papildymas');
    add('sildymas', 'slegio_rele');
  }
  if (s.sildymas !== 'nera') { add('sildymas', 'manometrai'); add('sildymas', 'termometrai'); }

  if (kvOn(s)) {
    add('kv', 'silumokaitis');
    add('kv', 'reg_voztuvas');
    if (s.kv_cirkuliacija === 'taip') add('kv', 'siurblys');
    add('kv', 'apsauginis_voztuvas');
    add('kv', 'sv_skaitiklis');
    add('kv', 'atbulinis');
    add('kv', 'manometrai');
    add('kv', 'termometrai');
  }
  return out;
}

export const itemLabel = it => {
  const base = (KINDS[it.kind] || KINDS.kita).label;
  if (it.kind === 'kita') return it.label || base;
  return it.label ? it.label : base;
};

export const itemFilled = it => !!(it.manufacturer || it.model || it.tag || it.note || it.qty || Object.values(it.specs || {}).some(v => v !== '' && v != null));

const answered = v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Ko dar trūksta. Grąžina { checks: [{ step, label, ok }], done, total, percent, missing }.
 * Skaičiuojami: privalomi klausimai, privalomos nuotraukos ir kiekvieno (ne „nėra“) įrenginio nuotrauka.
 */
export function computeProgress(hp, items, photos) {
  const s = hp.survey || {};
  const checks = [];
  for (const step of STEPS) {
    if (step.office) continue;
    for (const q of QUESTIONS[step.id] || []) {
      if (!q.key || !q.req || q.office || (q.show && !q.show(s))) continue;
      checks.push({ step: step.id, label: q.label, ok: answered(s[q.key]) });
    }
    for (const sl of SLOTS[step.id] || []) {
      if (!sl.min || (sl.show && !sl.show(s))) continue;
      const n = photos.filter(p => !p.item_id && p.slot === sl.slot).length;
      checks.push({ step: step.id, label: `${sl.title} (reikia bent ${sl.min}, yra ${n})`, ok: n >= sl.min });
    }
  }
  for (const it of items) {
    if (it.absent) continue;
    if (it.kind === 'valdiklis' && (hp.office || {}).valdiklis_modelis) continue;     // žinomas valdiklis – nei duomenų, nei nuotraukų nereikia
    const k = KINDS[it.kind] || KINDS.kita;
    const ph = photos.filter(p => p.item_id === it.id);
    const ok = k.plate ? ph.some(p => p.slot === 'plate') : ph.length > 0;
    checks.push({ step: it.grp, label: `${itemLabel(it)}: ${k.plate ? 'gamyklinės lentelės nuotrauka' : 'nuotrauka'}`, ok });
  }
  const total = checks.length, done = checks.filter(c => c.ok).length;
  return { checks, done, total, missing: total - done, percent: total ? Math.round(done * 100 / total) : 0 };
}
