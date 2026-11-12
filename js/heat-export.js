// =====================================================================
// ŠP aprašo eksportas: blokai iš heat-doc.js → Word (.docx) ir PDF.
// Bibliotekos kraunamos tik paspaudus mygtuką. Išvaizda: A4, 10 pt,
// lentelės antraštė #1F3A5F, grupės eilutė #EEF2F7.
// =====================================================================

const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm';
const PDFMAKE_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js';
const PDFFONTS_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js';
const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const HEAD = '1F3A5F', GROUP = 'EEF2F7', LINE_C = '8A94A6';

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

const fitBox = (w, h, maxW, maxH) => { const k = Math.min(maxW / (w || maxW), maxH / (h || maxH), 1e9); return [Math.round((w || maxW) * k), Math.round((h || maxH) * k)]; };

// ---------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------
export async function aprasasDocx(doc, images = []) {
  const D = await import(DOCX_URL);
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ImageRun,
    VerticalAlign, ShadingType, Header, Footer, PageNumber, PageBreak } = D;
  const PAGE_W = 11906, PAGE_H = 16838, MX = 1000, MY = 1000;
  const W = PAGE_W - 2 * MX;
  const SZ = 20;
  const LINE = { style: BorderStyle.SINGLE, size: 4, color: LINE_C };
  const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const ALL = { top: LINE, bottom: LINE, left: LINE, right: LINE };
  const NOB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
  const AL = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED, left: AlignmentType.LEFT };

  const runs = (text, o = {}) => String(text ?? '').split('\n').map((ln, i) =>
    new TextRun({ text: ln, break: i ? 1 : 0, bold: o.bold, italics: o.italics, size: o.size || SZ, color: o.color }));
  const P = (text, o = {}) => new Paragraph({
    children: runs(text, o), alignment: AL[o.align] || AlignmentType.LEFT, keepNext: o.keepNext,
    spacing: { before: o.before || 0, after: o.after ?? 80 }, indent: o.indent,
    border: o.underline ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } } : undefined
  });
  const cell = (text, o = {}) => new TableCell({
    width: { size: o.w, type: WidthType.DXA }, columnSpan: o.span, borders: o.borders || ALL,
    verticalAlign: o.v || VerticalAlign.CENTER,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [P(text, { bold: o.bold, align: o.align, color: o.color, size: o.size, after: 0 })]
  });
  const widths = fr => { const w = fr.map(x => Math.round(W * x)); w[w.length - 1] += W - w.reduce((a, b) => a + b, 0); return w; };
  const mkTable = (w, rows) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: w, rows });

  const out = [];
  for (const b of doc.blocks) {
    if (b.t === 'h1') out.push(P(b.text, { bold: true, size: 24, before: 280, after: 120, keepNext: true }));
    else if (b.t === 'h2') out.push(P(b.text, { bold: true, size: 21, before: 200, after: 100, keepNext: true }));
    else if (b.t === 'title') out.push(P(b.text, { bold: true, size: 30, align: 'center', before: 200, after: 160 }));
    else if (b.t === 'p') out.push(P(b.text, b.small ? { size: 16, italics: true, color: '555555', before: 40, align: b.align } : { bold: b.bold, align: b.align || 'justify' }));
    else if (b.t === 'space') out.push(P('', { after: b.h * 12 }));
    else if (b.t === 'break') out.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.t === 'approve') b.lines.forEach((l, i) => out.push(P(l, { bold: i === 0, indent: { left: Math.round(W * 0.6) }, after: i === 0 ? 80 : 40 })));
    else if (b.t === 'center') {
      out.push(P(b.text || ' ', { align: 'center', bold: b.bold, size: b.bold ? 24 : SZ, underline: true, indent: { left: Math.round(W * 0.15), right: Math.round(W * 0.15) }, after: 0, before: 120 }));
      out.push(P(b.caption, { align: 'center', size: 14, color: '333333', after: 80 }));
    } else if (b.t === 'list') b.items.forEach(x => out.push(new Paragraph({ children: runs(x), bullet: { level: 0 }, spacing: { after: 50 } })));
    else if (b.t === 'kv') {
      const w = widths([0.38, 0.62]);
      out.push(mkTable(w, b.rows.map(([l, v]) => new TableRow({ cantSplit: true, children: [cell(l, { w: w[0], fill: GROUP }), cell(v, { w: w[1] })] }))));
    } else if (b.t === 'table') {
      const w = widths(b.w), ctr = b.center || [];
      const rows = [new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => cell(h, { w: w[i], bold: true, fill: HEAD, color: 'FFFFFF', align: 'center' })) })];
      for (const r of b.rows) {
        if (!Array.isArray(r)) { rows.push(new TableRow({ cantSplit: true, children: [cell(r.group, { w: W, span: w.length, bold: true, fill: GROUP })] })); continue; }
        rows.push(new TableRow({ cantSplit: true, height: b.tall ? { value: 520, rule: 'atLeast' } : undefined,
          children: r.map((v, i) => cell(v, { w: w[i], align: ctr.includes(i) ? 'center' : 'left' })) }));
      }
      out.push(mkTable(w, rows));
    } else if (b.t === 'image') {
      const im = images[b.index];
      if (im && im.bytes) {
        const [iw, ih] = fitBox(im.width, im.height, 640, 820);
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new ImageRun({ data: im.bytes, transformation: { width: iw, height: ih }, type: 'jpg' })] }));
      }
    } else if (b.t === 'sign') {
      const w = widths([0.4, 0.24, 0.36]);
      const bot = { top: NONE, left: NONE, right: NONE, bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' } };
      out.push(P(b.label, { bold: true, after: 200 }));
      out.push(mkTable(w, [
        new TableRow({ children: [cell(b.position || ' ', { w: w[0], borders: bot, align: 'center', v: VerticalAlign.BOTTOM }), cell(' ', { w: w[1], borders: bot }), cell(b.name || ' ', { w: w[2], borders: bot, align: 'center', v: VerticalAlign.BOTTOM })] }),
        new TableRow({ children: [cell('(pareigos)', { w: w[0], borders: NOB, align: 'center', size: 14 }), cell('(parašas)', { w: w[1], borders: NOB, align: 'center', size: 14 }), cell('(vardas, pavardė)', { w: w[2], borders: NOB, align: 'center', size: 14 })] })
      ]));
    }
  }

  const header = new Header({ children: [P(doc.header, { size: 15, color: '666666', underline: true, after: 120 })] });
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: '666666' })] })] });
  const document_ = new Document({
    creator: 'ŠP aprašai', title: doc.title,
    styles: { default: { document: { run: { font: 'Arial', size: SZ } } } },
    sections: [{
      properties: { titlePage: true, page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MY + 200, right: MX, bottom: MY, left: MX } } },
      headers: { default: header, first: new Header({ children: [P('', { after: 0 })] }) },
      footers: { default: footer, first: new Footer({ children: [P('', { after: 0 })] }) },
      children: out
    }]
  });
  return Packer.toBlob(document_);
}

// ---------------------------------------------------------------------
// PDF (pdfmake)
// ---------------------------------------------------------------------
let pdfReady = null;
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = src; s.onload = res; s.onerror = () => rej(new Error('Nepavyko įkelti PDF bibliotekos (patikrinkite interneto ryšį).'));
  document.head.appendChild(s);
});
async function pdfLib() {
  if (!pdfReady) pdfReady = (async () => { if (!window.pdfMake) await loadScript(PDFMAKE_URL); if (!window.pdfMake.vfs) await loadScript(PDFFONTS_URL); return window.pdfMake; })()
    .catch(e => { pdfReady = null; throw e; });
  return pdfReady;
}

export async function aprasasPdf(doc, images = []) {
  const pdfMake = await pdfLib();
  const ML = 50, MR = 42, CW = 595.28 - ML - MR;
  const PAD = 4, LW = 0.5;
  const layout = {
    hLineWidth: () => LW, vLineWidth: () => LW, hLineColor: () => '#' + LINE_C, vLineColor: () => '#' + LINE_C,
    paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 3, paddingBottom: () => 3
  };
  const widths = fr => { const avail = CW - fr.length * 2 * PAD - (fr.length + 1) * LW; return fr.map(x => Math.floor(avail * x * 100) / 100); };
  const T = v => String(v ?? '');

  const C = [];
  for (const b of doc.blocks) {
    if (b.t === 'h1') C.push({ text: b.text, bold: true, fontSize: 12, margin: [0, 16, 0, 6], headlineLevel: 1 });
    else if (b.t === 'h2') C.push({ text: b.text, bold: true, fontSize: 10.5, margin: [0, 10, 0, 5], headlineLevel: 2 });
    else if (b.t === 'title') C.push({ text: b.text, bold: true, fontSize: 15, alignment: 'center', margin: [0, 10, 0, 10] });
    else if (b.t === 'p') C.push(b.small ? { text: b.text, fontSize: 8, italics: true, color: '#555555', margin: [0, 3, 0, 4], alignment: b.align || 'left' }
      : { text: b.text, bold: b.bold, alignment: b.align || 'justify', margin: [0, 0, 0, 4] });
    else if (b.t === 'space') C.push({ text: '', margin: [0, 0, 0, b.h] });
    else if (b.t === 'break') C.push({ text: '', pageBreak: 'after' });
    else if (b.t === 'approve') C.push({ stack: b.lines.map((l, i) => ({ text: l, bold: i === 0, margin: [0, 0, 0, i === 0 ? 4 : 2] })), margin: [CW * 0.6, 0, 0, 0] });
    else if (b.t === 'center') C.push({ stack: [
      { text: b.text || ' ', alignment: 'center', bold: b.bold, fontSize: b.bold ? 12 : 10, margin: [0, 8, 0, 1] },
      { canvas: [{ type: 'line', x1: CW * 0.15, y1: 0, x2: CW * 0.85, y2: 0, lineWidth: 0.5 }] },
      { text: b.caption, alignment: 'center', fontSize: 7, color: '#333333', margin: [0, 1, 0, 4] }] });
    else if (b.t === 'list') C.push({ ul: b.items.map(T), margin: [6, 0, 0, 6] });
    else if (b.t === 'kv') C.push({ unbreakable: b.rows.length <= 16, table: { widths: widths([0.38, 0.62]), dontBreakRows: true, body: b.rows.map(([l, v]) => [{ text: T(l), fillColor: '#' + GROUP }, { text: T(v) }]) }, layout, margin: [0, 0, 0, 6] });
    else if (b.t === 'table') {
      const n = b.head.length, ctr = b.center || [];
      const body = [b.head.map(h => ({ text: h, bold: true, color: '#FFFFFF', fillColor: '#' + HEAD, alignment: 'center' }))];
      for (const r of b.rows) {
        if (!Array.isArray(r)) body.push([{ text: r.group, colSpan: n, bold: true, fillColor: '#' + GROUP }, ...Array(n - 1).fill({})]);
        else body.push(r.map((v, i) => ({ text: T(v) || ' ', alignment: ctr.includes(i) ? 'center' : 'left', margin: b.tall ? [0, 8, 0, 8] : undefined })));
      }
      C.push({ table: { headerRows: 1, widths: widths(b.w), dontBreakRows: true, body }, layout, margin: [0, 0, 0, 6] });
    } else if (b.t === 'image') {
      const im = images[b.index];
      if (im && im.dataUrl) C.push({ image: im.dataUrl, fit: [CW, 640], alignment: 'center', margin: [0, 4, 0, 10] });
    } else if (b.t === 'sign') {
      const w = widths([0.4, 0.24, 0.36]);
      C.push({ text: b.label, bold: true, margin: [0, 6, 0, 16] });
      C.push({ unbreakable: true, table: { widths: w, body: [
        [{ text: b.position || ' ', alignment: 'center' }, { text: ' ' }, { text: b.name || ' ', alignment: 'center' }],
        [{ text: '(pareigos)', alignment: 'center', fontSize: 7 }, { text: '(parašas)', alignment: 'center', fontSize: 7 }, { text: '(vardas, pavardė)', alignment: 'center', fontSize: 7 }]] },
        layout: { hLineWidth: i => i === 1 ? 0.5 : 0, vLineWidth: () => 0, paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 2, paddingBottom: () => 2 } });
    }
  }

  const dd = {
    pageSize: 'A4', pageMargins: [ML, 58, MR, 48],
    info: { title: doc.title, creator: 'ŠP aprašai' },
    defaultStyle: { fontSize: 9.5, lineHeight: 1.15 },
    header: page => page === 1 ? null : { stack: [{ text: doc.header, fontSize: 7.5, color: '#666666' }, { canvas: [{ type: 'line', x1: 0, y1: 3, x2: CW, y2: 3, lineWidth: 0.5, lineColor: '#999999' }] }], margin: [ML, 28, MR, 0] },
    footer: (page, count) => page === 1 ? null : { text: `${page} / ${count}`, alignment: 'center', fontSize: 8, color: '#666666', margin: [0, 16, 0, 0] },
    // antraštė nelieka viena puslapio apačioje
    pageBreakBefore: (node, following) => !!node.headlineLevel && following.length > 0 && following[0].pageNumbers && following[0].pageNumbers[0] > node.pageNumbers[0] && node.startPosition.top > 120,
    content: C
  };
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(dd).getBlob(resolve); } catch (e) { reject(e); }
  });
}

/** Keli failai į vieną zip: files = [{ name, blob }]. */
export async function zipBlobs(files) {
  const JSZip = (await import(JSZIP_URL)).default;
  const zip = new JSZip();
  const used = new Set();
  for (const f of files) {
    let name = f.name, i = 2;
    while (used.has(name)) name = f.name.replace(/(\.[a-z]+)$/i, ` (${i++})$1`);
    used.add(name);
    zip.file(name, f.blob);
  }
  return zip.generateAsync({ type: 'blob' });
}
