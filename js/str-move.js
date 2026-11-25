// Defektų akte STR nuorodos rašomos ne prie kiekvieno objekto, o išvadoje („Teisinis pagrindas“).
// DI nuorodas dažniausiai deda objekto teksto gale skliaustuose – čia jos iškeliamos į išvadą.

const MARK = 'Teisinis pagrindas';

/** Nuo teksto galo atskiria skliaustus, kuriuose prasideda „STR …“. Grąžina { text, ref } (ref – nuorodos turinys arba ''). */
export function splitTrailingStr(text) {
  let s = String(text || '').replace(/\s+$/, '');
  if (!s.endsWith(')')) return { text: s, ref: '' };
  let depth = 0, i = s.length - 1;
  for (; i >= 0; i--) {
    if (s[i] === ')') depth++;
    else if (s[i] === '(' && --depth === 0) break;
  }
  if (i < 0) return { text: s, ref: '' };
  const inner = s.slice(i + 1, -1).trim();
  if (!/^STR\s/.test(inner)) return { text: s, ref: '' };
  return { text: s.slice(0, i).replace(/[\s,;]+$/, ''), ref: inner };
}

export const hasStrInObjects = d => ((d && d.objects) || []).some(o => splitTrailingStr(o.defects).ref);

/**
 * Perkelia objektų STR nuorodas į išvadą. Keičia d vietoje. Nuorodos sujungiamos, pasikartojančios išmetamos.
 * Jei išvadoje jau yra „Teisinis pagrindas“, nauja nuorodų eilutė pridedama prie jos.
 */
export function moveStrToSummary(d) {
  if (!d || !Array.isArray(d.objects)) return d;
  const refs = [];
  const seen = new Set();
  for (const o of d.objects) {
    const r = splitTrailingStr(o.defects);
    if (!r.ref) continue;
    o.defects = r.text;
    for (const part of r.ref.split(';').map(x => x.trim()).filter(Boolean)) {
      const k = part.toLowerCase();
      if (!seen.has(k)) { seen.add(k); refs.push(part); }
    }
  }
  if (!refs.length) return d;
  const line = `${MARK}: ${refs.join('; ')}.`;
  const sum = String(d.summary || '').trim();
  d.summary = sum ? `${sum}\n\n${line}` : line;
  return d;
}
