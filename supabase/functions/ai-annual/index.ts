// Supabase Edge Function „ai-annual“ – metinės (kasmetinės) statinio apžiūros akto tekstai.
// Atskira nuo funkcijos „ai“. Vartotoją (ir jo aktyvumą) tikrina pati, todėl diegti su verify_jwt = false.
// Reikia tų pačių paslapčių: ANTHROPIC_API_KEY (neprivaloma ANTHROPIC_MODEL).

const MODEL_DEFAULT = 'claude-sonnet-5-5';
const MAX_PHOTOS = 12;

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

const SYSTEM = `Tu esi patyręs daugiabučių gyvenamųjų namų techninės priežiūros inžinierius Lietuvoje. Padedi parengti METINĖS (KASMETINĖS) STATINIO APŽIŪROS AKTO tekstus.

Gausi apžiūros elementų sąrašą (sienos, stogas, cokolis ir t. t.). Kiekvienam elementui, kuriame inžinierius nurodė defektų („yra defektų“), parašyk du SKIRTUS laukus:
• defects – pastebėti defektai: ką matoma, jų mastas ir vieta (apie 2–4 trumpi sakiniai, be taisymo technologijų). Jokių nuorodų į paveikslėlius („žr. 3 pav.“) ir be žodžio „Pastaba:“.• rec – rekomendacijos: TRUMPAI, 1–2 sakiniai, tik KĄ daryti (pvz. „Užtaisyti įtrūkimus, nudažyti sienas. Stebėti, ar įtrūkimai plečiasi.“). NEAPRAŠYK technologijų, medžiagų, darbų eigos ir kaip taisyti. Negali būti ilgesnė nei ~200 simbolių.
- Nenurodyk to, ko nėra inžinieriaus pastabose, nuotraukose ar praėjusių metų akte. Inžinieriaus pastaba gali būti ilga (perkelta iš defektų akto) – ją sutrumpink ir sutvarkyk.
- Rašyk taisyklinga dalykine lietuvių kalba, trumpais techniniais sakiniais. Jokių kreipinių.
- NIEKUR nenurodyk STR ar kitų norminių dokumentų punktų ir nuorodų (nei elementų tekstuose, nei rekomendacijose, nei išvadose).
- Jei pateiktas praėjusių metų tekstas („pernai“), naudok jį kaip pagrindą: pakartok tai, kas nepasikeitė, pakeisk pagal šių metų pastabas, ir neprieštarauk naujiems faktams.
- Atsižvelk į pastato kontekstą (konstruktyvas, stogo tipas / danga, metai), bet nepridėk defektų, kurių nėra pastabose.
- Elementams be defektų teksto NEKURK.

Bendros išvados (conclusions): grąžink PILNĄ numeruotinų pastraipų sąrašą (be numerių). Pradėk nuo standartinių formuluočių ir pritaikyk pagal tai, kas rasta:
1) Laikančiose konstrukcijose deformacijų, pažeidimų, susilpnėjimų ar griūties pavojaus nėra (jei pastabose nėra pavojaus signalų) – kitaip aiškiai nurodyk problemą.
2) Pastato konstrukcijų (dalių) tyrinėjimui poreikio nėra (arba nurodyk, ką reikia ištirti).
3) Išorės atitvarų drėgmę izoliuojantys sluoksniai turi pažaidų / neturi pažaidų (pagal sienų, stogo, cokolio pastabas).
4) Paviršinio vandens nuvedimo elementų (įlajos, latakai, stovai, įvadai) būklė (pagal pastabas).
5) Nuolatinių stebėjimų dažninti poreikio nėra (arba yra).
6) Vamzdynų būklė (pagal pastabas, jei jų buvo; kitaip praleisk).
7) Jei yra daug defektų – siūlyti gyventojams atlikti pastato modernizaciją, kurios metu kompleksiškai pašalinami defektai.
8) Visi kiekiai, darbų apimtys tikslinami darbų suderinamumo eigoje.
9) Vykdyti tolimesnius nuolatinius priežiūros darbus.
Nepridėk kitų išvadų, nebent jos išplaukia iš pastabų.

Rezultatą VISADA pateik iškviesdamas įrankį „pateikti_metine“.`;

const TOOL = {
  name: 'pateikti_metine',
  description: 'Pateikia metinės apžiūros akto tekstus ir bendras išvadas.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Elemento id iš užklausos.' },
            defects: { type: 'string', description: 'Pastebėti defektai (be nuorodų į paveikslėlius, be technologijų).' },
            rec: { type: 'string', description: 'Rekomendacijos: trumpai, 1–2 sakiniai, ką daryti.' }
          },
          required: ['id', 'defects', 'rec']
        }
      },
      conclusions: { type: 'array', items: { type: 'string' }, description: 'Bendros išvados / rekomendacijos (be numerių).' },
      assumptions: { type: 'array', items: { type: 'string' }, description: 'Prielaidos, kurias padarei (rodomos tik inžinieriui).' }
    },
    required: ['items', 'conclusions']
  }
};

function imageBlock(p: any) {
  if (p.url) return { type: 'image', source: { type: 'url', url: p.url } };
  if (p.data) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(p.data);
    if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  }
  return null;
}

const LABELS: Record<string, string> = {
  construction: 'Konstruktyvas', built_year: 'Statybos metai', floors: 'Aukštų skaičius', apartments: 'Butų skaičius',
  roof_type: 'Stogo tipas', roof_cover: 'Stogo danga', roof_condition: 'Stogo būklė', heat_point: 'Šilumos punkto tipas',
  renovation: 'Renovacijos būklė'
};

function buildRequest(payload: any, model: string) {
  const g = payload.general || {};
  let text = `STATINYS: ${g.address || ''}\nStatybos metai: ${g.built_year || '-'}; apžiūros data: ${g.date || '-'}\n`;
  const b = payload.building || {};
  const rows = Object.entries(LABELS).filter(([k]) => b[k] || b[k] === 0).map(([k, l]) => `- ${l}: ${b[k]}`);
  if (rows.length) text += '\nPASTATO KONTEKSTAS:\n' + rows.join('\n') + '\n';
  text += '\nAPŽIŪROS ELEMENTAI:\n';
  const content: any[] = [];
  const photos: any[] = [];
  for (const it of payload.items || []) {
    text += `\n[id=${it.id}] ${it.no} ${it.name}\n  būsena: ${it.status === 'defects' ? 'YRA DEFEKTŲ' : 'defektų nėra'}\n`;
    if (it.brief) text += `  inžinieriaus pastabos: ${it.brief}\n`;
    if (it.prev) text += `  pernai: ${String(it.prev).slice(0, 900)}\n`;
    if ((it.photos || []).length) text += `  nuotraukos: ${it.photos.join(', ')}\n`;
  }
  if (payload.instruction) text += `\nINŽINIERIAUS NURODYMAS (pataisymui): ${payload.instruction}\nDabartinės išvados: ${JSON.stringify(payload.conclusions || [])}\n`;
  content.push({ type: 'text', text });
  for (const p of (payload.photos || []).slice(0, MAX_PHOTOS)) {
    const blk = imageBlock(p);
    if (!blk) continue;
    content.push({ type: 'text', text: `${p.n} pav. – ${p.caption || p.element || ''}` });
    content.push(blk);
    photos.push(p);
  }
  content.push({ type: 'text', text: 'Pateik rezultatą per įrankį „pateikti_metine“.' });
  return { model, max_tokens: 6000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] };
}

// OpenAI (ChatGPT): ta pati užklausa išversta į Responses API, atsakymas grąžinamas Claude formatu
function oaiContent(content: any): any[] {
  if (typeof content === 'string') return [{ type: 'input_text', text: content }];
  const out: any[] = [];
  for (const b of content || []) {
    if (b.type === 'text') out.push({ type: 'input_text', text: b.text });
    else if (b.type === 'image') {
      const s = b.source || {};
      out.push({ type: 'input_image', image_url: s.type === 'base64' ? `data:${s.media_type};base64,${s.data}` : s.url });
    }
  }
  return out;
}

async function callOpenAI(apiKey: string, body: any, model: string) {
  const req = {
    model,
    instructions: typeof body.system === 'string' ? body.system : '',
    input: (body.messages || []).map((m: any) => ({ role: m.role, content: oaiContent(m.content) })),
    tools: (body.tools || []).map((t: any) => ({ type: 'function', name: t.name, description: t.description || '', parameters: t.input_schema, strict: false })),
    tool_choice: 'required',
    max_output_tokens: Math.max(16000, (body.max_tokens || 4000) * 2)
  };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(req)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI API klaida (${res.status}): ${(data && data.error && data.error.message) || res.statusText}`);
  if (data.status === 'incomplete') throw new Error('OpenAI atsakymas nutrūko (per ilgas). Bandykite dar kartą arba pasirinkite Claude.');
  const content: any[] = [];
  for (const it of data.output || []) {
    if (it.type === 'function_call') {
      let input: any = {};
      try { input = JSON.parse(it.arguments || '{}'); } catch (_) { throw new Error('OpenAI grąžino sugadintą atsakymą. Bandykite dar kartą.'); }
      content.push({ type: 'tool_use', name: it.name, input });
    } else if (it.type === 'message') {
      for (const c of it.content || []) if (c.type === 'output_text') content.push({ type: 'text', text: c.text });
    }
  }
  const u = data.usage || {};
  return { content, usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, provider: 'openai', model } };
}

function extract(resp: any) {
  const blocks = (resp && resp.content) || [];
  const tool = blocks.find((b: any) => b.type === 'tool_use' && b.name === TOOL.name);
  if (tool) return tool.input;
  const t = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* ignore */ } }
  throw new Error('DI negrąžino struktūrizuoto atsakymo. Bandykite dar kartą.');
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
    const body = buildRequest(payload || {}, Deno.env.get('ANTHROPIC_MODEL') || MODEL_DEFAULT);
    if (payload && payload.provider === 'openai') {          // pasirinktas ChatGPT
      const key = Deno.env.get('OPENAI_API_KEY');
      if (!key) return json({ error: 'Serveryje nenustatytas OPENAI_API_KEY – pasirinkite Claude arba pridėkite raktą.' }, 500);
      const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-sol';
      const oai = await callOpenAI(key, body, model);
      const out = extract(oai);
      out.usage = oai.usage || null;
      return json(out);
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Claude API klaida (${res.status}): ${(data && data.error && data.error.message) || res.statusText}`);
    const out = extract(data);
    out.usage = data.usage || null;
    return json(out);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
