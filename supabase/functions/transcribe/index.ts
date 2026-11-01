// Supabase Edge Function „transcribe“ – lietuviško garso (diktavimo) pavertimas tekstu per OpenAI.
// Vartotoją (ir jo aktyvumą) tikrina pati, todėl diegti su verify_jwt = false.
// Paslaptys (Supabase → Edge Functions → Secrets): OPENAI_API_KEY (privaloma), OPENAI_TRANSCRIBE_MODEL (neprivaloma).

const MODEL_DEFAULT = 'gpt-4o-transcribe';
const MAX_BYTES = 8 * 1024 * 1024;

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

// Žodynas padeda atpažinti specifinius terminus.
const HINT = 'Daugiabučio namo techninė apžiūra: stogas, įlaja, parapetas, bituminė danga, laiptinė, cokolis, tinkas, įtrūkimai, '
  + 'šilumos punktas, vamzdynas, elektros skydinė, balkonas, langų angokraščiai, nuogrinda, rūsys.';

function fileName(type: string): string {
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'audio.m4a';
  if (type.includes('ogg')) return 'audio.ogg';
  if (type.includes('wav')) return 'audio.wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3';
  return 'audio.webm';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);
  const user = await getUser(req);
  if (!user) return json({ error: 'Neprisijungta arba paskyra neaktyvuota. Prisijunkite iš naujo.' }, 401);
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'Serveryje nenustatytas OPENAI_API_KEY (diktavimui)' }, 500);
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return json({ error: 'Nėra garso failo' }, 400);
    if (file.size > MAX_BYTES) return json({ error: 'Įrašas per ilgas (iki ~8 MB). Padiktuokite trumpesnėmis dalimis.' }, 413);

    const out = new FormData();
    out.append('file', new File([await file.arrayBuffer()], fileName(file.type || ''), { type: file.type || 'audio/webm' }));
    out.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || MODEL_DEFAULT);
    out.append('language', 'lt');
    out.append('prompt', HINT);
    out.append('response_format', 'json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: out
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Transkribavimo klaida (${res.status}): ${(data && data.error && data.error.message) || res.statusText}`);
    return json({ text: String(data.text || '').trim() });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
