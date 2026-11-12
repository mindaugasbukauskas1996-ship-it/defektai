// =====================================================================
// Schemos nuotraukos „nuskenavimas“: iš telefonu darytos nuotraukos – tiesi,
// nukirpta, nespalvota (kaip skenuota) schema be rašysenos ir parašų.
// DI (hp-schema, mode: 'scan') tik nurodo lapo kampus, pasukimą ir sritis,
// kur yra ranka rašyta; paveikslėlį apdoroja ši naršyklės dalis.
// =====================================================================

/** Homografija: išvesties stačiakampis (0,0)-(W,H) → šaltinio keturkampis q = [TL, TR, BR, BL]. */
function homography(W, H, q) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let i = 0; i < 8; i++) {                               // Gauso eliminavimas
    let m = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < 8; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const h = new Array(8);
  for (let i = 7; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < 8; c++) s -= A[i][c] * h[c];
    h[i] = s / A[i][i];
  }
  return h;
}

const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * blob – nuotrauka; spec – { rotate: 0|90|180|270, corners: [{x,y}×4 (TL,TR,BR,BL, 0..1)], erase: [{x,y,w,h}] (0..1 apdoroto vaizdo) }.
 * Grąžina JPEG blob (nespalvotas, ištiesintas).
 */
export async function makeScan(blob, spec) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const rot = ((Number(spec.rotate) || 0) % 360 + 360) % 360;
  const sw = rot % 180 ? bmp.height : bmp.width, sh = rot % 180 ? bmp.width : bmp.height;
  const c0 = document.createElement('canvas'); c0.width = sw; c0.height = sh;
  const g0 = c0.getContext('2d');
  g0.translate(sw / 2, sh / 2); g0.rotate(rot * Math.PI / 180); g0.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  const src = g0.getImageData(0, 0, sw, sh);

  // lapo kampai (jei DI nenurodė – visas vaizdas)
  let q = (Array.isArray(spec.corners) && spec.corners.length === 4) ? spec.corners.map(p => [clamp01(p.x) * (sw - 1), clamp01(p.y) * (sh - 1)]) : [[0, 0], [sw - 1, 0], [sw - 1, sh - 1], [0, sh - 1]];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  if (W < 200 || H < 200) { q = [[0, 0], [sw - 1, 0], [sw - 1, sh - 1], [0, sh - 1]]; W = sw; H = sh; }
  const k = Math.min(1, 2600 / Math.max(W, H));
  const ow = Math.round(W * k), oh = Math.round(H * k);
  const h = homography(ow, oh, q);

  // atvirkštinis atvaizdavimas su bilinear mėginiais → pilkumo masyvas
  const gray = new Float32Array(ow * oh);
  const sd = src.data;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const z = h[6] * x + h[7] * y + 1;
      const u = (h[0] * x + h[1] * y + h[2]) / z, v = (h[3] * x + h[4] * y + h[5]) / z;
      const x0 = Math.floor(u), y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { gray[y * ow + x] = 255; continue; }
      const fx = u - x0, fy = v - y0, i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const px = i => 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      gray[y * ow + x] = (px(i00) * (1 - fx) + px(i10) * fx) * (1 - fy) + (px(i01) * (1 - fx) + px(i11) * fx) * fy;
    }
  }

  // apšvietimo išlyginimas: fonas = stipriai sumažintas ir vėl padidintas vaizdas
  const bs = 24, bw = Math.ceil(ow / bs), bh = Math.ceil(oh / bs);
  const bg = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const vals = [];
    for (let yy = by * bs; yy < Math.min(oh, (by + 1) * bs); yy += 3) for (let xx = bx * bs; xx < Math.min(ow, (bx + 1) * bs); xx += 3) vals.push(gray[yy * ow + xx]);
    vals.sort((a, b) => a - b);
    bg[by * bw + bx] = vals[Math.floor(vals.length * 0.9)] || 255;           // šviesiausi taškai = popierius
  }
  const out = document.createElement('canvas'); out.width = ow; out.height = oh;
  const og = out.getContext('2d'), img = og.createImageData(ow, oh), od = img.data;
  for (let y = 0; y < oh; y++) {
    const fy = Math.min(bh - 1.001, Math.max(0, y / bs - 0.5)), y1 = Math.floor(fy), ty = fy - y1;
    for (let x = 0; x < ow; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, x / bs - 0.5)), x1 = Math.floor(fx), tx = fx - x1;
      const b = (bg[y1 * bw + x1] * (1 - tx) + bg[y1 * bw + x1 + 1] * tx) * (1 - ty) + (bg[(y1 + 1) * bw + x1] * (1 - tx) + bg[(y1 + 1) * bw + x1 + 1] * tx) * ty;
      let v = gray[y * ow + x] / Math.max(60, b);                              // 1 = popierius
      v = (v - 0.5) / (0.9 - 0.5);                                             // kontrastas: juoda / balta
      v = Math.max(0, Math.min(1, v));
      v = v * v * (3 - 2 * v);
      const o = (y * ow + x) * 4, c = Math.round(v * 255);
      od[o] = od[o + 1] = od[o + 2] = c; od[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);

  // ranka rašytos vietos (rašysena, parašai, antspaudai) – baltai
  og.fillStyle = '#fff';
  for (const e of spec.erase || []) {
    const ex = clamp01(e.x) * ow, ey = clamp01(e.y) * oh, ew = clamp01(e.w) * ow, eh = clamp01(e.h) * oh;
    og.fillRect(ex - 4, ey - 4, ew + 8, eh + 8);
  }
  return new Promise(res => out.toBlob(res, 'image/jpeg', 0.9));
}
