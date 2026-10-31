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

const SYSTEM = `Tu esi patyręs daugiabučių gyvenamųjų namų techninės priežiūros inžinierius Lietuvoje. Padedi parengti METINĖS (KASMETINĖS) STATINIO APŽIŪROS AKTO tekstus pagal STR 1.07.03:2017 dvasią.

Gausi apžiūros elementų sąrašą (sienos, stogas, cokolis ir t. t.). Kiekvienam elementui, kuriame inžinierius nurodė defektų („yra defektų“), parašyk akto tekstą tokio pavidalo (kaip pavyzdiniuose aktuose):
"Pastaba: <ką matoma – defektai, jų mastas, vieta>.\\nImtis veiksmų: <konkretūs taisymo darbai>.\\nRekomenduojama: <platesnis ilgalaikis sprendimas, jei tinka>. (STR 1.07.03:2017 <punktai>)"
- Eilutes „Imtis veiksmų“ ir „Rekomenduojama“ rašyk tik jei turi ką pasakyti. Nenurodyk to, ko nėra inžinieriaus pastabose, nuotraukose ar praėjusių metų akte.
- Rašyk taisyklinga dalykine lietuvių kalba, trumpais techniniais sakiniais. Jokių kreipinių.
- STR punktus nurodyk tik pateiktus elemento lauke „str“ (jei jis tuščias – nenurodyk).
- Jei pateiktas praėjusių metų tekstas („pernai“), naudok jį kaip pagrindą: pakartok tai, kas nepasikeitė, pakeisk pagal šių metų pastabas, ir neprieštarauk naujiems faktams.
- Atsižvelk į pastato kontekstą (konstruktyvas, stogo tipas / danga, metai), bet nepridėk defektų, kurių nėra pastabose.
- Elementams be defektų teksto NEKURK.

Bendros išvados (conclusions): grąžink PILNĄ numeruotinų pastraipų sąrašą (be numerių). Pradėk nuo standartinių formuluočių ir pritaikyk pagal tai, kas rasta:
1) Laikančiose konstrukcijose deformacijų, pažeidimų, susilpnėjimų ar griūties pavojaus nėra (jei pastabose nėra pavojaus signalų) – kitaip aiškiai nurodyk problemą.
2) Pastato konstrukcijų (dalių) tyrinėjimui poreikio nėra (arba nurodyk, ką reikia ištirti).
3) Išorės atitvarų drėgmę izoliuojantys sluoksniai turi pažaidų / neturi pažaidų (pagal sienų, stogo, cokolio pastabas).
4) Paviršinio vandens nuvedimo elementų (įlajos, latakai, stovai, įvadai) būklė (pagal pastabas).
5) Nuolatinių stebėjimų dažninti, nei numatyta STR 1.07.03:2017 88.1 punkte, poreikio nėra (arba yra).
6) Vamzdynų būklė (pagal pastabas, jei jų buvo; kitaip praleisk).
7) Jei yra daug defektų – siūlyti gyventojams atlikti pastato modernizaciją, kurios metu kompleksiškai pašalinami defektai.
8) Visi kiekiai, darbų apimtys tikslinami darbų suderinamumo eigoje.
9) Vykdyti tolimesnius nuolatinius priežiūros darbus (STR 1.07.03:2017 88.1 p.).
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
            text: { type: 'string', description: 'Akto tekstas: „Pastaba: ...\\nImtis veiksmų: ...\\nRekomenduojama: ... (STR ...)“.' }
          },
          required: ['id', 'text']
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
    if (it.str) text += `  str: ${it.str}\n`;
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
