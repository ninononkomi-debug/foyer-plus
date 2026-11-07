// Fabrique les images (PNG) envoyées aux clientes sur WhatsApp :
// facture et relevé des paiements.
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './security.js';
import { money, num, dateFr } from './format.js';
import { factTotals, LIV_LABEL, STATUT_LABEL, MODES } from './market.js';
import logoUrl from '../assets/orlymarket-logo.jpg';

const W = 1080;
const PAD = 64;
const C = {
  primary: '#D3145A', deep: '#A10A42', ink: '#18131A', muted: '#7A6F75', line: '#EFE7EA', soft: '#FCEBF1', bg: '#FFFFFF',
  green: '#0F8A55', greenBg: '#E8F6EF', amber: '#B7700A', amberBg: '#FFF4E0', blue: '#2563A8', blueBg: '#E8F1FC',
};
const F = (w, size) => `${w} ${size}px "Plus Jakarta Sans", Arial, sans-serif`;
const ST = { route: [C.amber, C.amberBg], dispo: [C.blue, C.blueBg], livre: [C.green, C.greenBg] };
const MODE_L = Object.fromEntries(MODES);

let logoImg = null;
function loadLogo() {
  if (logoImg) return Promise.resolve(logoImg);
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => { logoImg = i; res(i); };
    i.onerror = () => res(null);
    i.src = logoUrl;
  });
}
async function fontsReady() {
  try {
    await Promise.all([600, 700, 800].map((w) => document.fonts.load(F(w, 20))));
    await document.fonts.ready;
  } catch (e) { /* police système */ }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Mise en page en deux passes : mesure de la hauteur puis dessin.
function compose(draw) {
  const probe = document.createElement('canvas').getContext('2d');
  const h = draw(probe, false);
  const c = document.createElement('canvas');
  c.width = W; c.height = Math.ceil(h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, c.height);
  draw(ctx, true);
  return c;
}

function header(ctx, on, y, b, title, sub) {
  // bandeau
  if (on) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, C.deep); g.addColorStop(1, C.primary);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 14);
  }
  y += 40;
  const L = 150;
  if (on && logoImg) {
    ctx.save(); ctx.beginPath(); ctx.arc(PAD + L / 2, y + L / 2, L / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logoImg, PAD, y, L, L); ctx.restore();
  }
  const x = PAD + L + 28;
  ctx.textBaseline = 'alphabetic';
  ctx.font = F(800, 44); if (on) { ctx.fillStyle = C.ink; ctx.fillText(b.nom || 'OrlyMarket', x, y + 52); }
  ctx.font = F(600, 24); if (on) { ctx.fillStyle = C.muted; ctx.fillText(b.slogan || 'Boutique en ligne', x, y + 88); }
  const info = [b.whatsapp && `WhatsApp ${b.whatsapp}`, b.adresse].filter(Boolean).join('  ·  ');
  ctx.font = F(600, 22); if (on && info) { ctx.fillStyle = C.muted; ctx.fillText(info, x, y + 122); }
  // titre du document à droite
  ctx.textAlign = 'right';
  ctx.font = F(800, 34); if (on) { ctx.fillStyle = C.primary; ctx.fillText(title, W - PAD, y + 52); }
  ctx.font = F(600, 24); if (on) { ctx.fillStyle = C.ink; sub.forEach((s, i) => ctx.fillText(s, W - PAD, y + 90 + i * 32)); }
  ctx.textAlign = 'left';
  y += L + 34;
  if (on) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - 2 * PAD, 2); }
  return y + 34;
}

function clientBlock(ctx, on, y, cliente) {
  ctx.font = F(700, 20); if (on) { ctx.fillStyle = C.muted; ctx.fillText('CLIENTE', PAD, y + 20); }
  ctx.font = F(800, 34); if (on) { ctx.fillStyle = C.ink; ctx.fillText(cliente.nom || 'Cliente', PAD, y + 62); }
  let yy = y + 62;
  const extra = [cliente.telephone, cliente.quartier].filter(Boolean).join('  ·  ');
  if (extra) { ctx.font = F(600, 24); if (on) { ctx.fillStyle = C.muted; ctx.fillText(extra, PAD, yy + 36); } yy += 36; }
  return yy + 36;
}

function pill(ctx, on, x, y, text, [fg, bg], align = 'left') {
  ctx.font = F(700, 20);
  const w = ctx.measureText(text).width + 28;
  const px = align === 'right' ? x - w : x;
  if (on) { ctx.fillStyle = bg; rr(ctx, px, y, w, 36, 18); ctx.fill(); ctx.fillStyle = fg; ctx.fillText(text, px + 14, y + 25); }
  return w;
}

function payBlock(ctx, on, y, b) {
  const lines = [];
  if (b.airtel) lines.push(`Airtel Money : ${b.airtel}`);
  if (b.moov) lines.push(`Moov Money : ${b.moov}`);
  if (!lines.length) return y;
  ctx.font = F(700, 20); if (on) { ctx.fillStyle = C.muted; ctx.fillText('POUR PAYER', PAD, y + 20); }
  y += 32;
  ctx.font = F(700, 26);
  for (const l of lines) { if (on) { ctx.fillStyle = C.ink; ctx.fillText(l, PAD, y + 26); } y += 38; }
  return y + 10;
}

function footer(ctx, on, y, b) {
  y += 10;
  if (on) { ctx.fillStyle = C.soft; ctx.fillRect(0, y, W, 120); }
  ctx.textAlign = 'center';
  ctx.font = F(700, 26); if (on) { ctx.fillStyle = C.deep; ctx.fillText(b.merci || 'Merci pour votre confiance !', W / 2, y + 54); }
  ctx.font = F(600, 20); if (on) { ctx.fillStyle = C.muted; ctx.fillText(`${b.nom || 'OrlyMarket'} · Fiable · Rapide · Sécurisé`, W / 2, y + 88); }
  ctx.textAlign = 'left';
  return y + 120;
}

function totalsBlock(ctx, on, y, rows, big) {
  const x0 = 360;
  for (const [l, v, color] of rows) {
    ctx.font = F(600, 26); if (on) { ctx.fillStyle = C.muted; ctx.fillText(l, x0, y + 28); }
    ctx.textAlign = 'right'; ctx.font = F(700, 26); if (on) { ctx.fillStyle = color || C.ink; ctx.fillText(v, W - PAD, y + 28); }
    ctx.textAlign = 'left';
    y += 44;
  }
  if (big) {
    y += 8;
    if (on) { ctx.fillStyle = big.paid ? C.greenBg : C.soft; rr(ctx, PAD, y, W - 2 * PAD, 108, 22); ctx.fill(); }
    ctx.font = F(800, 30); if (on) { ctx.fillStyle = big.paid ? C.green : C.deep; ctx.fillText(big.label, PAD + 32, y + 66); }
    ctx.textAlign = 'right'; ctx.font = F(800, 48); if (on) { ctx.fillStyle = big.paid ? C.green : C.primary; ctx.fillText(big.value, W - PAD - 32, y + 72); }
    ctx.textAlign = 'left';
    y += 130;
  }
  return y;
}

// ---------------- Montant en lettres ----------------
const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const D = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
function lt100(n) {
  if (n <= 16) return U[n];
  if (n < 20) return `dix-${U[n - 10]}`;
  if (n < 70) { const d = Math.floor(n / 10), u = n % 10; return u === 0 ? D[d] : u === 1 ? `${D[d]} et un` : `${D[d]}-${U[u]}`; }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${lt100(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${lt100(n - 80)}`;
}
function lt1000(n) {
  const c = Math.floor(n / 100), r = n % 100;
  let s = c === 0 ? '' : c === 1 ? 'cent' : `${U[c]} cent${r === 0 ? 's' : ''}`;
  if (r) s = s ? `${s} ${lt100(r)}` : lt100(r);
  return s;
}
export function enLettres(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'zéro';
  const parts = [];
  const mds = Math.floor(n / 1e9), mns = Math.floor((n % 1e9) / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (mds) parts.push(`${lt1000(mds)} milliard${mds > 1 ? 's' : ''}`);
  if (mns) parts.push(`${lt1000(mns)} million${mns > 1 ? 's' : ''}`);
  if (mil) parts.push(mil === 1 ? 'mille' : `${lt1000(mil).replace(/cents$/, 'cent').replace(/vingts$/, 'vingt')} mille`);
  if (r) parts.push(lt1000(r));
  return parts.join(' ');
}

// ---------------- Tableau ----------------
// cols : [{ t: titre, w: largeur, a: 'left'|'center'|'right' }]
function table(ctx, on, y, cols, rows, opt = {}) {
  const x0 = opt.x || PAD;
  const width = cols.reduce((x, c) => x + c.w, 0);
  const headH = 58;
  const pad = 18;
  if (on) {
    ctx.fillStyle = C.ink; ctx.fillRect(x0, y, width, headH);
    ctx.font = F(700, 20); ctx.fillStyle = '#fff';
    let x = x0;
    for (const c of cols) {
      ctx.textAlign = c.a || 'left';
      const tx = c.a === 'right' ? x + c.w - pad : c.a === 'center' ? x + c.w / 2 : x + pad;
      ctx.fillText(c.t, tx, y + 37);
      x += c.w;
    }
    ctx.textAlign = 'left';
  }
  let yy = y + headH;
  const groups = [];
  rows.forEach((r, ri) => {
    if (r.group) {
      const gh = 54;
      groups.push([yy, r]);
      if (on) {
        ctx.fillStyle = C.soft; ctx.fillRect(x0, yy, width, gh);
        ctx.font = F(800, 22); ctx.fillStyle = C.deep; ctx.fillText(r.group, x0 + pad, yy + 35);
        if (r.right) { ctx.textAlign = 'right'; ctx.fillText(r.right, x0 + width - pad, yy + 35); ctx.textAlign = 'left'; }
        ctx.fillStyle = C.line; ctx.fillRect(x0, yy + gh - 2, width, 2);
      }
      yy += gh;
      return;
    }
    // mesure de la hauteur de la ligne
    ctx.font = F(600, 25);
    const cells = r.cells.map((v, i) => wrap(ctx, String(v ?? ''), cols[i].w - 2 * pad));
    const nl = Math.max(...cells.map((c) => c.length));
    const h = 26 + nl * 34 + (r.sub ? 34 : 0) + 8;
    if (on) {
      if (ri % 2 === 1) { ctx.fillStyle = '#FBF7F9'; ctx.fillRect(x0, yy, width, h); }
      let x = x0;
      cells.forEach((lines, i) => {
        const c = cols[i];
        ctx.textAlign = c.a || 'left';
        const tx = c.a === 'right' ? x + c.w - pad : c.a === 'center' ? x + c.w / 2 : x + pad;
        ctx.font = F(i === cols.length - 1 || c.bold ? 700 : 600, 25);
        ctx.fillStyle = c.muted ? C.muted : C.ink;
        lines.forEach((ln, li) => ctx.fillText(ln, tx, yy + 40 + li * 34));
        if (r.sub && i === r.subCol) { ctx.font = F(700, 19); ctx.fillStyle = r.sub[1]; ctx.fillText(r.sub[0], tx, yy + 40 + lines.length * 34); }
        x += c.w;
      });
      ctx.textAlign = 'left';
      ctx.fillStyle = C.line; ctx.fillRect(x0, yy + h - 2, width, 2);
    }
    yy += h;
  });
  if (on) {
    // bordures verticales et cadre
    ctx.strokeStyle = '#D9CDD3'; ctx.lineWidth = 2;
    ctx.strokeRect(x0, y, width, yy - y);
    let x = x0;
    for (let i = 0; i < cols.length - 1; i++) { x += cols[i].w; ctx.beginPath(); ctx.moveTo(x, y + headH); ctx.lineTo(x, yy); ctx.stroke(); }
    // les lignes « Facture N° … » passent par-dessus les séparateurs de colonnes
    for (const [gy, r] of groups) {
      ctx.fillStyle = C.soft; ctx.fillRect(x0 + 1, gy, width - 2, 52);
      ctx.font = F(800, 22); ctx.fillStyle = C.deep; ctx.fillText(r.group, x0 + pad, gy + 35);
      if (r.right) { ctx.textAlign = 'right'; ctx.fillText(r.right, x0 + width - pad, gy + 35); ctx.textAlign = 'left'; }
    }
  }
  return yy;
}

// Récapitulatif des montants (cadre à droite)
function recap(ctx, on, y, rows) {
  const w = 560, x0 = W - PAD - w, lh = 54;
  rows.forEach((r) => {
    const big = r.big;
    const h = big ? 72 : lh;
    if (on) {
      if (r.fill) { ctx.fillStyle = r.fill; ctx.fillRect(x0, y, w, h); }
      ctx.strokeStyle = '#D9CDD3'; ctx.lineWidth = 2; ctx.strokeRect(x0, y, w, h);
      ctx.font = F(big ? 800 : r.bold ? 800 : 600, big ? 28 : 24); ctx.fillStyle = r.fg || C.ink;
      ctx.fillText(r.l, x0 + 20, y + h / 2 + 9);
      ctx.textAlign = 'right'; ctx.font = F(800, big ? 34 : 25); ctx.fillStyle = r.vfg || r.fg || C.ink;
      ctx.fillText(r.v, x0 + w - 20, y + h / 2 + (big ? 12 : 9));
      ctx.textAlign = 'left';
    }
    y += h;
  });
  return y;
}

function infoBox(ctx, on, y, rows) {
  // petit cadre N° / Date à droite
  const w = 420, x0 = W - PAD - w, h = 50;
  rows.forEach(([l, v], i) => {
    if (on) {
      ctx.fillStyle = i % 2 ? '#fff' : C.soft; ctx.fillRect(x0, y + i * h, w, h);
      ctx.strokeStyle = '#D9CDD3'; ctx.lineWidth = 2; ctx.strokeRect(x0, y + i * h, w, h);
      ctx.font = F(600, 22); ctx.fillStyle = C.muted; ctx.fillText(l, x0 + 18, y + i * h + 33);
      ctx.textAlign = 'right'; ctx.font = F(800, 24); ctx.fillStyle = C.ink; ctx.fillText(v, x0 + w - 18, y + i * h + 33); ctx.textAlign = 'left';
    }
  });
  return y + rows.length * h;
}

function docHead(ctx, on, b, title, cliente, refs) {
  if (on) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, C.deep); g.addColorStop(1, C.primary);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 14);
  }
  let y = 46;
  const L = 130;
  if (on && logoImg) {
    ctx.save(); ctx.beginPath(); ctx.arc(PAD + L / 2, y + L / 2, L / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logoImg, PAD, y, L, L); ctx.restore();
  }
  const x = PAD + L + 24;
  ctx.font = F(800, 38); if (on) { ctx.fillStyle = C.ink; ctx.fillText(b.nom || 'OrlyMarket', x, y + 46); }
  ctx.font = F(600, 21); if (on) { ctx.fillStyle = C.muted; ctx.fillText(b.slogan || 'Boutique en ligne', x, y + 78); }
  const info1 = [b.whatsapp && `WhatsApp : ${b.whatsapp}`, b.adresse].filter(Boolean).join('  ·  ');
  if (on && info1) { ctx.font = F(600, 20); ctx.fillStyle = C.muted; ctx.fillText(info1, x, y + 108); }
  // titre à droite
  ctx.textAlign = 'right'; ctx.font = F(800, 54);
  if (on) { ctx.fillStyle = C.primary; ctx.fillText(title, W - PAD, y + 62); }
  ctx.textAlign = 'left';
  y += L + 28;
  if (on) { ctx.fillStyle = C.ink; ctx.fillRect(PAD, y, W - 2 * PAD, 3); }
  y += 22;
  // ligne cliente (gauche) / références (droite)
  if (on) {
    ctx.font = F(700, 19); ctx.fillStyle = C.muted; ctx.fillText('CLIENTE', PAD, y + 22);
    ctx.font = F(800, 30); ctx.fillStyle = C.ink; ctx.fillText(cliente.nom || 'Cliente', PAD, y + 60);
    const extra = [cliente.telephone && `Tél. ${cliente.telephone}`, cliente.quartier].filter(Boolean).join('  ·  ');
    if (extra) { ctx.font = F(600, 21); ctx.fillStyle = C.muted; ctx.fillText(extra, PAD, y + 92); }
    ctx.textAlign = 'right';
    refs.forEach(([l, v], i) => {
      const yy = y + 30 + i * 36;
      ctx.font = F(800, 26); ctx.fillStyle = C.ink; ctx.fillText(v, W - PAD, yy);
      const vw = ctx.measureText(v).width;
      ctx.font = F(600, 22); ctx.fillStyle = C.muted; ctx.fillText(l, W - PAD - vw - 12, yy);
    });
    ctx.textAlign = 'left';
  }
  y += Math.max(104, refs.length * 36 + 20);
  if (on) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - 2 * PAD, 2); }
  return y + 28;
}

function sectionTitle(ctx, on, y, t) {
  ctx.font = F(800, 22); if (on) { ctx.fillStyle = C.ink; ctx.fillText(t, PAD, y + 24); }
  return y + 40;
}

const ST_TXT = { route: ['En route', C.amber], dispo: ['Disponible', C.blue], livre: ['Livré', C.green] };
const ART_COLS = () => [
  { t: 'QTÉ', w: 100, a: 'center', bold: true },
  { t: 'DÉSIGNATION', w: W - 2 * PAD - 100 - 210 - 220 },
  { t: 'PRIX UNITAIRE', w: 210, a: 'right' },
  { t: 'MONTANT', w: 220, a: 'right' },
];
const artRows = (d) => (d.lignes || []).map((l) => {
  const q = num(l.qte) || 1;
  return { cells: [String(q), l.designation, money(l.pv), money(q * num(l.pv))], sub: ST_TXT[l.statut || 'route'], subCol: 1 };
});

function lettres(ctx, on, y, total, mot) {
  ctx.font = F(600, 23);
  const ls = wrap(ctx, `Arrêtée la présente ${mot} à la somme de ${enLettres(total)} francs CFA (${money(total)}).`, W - 2 * PAD);
  ls.forEach((ln, i) => { if (on) { ctx.fillStyle = C.ink; ctx.fillText(ln, PAD, y + 24 + i * 32); } });
  return y + ls.length * 32 + 26;
}

function versements(ctx, on, y, pays) {
  if (!pays.length) return y;
  y = sectionTitle(ctx, on, y, 'Versements reçus');
  y = table(ctx, on, y, [
    { t: 'DATE DU VERSEMENT', w: 300 }, { t: 'MODE DE PAIEMENT', w: W - 2 * PAD - 300 - 250 }, { t: 'MONTANT', w: 250, a: 'right' },
  ], pays.map((p) => ({ cells: [dateFr(p.date), MODE_L[p.mode] || 'Espèces', money(p.montant)] })));
  return y + 26;
}

// ---------------- FACTURE ----------------
export async function invoiceCanvas({ facture, cliente, boutique }) {
  await Promise.all([fontsReady(), loadLogo()]);
  const d = facture.data;
  const t = factTotals(facture);
  return compose((ctx, on) => {
    let y = docHead(ctx, on, boutique, 'FACTURE', cliente || {}, [['N°', d.numero], ['Date :', dateFr(d.date)]]);
    y = table(ctx, on, y, ART_COLS(), artRows(d));
    y += 26;
    const rec = [{ l: `Total brut (${t.nb} pièce${t.nb > 1 ? 's' : ''})`, v: money(t.sousTotal) }];
    if (t.remise > 0) rec.push({ l: `Remise${d.remise_type === 'pct' ? ` (${num(d.remise)} %)` : ''}`, v: `- ${money(t.remise)}`, vfg: C.primary });
    if (num(d.livraison)) rec.push({ l: 'Frais de livraison', v: `+ ${money(d.livraison)}` });
    rec.push({ l: 'NET À PAYER', v: money(t.total), bold: true, fill: C.ink, fg: '#fff' });
    if (t.paye > 0) rec.push({ l: 'Déjà versé', v: `- ${money(t.paye)}`, vfg: C.green });
    rec.push(t.reste > 0 ? { l: 'RESTE À PAYER', v: money(t.reste), big: true, fill: C.primary, fg: '#fff' } : { l: 'FACTURE SOLDÉE', v: money(t.total), big: true, fill: C.green, fg: '#fff' });
    y = recap(ctx, on, y, rec);
    y = lettres(ctx, on, y + 30, t.total, 'facture');
    y = versements(ctx, on, y, d.paiements || []);
    if (d.note_cliente) {
      ctx.font = F(600, 23);
      const nl = wrap(ctx, `Note : ${d.note_cliente}`, W - 2 * PAD);
      nl.forEach((ln, i) => { if (on) { ctx.fillStyle = C.muted; ctx.fillText(ln, PAD, y + 24 + i * 32); } });
      y += nl.length * 32 + 20;
    }
    return footer(ctx, on, y + 10, boutique);
  });
}

// ---------------- RELEVÉ DES PAIEMENTS ----------------
// Une seule facture : même présentation que la facture, centrée sur les versements.
// Plusieurs factures : les articles sont regroupés par facture dans un seul tableau.
export async function statementCanvas({ factures, cliente, boutique }) {
  const fs = [...factures].sort((a, b) => (a.data.date || '').localeCompare(b.data.date || ''));
  if (fs.length === 1) return invoiceCanvas({ facture: fs[0], cliente, boutique });
  await Promise.all([fontsReady(), loadLogo()]);
  let gTotal = 0, gPaye = 0;
  fs.forEach((f) => { const t = factTotals(f); gTotal += t.total; gPaye += t.paye; });
  const gReste = Math.max(0, gTotal - gPaye);
  const now = new Date();
  const dstr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  return compose((ctx, on) => {
    let y = docHead(ctx, on, boutique, 'FACTURES', cliente || {}, [['Nombre :', String(fs.length)], ['Au', dstr]]);
    const rows = [];
    fs.forEach((f) => {
      const t = factTotals(f);
      rows.push({ group: `Facture N° ${f.data.numero} du ${dateFr(f.data.date)}`, right: `Net : ${money(t.total)}` });
      rows.push(...artRows(f.data));
      if (t.remise > 0) rows.push({ cells: ['', `Remise${f.data.remise_type === 'pct' ? ` (${num(f.data.remise)} %)` : ''}`, '', `- ${money(t.remise)}`] });
      if (num(f.data.livraison)) rows.push({ cells: ['', 'Frais de livraison', '', money(f.data.livraison)] });
    });
    y = table(ctx, on, y, ART_COLS(), rows);
    y += 26;
    y = recap(ctx, on, y, [
      { l: 'Total des factures', v: money(gTotal), bold: true },
      { l: 'Déjà versé', v: `- ${money(gPaye)}`, vfg: C.green },
      gReste > 0 ? { l: 'RESTE À PAYER', v: money(gReste), big: true, fill: C.primary, fg: '#fff' } : { l: 'TOUT EST PAYÉ', v: money(gPaye), big: true, fill: C.green, fg: '#fff' },
    ]);
    y += 30;
    const pays = [];
    fs.forEach((f) => (f.data.paiements || []).forEach((p) => pays.push(p)));
    pays.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    y = versements(ctx, on, y, pays);
    return footer(ctx, on, y + 10, boutique);
  });
}

// ---------------- Partage ----------------
export async function shareCanvas(canvas, filename, text) {
  const dataUrl = canvas.toDataURL('image/png');
  const b64 = dataUrl.split(',')[1];
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache });
    await Share.share({ title: filename, text, files: [res.uri], dialogTitle: 'Envoyer sur WhatsApp' });
    return;
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
