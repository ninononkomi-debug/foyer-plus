// Fabrique les images (PNG) envoyées aux clientes sur WhatsApp :
// facture et point de paiement.
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
  const x0 = W / 2 - 20;
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

// ---------------- FACTURE ----------------
export async function invoiceCanvas({ facture, cliente, boutique }) {
  await Promise.all([fontsReady(), loadLogo()]);
  const d = facture.data;
  const t = factTotals(facture);
  return compose((ctx, on) => {
    let y = header(ctx, on, 0, boutique, 'FACTURE', [`N° ${d.numero}`, `Date : ${dateFr(d.date)}`]);
    y = clientBlock(ctx, on, y, cliente || {});
    // en-tête du tableau
    if (on) { ctx.fillStyle = C.ink; rr(ctx, PAD, y, W - 2 * PAD, 56, 14); ctx.fill(); }
    const cQ = 640, cP = 790, cT = W - PAD - 24;
    ctx.font = F(700, 21);
    if (on) {
      ctx.fillStyle = '#fff'; ctx.fillText('ARTICLE', PAD + 24, y + 36);
      ctx.textAlign = 'center'; ctx.fillText('QTÉ', cQ, y + 36);
      ctx.textAlign = 'right'; ctx.fillText('PRIX', cP + 70, y + 36); ctx.fillText('TOTAL', cT, y + 36); ctx.textAlign = 'left';
    }
    y += 72;
    for (const l of d.lignes || []) {
      ctx.font = F(700, 27);
      const lines = wrap(ctx, l.designation, cQ - PAD - 70);
      lines.forEach((ln, i) => { if (on) { ctx.fillStyle = C.ink; ctx.fillText(ln, PAD + 8, y + 30 + i * 36); } });
      ctx.font = F(600, 26);
      if (on) {
        ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText(String(num(l.qte || 1)), cQ, y + 30);
        ctx.textAlign = 'right'; ctx.fillStyle = C.muted; ctx.fillText(money(l.pv), cP + 70, y + 30);
        ctx.fillStyle = C.ink; ctx.font = F(700, 26); ctx.fillText(money(num(l.qte || 1) * num(l.pv)), cT, y + 30); ctx.textAlign = 'left';
      }
      const yy = y + 30 + (lines.length - 1) * 36 + 14;
      pill(ctx, on, PAD + 8, yy, LIV_LABEL[l.statut === 'livre' ? 'livre' : l.statut || 'route'].replace('Livrée', 'Livré'), ST[l.statut || 'route']);
      y = yy + 54;
      if (on) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y - 8, W - 2 * PAD, 2); }
      y += 8;
    }
    y += 12;
    const rows = [['Sous-total', money(t.sousTotal)]];
    if (num(d.livraison)) rows.push(['Livraison', money(d.livraison)]);
    rows.push(['Total', money(t.total)]);
    if (t.paye > 0) rows.push(['Acompte versé', `- ${money(t.paye)}`, C.green]);
    y = totalsBlock(ctx, on, y, rows, t.reste > 0 ? { label: 'Reste à payer', value: money(t.reste) } : { label: 'Facture soldée', value: money(t.total), paid: true });
    // détail des versements
    if ((d.paiements || []).length) {
      ctx.font = F(700, 20); if (on) { ctx.fillStyle = C.muted; ctx.fillText('VERSEMENTS REÇUS', PAD, y + 20); }
      y += 34;
      for (const p of d.paiements) {
        ctx.font = F(600, 24);
        if (on) {
          ctx.fillStyle = C.ink; ctx.fillText(`${dateFr(p.date)}  ·  ${MODE_L[p.mode] || 'Espèces'}`, PAD, y + 24);
          ctx.textAlign = 'right'; ctx.font = F(700, 24); ctx.fillStyle = C.green; ctx.fillText(money(p.montant), W - PAD, y + 24); ctx.textAlign = 'left';
        }
        y += 36;
      }
      y += 16;
    }
    if (t.reste > 0) y = payBlock(ctx, on, y, boutique);
    if (d.note_cliente) {
      ctx.font = F(600, 23);
      const ls = wrap(ctx, d.note_cliente, W - 2 * PAD);
      ls.forEach((ln, i) => { if (on) { ctx.fillStyle = C.muted; ctx.fillText(ln, PAD, y + 24 + i * 32); } });
      y += ls.length * 32 + 20;
    }
    return footer(ctx, on, y + 10, boutique);
  });
}

// ---------------- POINT DE PAIEMENT ----------------
export async function statementCanvas({ factures, cliente, boutique }) {
  await Promise.all([fontsReady(), loadLogo()]);
  const today = new Date();
  const dstr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  let gTotal = 0, gPaye = 0;
  factures.forEach((f) => { const t = factTotals(f); gTotal += t.total; gPaye += t.paye; });
  const gReste = Math.max(0, gTotal - gPaye);
  return compose((ctx, on) => {
    let y = header(ctx, on, 0, boutique, 'POINT DE PAIEMENT', [`Au ${dstr}`]);
    y = clientBlock(ctx, on, y, cliente || {});
    for (const f of factures) {
      const t = factTotals(f);
      const d = f.data;
      const pays = d.paiements || [];
      const boxH = 150 + pays.length * 40 + (pays.length ? 10 : 0);
      if (on) { ctx.strokeStyle = C.line; ctx.lineWidth = 2; rr(ctx, PAD, y, W - 2 * PAD, boxH, 20); ctx.stroke(); }
      ctx.font = F(800, 28); if (on) { ctx.fillStyle = C.ink; ctx.fillText(`Facture ${d.numero}`, PAD + 28, y + 46); }
      ctx.font = F(600, 22); if (on) { ctx.fillStyle = C.muted; ctx.fillText(`du ${dateFr(d.date)} · ${(d.lignes || []).map((l) => l.designation).join(', ').slice(0, 48)}`, PAD + 28, y + 80); }
      pill(ctx, on, W - PAD - 28, y + 20, STATUT_LABEL[t.statut], t.statut === 'paid' ? [C.green, C.greenBg] : t.statut === 'part' ? [C.amber, C.amberBg] : ['#C62828', '#FDECEC'], 'right');
      let yy = y + 104;
      ctx.font = F(700, 24);
      if (on) { ctx.fillStyle = C.ink; ctx.fillText('Montant de la facture', PAD + 28, yy + 24); ctx.textAlign = 'right'; ctx.fillText(money(t.total), W - PAD - 28, yy + 24); ctx.textAlign = 'left'; }
      yy += 40;
      pays.forEach((p, i) => {
        ctx.font = F(600, 24);
        if (on) {
          ctx.fillStyle = C.muted; ctx.fillText(`${i === 0 ? 'Vous avez versé' : 'Puis versé'} le ${dateFr(p.date)}`, PAD + 28, yy + 24);
          ctx.textAlign = 'right'; ctx.fillStyle = C.green; ctx.font = F(700, 24); ctx.fillText(`- ${money(p.montant)}`, W - PAD - 28, yy + 24); ctx.textAlign = 'left';
        }
        yy += 40;
      });
      y += boxH + 22;
    }
    y += 6;
    y = totalsBlock(ctx, on, y, [['Total des factures', money(gTotal)], ['Total déjà versé', money(gPaye), C.green]],
      gReste > 0 ? { label: 'Il vous reste à payer', value: money(gReste) } : { label: 'Tout est payé, merci !', value: money(gPaye), paid: true });
    if (gReste > 0) y = payBlock(ctx, on, y, boutique);
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
