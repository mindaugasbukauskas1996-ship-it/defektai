// =====================================================================
// Duomenų sluoksnis: Supabase (tikras režimas) arba IndexedDB (demo).
// Visa programėlė duomenis pasiekia tik per šį modulį.
// =====================================================================

import { CONFIG } from './config.js';
import { uuid, blobToDataURL } from './util.js';

export const isDemo = !CONFIG.SUPABASE_URL;

export const DEFAULT_SETTINGS = {
  org_name: 'Mano Būstas Baltija, UAB',
  customer_name: 'Mano Būstas Baltija',
  engineer_name: '',
  engineer_position: 'Techninis inžinierius',
  engineer_phone: '',
  city: 'Klaipėda',
  act_prefix: 'DA',
  next_act_no: 1,
  nc_prefix: 'NA',
  next_nc_no: 1,
  form_code: 'Forma VP08FA',
  department: 'TECHNINIAI INŽ.',
  service_types: [
    'Bendrastatybiniai darbai (tech. inž.)',
    'Elektros ūkio prevencinė priežiūra',
    'Pastatų ir statinių konstrukcijų prevencinė priežiūra',
    'Šalto vandens ir nuotekų sistemos prevencinė priežiūra',
    'Šilumos ūkio prevencinė priežiūra',
    'Vėdinimo ir oro kondicionavimo sistemų prevencinė priežiūra',
    'Vidaus elektros tinklai_skaitikliai',
    'Sudėtingų elektros ūkio sistemos darbų prevencinė priežiūra',
    'Vėliavų kabinimo paslauga'
  ],
  commission: [
    { position: '', name: '' },
    { position: '', name: '' }
  ],
  conclusion_text:
    'Komisija, atsižvelgdama į apžiūros metu nustatytus daugiabučio gyvenamojo namo (bendrojo naudojimo objektų) defektus, konstatuoja, kad nurodytos namo (objekto) sistemos neatitinka STR 1.07.03:2017 „Statinių techninės ir naudojimo priežiūros tvarka. Naujų nekilnojamojo turto kadastro objektų formavimo tvarka“ įtvirtintų daugiabučio gyvenamojo namo privalomųjų reikalavimų visumos.\n' +
    'Atsižvelgiant į aukščiau išdėstytą, (komisija) rekomenduoja nedelsiant organizuoti sprendimo dėl privalomųjų reikalavimų neatitinkančių gyvenamojo namo bendrojo naudojimo objektų defektų pašalinimo priėmimą bei pašalinti užfiksuotus defektus.',
  works_note: 'Kiekius vietoje patikslins rangovas.',
  signature: '',
  demo_api_key: ''
};

let sb = null;          // Supabase klientas
let idb = null;         // IndexedDB
const urlCache = new Map();

// ---------------------------------------------------------------------
// Inicializacija ir prisijungimas
// ---------------------------------------------------------------------

export async function init() {
  if (isDemo) {
    idb = await openIDB();
    return;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

export async function getUser() {
  if (isDemo) return { email: 'demo' };
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

export async function signIn(email, password) {
  resetCaches();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials'
    ? 'Neteisingas el. paštas arba slaptažodis' : error.message);
}

export async function signOut() {
  resetCaches();
  if (!isDemo) await sb.auth.signOut();
}

export function onAuthChange(cb) {
  if (!isDemo) sb.auth.onAuthStateChange((_e, session) => { resetCaches(); cb(session ? session.user : null); });
}

// ---------------------------------------------------------------------
// Paskyros ir rolės
// ---------------------------------------------------------------------

let meCache = null;

function resetCaches() { meCache = null; settingsCache = null; }

/** Prisijungusios paskyros profilis: { id, email, full_name, role: 'admin' | 'user' }. */
export async function getProfile(force = false) {
  if (isDemo) return { id: 'demo', email: 'demo', full_name: '', role: 'admin' };
  if (meCache && !force) return meCache;
  const { data: s } = await sb.auth.getSession();
  const u = s.session && s.session.user;
  if (!u) return null;
  const r = await sb.from('profiles').select('id,email,full_name,role').eq('id', u.id).maybeSingle();
  if (r.error) throw r.error;
  meCache = r.data || { id: u.id, email: u.email, full_name: '', role: 'user' };
  return meCache;
}

/** Visos paskyros (RLS: tik adminui; paprastas vartotojas mato tik save). */
export async function listProfiles() {
  if (isDemo) return [];
  const { data, error } = await sb.from('profiles').select('id,email,full_name,role').order('created_at');
  if (error) throw error;
  return data;
}

export const profileName = p => (p && (p.full_name || p.email)) || '';

// ---------------------------------------------------------------------
// Užduotys
// ---------------------------------------------------------------------

export async function listTasks() {
  if (isDemo) return (await idbAll('tasks')).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await sb.from('tasks')
    .select('id,created_at,updated_at,status,priority,service_type,address,city,apartment,stairwell,contact_name,contact_phone,problem,due_date,act_number,kind,contractor,assigned_to')
    .order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return data;
}

export async function getTask(id) {
  if (isDemo) return idbGet('tasks', id);
  const { data, error } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTask(obj) {
  if (isDemo) {
    const now = new Date().toISOString();
    const t = {
      id: uuid(), created_at: now, updated_at: now, status: 'nauja', priority: 'iprastas',
      inspection_purpose: 'Neeilinė', act_mode: 'defect', ai_questions: [], ai_assumptions: [],
      defect_act: null, works_act: null, kind: 'defect', nc_act: null, ...obj
    };
    await idbPut('tasks', t);
    return t;
  }
  const { data, error } = await sb.from('tasks').insert(obj).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, patch) {
  if (isDemo) {
    const t = await idbGet('tasks', id);
    const n = { ...t, ...patch, updated_at: new Date().toISOString() };
    await idbPut('tasks', n);
    return n;
  }
  const { data, error } = await sb.from('tasks').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id) {
  const photos = await listPhotos(id);
  for (const p of photos) await deletePhoto(p);
  if (isDemo) return idbDel('tasks', id);
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Nuotraukos
// ---------------------------------------------------------------------

export async function listPhotos(taskId) {
  if (isDemo) {
    const all = await idbAll('photos');
    return all.filter(p => p.task_id === taskId).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  }
  const { data, error } = await sb.from('photos').select('*').eq('task_id', taskId)
    .order('sort').order('created_at');
  if (error) throw error;
  return data;
}

export async function addPhoto(taskId, blob, meta = {}) {
  const id = uuid();
  const path = `${taskId}/${id}.jpg`;
  const row = {
    id, task_id: taskId, path, annotated_path: null, annotations: [],
    caption: meta.caption || '', sort: meta.sort || 0, include_in_act: true,
    width: meta.width || null, height: meta.height || null
  };
  if (isDemo) {
    await idbPut('blobs', { path, blob });
    row.created_at = new Date().toISOString();
    await idbPut('photos', row);
    return row;
  }
  const up = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await sb.from('photos').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function updatePhoto(id, patch) {
  if (isDemo) {
    const p = await idbGet('photos', id);
    const n = { ...p, ...patch };
    await idbPut('photos', n);
    return n;
  }
  const { data, error } = await sb.from('photos').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function saveAnnotated(photo, blob, annotations) {
  const path = `${photo.task_id}/${photo.id}_ann_${Date.now()}.jpg`;
  const old = photo.annotated_path;
  if (isDemo) {
    if (blob) await idbPut('blobs', { path, blob });
    if (old) await idbDel('blobs', old);
  } else {
    if (blob) {
      const up = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
    }
    if (old) await sb.storage.from('photos').remove([old]);
  }
  if (old) forgetUrl(old);
  return updatePhoto(photo.id, { annotated_path: blob ? path : null, annotations });
}

export async function deletePhoto(photo) {
  const paths = [photo.path, photo.annotated_path].filter(Boolean);
  paths.forEach(forgetUrl);
  if (isDemo) {
    for (const p of paths) await idbDel('blobs', p);
    return idbDel('photos', photo.id);
  }
  await sb.storage.from('photos').remove(paths);
  const { error } = await sb.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
}

/** Peržiūros URL (pažymėta versija, jei yra). */
export async function photoUrl(photo, preferAnnotated = true) {
  const path = (preferAnnotated && photo.annotated_path) || photo.path;
  return pathUrl(path);
}

async function pathUrl(path) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  let url;
  if (isDemo) {
    const rec = await idbGet('blobs', path);
    if (!rec) return '';
    url = URL.createObjectURL(rec.blob);
    urlCache.set(path, { url, exp: Infinity });
  } else {
    const { data, error } = await sb.storage.from('photos').createSignedUrl(path, 3600);
    if (error) throw error;
    url = data.signedUrl;
    urlCache.set(path, { url, exp: Date.now() + 50 * 60 * 1000 });
  }
  return url;
}

function forgetUrl(path) {
  const c = urlCache.get(path);
  if (c && isDemo) URL.revokeObjectURL(c.url);
  urlCache.delete(path);
}

/** Originalios nuotraukos blob (žymėjimo redaktoriui). */
export async function photoBlob(photo) {
  if (isDemo) {
    const rec = await idbGet('blobs', photo.path);
    return rec && rec.blob;
  }
  const { data, error } = await sb.storage.from('photos').download(photo.path);
  if (error) throw error;
  return data;
}

/** Nuotraukos aprašas DI užklausai. */
export async function photoForAI(photo) {
  const path = photo.annotated_path || photo.path;
  if (isDemo) {
    const rec = await idbGet('blobs', path);
    return { data: await blobToDataURL(rec.blob) };
  }
  const { data, error } = await sb.storage.from('photos').createSignedUrl(path, 900);
  if (error) throw error;
  return { url: data.signedUrl };
}

// ---------------------------------------------------------------------
// Nustatymai
// ---------------------------------------------------------------------

let settingsCache = null;

export async function getSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  let data = {};
  if (isDemo) {
    const rec = await idbGet('settings', 1);
    data = rec ? rec.data : {};
  } else {
    const me = await getProfile();
    const r = await sb.from('user_settings').select('data').eq('user_id', me.id).maybeSingle();
    if (r.error) throw r.error;
    data = (r.data && r.data.data) || {};
  }
  settingsCache = { ...DEFAULT_SETTINGS, ...data };
  return settingsCache;
}

export async function saveSettings(data) {
  const clean = { ...data };
  if (isDemo) {
    await idbPut('settings', { id: 1, data: clean });
  } else {
    delete clean.demo_api_key;
    const me = await getProfile();
    const { error } = await sb.from('user_settings').upsert({ user_id: me.id, data: clean });
    if (error) throw error;
    const name = (clean.engineer_name || '').trim();
    if (name !== (me.full_name || '')) {
      const r = await sb.from('profiles').update({ full_name: name || null }).eq('id', me.id);
      if (!r.error) meCache = { ...me, full_name: name };
    }
  }
  settingsCache = { ...DEFAULT_SETTINGS, ...data };
  return settingsCache;
}

/** Suteikia kitą akto numerį ir padidina skaitiklį. */
export async function nextActNumber(kind = 'defect') {
  const s = await getSettings(true);
  if (kind === 'nonconformity') {
    const no = Number(s.next_nc_no) || 1;
    await saveSettings({ ...s, next_nc_no: no + 1 });
    return `${s.nc_prefix || ''}${String(no).padStart(4, '0')}`;
  }
  const no = Number(s.next_act_no) || 1;
  await saveSettings({ ...s, next_act_no: no + 1 });
  return `${s.act_prefix || ''}${String(no).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------
// DI
// ---------------------------------------------------------------------

export async function ai(action, payload) {
  if (isDemo) {
    const s = await getSettings();
    if (!s.demo_api_key) {
      throw new Error('Demo režime DI veikia tik įrašius Anthropic API raktą Nustatymuose (skiltis „Demo režimas“).');
    }
    const { runAction, DEFAULT_MODEL } = await import('../supabase/functions/ai/prompt.js');
    return runAction(s.demo_api_key, s.demo_model || DEFAULT_MODEL, action, payload,
      { 'anthropic-dangerous-direct-browser-access': 'true' });
  }
  const { data, error } = await sb.functions.invoke('ai', { body: { action, payload } });
  if (error) {
    let msg = error.message;
    try {
      const body = await error.context.json();
      if (body && body.error) msg = body.error;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ---------------------------------------------------------------------
// IndexedDB (demo režimas)
// ---------------------------------------------------------------------

function openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('defektai-demo', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('tasks', { keyPath: 'id' });
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('blobs', { keyPath: 'path' });
      db.createObjectStore('settings', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = idb.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  });
}
const idbGet = (s, k) => tx(s, 'readonly', st => st.get(k));
const idbAll = (s) => tx(s, 'readonly', st => st.getAll());
const idbPut = (s, v) => tx(s, 'readwrite', st => st.put(v));
const idbDel = (s, k) => tx(s, 'readwrite', st => st.delete(k));
