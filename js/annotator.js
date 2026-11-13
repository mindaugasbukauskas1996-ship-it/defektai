// =====================================================================
// Nuotraukų žymėjimo redaktorius (pelė ir lietimas).
// Žymės saugomos vektoriškai (galima vėliau redaguoti) ir
// sugeneruojama pažymėta JPEG kopija aktams ir DI.
// =====================================================================

import { icon } from './icons.js';
import { esc } from './util.js';

const TOOLS = [
  { id: 'rect', label: 'Stačiakampis', svg: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
  { id: 'ellipse', label: 'Elipsė', svg: '<ellipse cx="12" cy="12" rx="9" ry="6"/>' },
  { id: 'arrow', label: 'Rodyklė', svg: '<path d="M5 19L19 5M19 5h-8M19 5v8"/>' },
  { id: 'pen', label: 'Laisva linija', svg: '<path d="M3 17c3-6 6 2 9-4s5-6 9-2"/>' },
  { id: 'num', label: 'Numeris', svg: '<circle cx="12" cy="12" r="9"/><path d="M11 8l2-1v10"/>' },
  { id: 'text', label: 'Tekstas', svg: '<path d="M5 6h14M12 6v13"/>' },
  { id: 'erase', label: 'Trinti žymę', svg: '<path d="M20 20H8l-5-5 10-10 8 8-6 6"/>' },
  { id: 'pan', label: 'Stumdyti', svg: '<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6m0-1V4a1.5 1.5 0 0 1 3 0v7m0-5a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.5-1.5L8 14"/>' }
];
const ZOOM_MAX = 8;
const COLORS = ['#e53935', '#ffd600', '#00e5ff', '#76ff03', '#ffffff', '#111111'];
const WIDTHS = [{ id: 1, label: 'S' }, { id: 2, label: 'M' }, { id: 3, label: 'L' }];

export function openAnnotator({ blob, shapes = [], title = '' }) {
  return new Promise(async resolve => {
    const img = await loadImage(blob);
    const W = img.naturalWidth, H = img.naturalHeight;
    const u = Math.max(W, H) / 1000;
    const all = JSON.parse(JSON.stringify(shapes || []));
    const st = {
      tool: 'rect', color: COLORS[0], wl: 2,
      shapes: all.filter(s => s.t !== 'crop'),       // „crop“ – išsaugota pritraukta sritis, ne žymė
      crop: all.find(s => s.t === 'crop') || null,
      cropOn: !!all.find(s => s.t === 'crop'),
      z: 1,
      undo: [], redo: [], cur: null
    };

    const root = document.createElement('div');
    root.className = 'annot';
    root.innerHTML = `
      <div class="an-bar">
        <div class="an-tools">
        <div class="an-group tools">
          ${TOOLS.map(t => `<button class="an-btn" data-tool="${t.id}" title="${t.label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.svg}</svg><span>${t.label}</span></button>`).join('')}
        </div>
        <div class="an-group">
          ${COLORS.map(c => `<button class="an-color" data-color="${c}" style="background:${c}" title="Spalva"></button>`).join('')}
        </div>
        <div class="an-group">
          ${WIDTHS.map(w => `<button class="an-btn w" data-w="${w.id}" title="Storis">${w.label}</button>`).join('')}
        </div>
        <div class="an-group">
          <button class="an-btn" data-cmd="zout" title="Nutolinti">−</button>
          <button class="an-btn" data-cmd="zin" title="Pritraukti">+</button>
          <button class="an-btn" data-cmd="zfit" title="Visa nuotrauka">1:1</button>
          <button class="an-btn" data-cmd="crop" title="Išsaugoti tik matomą (pritrauktą) sritį"><span style="display:inline">Kirpti</span></button>
        </div>
        <div class="an-group">
          <button class="an-btn" data-cmd="undo" title="Atšaukti (Ctrl+Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg></button>
          <button class="an-btn" data-cmd="redo" title="Pakartoti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg></button>
          <button class="an-btn" data-cmd="clear" title="Išvalyti viską">${icon('trash')}</button>
        </div>
        </div>
        <div class="an-title">${esc(title)}</div>
        <div class="an-group end">
          <button class="btn ghost" data-cmd="cancel">Atšaukti</button>
          <button class="btn primary" data-cmd="save">${icon('check')} Išsaugoti</button>
        </div>
      </div>
      <div class="an-stage"><canvas></canvas><input class="an-text" type="text" placeholder="Tekstas, Enter – patvirtinti" hidden></div>`;
    if (document.activeElement) document.activeElement.blur();
    document.body.appendChild(root);
    document.body.classList.add('no-scroll');

    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    const stage = root.querySelector('.an-stage');
    const textInp = root.querySelector('.an-text');

    function fit() {
      const r = stage.getBoundingClientRect();
      const k = Math.min((r.width - 16) / W, (r.height - 16) / H);
      canvas.style.width = Math.max(50, W * k * st.z) + 'px';
      canvas.style.height = Math.max(50, H * k * st.z) + 'px';
    }
    fit();
    window.addEventListener('resize', fit);

    /** Keičia mastelį (1 = visa nuotrauka) išlaikant tašką (cx, cy) po žymekliu. */
    function zoomAt(z, cx, cy) {
      z = Math.min(ZOOM_MAX, Math.max(1, z));
      const r = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
      cx = cx ?? (s.left + s.width / 2); cy = cy ?? (s.top + s.height / 2);
      const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
      st.z = z; fit();
      const r2 = canvas.getBoundingClientRect();
      stage.scrollLeft += (r2.left + fx * r2.width) - cx;
      stage.scrollTop += (r2.top + fy * r2.height) - cy;
      syncBar();
    }
    /** Pritraukia prie nuotraukos srities (pikseliais). */
    function viewTo(c) {
      const s = stage.getBoundingClientRect();
      const k = Math.min((s.width - 16) / W, (s.height - 16) / H);
      st.z = Math.min(ZOOM_MAX, Math.max(1, Math.min((s.width - 16) / (c.w * k), (s.height - 16) / (c.h * k))));
      fit();
      const r = canvas.getBoundingClientRect();
      stage.scrollLeft += (r.left + (c.x + c.w / 2) / W * r.width) - (s.left + s.width / 2);
      stage.scrollTop += (r.top + (c.y + c.h / 2) / H * r.height) - (s.top + s.height / 2);
    }
    /** Matoma nuotraukos sritis pikseliais. */
    function visible() {
      const r = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
      const l = Math.max(r.left, s.left), t = Math.max(r.top, s.top), rr = Math.min(r.right, s.right), b = Math.min(r.bottom, s.bottom);
      return { x: Math.round((l - r.left) * W / r.width), y: Math.round((t - r.top) * H / r.height), w: Math.round((rr - l) * W / r.width), h: Math.round((b - t) * H / r.height) };
    }
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(st.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });
    if (st.crop) setTimeout(() => viewTo(st.crop), 0);

    function syncBar() {
      root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === st.tool));
      root.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === st.color));
      root.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === st.wl));
      root.querySelector('[data-cmd=undo]').disabled = !st.undo.length;
      root.querySelector('[data-cmd=redo]').disabled = !st.redo.length;
      root.querySelector('[data-cmd=crop]').classList.toggle('on', st.cropOn);
      root.querySelector('[data-cmd=zout]').disabled = st.z <= 1.001;
      root.querySelector('[data-cmd=zin]').disabled = st.z >= ZOOM_MAX - 0.001;
      canvas.style.cursor = st.tool === 'erase' ? 'not-allowed' : st.tool === 'text' ? 'text' : st.tool === 'pan' ? 'grab' : 'crosshair';
    }

    const lw = () => [0, 3, 5, 9][st.wl] * u;

    function render() {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      st.shapes.forEach(s => drawShape(ctx, s, u));
      if (st.cur) drawShape(ctx, st.cur, u);
    }

    function commit(newShapes) {
      st.undo.push(JSON.stringify(st.shapes));
      if (st.undo.length > 60) st.undo.shift();
      st.redo = [];
      st.shapes = newShapes;
      render(); syncBar();
    }

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
    }

    // ---- Pieštukas / figūros ----
    const ptrs = new Map();          // aktyvūs lietimai (pirštų suspaudimui)
    let pinch = null, pan = null;
    const mid = () => { const p = [...ptrs.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }; };
    canvas.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {                         // du pirštai: mastelis ir stumdymas, piešimas nutraukiamas
        st.cur = null; render();
        const m = mid(); pinch = { d0: m.d, z0: st.z, x: m.x, y: m.y }; e.preventDefault(); return;
      }
      if (ptrs.size > 2) return;
      if (!textInp.hidden) commitText();
      e.preventDefault();
      if (st.tool === 'pan') { canvas.setPointerCapture(e.pointerId); pan = { x: e.clientX, y: e.clientY }; return; }
      const [x, y] = pos(e);
      if (st.tool === 'erase') {
        const i = hitTest(st.shapes, x, y, u);
        if (i >= 0) commit(st.shapes.filter((_, k) => k !== i));
        return;
      }
      if (st.tool === 'num') {
        const n = st.shapes.filter(s => s.t === 'num').reduce((m, s) => Math.max(m, s.n), 0) + 1;
        commit([...st.shapes, { t: 'num', c: st.color, x1: x, y1: y, n, w: lw() }]);
        return;
      }
      if (st.tool === 'text') { openText(e, x, y); return; }
      canvas.setPointerCapture(e.pointerId);
      st.cur = { t: st.tool, c: st.color, w: lw(), x1: x, y1: y, x2: x, y2: y, pts: st.tool === 'pen' ? [[x, y]] : undefined };
    });
    canvas.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) {
        const m = mid();
        zoomAt(pinch.z0 * m.d / pinch.d0, m.x, m.y);
        stage.scrollLeft -= m.x - pinch.x; stage.scrollTop -= m.y - pinch.y;
        pinch.x = m.x; pinch.y = m.y; return;
      }
      if (pan) { stage.scrollLeft -= e.clientX - pan.x; stage.scrollTop -= e.clientY - pan.y; pan = { x: e.clientX, y: e.clientY }; return; }
      if (!st.cur) return;
      const [x, y] = pos(e);
      st.cur.x2 = x; st.cur.y2 = y;
      if (st.cur.pts) st.cur.pts.push([Math.round(x), Math.round(y)]);
      render();
    });
    const end = e => {
      if (e && e.pointerId !== undefined) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; }
      pan = null;
      if (!st.cur) return;
      const s = st.cur; st.cur = null;
      const big = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 6 * u || (s.pts && s.pts.length > 3);
      if (big) commit([...st.shapes, s]); else render();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // ---- Tekstas ----
    let textPos = null;
    function openText(e, x, y) {
      textPos = [x, y];
      const sr = stage.getBoundingClientRect();
      textInp.style.left = (e.clientX - sr.left + stage.scrollLeft) + 'px';
      textInp.style.top = (e.clientY - sr.top + stage.scrollTop) + 'px';
      textInp.value = '';
      textInp.hidden = false;
      textInp.focus();
      setTimeout(() => textInp.focus(), 0);
    }
    function commitText() {
      const v = textInp.value.trim();
      textInp.hidden = true;
      if (v && textPos) commit([...st.shapes, { t: 'text', c: st.color, x1: textPos[0], y1: textPos[1], text: v, w: lw() }]);
      textPos = null;
    }
    textInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitText(); }
      if (e.key === 'Escape') { textInp.hidden = true; textPos = null; e.stopPropagation(); }
    });
    textInp.addEventListener('blur', () => { if (!textInp.hidden) commitText(); });

    // ---- Įrankių juosta ----
    root.querySelector('.an-bar').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) st.tool = b.dataset.tool;
      if (b.dataset.color) st.color = b.dataset.color;
      if (b.dataset.w) st.wl = +b.dataset.w;
      const cmd = b.dataset.cmd;
      if (cmd === 'undo' && st.undo.length) { st.redo.push(JSON.stringify(st.shapes)); st.shapes = JSON.parse(st.undo.pop()); render(); }
      if (cmd === 'redo' && st.redo.length) { st.undo.push(JSON.stringify(st.shapes)); st.shapes = JSON.parse(st.redo.pop()); render(); }
      if (cmd === 'clear' && st.shapes.length) commit([]);
      if (cmd === 'zin') zoomAt(st.z * 1.5);
      if (cmd === 'zout') zoomAt(st.z / 1.5);
      if (cmd === 'zfit') zoomAt(1);
      if (cmd === 'crop') st.cropOn = !st.cropOn;
      if (cmd === 'cancel') return close(null);
      if (cmd === 'save') {
        if (!textInp.hidden) commitText();
        st.cur = null; render();
        // pritrauktas vaizdas: išsaugoma tik matoma sritis (jos koordinatės įrašomos kaip „crop“, kad redaguojant vėl pritrauktų)
        const crop = st.cropOn && st.z > 1.02 ? visible() : (st.cropOn && st.crop ? st.crop : null);
        const shapesOut = crop ? [...st.shapes, { t: 'crop', ...crop }] : st.shapes;
        let src = canvas;
        if (crop) {
          src = document.createElement('canvas'); src.width = crop.w; src.height = crop.h;
          src.getContext('2d').drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        }
        src.toBlob(b2 => close({ blob: b2, shapes: shapesOut, forceBlob: !!crop }), 'image/jpeg', 0.88);
        return;
      }
      syncBar();
    });

    function onKey(e) {
      if (!textInp.hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        root.querySelector(e.shiftKey ? '[data-cmd=redo]' : '[data-cmd=undo]').click();
      } else if (e.key === 'Escape') close(null);
    }
    document.addEventListener('keydown', onKey);

    function close(result) {
      window.removeEventListener('resize', fit);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      root.remove();
      URL.revokeObjectURL(img.src);
      resolve(result);
    }

    render(); syncBar();
  });
}

function loadImage(blob) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(blob);
  });
}

// ---------------------------------------------------------------------
// Piešimas
// ---------------------------------------------------------------------

function drawShape(ctx, s, u) {
  ctx.save();
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 3 * u;
  const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
  const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);

  if (s.t === 'rect') {
    ctx.strokeRect(x, y, w, h);
  } else if (s.t === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.t === 'arrow') {
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const head = Math.max(14 * u, s.w * 3.2);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2 - Math.cos(ang) * head * 0.6, s.y2 - Math.sin(ang) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45));
    ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  } else if (s.t === 'pen' && s.pts) {
    ctx.beginPath();
    s.pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.stroke();
  } else if (s.t === 'num') {
    const r = 16 * u + s.w * 1.2;
    ctx.beginPath();
    ctx.arc(s.x1, s.y1, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, 2.5 * u);
    ctx.strokeStyle = contrast(s.c);
    ctx.stroke();
    ctx.fillStyle = contrast(s.c);
    ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.n), s.x1, s.y1 + r * 0.06);
  } else if (s.t === 'text') {
    const fs = Math.round(22 * u + s.w * 2);
    ctx.font = `bold ${fs}px system-ui, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(s.text).width;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(s.x1 - fs * 0.25, s.y1 - fs * 0.15, tw + fs * 0.5, fs * 1.3);
    ctx.fillStyle = s.c === '#111111' ? '#ffffff' : s.c;
    ctx.fillText(s.text, s.x1, s.y1);
  }
  ctx.restore();
}

function contrast(c) {
  return ['#ffd600', '#76ff03', '#ffffff', '#00e5ff'].includes(c) ? '#111111' : '#ffffff';
}

function hitTest(shapes, x, y, u) {
  const tol = 12 * u;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    let x1, y1, x2, y2;
    if (s.t === 'pen' && s.pts) {
      if (s.pts.some(([px, py]) => Math.hypot(px - x, py - y) < tol + s.w)) return i;
      continue;
    }
    if (s.t === 'num') {
      if (Math.hypot(s.x1 - x, s.y1 - y) < 16 * u + s.w * 1.2 + tol) return i;
      continue;
    }
    if (s.t === 'text') {
      const fs = 22 * u + s.w * 2;
      x1 = s.x1; y1 = s.y1; x2 = s.x1 + fs * 0.6 * s.text.length; y2 = s.y1 + fs * 1.2;
    } else {
      x1 = Math.min(s.x1, s.x2); x2 = Math.max(s.x1, s.x2);
      y1 = Math.min(s.y1, s.y2); y2 = Math.max(s.y1, s.y2);
    }
    if (x >= x1 - tol && x <= x2 + tol && y >= y1 - tol && y <= y2 + tol) return i;
  }
  return -1;
}
