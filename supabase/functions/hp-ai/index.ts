// Supabase Edge Function „hp-ai“ – šilumos punkto (ŠP) įrenginių gamyklinių lentelių skaitymas iš nuotraukų.
// Atskira nuo funkcijų „ai“ ir „ai-annual“. Vartotoją (ir jo aktyvumą) tikrina pati, todėl diegti su verify_jwt = false.
// Reikia tų pačių paslapčių: ANTHROPIC_API_KEY (neprivaloma ANTHROPIC_MODEL).
// Viena užklausa = vienas įrenginys su jo nuotraukomis; atsakymas – gamintojas, modelis ir rodikliai.

const MODEL_DEFAULT = 'claude-sonnet-5-5';
const MAX_PHOTOS = 4;
const MAX_PHOTOS_MULTI = 8;                               // keli vienodo tipo prietaisai (manometrai, termometrai ir pan.)
const MAX_FIELDS = 14;

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
  const pr = await fetch(`${url}/rest/v1/profiles?select=active&id=eq.${user.id}`, {
    headers: { Authorization: auth, apikey: projectApiKey(req) }
  });
  if (!pr.ok) return null;
  const rows = await pr.json();
  return rows && rows[0] && rows[0].active ? user : null;
}

const SYSTEM = `Tu esi daugiabučių namų šilumos punktų (ŠP) įrangos specialistas Lietuvoje. Gausi VIENO įrenginio nuotraukas (gamyklinė lentelė ir / arba bendras vaizdas) ir turi iš jų nuskaityti duomenis „Pastato šildymo ir karšto vandens sistemos aprašui“.

Taisyklės:
- Rašyk TIK tai, kas matoma nuotraukose: lentelėje, lipduke, ant korpuso išlietus ar išgraviruotus užrašus, prietaiso skalę ar ekraną. Nieko neimk iš atminties ar katalogų. Jei reikšmės nuotraukoje nėra arba jos neįmanoma įskaityti – lauką palik visiškai tuščią (be kabučių, brūkšnių ar žodžio „nėra“).
- Iš modelio žymens gali išvesti tik tai, kas jame tiesiogiai užrašyta (pvz. „DN 25“, „PN16“, „32-80“). Tokį lauką įtrauk į „uncertain“, jei nesi tikras, ką skaičius reiškia.
- manufacturer – gamintojo pavadinimas taip, kaip užrašyta (pvz. Danfoss, Grundfos, Wilo, Alfa Laval, SWEP, Kamstrup, Axis Industries, Reflex, Siemens). model – tikslus tipo / modelio žymuo, be gamyklinio numerio. Sertifikavimo ir patvirtinimo žymos (TÜV, CE, MID, EN numeriai) nėra nei gamintojas, nei modelis – jas rašyk į „extra“.
- Rodiklių laukuose rašyk tik reikšmę be mato vieneto (vienetas nurodytas prie lauko), dešimtainį skyriklį – kablelį (pvz. "1,6"). Jei lentelėje kitas vienetas (pvz. l/h vietoj m³/h, kPa ar MPa vietoj bar) – perskaičiuok į prašomą ir lauką įtrauk į „uncertain“. Jei laukas turi galimų reikšmių sąrašą – rinkis vieną iš jo arba palik tuščią.
- Jei nuotraukose yra kelios lentelės (pvz. vožtuvo ir pavaros) – naudok abi: pagrindinis įrenginys į manufacturer / model, kita – į atitinkamą lauką (pvz. „Pavaros modelis“).
- Jei nuotraukoje matosi aiškiai kitas įrenginys, nei nurodyta užduotyje – duomenų nepildyk ir parašyk tai lauke „comment“.
- uncertain – laukų raktai (taip pat "manufacturer", "model"), kurių reikšmę įskaitei tik iš dalies arba spėjai.
- readable: "gera" – gamintojas ir modelis (arba pagrindiniai rodikliai) įskaityti; "dalinai" – lentelė yra, bet dalis jos neįskaitoma (blizgesys, neryšku, nupjauta, per toli); "neiskaitoma" – lentelės nuotraukoje nėra arba nieko įskaityti nepavyko.
- comment – tik kai readable nėra "gera" arba nuotraukoje ne tas įrenginys: vienas trumpas sakinys paprastais žodžiais šilumininkui, ką perfotografuoti (pvz. „Lentelė blizga – fotografuokite be blykstės, iš arčiau.“). Neprašyk papildomų nuotraukų duomenims, kurių gamyklinėje lentelėje paprastai nebūna (plokštelių skaičius, nustatytas režimas, DN), ir neprašyk nuimti izoliacijos ar ką nors ardyti. Kitais atvejais lauką palik tuščią.
- extra – kiti lentelėje matomi naudingi duomenys, kuriems nėra atskiro lauko (gamyklinis Nr., pagaminimo metai, PN, Tmax, įtampa ir pan.), viena eilute. Jei nėra – palik tuščią.
- Įrenginiams BE gamyklinės lentelės (užduotyje parašyta „gamyklinės lentelės nėra“: manometrai, termometrai, armatūra, filtrai ir pan.) skaityk tai, kas matoma ant paties prietaiso: skalės ribas, ant korpuso išlietą DN / PN, gamintojo ženklą. Jei įrenginys nuotraukoje matomas – readable = "gera" ir comment tuščias, net jei DN ar gamintojo nesimato.
- Jei užduotyje parašyta „keli prietaisai“ – kiekvienoje nuotraukoje gali būti kitas to paties tipo prietaisas. Neaprašinėk tik vieno: laukuose išvardyk visas skirtingas reikšmes per kabliataškį su kiekiu (pvz. skalė „0–16 (2 vnt.); 0–10 (1 vnt.)“, patikra „2022; 2024“), manufacturer – visi matomi gamintojai per kablelį. Neprašyk fotografuoti kiekvieno atskirai.
- Skalę rašyk kaip ribas, pvz. „0–16“.

Rezultatą VISADA pateik iškviesdamas įrankį „pateikti_irengini“.`;

type Field = { key: string; label: string; unit?: string; options?: string[] };

function cleanFields(raw: unknown): Field[] {
  const out: Field[] = [];
  for (const f of Array.isArray(raw) ? raw : []) {
    const key = String((f && f.key) || '');
    if (!/^[a-z0-9_]{1,40}$/.test(key) || out.some(x => x.key === key)) continue;
    out.push({
      key, label: String(f.label || key).slice(0, 120), unit: f.unit ? String(f.unit).slice(0, 20) : '',
      options: Array.isArray(f.options) ? f.options.map((o: unknown) => String(o).slice(0, 60)).slice(0, 12) : undefined
    });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

function buildTool(fields: Field[]) {
  const specProps: Record<string, unknown> = {};
  for (const f of fields) {
    specProps[f.key] = {
      type: 'string',
      description: `${f.label}${f.unit ? ` (${f.unit})` : ''}${f.options && f.options.length ? `. Galimos reikšmės: ${f.options.join(' | ')}` : ''}. Jei nematyti – palik tuščią.`
    };
  }
  return {
    name: 'pateikti_irengini',
    description: 'Pateikia iš nuotraukų nuskaitytus vieno ŠP įrenginio duomenis.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        manufacturer: { type: 'string', description: 'Gamintojas. Jei nematyti – palik tuščią.' },
        model: { type: 'string', description: 'Tipas / modelis. Jei nematyti – palik tuščią.' },
        specs: { type: 'object', additionalProperties: false, properties: specProps, required: fields.map(f => f.key) },
        uncertain: { type: 'array', items: { type: 'string' }, description: 'Laukų raktai, kurių reikšmė neužtikrinta.' },
        readable: { type: 'string', enum: ['gera', 'dalinai', 'neiskaitoma'] },
        comment: { type: 'string', description: 'Ką perfotografuoti (šilumininkui). Jei nereikia – palik tuščią.' },
        extra: { type: 'string', description: 'Kiti lentelėje matomi duomenys viena eilute. Jei nėra – palik tuščią.' }
      },
      required: ['manufacturer', 'model', 'specs', 'uncertain', 'readable', 'comment', 'extra']
    }
  };
}

function imageBlock(p: any) {
  if (p && typeof p.url === 'string' && /^https:\/\//.test(p.url)) return { type: 'image', source: { type: 'url', url: p.url } };
  return null;
}

function buildRequest(payload: any, model: string) {
  const it = payload.item || {};
  const fields = cleanFields(it.fields);
  const tool = buildTool(fields);
  let text = `ĮRENGINYS: ${String(it.name || '').slice(0, 200)}\nGrupė: ${String(it.group || '').slice(0, 100)}\n`;
  if (payload.sp_type) text += `Šilumos punktas: ${String(payload.sp_type).slice(0, 200)}\n`;
  text += it.plate ? 'Šis įrenginys turi gamyklinę lentelę.\n' : 'Šio tipo įrenginiams gamyklinės lentelės nėra.\n';
  if (it.multi) text += 'Keli prietaisai: nuotraukose gali būti keli skirtingi šio tipo prietaisai.\n';
  if (it.hint) text += `Pastaba apie nuotraukas: ${String(it.hint).slice(0, 300)}\n`;
  text += '\nLAUKAI, kuriuos reikia užpildyti (specs):\n' + (fields.length
    ? fields.map(f => `- ${f.key}: ${f.label}${f.unit ? ` (${f.unit})` : ''}`).join('\n') : '(papildomų laukų nėra)') + '\n';
  const content: any[] = [{ type: 'text', text }];
  let n = 0;
  for (const p of (payload.photos || []).slice(0, it.multi ? MAX_PHOTOS_MULTI : MAX_PHOTOS)) {
    const blk = imageBlock(p);
    if (!blk) continue;
    n++;
    content.push({ type: 'text', text: `${n} nuotrauka – ${p.slot === 'plate' ? 'gamyklinė lentelė' : 'bendras įrenginio vaizdas'}` });
    content.push(blk);
  }
  if (!n) throw new Error('Nėra nuotraukų, kurias būtų galima nuskaityti.');
  content.push({ type: 'text', text: 'Pateik rezultatą per įrankį „pateikti_irengini“.' });
  return {
    tool,
    body: {
      model, max_tokens: 4000, system: SYSTEM, tools: [tool], tool_choice: { type: 'auto' },
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content }]
    }
  };
}

function extract(resp: any, toolName: string) {
  if (resp && resp.stop_reason === 'refusal') throw new Error('DI atsisakė apdoroti šias nuotraukas. Įveskite duomenis ranka.');
  const blocks = (resp && resp.content) || [];
  const tool = blocks.find((b: any) => b.type === 'tool_use' && b.name === toolName);
  if (tool && tool.input && typeof tool.input === 'object') return tool.input;
  const t = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* ignore */ } }
  throw new Error('DI negrąžino struktūrizuoto atsakymo. Bandykite dar kartą.');
}

// tuščia reikšmė kartais grįžta kaip dvi kabutės, brūkšnys ar „nėra“ – tokias laikome tuščiomis
const EMPTY_RE = /^(["'„“”\s.?–—-]*|nėra|nematyti|nesimato|n\/a|none|null)$/i;
const str = (v: unknown, max = 300) => {
  const s = (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
  return EMPTY_RE.test(s) ? '' : s.slice(0, max);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);
  const user = await getUser(req);
  if (!user) return json({ error: 'Neprisijungta arba paskyra neaktyvuota. Prisijunkite iš naujo.' }, 401);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Serveryje nenustatytas ANTHROPIC_API_KEY' }, 500);
  try {
    const { payload } = await req.json();
    const model = Deno.env.get('ANTHROPIC_MODEL') || MODEL_DEFAULT;
    const { tool, body } = buildRequest(payload || {}, model);
    const call = (b: unknown) => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(b)
    });
    let res = await call(body);
    let data = await res.json().catch(() => ({}));
    if (res.status === 400) {
      // atsarginis variantas: be griežtos schemos ir be „effort“ (jei modelis kurio nors parametro nepriima)
      console.error('hp-ai 400, kartojama paprastesne užklausa:', data && data.error && data.error.message);
      const { strict: _s, ...plainTool } = tool as any;
      const { output_config: _o, ...plain } = body as any;
      res = await call({ ...plain, tools: [plainTool] });
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok) throw new Error(`Claude API klaida (${res.status}): ${(data && data.error && data.error.message) || res.statusText}`);
    const raw: any = extract(data, tool.name);
    const keys = Object.keys((tool.input_schema.properties.specs as any).properties);
    const specs: Record<string, string> = {};
    for (const k of keys) { const v = str(raw.specs && raw.specs[k]); if (v) specs[k] = v; }
    const readable = ['gera', 'dalinai', 'neiskaitoma'].includes(raw.readable) ? raw.readable : 'dalinai';
    return json({
      manufacturer: str(raw.manufacturer, 120), model: str(raw.model, 160), specs,
      uncertain: (Array.isArray(raw.uncertain) ? raw.uncertain : []).map((x: unknown) => str(x, 40)).filter(Boolean).slice(0, 20),
      readable, comment: str(raw.comment, 400), extra: str(raw.extra, 500),
      model_id: data.model || model, usage: data.usage || null
    });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
