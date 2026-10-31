// =====================================================================
// Duomenų sluoksnis: Supabase (tikras režimas) arba IndexedDB (demo).
// Visa programėlė duomenis pasiekia tik per šį modulį.
// =====================================================================

import { CONFIG } from './config.js';
import { uuid, blobToDataURL, normKey, splitAddress, parseNum } from './util.js';

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
    .select('id,created_at,updated_at,status,priority,service_type,address,city,apartment,stairwell,contact_name,contact_phone,problem,due_date,act_number,kind,contractor,assigned_to,report_no')
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
// Objektai (pastatai) ir laiptinių kodai
// ---------------------------------------------------------------------

let objectsCache = null;

/** Visi objektai (kešuojama; skaitoma puslapiais, nes API riboja eilučių skaičių). */
export async function listObjects(force = false) {
  if (isDemo) return [];
  if (objectsCache && !force) return objectsCache;
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('objects').select('*').order('address').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  objectsCache = all;
  return all;
}

export async function getObject(id) {
  if (!id || isDemo) return null;
  return (await listObjects()).find(o => o.id === id) || null;
}

/** Randa objektą pagal užduoties adresą (pvz. „Taikos pr. 55“ + „Klaipėda“). */
export async function findObject(address, city) {
  if (isDemo || !address) return null;
  const a = splitAddress(city ? `${address}, ${city}` : address);
  const sk = normKey(a.street), hk = normKey(a.house);
  if (!sk || !hk) return null;
  const hits = (await listObjects()).filter(o => o.street_key === sk && o.house_key === hk);
  if (hits.length <= 1) return hits[0] || null;
  return hits.find(o => normKey(o.city) === normKey(a.city)) || null;
}

// ---------------------------------------------------------------------
// Pranešimai (importuojami; pasirenkami pagal registracijos nr.)
// ---------------------------------------------------------------------

/** Paskyrai matomi pranešimai (admin mato visus). */
export async function listReports() {
  if (isDemo) return [];
  const { data, error } = await sb.from('reports').select('*').order('registered_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return data;
}

export async function countReports() {
  if (isDemo) return 0;
  const { count, error } = await sb.from('reports').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

/** Registracijos nr., kuriems jau sukurta užduotis (matomos paskyrai). */
export async function usedReportNos() {
  if (isDemo) return new Set();
  const { data, error } = await sb.from('tasks').select('report_no').not('report_no', 'is', null).limit(5000);
  if (error) throw error;
  return new Set(data.map(r => r.report_no));
}

/** Pranešimų importas (pagal registracijos nr.: naujus įrašo, esamus atnaujina). */
export async function importReports(list, assignedTo) {
  const rows = new Map();
  for (const r of list) {
    const d = new Date(String(r.date || '').replace(' ', 'T'));
    rows.set(r.reg_no, {
      reg_no: r.reg_no, registered_at: isNaN(d) ? null : d.toISOString(),
      address: txt(String(r.address || '').replace(/\s+/g, ' ')), city: txt(r.city),
      report_type: txt(r.report_type), department: txt(r.department), service_type: txt(r.service_type),
      description: txt(r.description), status: txt(r.status), priority_code: txt(r.priority_code),
      engineer: txt(r.engineer), manager: txt(r.manager), order_type: txt(r.order_type), apartment: txt(r.apartment),
      work_label: txt(r.work_label), act_type: txt(r.act_type), reporter: txt(r.reporter),
      contact: txt(r.contact), property_type: txt(r.property_type), assigned_to: assignedTo || null
    });
  }
  const out = [...rows.values()];
  if (!out.length) throw new Error('Faile nerasta pranešimų (tikėtasi eilučių, prasidedančių „V26-…“)');
  for (const part of chunks(out, 100)) {
    const { error } = await sb.from('reports').upsert(part, { onConflict: 'reg_no' });
    if (error) throw error;
  }
  return out.length;
}

export async function countCodes() {
  if (isDemo) return 0;
  const { count, error } = await sb.from('stair_codes').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

/** Objekto laiptinių kodai: [{ stairwell, code }] (surikiuota pagal laiptinę). */
export async function codesFor(obj) {
  if (isDemo || !obj || !obj.street_key || !obj.house_key) return [];
  const { data, error } = await sb.from('stair_codes').select('city,stairwell,code')
    .eq('street_key', obj.street_key).eq('house_key', obj.house_key);
  if (error) throw error;
  const same = data.filter(r => normKey(r.city) === normKey(obj.city));
  const rows = same.length ? same : (new Set(data.map(r => normKey(r.city))).size <= 1 ? data : []);
  const by = new Map();
  rows.forEach(r => { const k = String(r.stairwell || ''); if (!by.has(k)) by.set(k, r.code); });
  return [...by.entries()].map(([stairwell, code]) => ({ stairwell, code }))
    .sort((a, b) => a.stairwell.localeCompare(b.stairwell, 'lt', { numeric: true }));
}

const txt = v => { const s = String(v ?? '').trim(); return s || null; };
const int = v => { const n = parseNum(v); return n === null ? null : Math.round(n); };
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Eilutės stulpelių išdėstymas pagal stulpelių skaičių → [adresas, vadybininkas, projektas, butai, konstruktyvas,
 *  laiptinės, naudingas plotas, plotas, rūsio plotas, renovacija, metai, stogo būklė, danga, stogo plotas, stogo tipas,
 *  šilumos punktas, aukštai]. 18 stulpelių eksportas turi papildomus „Aukštų sk.“ (4) ir vieną nenaudojamą (6). */
const OBJECT_LAYOUTS = {
  18: [0, 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 4],
  16: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, -1]
};
const cap = v => { const s = txt(v); return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/^(.)/, '$1') : null; };
const nz = v => { const n = parseNum(v); return n ? n : null; };            // 0 = nenurodyta
const nzInt = v => { const n = nz(v); return n === null ? null : Math.round(n); };

/** Objektų CSV (kaip sistemos eksportas, 16 arba 18 stulpelių): įrašo arba atnaujina pagal adresą. */
export async function importObjects(rows) {
  if (rows.length && /adresas/i.test(rows[0][0] || '')) rows = rows.slice(1);
  const map = new Map();
  for (const r of rows) {
    const L = OBJECT_LAYOUTS[r.length] || OBJECT_LAYOUTS[16];
    const c = i => (i >= 0 ? r[L[i]] : '');
    const f = i => (L[i] >= 0 ? r[L[i]] : '');
    const a = splitAddress(f(0));
    if (!a.address) continue;
    const roofType = String(f(14) || '').trim().replace(/^plokšcias$/i, 'plokščias');
    map.set(a.address.toLowerCase(), {
      address: a.address, city: txt(a.city), street: txt(a.street), house: txt(a.house),
      street_key: normKey(a.street), house_key: normKey(a.house),
      manager: txt(f(1)), project: txt(f(2)), apartments: nzInt(f(3)), construction: cap(f(4)),
      stairwells: nzInt(f(5)), usable_area: nz(f(6)), area: nz(f(7)), basement_area: parseNum(f(8)),
      renovation: cap(f(9)), built_year: nzInt(f(10)), roof_condition: cap(f(11)), roof_cover: cap(f(12)),
      roof_area: nz(f(13)), roof_type: cap(roofType), heat_point: cap(f(15)), floors: nzInt(f(16))
    });
  }
  const list = [...map.values()];
  for (const part of chunks(list, 250)) {
    const { error } = await sb.from('objects').upsert(part, { onConflict: 'address' });
    if (error) throw error;
  }
  objectsCache = null;
  return list.length;
}
/** Laiptinių kodų CSV (Miestas;Gatvė;Namo nr.;Laiptinė;Kodas): pakeičia visą sąrašą. */
export async function importCodes(rows) {
  if (rows.length && /miestas/i.test(rows[0][0] || '')) rows = rows.slice(1);
  const seen = new Set();
  const list = [];
  for (const r of rows) {
    const [city, street, house, stairwell, code] = r.map(x => String(x ?? '').trim());
    if (!street || !code) continue;
    const k = [city, street, house, stairwell, code].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ city: city || null, street, house, stairwell: stairwell || null, code,
      street_key: normKey(street), house_key: normKey(house) });
  }
  if (!list.length) throw new Error('Faile nerasta kodų');
  const del = await sb.from('stair_codes').delete().not('id', 'is', null);
  if (del.error) throw del.error;
  for (const part of chunks(list, 500)) {
    const { error } = await sb.from('stair_codes').insert(part);
    if (error) throw error;
  }
  return list.length;
}

// ---------------------------------------------------------------------
// DI išmoktos taisyklės (savos kiekvienai paskyrai)
// ---------------------------------------------------------------------

const LS_KEY = 'defektai-lessons';
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (_) { return []; } };
const lsWrite = arr => localStorage.setItem(LS_KEY, JSON.stringify(arr));

/** Visos matomos taisyklės (admin mato visų paskyrų). */
export async function listLessons() {
  if (isDemo) return lsRead();
  const { data, error } = await sb.from('ai_lessons').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data;
}

/** Aktyvių taisyklių tekstai šio tipo aktui (tik savos). */
export async function activeLessons(kind) {
  const me = await getProfile();
  const all = await listLessons();
  return all.filter(l => l.active && l.kind === kind && (isDemo || l.user_id === me.id))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-30).map(l => l.text);
}

export async function addLesson(kind, text, sourceTask = null) {
  text = String(text || '').trim();
  if (!text) return null;
  const me0 = await getProfile();
  const mine = (await listLessons()).filter(l => isDemo || l.user_id === me0.id);
  if (mine.some(l => l.kind === kind && l.text.trim().toLowerCase() === text.toLowerCase())) return null;
  if (isDemo) {
    const row = { id: uuid(), kind, text, active: true, source_task: sourceTask, created_at: new Date().toISOString() };
    lsWrite([row, ...lsRead()]);
    return row;
  }
  const me = await getProfile();
  const { data, error } = await sb.from('ai_lessons')
    .insert({ user_id: me.id, kind, text, source_task: sourceTask }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateLesson(id, patch) {
  if (isDemo) { lsWrite(lsRead().map(l => l.id === id ? { ...l, ...patch } : l)); return; }
  const { error } = await sb.from('ai_lessons').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteLesson(id) {
  if (isDemo) { lsWrite(lsRead().filter(l => l.id !== id)); return; }
  const { error } = await sb.from('ai_lessons').delete().eq('id', id);
  if (error) throw error;
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
