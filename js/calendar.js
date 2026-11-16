// Vizitų kalendorius: sutarti susitikimai su gyventojais (tasks.visit_at), pridėjimas į Google kalendorių ir .ics failas.
// Dvipusio sinchronizavimo su Google nėra: kiekvieną vizitą galima vienu paspaudimu įkelti į savo Google kalendorių
// arba parsisiųsti .ics (tinka ir Outlook / iPhone kalendoriui).

import * as db from './data.js';
import { icon } from './icons.js';
import { esc, toast } from './util.js';

const pad = n => String(n).padStart(2, '0');
const VISIT_MIN = 60;                                    // numatoma vizito trukmė

/** ISO → reikšmė <input type="datetime-local"> (vietos laikas). */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** <input type="datetime-local"> reikšmė → ISO (UTC) arba null. */
export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

const utc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const place = t => [t.address, t.city].filter(Boolean).join(', ');
const title = t => `Vizitas: ${[t.address, t.apartment ? 'bt. ' + t.apartment : ''].filter(Boolean).join(', ')}`;
const details = t => [
  t.problem, t.contact_name ? `Kontaktas: ${t.contact_name}${t.contact_phone ? ' ' + t.contact_phone : ''}` : (t.contact_phone ? `Tel.: ${t.contact_phone}` : ''),
  t.stairwell ? `Laiptinė: ${t.stairwell}` : '', t.entry_code ? `Kodas: ${t.entry_code}` : '',
  `${location.origin}${location.pathname}#/u/${t.id}`
].filter(Boolean).join('\n');

export function googleUrl(t) {
  const s = new Date(t.visit_at), e = new Date(s.getTime() + VISIT_MIN * 60000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title(t), dates: `${utc(s)}/${utc(e)}`, details: details(t), location: place(t) });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
export function icsText(tasks) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Defektu aktai//LT', 'CALSCALE:GREGORIAN'];
  for (const t of tasks) {
    if (!t.visit_at) continue;
    const s = new Date(t.visit_at), e = new Date(s.getTime() + VISIT_MIN * 60000);
    lines.push('BEGIN:VEVENT', `UID:${t.id}@defektai`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(s)}`, `DTEND:${utc(e)}`,
      `SUMMARY:${icsEsc(title(t))}`, `LOCATION:${icsEsc(place(t))}`, `DESCRIPTION:${icsEsc(details(t))}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function saveIcs(tasks, name) {
  const url = URL.createObjectURL(new Blob([icsText(tasks)], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Mygtukai „Į Google kalendorių“ / „.ics“ užduoties kortelei. */
export function calendarButtons(t) {
  if (!t.visit_at) return '';
  return `<div class="kv"><span>Kalendorius</span><span class="head-btns">
    <a class="btn small" target="_blank" rel="noopener" href="${esc(googleUrl(t))}">${icon('plus')} Į Google kalendorių</a>
    <button class="btn small ghost" type="button" data-ics="${esc(t.id)}">.ics</button></span></div>`;
}
export function bindCalendarButtons(root, t) {
  root.querySelectorAll(`[data-ics="${t.id}"]`).forEach(b => b.addEventListener('click', () => saveIcs([t], 'vizitas.ics')));
}

const DAY = ['sekmadienis', 'pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis'];
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function dayLabel(key) {
  const d = new Date(key + 'T12:00:00'), t0 = new Date(); t0.setHours(12, 0, 0, 0);
  const diff = Math.round((d - t0) / 86400000);
  const base = `${key} · ${DAY[d.getDay()]}`;
  return diff === 0 ? `Šiandien · ${base}` : diff === 1 ? `Rytoj · ${base}` : base;
}

let showPast = false;

/** Maršrutas #/kalendorius – vizitai pagal dienas. */
export async function renderCalendar(el) {
  el.innerHTML = '<div class="loading">Kraunama...</div>';
  const all = await db.listVisits();
  if (all === null) {
    el.innerHTML = '<div class="page-head"><h1>Vizitai</h1></div><div class="card">Kalendoriui reikia vieno karto atliekamo duomenų bazės papildymo (stulpelis „visit_at“). Kreipkitės į administratorių.</div>';
    return;
  }
  const now = Date.now();
  const list = all.filter(t => showPast ? new Date(t.visit_at).getTime() < now : new Date(t.visit_at).getTime() >= now - 3600000)
    .sort((a, b) => showPast ? b.visit_at.localeCompare(a.visit_at) : a.visit_at.localeCompare(b.visit_at));
  const groups = new Map();
  for (const t of list) {
    const k = dayKey(new Date(t.visit_at));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  el.innerHTML = `
    <div class="page-head"><h1>Vizitai</h1>
      <span class="head-btns">
        <button class="btn ghost" id="cal-toggle" type="button">${showPast ? 'Rodyti būsimus' : 'Rodyti praėjusius'}</button>
        ${list.length ? `<button class="btn" id="cal-ics" type="button">.ics (visi)</button>` : ''}
      </span></div>
    <div class="muted small" style="margin-bottom:10px">Vizito laiką įrašote užduoties redagavimo formoje („Susitikimas su gyventoju“). Čia matote visus sutartus vizitus; kiekvieną galima vienu paspaudimu įkelti į savo Google kalendorių.</div>
    ${groups.size ? [...groups].map(([k, arr]) => `
      <div class="card"><div class="card-title">${esc(dayLabel(k))}</div>
        ${arr.map(t => `<div class="kv" style="align-items:flex-start;gap:10px">
          <b style="min-width:3.2em">${pad(new Date(t.visit_at).getHours())}:${pad(new Date(t.visit_at).getMinutes())}</b>
          <span style="flex:1"><a href="#/u/${esc(t.id)}"><b>${esc(place(t) || '(be adreso)')}</b>${t.apartment ? ` · bt. ${esc(t.apartment)}` : ''}</a>
            <div class="muted small">${esc([t.problem, t.contact_name, t.contact_phone].filter(Boolean).join(' · '))}</div></span>
          <a class="btn small" target="_blank" rel="noopener" href="${esc(googleUrl(t))}" title="Pridėti į Google kalendorių">${icon('plus')} Google</a>
        </div>`).join('')}
      </div>`).join('') : `<div class="empty card">${showPast ? 'Praėjusių vizitų nėra.' : 'Būsimų vizitų nėra.'}</div>`}`;
  el.querySelector('#cal-toggle').addEventListener('click', () => { showPast = !showPast; renderCalendar(el); });
  const ics = el.querySelector('#cal-ics');
  if (ics) ics.addEventListener('click', () => { saveIcs(list, 'vizitai.ics'); toast('Failas paruoštas', 'ok'); });
}
