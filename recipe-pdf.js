// Génère le PDF (A4) d'une recette avec pdf-lib (injecté en paramètre : testable hors navigateur).
// Polices PDF standard (WinAnsi) : les caractères non pris en charge (émojis…) sont retirés du texte.

const PAGE = [595.28, 841.89];
const M = 48;                       // marge
const CW = PAGE[0] - 2 * M;         // largeur utile
const FOOT = 26;                    // réserve pour le pied de page
const C = {
  ink: [0.157, 0.125, 0.227],
  accent: [0.486, 0.302, 1],
  muted: [0.49, 0.455, 0.58],
  line: [0.9, 0.878, 0.953],
  soft: [0.953, 0.94, 0.99],
};

const SPACES = /[   -   　\t]/g;
const MAP = { "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "−": "-", "‑": "-", "→": "->", "​": "", "‍": "", "️": "" };

export async function buildRecipePdf(PDFLib, r) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const col = (a) => rgb(a[0], a[1], a[2]);
  const doc = await PDFDocument.create();
  const title = String(r.title || "Recette");
  doc.setTitle(title);
  doc.setAuthor("NoutBook");
  doc.setCreator("NoutBook");
  doc.setProducer("NoutBook");

  const serifB = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansB = await doc.embedFont(StandardFonts.HelveticaBold);
  const sansI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const supported = new Set(sans.getCharacterSet());

  const clean = (t) => {
    let out = "";
    for (const ch of String(t == null ? "" : t).normalize("NFC").replace(SPACES, " ").replace(/[\r\n]+/g, " ")) {
      if (Object.prototype.hasOwnProperty.call(MAP, ch)) out += MAP[ch];
      else if (supported.has(ch.codePointAt(0))) out += ch;
    }
    return out.replace(/ {2,}/g, " ").trim();
  };
  const lines = (t) => String(t || "").split("\n").map((l) => l.replace(/^[\-•*·]\s*/, "")).map(clean).filter(Boolean);

  const wrap = (text, font, size, maxW) => {
    const out = [];
    let cur = "";
    for (const word of text.split(" ")) {
      if (!word) continue;
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxW) {            // mot plus long que la ligne
        let k = w.length - 1;
        while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > maxW) k--;
        if (cur) { out.push(cur); cur = ""; }
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const test = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(test, size) <= maxW) cur = test;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  };

  let page, y;
  const newPage = () => { page = doc.addPage(PAGE); y = PAGE[1] - M; };
  const ensure = (h) => { if (y - h < M + FOOT) newPage(); };
  const text = (t, x, baseY, size, font, color) => page.drawText(t, { x, y: baseY, size, font, color: col(color) });

  // un titre n'est jamais laissé seul en bas de page : on réserve aussi la place du début du contenu
  const heading = (label, after = 40) => {
    ensure(50 + after);
    y -= 8;
    text(label, M, y - 16, 17, serifB, C.accent);
    y -= 24;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE[0] - M, y }, thickness: 0.8, color: col(C.line) });
    y -= 12;
  };

  // ---------- images ----------
  const imgs = [];
  for (const p of r.photos || []) {
    try { imgs.push(await doc.embedJpg(p)); continue; } catch (e) { /* pas un JPEG */ }
    try { imgs.push(await doc.embedPng(p)); } catch (e) { /* photo ignorée */ }
  }

  // ---------- en-tête ----------
  newPage();
  page.drawRectangle({ x: 0, y: PAGE[1] - 12, width: PAGE[0], height: 12, color: col(C.accent) });
  y = PAGE[1] - M - 6;
  const tsz = 28;
  for (const l of wrap(clean(title) || "Recette", serifB, tsz, CW)) {
    text(l, M, y - tsz * 0.85, tsz, serifB, C.ink);
    y -= tsz * 1.2;
  }
  const n = Number(r.servings);
  const meta = [clean(r.category), clean(r.time), n ? `${n} personne${n > 1 ? "s" : ""}` : ""].filter(Boolean).join("   ·   ");
  if (meta) { text(meta, M, y - 12, 11.5, sansB, C.accent); y -= 22; }
  y -= 8;

  if (imgs[0]) {
    const im = imgs[0];
    const s = Math.min(CW / im.width, 260 / im.height);
    const w = im.width * s, h = im.height * s;
    page.drawImage(im, { x: M + (CW - w) / 2, y: y - h, width: w, height: h });
    y -= h + 14;
  }

  // ---------- ingrédients ----------
  const ing = lines(r.ingredients);
  if (ing.length) {
    heading("Ingrédients", 24);
    const sz = 11.5, lh = 16;
    for (const it of ing) {
      const ls = wrap(it, sans, sz, CW - 18);
      ensure(ls.length * lh + 5);
      page.drawCircle({ x: M + 4, y: y - 9, size: 2.2, color: col(C.accent) });
      ls.forEach((l, i) => text(l, M + 16, y - 13 - i * lh, sz, sans, C.ink));
      y -= ls.length * lh + 5;
    }
  }

  // ---------- préparation ----------
  const steps = lines(r.steps);
  if (steps.length) {
    heading("Préparation", 44);
    const sz = 11.5, lh = 16.5;
    steps.forEach((st, i) => {
      const ls = wrap(st, sans, sz, CW - 34);
      ensure(Math.max(ls.length * lh, 22) + 9);
      page.drawCircle({ x: M + 10, y: y - 10, size: 10, color: col(C.accent) });
      const num = String(i + 1);
      text(num, M + 10 - sansB.widthOfTextAtSize(num, 10) / 2, y - 13.4, 10, sansB, [1, 1, 1]);
      ls.forEach((l, k) => text(l, M + 34, y - 13 - k * lh, sz, sans, C.ink));
      y -= Math.max(ls.length * lh, 22) + 9;
    });
  }

  // ---------- notes ----------
  const note = clean(r.notes);
  if (note) {
    heading("Notes", 50);
    const sz = 11, lh = 15.5, pad = 12;
    const ls = wrap(note, sansI, sz, CW - 2 * pad);
    const h = ls.length * lh + 2 * pad;
    if (h <= PAGE[1] - 2 * M - FOOT - 10) {
      ensure(h + 4);
      page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: col(C.soft) });
      ls.forEach((l, i) => text(l, M + pad, y - pad - 11 - i * lh, sz, sansI, C.ink));
      y -= h + 8;
    } else {
      ls.forEach((l) => { ensure(lh); text(l, M, y - 11, sz, sansI, C.ink); y -= lh; });
    }
  }

  // ---------- autres photos ----------
  if (imgs.length > 1) {
    heading("Photos", 160);
    const gap = 12, cols = 3, cw = (CW - gap * (cols - 1)) / cols, ch = 150;
    for (let i = 1; i < imgs.length; i += cols) {
      ensure(ch + gap);
      for (let k = 0; k < cols && i + k < imgs.length; k++) {
        const im = imgs[i + k];
        const s = Math.min(cw / im.width, ch / im.height);
        const w = im.width * s, h = im.height * s;
        page.drawImage(im, { x: M + k * (cw + gap) + (cw - w) / 2, y: y - h, width: w, height: h });
      }
      y -= ch + gap;
    }
  }

  // ---------- pied de page ----------
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M - 4 }, end: { x: PAGE[0] - M, y: M - 4 }, thickness: 0.6, color: col(C.line) });
    pg.drawText("NoutBook", { x: M, y: M - 18, size: 8.5, font: sansB, color: col(C.muted) });
    const lab = `${i + 1} / ${pages.length}`;
    pg.drawText(lab, { x: PAGE[0] - M - sans.widthOfTextAtSize(lab, 8.5), y: M - 18, size: 8.5, font: sans, color: col(C.muted) });
  });

  return doc.save();
}

// Nom de fichier propre : « Tarte aux pommes.pdf »
export function pdfFileName(title) {
  const t = String(title || "Recette").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return (t || "Recette") + ".pdf";
}
