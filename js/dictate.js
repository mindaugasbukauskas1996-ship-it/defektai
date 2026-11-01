// Diktavimas garsu: įrašome mikrofoną (veikia ir iPhone programėlėje), o lietuvišką tekstą
// atpažįsta serveris (Edge funkcija „transcribe“). Įrašo ilgis ribojamas.

import * as db from './data.js';
import { icon } from './icons.js';
import { toast } from './util.js';

const MAX_MS = 4 * 60 * 1000;

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
}

const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Pririša mygtuką: spaudžiate – įrašo, dar kartą – sustabdo ir įrašo atpažintą tekstą per onText(tekstas). */
export function bindDictation(btn, onText, label = 'Diktuoti') {
  let stop = null;
  const idle = () => { btn.hidden = false; btn.disabled = false; btn.classList.remove('rec'); btn.innerHTML = `${icon('mic')} ${label}`; };

  btn.addEventListener('click', async () => {
    if (stop) return stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      return toast('Ši naršyklė nepalaiko garso įrašymo.', 'error');
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { return toast('Mikrofonas neleistas. Leiskite jį telefono / naršyklės nustatymuose ir bandykite dar kartą.', 'error', 7000); }

    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const t0 = Date.now();
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const tick = setInterval(() => { btn.innerHTML = `${icon('mic')} Įrašoma ${clock(Date.now() - t0)} – sustabdyti`; }, 500);
    const limit = setTimeout(() => stop && stop(), MAX_MS);

    rec.onstop = async () => {
      clearInterval(tick); clearTimeout(limit); stop = null;
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      if (blob.size < 2000) { idle(); return toast('Įrašas per trumpas.', 'error'); }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Atpažįstama...';
      try {
        const text = await db.transcribe(blob);
        if (text) onText(text); else toast('Žodžių neatpažinta – bandykite dar kartą.', 'error');
      } catch (e) { toast(e.message || String(e), 'error', 9000); }
      finally { idle(); }
    };

    stop = () => { if (rec.state !== 'inactive') rec.stop(); };
    rec.start();
    btn.classList.add('rec');
    btn.innerHTML = `${icon('mic')} Įrašoma 0:00 – sustabdyti`;
  });

  idle();
}
