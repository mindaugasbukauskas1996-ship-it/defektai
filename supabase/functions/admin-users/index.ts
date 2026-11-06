// Supabase Edge Function „admin-users“ – administratorius sukuria naują vartotoją arba nustato naują slaptažodį.
// Kviesti gali TIK aktyvus administratorius (tikrinama čia). Naudoja SUPABASE_SERVICE_ROLE_KEY (Supabase paslaptys
// funkcijoms suteikiamos automatiškai). Diegti su verify_jwt = false.
//
// Veiksmai (POST { action, ... }):
//   create → { email, full_name? }                    sukuria paskyrą „darbuotojas“ (el. paštas patvirtintas, aktyvi) ir grąžina laikiną slaptažodį
//   reset  → { id }                                   nustato naują laikiną slaptažodį esamai paskyrai

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

/** Grąžina prisijungusį vartotoją, jei jis aktyvus administratorius. */
async function getAdmin(req: Request, url: string, service: string) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: projectApiKey(req) } });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;
  const pr = await fetch(`${url}/rest/v1/profiles?select=role,active&id=eq.${user.id}`, {
    headers: { Authorization: `Bearer ${service}`, apikey: service }
  });
  if (!pr.ok) return null;
  const rows = await pr.json();
  return rows && rows[0] && rows[0].role === 'admin' && rows[0].active ? user : null;
}

// Laikinas slaptažodis be painiojamų simbolių, pvz. „kqmz-7x3p-hr9t“
function tempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, b => chars[b % chars.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tik POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !service) return json({ error: 'Serveryje nėra SUPABASE_SERVICE_ROLE_KEY' }, 500);

  const admin = await getAdmin(req, url, service);
  if (!admin) return json({ error: 'Šį veiksmą gali atlikti tik administratorius.' }, 403);

  const H = { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': 'application/json' };
  try {
    const body = await req.json();
    const action = body && body.action;

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const full_name = String(body.full_name || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Neteisingas el. pašto adresas.' }, 400);
      const password = tempPassword();
      const res = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: full_name ? { full_name } : {}, app_metadata: { admin_created: true } })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String((data && (data.msg || data.message || data.error_description)) || res.statusText);
        return json({ error: /already|registered|exists/i.test(msg) ? 'Toks el. paštas jau registruotas.' : `Nepavyko sukurti: ${msg}` }, 400);
      }
      // profilį (aktyvų, rolė „user“, su vardu) sukuria duomenų bazės trigeris handle_new_user pagal app_metadata.admin_created
      return json({ id: data.id, email, password });
    }

    if (action === 'reset') {
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Neteisingas paskyros id.' }, 400);
      const password = tempPassword();
      const res = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: H, body: JSON.stringify({ password }) });
      if (!res.ok) return json({ error: 'Nepavyko pakeisti slaptažodžio.' }, 400);
      return json({ id, password });
    }

    return json({ error: 'Nežinomas veiksmas' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
