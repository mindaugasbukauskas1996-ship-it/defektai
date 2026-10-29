// Supabase Edge Function „ai“ – saugiai kviečia Claude API.
// API raktas laikomas Supabase paslaptyse (secrets), naršyklė jo nemato.
//
// Diegimas per CLI:
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   npx supabase functions deploy ai --no-verify-jwt
// (neprivaloma) npx supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5
//
// Vartotojas tikrinamas pačiame kode (veikia ir su naujais „publishable“,
// ir su senais „anon“ raktais), todėl platformos JWT tikrinimas išjungtas.

import { runAction, DEFAULT_MODEL } from './prompt.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

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

/** Patikrina, ar užklausą siuntė prisijungęs vartotojas. */
async function getUser(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: projectApiKey(req) }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: 'Neprisijungta. Prisijunkite iš naujo.' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Serveryje nenustatytas ANTHROPIC_API_KEY' }, 500);
  const model = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL;

  try {
    const { action, payload } = await req.json();
    const result = await runAction(apiKey, model, action, payload || {});
    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
