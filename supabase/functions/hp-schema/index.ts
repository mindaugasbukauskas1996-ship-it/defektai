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
  return { tool, body: { model, max_tokens: 16000, system: DRAW_SYSTEM, tools: [tool], tool_choice: { type: 'auto' }, output_config: { effort: 'high' }, messages: [{ role: 'user', content }] } };
}

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);
  const user = await getUser(req);
  if (!user) return json({ error: 'Neprisijungta arba paskyra neaktyvuota. Prisijunkite iš naujo.' }, 401);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Serveryje nenustatytas ANTHROPIC_API_KEY' }, 500);
  try {
    const { payload } = await req.json();
    if (payload && payload.mode === 'draw') {
      const d = buildDraw(payload, Deno.env.get('ANTHROPIC_MODEL') || MODEL_DEFAULT);
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(d.body) });
      const dd = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Claude API klaida (${r.status}): ${(dd && dd.error && dd.error.message) || r.statusText}`);
      if (dd.stop_reason === 'refusal') throw new Error('DI atsisakė apdoroti šią nuotrauką.');
      const u = (dd.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'pateikti_svg');
      if (!u || !u.input) throw new Error('DI negrąžino schemos. Bandykite dar kartą.');
      return json({ svg: sanitizeSvg(u.input.svg), comment: str(u.input.comment, 500), model_id: dd.model || '', usage: dd.usage || null, truncated: dd.stop_reason === 'max_tokens' });
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
