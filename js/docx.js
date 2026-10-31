// =====================================================================
// Aktų eksportas į Word (.docx). Biblioteka kraunama tik paspaudus mygtuką.
// Turinys sudaromas iš tų pačių duomenų kaip ir peržiūros vaizdas (print.js).
// =====================================================================

import { fmtDate, fmtQty } from './util.js';

const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/+esm';

// A4, paraštės 14 mm; turinio plotis (dxa = 1/20 pt)
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 800;
const W = PAGE_W - 2 * MARGIN;

export async function exportDocx({ t, s, doc, figs }) {
  const D = await import(DOCX_URL);
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
    BorderStyle, ImageRun, VerticalAlign, ShadingType } = D;

  // ---------- pagalbinės ----------
  const SZ = 20;                                           // 10 pt
  const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const ALL = { top: LINE, bottom: LINE, left: LINE, right: LINE };
  const NOBORD = { top: NONE, bottom: NONE, left: NONE, right: NONE };
  const BOTTOM = { top: NONE, left: NONE, right: NONE, bottom: LINE };

  const runs = (text, o = {}) => String(text ?? '').split('\n').map((ln, i) =>
    new TextRun({ text: ln, break: i ? 1 : 0, bold: o.bold, italics: o.italics, size: o.size || SZ, color: o.color }));
  const P = (text, o = {}) => new Paragraph({
    children: Array.isArray(text) ? text : runs(text, o),
    alignment: o.align || AlignmentType.LEFT,
    spacing: { before: o.before || 0, after: o.after ?? 60, line: o.line },
    border: o.border ? { bottom: LINE } : undefined,
    indent: o.indent
  });
  const small = (text, align = AlignmentType.CENTER) => P(text, { size: 14, align, after: 100, color: '333333' });
  const cell = (content, o = {}) => new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    columnSpan: o.span,
    borders: o.borders || ALL,
    verticalAlign: o.v || VerticalAlign.TOP,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: (Array.isArray(content) ? content : [P(content, { bold: o.bold, align: o.align, color: o.color, after: 0 })])
  });
  const table = (widths, rows) => new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows });
  const row = cells => new TableRow({ children: cells, cantSplit: true });
  const headRow = cells => new TableRow({ children: cells, tableHeader: true, cantSplit: true });

  const dataUrlBytes = async url => new Uint8Array(await (await fetch(url)).arrayBuffer());

  const formCode = label => P(`${s.form_code || ''}${s.form_code ? ' ' : ''}${label}`, { size: 16, align: AlignmentType.RIGHT, color: '333333', after: 160 });
  const addr = [t.address, t.city].filter(Boolean).join(', ') + (t.stairwell ? `, ${t.stairwell} laiptinė` : '');

  // ---------- parašų eilutės ----------
  async function signBlock(rows, posNote) {
    const sigCache = s.signature ? await dataUrlBytes(s.signature).catch(() => null) : null;
    const out = [];
    const cw = [Math.round(W * 0.42), Math.round(W * 0.22), Math.round(W * 0.36)];
    const mk = async r => {
      const sig = r.sig && sigCache ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: sigCache, transformation: { width: 110, height: 44 }, type: 'png' })] })] : [P('', { after: 0 })];
      return [
        row([cell([P(r.position || ' ', { align: AlignmentType.CENTER, after: 0 })], { w: cw[0], borders: BOTTOM, v: VerticalAlign.BOTTOM }),
          cell(sig, { w: cw[1], borders: BOTTOM, v: VerticalAlign.BOTTOM }),
          cell([P(r.name || ' ', { align: AlignmentType.CENTER, after: 0 })], { w: cw[2], borders: BOTTOM, v: VerticalAlign.BOTTOM })]),
        row([cell([small(posNote)], { w: cw[0], borders: NOBORD }), cell([small('(parašas)')], { w: cw[1], borders: NOBORD }), cell([small('(vardas, pavardė)')], { w: cw[2], borders: NOBORD })])
      ];
    };
    for (const r of rows) out.push(...await mk(r));
    return table(cw, out);
  }

  // ---------- lapai ----------
  async function defectSheet() {
    const d = t.defect_act;
    const rows = [{ position: s.engineer_position, name: s.engineer_name, sig: true }];
    (s.commission || []).forEach(c => rows.push({ position: c.position, name: c.name }));
    while (rows.length < 3) rows.push({ position: '', name: '' });
    const fw = [Math.round(W * 0.34), Math.round(W * 0.66)];
    const f = (l, v) => row([cell(l, { w: fw[0], borders: NOBORD, v: VerticalAlign.BOTTOM }), cell(v || ' ', { w: fw[1], borders: BOTTOM })]);
    const cw = [620, 2500, 3593, W - 620 - 2500 - 3593];
    const body = [headRow(['Eil. Nr.', 'Apžiūrėti objektai (sistemos)', 'Pastebėti defektai, deformacijos, gedimai', 'Rekomenduojami darbai defektams pašalinti']
      .map((h, i) => cell(h, { w: cw[i], bold: true, fill: 'E9ECEF', align: AlignmentType.CENTER, v: VerticalAlign.CENTER })))];
    (d.objects || []).forEach((o, i) => body.push(row([
      cell(String(i + 1), { w: cw[0], align: AlignmentType.CENTER }),
      cell([P(o.system || '', { bold: true, after: 40 }), ...((o.photos || []).length ? [P(`Nuotr.: ${o.photos.map(n => `${n} pav.`).join(', ')}`, { size: 17, color: '333333', after: 0 })] : [])], { w: cw[1] }),
      cell(o.defects || '', { w: cw[2] }), cell(o.works || '', { w: cw[3] })])));
    const ch = [
      formCode('Statinio defektavimo aktas'),
      P(s.org_name || '', { align: AlignmentType.CENTER, border: true, after: 0 }), small('(organizacijos pavadinimas)'),
      P('Statinio numatomų atlikti darbų ir defektavimo aktas', { bold: true, size: 28, align: AlignmentType.CENTER, before: 120, after: 120 }),
      P(`${fmtDate(t.act_date)}      Nr. ${t.act_number || ''}`, { size: 22, align: AlignmentType.CENTER, after: 0 }), small('(data)'),
      P(s.city || t.city || '', { align: AlignmentType.CENTER, border: true, after: 0 }), small('(sudarymo vieta)'),
      table(fw, [f('Statinio adresas', addr), f('Apžiūros tikslas', d.purpose), f('Problema', d.problem),
        ...(t.service_type ? [f('Darbų sritis', t.service_type)] : []), f('Pastatų administravimo vadybininkas', t.manager), f('Darbų skubumas', d.urgency)]),
      P('', { after: 120 }),
      table(cw, body)
    ];
    if (d.summary) ch.push(P([new TextRun({ text: 'Išvada. ', bold: true, size: SZ }), new TextRun({ text: d.summary, size: SZ })], { before: 140 }));
    String(s.conclusion_text || '').split('\n').filter(x => x.trim()).forEach(x => ch.push(P(x, { align: AlignmentType.JUSTIFIED, before: 80 })));
    ch.push(P(`Pridedama: ${[t.works_act ? `Numatomų atlikti darbų aktas Nr. ${t.act_number || ''}` : '', figs.length ? `nuotraukų fiksacija (${figs.length} nuotr.)` : ''].filter(Boolean).join('; ') || '—'}.`, { before: 100, after: 160 }));
    ch.push(await signBlock(rows, '(apžiūros vykdytojo pareigos)'));
    return ch;
  }

  async function worksSheet() {
    const w = t.works_act, d = t.defect_act || {};
    const kv = (l, v) => P([new TextRun({ text: `${l}: `, bold: true, size: SZ }), new TextRun({ text: v || '', size: SZ })], { after: 80 });
    const cw = [620, W - 620 - 1100 - 1250 - 2200, 1100, 1250, 2200];
    const body = [headRow(['Eil. Nr.', 'Numatomų darbų ir medžiagų aprašas', 'Mato vnt.', 'Preliminarus kiekis', 'Pastabos']
      .map((h, i) => cell(h, { w: cw[i], bold: true, fill: 'C62828', color: 'FFFFFF', align: AlignmentType.CENTER, v: VerticalAlign.CENTER })))];
    let last = null, n = 0;
    (w.rows || []).filter(r => (r.description || '').trim()).forEach(r => {
      if (r.section && r.section !== last) { body.push(row([cell('', { w: cw[0], fill: 'F6F6F6' }), cell(r.section, { w: cw[1] + cw[2] + cw[3] + cw[4], span: 4, bold: true, align: AlignmentType.CENTER, fill: 'F6F6F6' })])); last = r.section; }
      n++;
      body.push(row([cell(String(n), { w: cw[0], align: AlignmentType.CENTER }), cell(r.description, { w: cw[1] }),
        cell(r.unit || '', { w: cw[2], align: AlignmentType.CENTER }),
        cell(r.qty === null || r.qty === undefined ? '' : fmtQty(r.qty), { w: cw[3], align: AlignmentType.CENTER, bold: true }),
        cell(r.notes || '', { w: cw[4] })]));
    });
    const ch = [
      formCode('Numatomų atlikti darbų aktas'),
      P('NUMATOMŲ ATLIKTI DARBŲ IR DEFEKTAVIMO AKTAS', { bold: true, size: 26, align: AlignmentType.CENTER, before: 60, after: 200 }),
      kv('Akto Nr.', t.act_number), kv('Data', fmtDate(t.act_date)), kv('Užsakovas', s.customer_name), kv('Objektas', addr),
      kv('Problema', d.problem || t.problem), ...(t.service_type ? [kv('Darbų sritis', t.service_type)] : []),
      P('', { after: 100 }), table(cw, body)
    ];
    if (w.note) ch.push(P(`Pastaba: ${w.note}`, { bold: true, before: 140, after: 240 }));
    ch.push(P('Aktą paruošė:', { bold: true, before: 240, after: 120 }));
    ch.push(P([new TextRun({ text: [s.engineer_position, s.engineer_name].filter(Boolean).join(' '), size: SZ })], { border: true, after: 0 }));
    ch.push(small('(pareigos, vardas, pavardė, parašas)', AlignmentType.RIGHT));
    return ch;
  }

  async function ncSheet() {
    const a = t.nc_act;
    const fw = [Math.round(W * 0.34), Math.round(W * 0.66)];
    const f = (l, v) => row([cell(l, { w: fw[0], borders: NOBORD, v: VerticalAlign.BOTTOM }), cell(v || ' ', { w: fw[1], borders: BOTTOM })]);
    const cw = [620, 3300, 3100, W - 620 - 3300 - 3100];
    const body = [headRow(['Eil. Nr.', 'Nustatyta neatiktis', 'Pažeidžiamas reikalavimas', 'Rangovas privalo']
      .map((h, i) => cell(h, { w: cw[i], bold: true, fill: 'E9ECEF', align: AlignmentType.CENTER, v: VerticalAlign.CENTER })))];
    (a.items || []).forEach((o, i) => body.push(row([
      cell(String(i + 1), { w: cw[0], align: AlignmentType.CENTER }),
      cell([P(o.description || '', { after: 40 }), ...((o.photos || []).length ? [P(`Nuotr.: ${o.photos.map(n => `${n} pav.`).join(', ')}`, { size: 17, color: '333333', after: 0 })] : [])], { w: cw[1] }),
      cell(o.requirement || '', { w: cw[2] }), cell(o.action || '', { w: cw[3] })])));
    const sw = [Math.round(W * 0.42), Math.round(W * 0.22), Math.round(W * 0.36)];
    const ch = [
      formCode('Neatikties aktas'),
      P(s.org_name || '', { align: AlignmentType.CENTER, border: true, after: 0 }), small('(organizacijos pavadinimas)'),
      P('Neatikties aktas', { bold: true, size: 28, align: AlignmentType.CENTER, before: 120, after: 120 }),
      P(`${fmtDate(t.act_date)}      Nr. ${t.act_number || ''}`, { size: 22, align: AlignmentType.CENTER, after: 0 }), small('(data)'),
      P(s.city || t.city || '', { align: AlignmentType.CENTER, border: true, after: 0 }), small('(sudarymo vieta)'),
      table(fw, [f('Objektas', addr), f('Rangovas', t.contractor), f('Vertinami darbai', a.work || t.service_type),
        f('Neatikties nustatymo data', fmtDate(t.inspection_date) || fmtDate(t.act_date)), f('Neatikties lygis', a.severity), f('Pašalinti iki', fmtDate(t.due_date))]),
      P('', { after: 120 }), table(cw, body)
    ];
    if (a.summary) ch.push(P([new TextRun({ text: 'Išvada. ', bold: true, size: SZ }), new TextRun({ text: a.summary, size: SZ })], { before: 140 }));
    ch.push(P(`Pridedama: ${figs.length ? `nuotraukų fiksacija (${figs.length} nuotr.)` : '—'}.`, { before: 100, after: 160 }));
    ch.push(await signBlock([
      { position: s.engineer_position, name: s.engineer_name, sig: true },
      { position: t.contractor ? `Rangovo atstovas, ${t.contractor}` : 'Rangovo atstovas', name: '' }
    ], '(pareigos)'));
    void sw;
    return ch;
  }

  async function photoSheet() {
    const colW = Math.floor(W / 2);
    const items = [];
    for (const f of figs) {
      let img = null;
      try {
        const blob = await (await fetch(f.url)).blob();
        const bmp = await createImageBitmap(blob);
        const maxW = 300, maxH = 330;
        const k = Math.min(maxW / bmp.width, maxH / bmp.height);
        img = { data: new Uint8Array(await blob.arrayBuffer()), width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) };
      } catch (_) { /* nuotrauka praleidžiama */ }
      items.push([
        ...(img ? [new Paragraph({ children: [new ImageRun({ data: img.data, transformation: { width: img.width, height: img.height }, type: 'jpg' })], spacing: { after: 40 } })] : [P('(nuotrauka neįkelta)', { italics: true })]),
        P([new TextRun({ text: `${f.n} pav.`, bold: true, size: 18 }), new TextRun({ text: f.caption ? ' ' + f.caption : '', size: 18 })], { after: 160 })
      ]);
    }
    const trs = [];
    for (let i = 0; i < items.length; i += 2) {
      trs.push(new TableRow({ cantSplit: true, children: [
        cell(items[i], { w: colW, borders: NOBORD }),
        cell(items[i + 1] || [P('')], { w: colW, borders: NOBORD })
      ] }));
    }
    return [
      formCode('Nuotraukų fiksacija'),
      P(`Nuotraukų fiksacija prie akto Nr. ${t.act_number || ''}`, { bold: true, size: 24, after: 40 }),
      P(`${addr} · ${fmtDate(t.act_date)}`, { color: '333333', after: 160 }),
      table([colW, colW], trs)
    ];
  }

  // ---------- dokumentas ----------
  const sections = [];
  const add = children => sections.push({ properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } }, children });
  if (doc === 'nc') add(await ncSheet());
  if (doc === 'defect' || doc === 'both') add(await defectSheet());
  if (doc === 'works' || doc === 'both') add(await worksSheet());
  if (figs.length) add(await photoSheet());

  const document_ = new Document({
    creator: s.engineer_name || 'Defektų aktai',
    title: `${t.act_number || ''} ${t.address || ''}`.trim(),
    styles: { default: { document: { run: { font: 'Arial', size: SZ } } } },
    sections
  });
  const blob = await Packer.toBlob(document_);
  const labels = { defect: 'defektavimo aktas', works: 'numatomu darbu aktas', both: 'aktai', nc: 'neatikties aktas' };
  const name = `${t.act_number || 'aktas'} ${t.address || ''} ${labels[doc] || ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.docx';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return name;
}
