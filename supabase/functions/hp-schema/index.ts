// Supabase Edge Function „hp-schema“ – šilumos punkto principinės schemos nuotraukos skaitymas:
// elementų sąrašas su žymenimis (žymenų lentelei). Vartotoją (ir aktyvumą) tikrina pati, diegti su verify_jwt = false.
// Reikia ANTHROPIC_API_KEY (neprivaloma ANTHROPIC_MODEL).

const MODEL_DEFAULT = 'claude-sonnet-5-5';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function projectApiKey(req: Request): string {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (first) return String(first);
  } catch (_) { /* ignore */ }
  return req.headers.get('apikey') || '';
}

async function getUser(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: projectApiKey(req) } });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;
  const pr = await fetch(`${url}/rest/v1/profiles?select=active&id=eq.${user.id}`, { headers: { Authorization: auth, apikey: projectApiKey(req) } });
  if (!pr.ok) return null;
  const rows = await pr.json();
  return rows && rows[0] && rows[0].active ? user : null;
}

const SYSTEM = `Tu esi daugiabučių namų šilumos punktų specialistas Lietuvoje. Gausi ant šilumos punkto sienos kabančios principinės schemos nuotrauką (ar kelias). Nuskaityk iš jos įrenginių sąrašą su schemoje nurodytais žymenimis.

Taisyklės:
- Rašyk TIK tai, kas aiškiai matoma schemoje. Nespėliok žymenų, kurių nesimato; jei elemento žymens nematyti – tag palik tuščią.
- Kiekvienam schemoje pažymėtam įrenginiui (ne vamzdžiams ir ne armatūros numeriams pavieniui) grąžink: tag (žymuo, pvz. "T1", "CS1", "ŠŠ", "KVŠ", "1"), name (pavadinimas lietuviškai, kaip schemoje ar paprastai), kind (viena iš leidžiamų reikšmių), grp: "ivadas" (įvadas ir apskaita), "sildymas" (šildymo kontūras) arba "kv" (karšto vandens kontūras).
- Uždaromąją armatūrą (sklendes, ventilius) sujunk į vieną įrašą kind "armatura" su visais numeriais viename tag (pvz. "1, 2, 3"), atskirai pagal kontūrą.
- Manometrus ir termometrus – po vieną įrašą kiekvienam kontūrui (kind "manometrai" / "termometrai"), tag – visi jų žymenys.
- readable: "gera" – schema įskaitoma; "dalinai" – dalis žymenų neįskaitoma; "neiskaitoma" – nieko patikimai nuskaityti negalima.
- comment – jei readable nėra "gera": vienas sakinys paprastais žodžiais šilumininkui, kaip perfotografuoti (visa schema kadre, iš priekio, be blizgesio, iš arčiau). Kitu atveju palik tuščią.
Rezultatą VISADA pateik per įrankį „pateikti_schema“.`;

function buildRequest(payload: any, model: string) {
  const kinds: string[] = (Array.isArray(payload.kinds) ? payload.kinds : []).map((k: unknown) => String(k).slice(0, 40)).slice(0, 40);
  if (!kinds.includes('kita')) kinds.push('kita');
  const tool = {
    name: 'pateikti_schema',
    description: 'Pateikia iš schemos nuotraukos nuskaitytus įrenginius ir žymenis.',
    strict: true,
    input_schema: {
      type: 'object', additionalProperties: false,
      properties: {
        readable: { type: 'string', enum: ['gera', 'dalinai', 'neiskaitoma'] },
        comment: { type: 'string', description: 'Ką perfotografuoti; jei nereikia – palik tuščią.' },
        elements: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              tag: { type: 'string', description: 'Žymuo schemoje; jei nematyti – palik tuščią.' },
              name: { type: 'string' },
              kind: { type: 'string', enum: kinds },
              grp: { type: 'string', enum: ['ivadas', 'sildymas', 'kv'] }
            },
            required: ['tag', 'name', 'kind', 'grp']
          }
        }
      },
      required: ['readable', 'comment', 'elements']
    }
  };
  let text = 'Leidžiamos įrenginių rūšys (kind): ' + kinds.join(', ') + '.\n';
  if (payload.sp_type) text += `Šilumos punktas: ${String(payload.sp_type).slice(0, 200)}\n`;
  const content: any[] = [{ type: 'text', text }];
  let n = 0;
  for (const p of (payload.photos || []).slice(0, 4)) {
    if (p && typeof p.url === 'string' && /^https:\/\//.test(p.url)) { content.push({ type: 'image', source: { type: 'url', url: p.url } }); n++; }
  }
  if (!n) throw new Error('Nėra schemos nuotraukų.');
  content.push({ type: 'text', text: 'Pateik rezultatą per įrankį „pateikti_schema“.' });
  return { tool, body: { model, max_tokens: 4000, system: SYSTEM, tools: [tool], tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, messages: [{ role: 'user', content }] } };
}

const DRAW_SYSTEM = `Tu esi šilumos punktų schemų braižytojas. Gausi ant šilumos punkto sienos kabančios principinės schemos nuotrauką. Nubraižyk ją NAUJAI kaip švarų vektorinį SVG vaizdą, kuo tiksliau pagal nuotrauką (elementų tvarka, jungtys, žymenys).

Reikalavimai:
- <svg> su viewBox="0 0 1400 900", baltas fonas (<rect width="1400" height="900" fill="#fff"/>), šriftas Arial, tekstas ne mažesnis kaip 13 px. Leidžiami elementai: svg, g, rect, circle, ellipse, line, polyline, polygon, path, text, tspan, defs, marker. Jokių script, style su url, foreignObject, image, href, on* atributų.
- Vamzdžiai: tiekimo – raudona (#c62828), grąžinimo – mėlyna (#1565c0), karšto vandens – oranžinė (#ef6c00), šalto vandens – tamsiai mėlyna, cirkuliacija – ruda; storis 3. Tekėjimo kryptis – rodyklėmis (marker).
- Įrenginiai: standartiniai supaprastinti simboliai (šilumokaitis – stačiakampis su įstriža, siurblys – apskritimas su trikampiu, vožtuvas – du trikampiai „peteliškė“, filtras – trikampis, skaitiklis – kvadratas, manometras – mažas apskritimas, termometras – siaura kolba) ir PRIE KIEKVIENO – jo žymuo iš schemos (T1, CS1 ir pan.). Uždaromoji armatūra – vožtuvo simbolis su numeriu.
- Žymenis rašyk TIK tokius, kokie matomi schemoje arba pateikti sąraše; jei žymens nematyti – nerašyk ir neišgalvok.
- Pažymėk nuosavybės ribą punktyrine linija ir užrašu, jei schemoje yra.
- Viršuje antraštė (pastato adresas) ir apačioje trumpa legenda (spalvų reikšmės).
- Jei nuotrauka neįskaitoma arba schemos neįmanoma atkurti – svg palik tuščią eilutę, o comment parašyk, ką perfotografuoti.
- comment: kai nuotrauka gera – tuščia; jei dalis neaiški – trumpai, kas gali būti netiksliai.
Rezultatą pateik per įrankį „pateikti_svg“.`;

function sanitizeSvg(s: string): string {
  let x = String(s || '').trim();
  const a = x.indexOf('<svg'), b = x.lastIndexOf('</svg>');
  if (a < 0 || b < 0) return '';
  x = x.slice(a, b + 6);
  x = x.replace(/<\s*(script|foreignObject|image|iframe|style)\b[\s\S]*?<\/\s*(script|foreignObject|image|iframe|style)\s*>/gi, '');
  x = x.replace(/<\s*(script|foreignObject|image|iframe|style)\b[^>]*\/?>/gi, '');
  x = x.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, '');
  return x.length > 120000 ? '' : x;
}

function buildDraw(payload: any, model: string) {
  const tool = {
    name: 'pateikti_svg',
    description: 'Pateikia nubraižytą schemą SVG formatu.',
    input_schema: { type: 'object', properties: { svg: { type: 'string' }, comment: { type: 'string' } }, required: ['svg', 'comment'] }
  };
  let text = '';
  if (payload.address) text += `Pastato adresas: ${String(payload.address).slice(0, 200)}\n`;
  if (payload.sp_type) text += `Šilumos punktas: ${String(payload.sp_type).slice(0, 200)}\n`;
  const items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 60);
  if (items.length) text += 'Žinomi įrenginiai ir jų žymenys (tikrink pagal nuotrauką):\n' + items.map((i: any) => `- ${String(i.tag || '(žymens nėra)').slice(0, 40)}: ${String(i.name || '').slice(0, 80)}`).join('\n') + '\n';
  if (payload.instruction) text += `\nPATAISYMAS iš ankstesnio bandymo (įvykdyk): ${String(payload.instruction).slice(0, 500)}\n`;
  const content: any[] = [{ type: 'text', text }];
  let n = 0;
  for (const p of (payload.photos || []).slice(0, 3)) {
    if (p && typeof p.url === 'string' && /^https:\/\//.test(p.url)) { content.push({ type: 'image', source: { type: 'url', url: p.url } }); n++; }
  }
  if (!n) throw new Error('Nėra schemos nuotraukų.');
  content.push({ type: 'text', text: 'Nubraižyk schemą SVG ir pateik per įrankį „pateikti_svg“.' });
  return { tool, body: { model, max_tokens: 24000, system: DRAW_SYSTEM, tools: [tool], tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, messages: [{ role: 'user', content }] } };
}

// „Skenavimas“: DI tik nurodo lapo kampus ir ranka rašytas vietas; vaizdą apdoroja naršyklė.
const SCAN_SYSTEM = `Gausi ant sienos kabančios šilumos punkto principinės schemos (spausdinto lapo) nuotrauką, darytą telefonu. Reikia paruošti jos „skenuotą“ kopiją, todėl nurodyk:
1) corners – spausdinto lapo (popieriaus) 4 kampus nuotraukoje, normalizuotomis koordinatėmis (x, y nuo 0 iki 1; x į dešinę, y žemyn), TIKSLIAI tokia tvarka pagal lapo TEKSTO skaitymo kryptį: kairysis viršutinis, dešinysis viršutinis, dešinysis apatinis, kairysis apatinis (taip, tarsi lapas būtų pasuktas taip, kad tekstas skaitytųsi įprastai; jei nuotrauka pasukta ar apversta – tvarka tai atitinkamai atspindi). Jei lapas užima visą kadrą – kampai (0,0),(1,0),(1,1),(0,1). Kampai turi apimti visą lapą, nieko neatkirpdami.
2) erase – stačiakampiai (x, y, w, h; normalizuoti nuo 0 iki 1 pagal PASUKTO IR IŠTIESINTO lapo plotą, t. y. lapo kairysis viršutinis kampas = (0,0)), kuriuos reikia išbalinti, nes juose yra RANKA rašytas ar pieštas turinys: parašai, rašiklio/flomasterio užrašai, pataisymai, apibrauktos vietos, datos ranka, antspaudai, lipdukai. BŪTINAI taip pat žymėk VISĄ patvirtinimo bloką (spausdintą ir ranka rašytą kartu): užrašus „Tvirtinu: …“, „darbų vykdytojas …“, „2012 m. …“, „Darbų valdytojas …“, vardus, pavardes, datas ir parašus po jais ar šalia – kaip vieną ar kelis stačiakampius su DIDELE atsarga (visi tokie užrašai ir parašai turi būti pilnai uždengti, įskaitant ten, kur parašas užeina ant teksto). Schemos pavadinimo viršuje, simbolių, žymenų ir schemos linijų NEŽYMĖK. Ranka rašytus stačiakampius daryk su atsarga, kad rankraštis būtų uždengtas visas. Jei nieko tokio nėra – tuščias sąrašas.
3) readable: "gera" / "dalinai" / "neiskaitoma"; comment – kai nėra "gera", vienas sakinys, kaip perfotografuoti; kitaip tuščia.
Rezultatą pateik per įrankį „pateikti_skena“.`;

function buildScan(payload: any, model: string) {
  const rect = { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] };
  const pt = { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] };
  const tool = {
    name: 'pateikti_skena',
    description: 'Pateikia lapo kampus ir ranka rašytų vietų stačiakampius.',
    strict: true,
    input_schema: {
      type: 'object', additionalProperties: false,
      properties: {
        readable: { type: 'string', enum: ['gera', 'dalinai', 'neiskaitoma'] },
        comment: { type: 'string' },
        corners: { type: 'array', items: pt },
        erase: { type: 'array', items: rect }
      },
      required: ['readable', 'comment', 'corners', 'erase']
    }
  };
  const content: any[] = [];
  let n = 0;
  for (const p of (payload.photos || []).slice(0, 1)) {
    if (p && typeof p.url === 'string' && /^https:\/\//.test(p.url)) { content.push({ type: 'image', source: { type: 'url', url: p.url } }); n++; }
  }
  if (!n) throw new Error('Nėra schemos nuotraukos.');
  content.push({ type: 'text', text: 'Pateik kampus ir ranka rašytas vietas per įrankį „pateikti_skena“.' });
  return { tool, body: { model, max_tokens: 4000, system: SCAN_SYSTEM, tools: [tool], tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, messages: [{ role: 'user', content }] } };
}

const num01 = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);

// ---------------------------------------------------------------------
// Schemos perbraižymas: „extract“ (nuotrauka → JSON) ir „verify“ (originalas + atvaizdas → pataisos).
// Braižo naršyklė (js/schema-render.js); DI tik skaito ir tikrina. Modelis: ANTHROPIC_MODEL_SCHEMA (numatytas stipresnis).
// ---------------------------------------------------------------------
const SCHEMA_MODEL_DEFAULT = 'claude-opus-5-5';
const SYMBOL_TYPES = ['valve', 'check_valve', 'strainer', 'pump', 'pressure_gauge', 'thermometer', 'temp_sleeve', 'temp_sensor', 'sr_sensor', 'motor_valve', 'regulator', 'drain_valve', 'safety_valve', 'flange', 'flowmeter', 'pipe_break', 'boundary_mark'];

const EXTRACT_SYSTEM = `Tu esi šilumos punktų principinių schemų skaitytojas. Gausi schemos (spausdinto brėžinio) vaizdą. Reikia ją „perskaityti“ į struktūrą, iš kurios programa nubraižys švarią kopiją. Schemos NEPIEŠK – tik aprašyk, ką matai.

KOORDINATĖS: visos normalizuotos 0–1000 abiem ašims pagal VISĄ vaizdą (x – į dešinę, y – žemyn; (0,0) – kairysis viršutinis kampas). Vaizdas jau ištiesintas. aspect = vaizdo aukštis / plotis.

KĄ APRAŠYTI:
- pipes (vamzdžiai): kiekvienas nepertraukiamas vamzdis kaip ortogonali laužtė p=[[x,y],…] (tik horizontalūs ir vertikalūs atkarpos), n = pavadinimas (T1, T2, T3, T4, V1, T11, T21…), jei yra. c=1 – valdymo kabeliai (ploni pilki punktyriniai).
- junctions: taškai, kur vamzdžiai sujungti (juoda dėmė). crossings: kur vamzdžiai kertasi BE sujungimo.
- boxes: šilumokaičiai (k="exchanger"), išsiplėtimo indai (k="vessel", t = užrašas), skaitikliai ir kitos dėžės (k="box", t = užrašo eilutės), punktyriniai rėmai su pavadinimu, pvz. „ĮVADAS SU APSKAITA“ (k="region", t=[pavadinimas]). x,y – kairysis viršutinis kampas, w,h – matmenys.
- symbols: įrenginiai ant vamzdžių, tipai TIK iš sąrašo: ${SYMBOL_TYPES.join(', ')}. x,y – simbolio centras ant vamzdžio. v=1, jei vamzdis vertikalus. s="u" jei prietaisas (manometras, termometras, drenažas, jutiklis) eina į viršų nuo vamzdžio, "d" – į apačią. dn – skersmuo (DN50, DN15…), kvs – Kvs reikšmė (pvz. "Kvs 8"), tx – užrašas (pvz. "10 bar"). r=-1 jei siurblio ar atbulinio vožtuvo kryptis į kairę.
- labels: juodi užrašai (pvz. „Iš šilumos tinklų T1“, „Į šildymo sistemą T11 Ø66×1,5“, matmenys), t=tekstas, z=šrifto dydis (11–22), a="s" (pradžia) / "m" (centras) / "e" (pabaiga). r=1 jei užrašas RAUDONAS (DN ir Ds žymenys prie vamzdžių).
- positions: dideli raudoni pozicijų numeriai (1, 2, 12.1, S2, 4.1…) – t=numeris, x,y – centras.
- title_block: spaudo duomenys (object, document, client, code, sheet), jei yra.

TAISYKLĖS:
- IGNORUOK antspaudus, parašus, ranka rašytus įrašus, datas, „Suderinta“ žymas.
- Nespėliok: jei simbolio ar užrašo neįskaitai – praleisk. Neišgalvok žymenų.
- Koordinates rašyk kuo tiksliau (±5 vienetų). Vienodame lygyje esančius horizontalius vamzdžius laikyk tame pačiame y.
- Kiekvieną simbolį deda ant vamzdžio linijos (jo x,y turi būti ant to vamzdžio).
Rezultatą pateik per įrankį „pateikti_modeli“.`;

const VERIFY_SYSTEM = `Tu tikrinai schemos perbraižymą. Gausi: (1) ORIGINALIĄ schemą, (2) programos nubraižytą jos kopiją ir (3) kopijos JSON aprašą su elementų id. Palygink ir pateik pataisas, kad kopija atitiktų originalą: trūkstami elementai (op="add"), nereikalingi (op="remove"), neteisingai išdėstyti ar netinkamo tipo (op="move"/"change" su patch).
Koordinatės tos pačios kaip JSON (normalizuotos 0–1000). kind: symbols | pipes | labels | positions | boxes | junctions | crossings. Elementų forma kaip JSON (symbols: type,x,y,dir ("h"/"v"),side ("up"/"down"),dn,kvs,text,d; labels: x,y,text,size,anchor ("start"/"middle"/"end"),color ("red"/"black"); positions: x,y,text; pipes: pts=[[x,y]…]; boxes: kind,x,y,w,h,text).
Taisyk tik tai, kas tikrai neatitinka (trūksta įrenginio, neteisinga DN / numerio reikšmė, pasislinkęs daugiau nei ~15 vienetų, trūksta vamzdžio). Smulkių skirtumų ignoruok. Ranka rašytų įrašų ir antspaudų nekopijuok. Jei kopija jau tinkama – grąžink tuščią corrections ir done=true.
Rezultatą pateik per įrankį „pateikti_pataisas“.`;

const imgBlock = (p: any) => {
  if (p && typeof p.url === 'string' && /^https:\/\//.test(p.url)) return { type: 'image', source: { type: 'url', url: p.url } };
  if (p && typeof p.data === 'string') {
    const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(p.data);
    if (m && m[2].length < 9_000_000) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  }
  return null;
};

async function callClaude(apiKey: string, body: unknown) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d;
    if ((r.status === 429 || r.status === 529) && attempt === 0) { await new Promise(res => setTimeout(res, 2500)); continue; }
    throw new Error(`Claude API klaida (${r.status}): ${(d && d.error && d.error.message) || r.statusText}`);
  }
  throw new Error('Claude API nepasiekiamas.');
}

const nz = (v: unknown, a = 0, b = 1000) => Math.min(b, Math.max(a, Number(v) || 0));
const pt = (q: any) => [nz(q && q[0]), nz(q && q[1])];

/** Trumpų raktų atsakymas → pilnas modelis (js/schema-render.js formatas). */
function expandModel(raw: any) {
  const a = (k: string) => (Array.isArray(raw && raw[k]) ? raw[k] : []).filter((x: any) => x && typeof x === 'object' || Array.isArray(x));
  let k = 0;
  const id = (c: string) => c + (++k);
  return {
    title: str(raw && raw.title, 200), aspect: nz(raw && raw.aspect, 0.4, 1.2) || 0.707,
    pipes: a('pipes').slice(0, 200).map((p: any) => ({ id: id('p'), name: str(p.n, 20), style: p.c ? 'control' : 'solid', pts: (Array.isArray(p.p) ? p.p : []).slice(0, 60).map(pt) })).filter((p: any) => p.pts.length >= 2),
    junctions: a('junctions').slice(0, 300).map((q: any) => ({ id: id('j'), x: nz(q[0] ?? q.x), y: nz(q[1] ?? q.y) })),
    crossings: a('crossings').slice(0, 100).map((q: any) => ({ id: id('c'), x: nz(q[0] ?? q.x), y: nz(q[1] ?? q.y) })),
    boxes: a('boxes').slice(0, 60).map((b: any) => ({ id: id('b'), kind: ['exchanger', 'box', 'vessel', 'region'].includes(b.k) ? b.k : 'box', x: nz(b.x), y: nz(b.y), w: nz(b.w), h: nz(b.h), text: (Array.isArray(b.t) ? b.t : b.t ? [b.t] : []).slice(0, 6).map((s: unknown) => str(s, 60)) })),
    symbols: a('symbols').slice(0, 400).filter((s: any) => SYMBOL_TYPES.includes(s.t)).map((s: any) => ({ id: id('s'), type: s.t, x: nz(s.x), y: nz(s.y), dir: s.v ? 'v' : 'h', side: s.s === 'd' ? 'down' : s.s === 'u' ? 'up' : undefined, dn: str(s.dn, 20), kvs: str(s.kvs, 20), text: str(s.tx, 20), d: s.r === -1 ? -1 : 1 })),
    labels: a('labels').slice(0, 400).map((l: any) => ({ id: id('l'), x: nz(l.x), y: nz(l.y), text: str(l.t, 120), size: nz(l.z || 15, 9, 40), anchor: l.a === 's' ? 'start' : l.a === 'e' ? 'end' : 'middle', color: l.r ? 'red' : 'black' })),
    positions: a('positions').slice(0, 120).map((p: any) => ({ id: id('n'), x: nz(p.x), y: nz(p.y), text: str(p.t, 12) })),
    title_block: raw && raw.title_block && typeof raw.title_block === 'object' ? { object: str(raw.title_block.object, 160), document: str(raw.title_block.document, 80), client: str(raw.title_block.client, 100), code: str(raw.title_block.code, 80), sheet: str(raw.title_block.sheet, 60) } : null
  };
}

function buildExtract(payload: any, model: string) {
  const tool = {
    name: 'pateikti_modeli', description: 'Pateikia perskaitytą schemą struktūruota forma.',
    input_schema: {
      type: 'object',
      properties: {
        readable: { type: 'string', enum: ['gera', 'dalinai', 'neiskaitoma'] }, comment: { type: 'string' },
        title: { type: 'string' }, aspect: { type: 'number' },
        pipes: { type: 'array', items: { type: 'object' } }, junctions: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        crossings: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, boxes: { type: 'array', items: { type: 'object' } },
        symbols: { type: 'array', items: { type: 'object' } }, labels: { type: 'array', items: { type: 'object' } },
        positions: { type: 'array', items: { type: 'object' } }, title_block: { type: 'object' }
      },
      required: ['readable', 'comment', 'aspect', 'pipes', 'symbols', 'labels', 'positions']
    }
  };
  const content: any[] = [];
  const im = imgBlock((payload.photos || [])[0]);
  if (!im) throw new Error('Nėra schemos nuotraukos.');
  let text = '';
  if (payload.aspect) text += `Vaizdo aukštis/plotis = ${Number(payload.aspect).toFixed(3)}.\n`;
  if (payload.sp_type) text += `Šilumos punktas: ${str(payload.sp_type, 200)}\n`;
  if (payload.address) text += `Pastatas: ${str(payload.address, 150)}\n`;
  content.push({ type: 'text', text: text || 'Schemos vaizdas:' }, im, { type: 'text', text: 'Perskaityk schemą ir pateik per įrankį „pateikti_modeli“.' });
  return { tool, body: { model, max_tokens: 16000, system: EXTRACT_SYSTEM, tools: [tool], tool_choice: { type: 'tool', name: 'pateikti_modeli' }, messages: [{ role: 'user', content }] } };
}

function buildVerify(payload: any, model: string) {
  const tool = {
    name: 'pateikti_pataisas', description: 'Pateikia pataisas perbraižytai schemai.',
    input_schema: {
      type: 'object',
      properties: {
        done: { type: 'boolean' }, comment: { type: 'string' },
        corrections: { type: 'array', items: { type: 'object', properties: {
          op: { type: 'string', enum: ['add', 'remove', 'move', 'change'] },
          kind: { type: 'string', enum: ['symbols', 'pipes', 'labels', 'positions', 'boxes', 'junctions', 'crossings'] },
          id: { type: 'string' }, item: { type: 'object' }, patch: { type: 'object' }
        }, required: ['op', 'kind'] } }
      },
      required: ['done', 'corrections']
    }
  };
  const orig = imgBlock((payload.photos || [])[0]), draw = imgBlock(payload.render);
  if (!orig || !draw) throw new Error('Trūksta originalo ar atvaizdo.');
  const content: any[] = [
    { type: 'text', text: 'ORIGINALAS:' }, orig, { type: 'text', text: 'PROGRAMOS NUBRAIŽYTA KOPIJA:' }, draw,
    { type: 'text', text: 'KOPIJOS JSON:\n' + JSON.stringify(payload.model || {}).slice(0, 60000) + '\n\nPateik pataisas per įrankį „pateikti_pataisas“.' }
  ];
  return { tool, body: { model, max_tokens: 8000, system: VERIFY_SYSTEM, tools: [tool], tool_choice: { type: 'tool', name: 'pateikti_pataisas' }, messages: [{ role: 'user', content }] } };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);
  const user = await getUser(req);
  if (!user) return json({ error: 'Neprisijungta arba paskyra neaktyvuota. Prisijunkite iš naujo.' }, 401);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Serveryje nenustatytas ANTHROPIC_API_KEY' }, 500);
  try {
    const { payload } = await req.json();
    if (payload && (payload.mode === 'extract' || payload.mode === 'verify')) {
      const model = Deno.env.get('ANTHROPIC_MODEL_SCHEMA') || SCHEMA_MODEL_DEFAULT;
      const d = payload.mode === 'extract' ? buildExtract(payload, model) : buildVerify(payload, model);
      const dd: any = await callClaude(apiKey, d.body);
      if (dd.stop_reason === 'refusal') throw new Error('DI atsisakė apdoroti šią nuotrauką.');
      const u = (dd.content || []).find((b: any) => b.type === 'tool_use' && b.name === d.tool.name);
      if (!u || !u.input) throw new Error('DI negrąžino atsakymo (' + (dd.stop_reason || 'nežinoma priežastis') + '). Bandykite dar kartą.');
      const raw: any = u.input;
      const usage = { ...(dd.usage || {}), model: dd.model || model };
      if (payload.mode === 'extract') {
        return json({ readable: ['gera', 'dalinai', 'neiskaitoma'].includes(raw.readable) ? raw.readable : 'dalinai', comment: str(raw.comment, 400), model: expandModel(raw), truncated: dd.stop_reason === 'max_tokens', usage });
      }
      const corr = (Array.isArray(raw.corrections) ? raw.corrections : []).slice(0, 60).filter((c: any) => c && ['add', 'remove', 'move', 'change'].includes(c.op));
      return json({ done: !!raw.done || !corr.length, comment: str(raw.comment, 400), corrections: corr, usage });
    }
    if (payload && payload.mode === 'scan') {
      const d = buildScan(payload, Deno.env.get('ANTHROPIC_MODEL') || MODEL_DEFAULT);
      const call = (b: unknown) => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(b) });
      let r = await call(d.body);
      let dd = await r.json().catch(() => ({}));
      if (r.status === 400) {
        const { strict: _s, ...plainTool } = d.tool as any;
        const { output_config: _o, ...plain } = d.body as any;
        r = await call({ ...plain, tools: [plainTool] });
        dd = await r.json().catch(() => ({}));
      }
      if (!r.ok) throw new Error(`Claude API klaida (${r.status}): ${(dd && dd.error && dd.error.message) || r.statusText}`);
      if (dd.stop_reason === 'refusal') throw new Error('DI atsisakė apdoroti šią nuotrauką.');
      const u = (dd.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'pateikti_skena');
      if (!u || !u.input) throw new Error('DI negrąžino atsakymo. Bandykite dar kartą.');
      const raw: any = u.input;
      const corners = (Array.isArray(raw.corners) ? raw.corners : []).slice(0, 4).map((p: any) => ({ x: num01(p && p.x), y: num01(p && p.y) }));
      const erase = (Array.isArray(raw.erase) ? raw.erase : []).slice(0, 60).map((e: any) => ({ x: num01(e && e.x), y: num01(e && e.y), w: num01(e && e.w), h: num01(e && e.h) })).filter((e: any) => e.w > 0 && e.h > 0 && e.w * e.h < 0.25);
      return json({
        readable: ['gera', 'dalinai', 'neiskaitoma'].includes(raw.readable) ? raw.readable : 'dalinai',
        comment: str(raw.comment, 400), corners: corners.length === 4 ? corners : [], erase, usage: dd.usage || null
      });
    }
    if (payload && payload.mode === 'draw') {
      const d = buildDraw(payload, Deno.env.get('ANTHROPIC_MODEL') || MODEL_DEFAULT);
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(d.body) });
      const dd = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Claude API klaida (${r.status}): ${(dd && dd.error && dd.error.message) || r.statusText}`);
      if (dd.stop_reason === 'refusal') throw new Error('DI atsisakė apdoroti šią nuotrauką.');
      const u = (dd.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'pateikti_svg');
      let svg = u && u.input ? sanitizeSvg(u.input.svg) : '';
      let comment = u && u.input ? str(u.input.comment, 500) : '';
      if (!svg) {   // atsarginis kelias: SVG gali būti parašytas tiesiog tekstu
        const txt = (dd.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
        svg = sanitizeSvg(txt);
      }
      if (!svg && !comment) throw new Error(`DI negrąžino schemos (${dd.stop_reason || 'nežinoma priežastis'}). Bandykite dar kartą.`);
      return json({ svg, comment, model_id: dd.model || '', usage: dd.usage || null, truncated: dd.stop_reason === 'max_tokens' });
    }
    const { tool, body } = buildRequest(payload || {}, Deno.env.get('ANTHROPIC_MODEL') || MODEL_DEFAULT);
    const call = (b: unknown) => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(b)
    });
    let res = await call(body);
    let data = await res.json().catch(() => ({}));
    if (res.status === 400) {
      const { strict: _s, ...plainTool } = tool as any;
      const { output_config: _o, ...plain } = body as any;
      res = await call({ ...plain, tools: [plainTool] });
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok) throw new Error(`Claude API klaida (${res.status}): ${(data && data.error && data.error.message) || res.statusText}`);
    if (data.stop_reason === 'refusal') throw new Error('DI atsisakė apdoroti šią nuotrauką.');
    const tu = (data.content || []).find((b: any) => b.type === 'tool_use' && b.name === tool.name);
    if (!tu || !tu.input) throw new Error('DI negrąžino struktūrizuoto atsakymo. Bandykite dar kartą.');
    const raw: any = tu.input;
    const kinds = (tool.input_schema.properties.elements as any).items.properties.kind.enum;
    return json({
      readable: ['gera', 'dalinai', 'neiskaitoma'].includes(raw.readable) ? raw.readable : 'dalinai',
      comment: str(raw.comment, 400),
      elements: (Array.isArray(raw.elements) ? raw.elements : []).slice(0, 80).map((e: any) => ({
        tag: str(e.tag, 40), name: str(e.name), kind: kinds.includes(e.kind) ? e.kind : 'kita', grp: ['ivadas', 'sildymas', 'kv'].includes(e.grp) ? e.grp : 'ivadas'
      })),
      model_id: data.model || '', usage: data.usage || null
    });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
