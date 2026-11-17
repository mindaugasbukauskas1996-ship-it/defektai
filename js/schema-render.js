// =====================================================================
// Principinių schemų perbraižymas: JSON aprašas → švarus SVG (be DI).
// DI tik „skaito“ nuotrauką į šį JSON (hp-schema, veiksmas „extract“), o braižo šis modulis iš fiksuotos simbolių bibliotekos,
// todėl simboliai vienodi, o klaidas galima taisyti JSON lygmeniu (veiksmas „verify“ → applyCorrections).
// Simboliai paimti iš pavyzdinio rendererio (Baltijos pr. 79 schema).
//
// Koordinatės JSON: normalizuotos 0–1000 abiem ašims pagal visą (ištiesintą) lapą; x → dešinėn, y → žemyn.
// Modelis:
//  { title, aspect (aukštis/plotis, pvz. 0.707), pipes:[{id,name,pts:[[x,y]..],style:'solid'|'control'}],
//    junctions:[{x,y}], crossings:[{x,y}], boxes:[{id,kind:'exchanger'|'box'|'vessel'|'region',x,y,w,h,text:[..],dashed}],
//    symbols:[{id,type,x,y,dir:'h'|'v',side:'up'|'down',dn,kvs,text,d:1|-1}], labels:[{id,x,y,text,size,anchor,color,bold,rot}],
//    positions:[{id,x,y,text}], title_block:{object,document,client,code,sheet} }
// =====================================================================

export const SYMBOL_TYPES = ['valve', 'check_valve', 'strainer', 'pump', 'pressure_gauge', 'thermometer', 'temp_sleeve', 'temp_sensor',
  'sr_sensor', 'motor_valve', 'regulator', 'drain_valve', 'safety_valve', 'flange', 'flowmeter', 'pipe_break', 'boundary_mark'];

const RED = '#d0161b';
const W = 2100;
const LIMITS = { pipes: 200, symbols: 400, labels: 400, positions: 120, boxes: 60, junctions: 300, crossings: 100 };

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const r1 = v => Math.round(v * 10) / 10;

// ---- primityvai (grąžina SVG fragmentus) ----
const line = (x1, y1, x2, y2, w = 2.2, c = '#000', dash = null) =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const pl = (pts, w = 2.2, c = '#000', dash = null) =>
  `<polyline points="${pts.map(p => `${r1(p[0])},${r1(p[1])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const poly = (pts, fill = '#fff', w = 1.8, c = '#000') =>
  `<polygon points="${pts.map(p => `${r1(p[0])},${r1(p[1])}`).join(' ')}" fill="${fill}" stroke="${c}" stroke-width="${w}"/>`;
const circ = (x, y, r, fill = '#fff', w = 1.8) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${fill}" stroke="#000" stroke-width="${w}"/>`;
const rect = (x, y, w, h, fill = '#fff', sw = 1.6, rx = 0, dash = null) =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${rx ? ` rx="${rx}"` : ''} fill="${fill}" stroke="#000" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const text = (x, y, s, size = 15, anchor = 'middle', c = '#000', bold = false, rot = null) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" text-anchor="${anchor}" fill="${c}"${bold ? ' font-weight="bold"' : ''}${rot ? ` transform="rotate(${rot} ${r1(x)} ${r1(y)})"` : ''}>${esc(s)}</text>`;
const lbl = (x, y, s) => (s ? text(x, y, s, 13, 'middle', RED) : '');

// ---- simboliai ant horizontalaus vamzdžio (centras x,y); vertikaliems – pasukama 90° ----
const SYM = {
  valve: (x, y, o) => poly([[x - 12, y - 9], [x + 12, y + 9], [x + 12, y - 9], [x - 12, y + 9]]) + (o.dn ? lbl(x, o.up ? y - 14 : y + 24, o.dn) : ''),
  check_valve: (x, y, o) => { const d = o.d; return poly([[x - 10 * d, y - 9], [x - 10 * d, y + 9], [x + 8 * d, y]], '#000') + line(x + 9 * d, y - 10, x + 9 * d, y + 10, 2) + lbl(x, y + 24, o.dn); },
  strainer: (x, y) => poly([[x - 12, y], [x + 12, y], [x + 6, y + 24], [x - 12, y + 24]]) + line(x - 12, y + 3, x + 4, y + 21, 1.2),
  pump: (x, y, o) => { const d = o.d; return circ(x, y, 14) + poly([[x - 7 * d, y - 8], [x - 7 * d, y + 8], [x + 10 * d, y]], '#000', 1) + lbl(x, y + 30, o.dn); },
  pressure_gauge: (x, y, o) => {
    const s = o.up ? -1 : 1;
    return line(x, y, x, y + s * 42, 1.6) + poly([[x - 6, y + s * 12], [x + 6, y + s * 24], [x + 6, y + s * 12], [x - 6, y + s * 24]], '#fff', 1.4) +
      circ(x, y + s * 54, 12) + line(x, y + s * 54, x + 8, y + s * 54 - 8, 1.4) + (o.text ? text(x + 22, o.up ? y + s * 54 - 6 : y + s * 54 + 4, o.text, 11, 'start') : '');
  },
  thermometer: (x, y, o) => {
    const s = o.up ? -1 : 1;
    return line(x, y, x, y + s * 26, 1.6) + circ(x, y + s * 38, 12) + line(x, y + s * 30, x, y + s * 44, 1.6) + circ(x, y + s * 44, 3, '#000', 1);
  },
  temp_sleeve: (x, y) => rect(x - 14, y - 26, 28, 12, '#fff', 1.6, 6) + line(x, y - 14, x, y, 1.6),
  temp_sensor: (x, y, o) => { const s = o.up ? -1 : 1; return line(x, y, x + 14, y + s * 30, 1.6); },
  sr_sensor: (x, y) => line(x, y, x, y - 30, 1.6) + rect(x - 14, y - 48, 28, 18, '#fff', 1.4) + text(x, y - 34, 'SR', 11),
  motor_valve: (x, y, o) => SYM.valve(x, y, {}) + line(x, y, x, y - 30, 1.6) + rect(x - 12, y - 54, 24, 24, '#fff', 1.6) + text(x, y - 36, 'M', 14, 'middle', '#000', true) + lbl(x - 20, y + 28, o.kvs),
  regulator: (x, y, o) => SYM.valve(x, y, {}) + line(x, y, x, y - 26, 1.6) +
    `<path d="M${r1(x - 18)},${r1(y - 26)} A18,12 0 0 1 ${r1(x + 18)},${r1(y - 26)} Z" fill="#fff" stroke="#000" stroke-width="1.6"/>` + lbl(x, y + 28, o.kvs),
  drain_valve: (x, y, o) => {
    const s = o.up ? -1 : 1;
    return line(x, y, x, y + s * 36, 1.6) + poly([[x - 7, y + s * 14], [x + 7, y + s * 30], [x - 7, y + s * 30], [x + 7, y + s * 14]], '#fff', 1.4) + lbl(x - 26, y + s * 50 + (o.up ? 0 : 4), o.dn);
  },
  safety_valve: (x, y, o) => {
    const s = o.up ? -1 : 1;
    return line(x, y, x, y + s * 16, 1.6) + poly([[x - 7, y + s * 16], [x + 7, y + s * 16], [x, y + s * 28]], '#fff', 1.4) + line(x, y + s * 28, x + 20, y + s * 28, 1.6) +
      pl([[x, y + s * 28], [x - 5, y + s * 32], [x + 5, y + s * 36], [x - 5, y + s * 40], [x + 5, y + s * 44], [x, y + s * 48]], 1.2);
  },
  flange: (x, y) => line(x - 3, y - 11, x - 3, y + 11, 2) + line(x + 3, y - 11, x + 3, y + 11, 2),
  flowmeter: (x, y) => circ(x, y, 15) + line(x - 9, y + 9, x + 9, y - 9, 1.6) + poly([[x + 9, y - 9], [x + 1, y - 6], [x + 6, y - 1]], '#000', 1),
  pipe_break: (x, y) => `<path d="M${r1(x)},${r1(y - 10)} q-8,5 0,10 q8,5 0,10" fill="none" stroke="#000" stroke-width="1.8"/>`,
  boundary_mark: (x, y) => poly([[x - 9, y - 26], [x + 9, y - 26], [x, y - 12]], RED, 1, RED) + poly([[x - 9, y + 26], [x + 9, y + 26], [x, y + 12]], RED, 1, RED) + line(x, y - 28, x, y + 28, 1.4, RED)
};
const DEFAULT_UP = new Set(['pressure_gauge', 'thermometer', 'temp_sensor', 'valve']);     // be nurodytos pusės – į viršų

function clamp(v) { return Math.min(1000, Math.max(0, n(v))); }

/** Sutvarko (ir apriboja) modelį: nežinomi tipai, per daug elementų, blogos koordinatės. */
export function normalizeModel(m) {
  m = m && typeof m === 'object' ? m : {};
  const arr = (k) => (Array.isArray(m[k]) ? m[k] : []).slice(0, LIMITS[k] || 100).filter(x => x && typeof x === 'object');
  const out = {
    title: String(m.title || '').slice(0, 200),
    aspect: Math.min(1.2, Math.max(0.4, n(m.aspect, 0.707))),
    pipes: arr('pipes').map(p => ({ ...p, pts: (Array.isArray(p.pts) ? p.pts : []).slice(0, 60).map(q => [clamp(q[0]), clamp(q[1])]) })).filter(p => p.pts.length >= 2),
    junctions: arr('junctions'), crossings: arr('crossings'),
    boxes: arr('boxes'), symbols: arr('symbols').filter(s => SYMBOL_TYPES.includes(s.type)),
    labels: arr('labels'), positions: arr('positions'),
    title_block: m.title_block && typeof m.title_block === 'object' ? m.title_block : null
  };
  let k = 0;
  for (const key of ['pipes', 'boxes', 'symbols', 'labels', 'positions']) for (const e of out[key]) if (!e.id) e.id = key[0] + (++k);
  return out;
}

/** JSON → SVG tekstas. Grąžina { svg, w, h }. */
export function renderSchema(model) {
  const m = normalizeModel(model);
  const H = Math.round(W * m.aspect);
  const X = v => clamp(v) * W / 1000, Y = v => clamp(v) * H / 1000;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="DejaVu Sans, Arial, sans-serif">`);
  o.push(`<rect width="${W}" height="${H}" fill="#fff"/>`, rect(20, 20, W - 40, H - 40, 'none', 2));
  if (m.title) o.push(text(W / 2, 80, m.title, 42, 'middle', '#000', true));

  for (const b of m.boxes) {                                    // dėžės po vamzdžiais
    const x = X(b.x), y = Y(b.y), w = clamp(b.w) * W / 1000, h = clamp(b.h) * H / 1000;
    if (b.kind === 'region') { o.push(rect(x, y, w, h, 'none', 1.4, 0, '10,6')); if (b.text && b.text[0]) o.push(text(x + w / 2, y - 12, [].concat(b.text)[0], 17, 'middle', '#000', true)); continue; }
    if (b.kind === 'exchanger') { o.push(rect(x, y, w, h, '#fff', 2.4), line(x, y + h, x + w, y, 1.6)); continue; }
    o.push(rect(x, y, w, h, '#fff', b.kind === 'vessel' ? 1.8 : 1.6, b.kind === 'vessel' ? Math.min(w, h) / 2.2 : 0, b.dashed ? '8,5' : null));
    [].concat(b.text || []).slice(0, 6).forEach((s, i, a) => o.push(text(x + w / 2, y + h / 2 + (i - (a.length - 1) / 2) * 17 + 5, s, 14)));
  }
  for (const p of m.pipes) {
    const pts = p.pts.map(q => [X(q[0]), Y(q[1])]);
    o.push(p.style === 'control' ? pl(pts, 1.2, '#555', '6,4') : pl(pts, 2.2));
  }
  for (const c of m.crossings) o.push(`<rect x="${r1(X(c.x) - 9)}" y="${r1(Y(c.y) - 3)}" width="18" height="6" fill="#fff"/>`);
  for (const j of m.junctions) o.push(circ(X(j.x), Y(j.y), 4, '#000', 1));
  for (const s of m.symbols) {
    const f = SYM[s.type];
    const up = s.side ? s.side === 'up' : (DEFAULT_UP.has(s.type) ? true : s.type === 'drain_valve' || s.type === 'safety_valve' ? false : true);
    const x = X(s.x), y = Y(s.y);
    const g = f(x, y, { dn: s.dn ? esc(s.dn) : '', kvs: s.kvs ? esc(s.kvs) : '', text: s.text ? String(s.text).slice(0, 20) : '', up, d: s.d === -1 ? -1 : 1 });
    o.push(s.dir === 'v' ? `<g transform="rotate(90 ${r1(x)} ${r1(y)})">${g}</g>` : g);
  }
  for (const l of m.labels) o.push(text(X(l.x), Y(l.y), String(l.text || '').slice(0, 120), Math.min(40, Math.max(9, n(l.size, 15))), ['start', 'end'].includes(l.anchor) ? l.anchor : 'middle', l.color === 'red' ? RED : '#000', !!l.bold, n(l.rot) || null));
  for (const p of m.positions) o.push(text(X(p.x), Y(p.y), String(p.text || '').slice(0, 12), 36, 'middle', RED, true));
  const tb = m.title_block;
  if (tb) {                                                      // supaprastintas spaudas apačioje dešinėje
    const x0 = W * 0.52, y0 = H - 270, w = W - 20 - x0, h = 250;
    o.push(rect(x0, y0, w, h, '#fff', 2), line(x0, y0 + 60, W - 20, y0 + 60, 1.4), line(x0, y0 + 150, W - 20, y0 + 150, 1.4), line(x0 + 170, y0, x0 + 170, y0 + h, 1.4));
    o.push(text(x0 + 10, y0 + 22, 'Statinys', 13, 'start'), text(x0 + 185, y0 + 36, String(tb.object || '').slice(0, 110), 16, 'start'));
    o.push(text(x0 + 10, y0 + 82, 'Dokumentas', 13, 'start'), text(x0 + 185, y0 + 112, String(tb.document || '').slice(0, 60), 22, 'start', '#000', true));
    o.push(text(x0 + 10, y0 + 172, 'Statytojas', 13, 'start'), text(x0 + 185, y0 + 187, String(tb.client || '').slice(0, 80), 16, 'start'));
    o.push(text(x0 + 10, y0 + 232, 'Žymuo', 13, 'start'), text(x0 + 185, y0 + 240, String(tb.code || '').slice(0, 60), 16, 'start', '#000', true));
    if (tb.sheet) o.push(text(x0 + w - 12, y0 + 240, String(tb.sheet).slice(0, 40), 14, 'end'));
  }
  o.push('</svg>');
  return { svg: o.join('\n'), w: W, h: H };
}

/** SVG → PNG (naršyklėje). */
export async function svgToPng(svg, w, h, outW = 2400, type = 'image/png') {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Nepavyko atvaizduoti schemos')); i.src = url; });
    const c = document.createElement('canvas'); c.width = outW; c.height = Math.round(outW * h / w);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, type, type === 'image/jpeg' ? 0.92 : undefined));
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Pataisos iš patikros: [{ op: 'add'|'remove'|'move'|'change', kind: 'symbols'|'pipes'|'labels'|'positions'|'boxes'|'junctions'|'crossings', id?, item?, patch? }].
 * Grąžina naują modelį ir pritaikytų pataisų skaičių.
 */
export function applyCorrections(model, corrections) {
  const m = JSON.parse(JSON.stringify(normalizeModel(model)));
  let done = 0;
  for (const c of (Array.isArray(corrections) ? corrections : []).slice(0, 60)) {
    const list = m[c && c.kind];
    if (!Array.isArray(list)) continue;
    if (c.op === 'add' && c.item && typeof c.item === 'object') { list.push(c.item); done++; continue; }
    const i = list.findIndex(e => e.id && e.id === c.id);
    if (i < 0) continue;
    if (c.op === 'remove') { list.splice(i, 1); done++; }
    else if ((c.op === 'move' || c.op === 'change') && c.patch && typeof c.patch === 'object') { Object.assign(list[i], c.patch); done++; }
  }
  return { model: normalizeModel(m), applied: done };
}
