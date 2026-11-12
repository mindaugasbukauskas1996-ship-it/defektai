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
