// OrlyMarket : factures, clientes, encaissements et répartition du bénéfice
import { num, today, monthKey, uid } from './format.js';

export const PARTS = [
  { k: 'relance', label: 'Relance du commerce', short: 'Relance', color: '#D3145A', help: 'Nouveaux stocks, publicité, matériel' },
  { k: 'epargne', label: 'Épargne', short: 'Épargne', color: '#0F8A55', help: 'Mise de côté, à ne pas toucher' },
  { k: 'charges', label: 'Charges', short: 'Charges', color: '#B7700A', help: 'Transport, emballages, crédit internet, frais Mobile Money' },
  { k: 'moi', label: 'Pour moi', short: 'Pour moi', color: '#2563A8', help: 'À répartir dans « Affectation »' },
];
export const DEFAULT_PCT = { relance: 35, epargne: 25, charges: 25, moi: 15 };
export const CAPITAL = { k: 'capital', label: 'Capital à racheter', short: 'Capital', color: '#18131A', help: "Prix fournisseur récupéré : il sert à racheter la marchandise" };

export const ARTICLE_ST = [
  ['route', 'En route'],
  ['dispo', 'Disponible'],
  ['livre', 'Livré'],
];
export const MODES = [['especes', 'Espèces'], ['airtel', 'Airtel Money'], ['moov', 'Moov Money'], ['virement', 'Virement']];

export function marketParam(s) {
  const p = s.list('om_param')[0];
  const d = p?.data || {};
  return {
    rec: p,
    parts: { ...DEFAULT_PCT, ...(d.parts || {}) },
    debut: d.debut || `${monthKey(today())}-01`,
    boutique: {
      nom: 'OrlyMarket', slogan: 'Boutique en ligne', whatsapp: '', adresse: 'Libreville', airtel: '', moov: '',
      merci: 'Merci pour votre confiance ! Votre satisfaction, notre priorité.',
      ...(d.boutique || {}),
    },
    raw: d,
  };
}
export function saveMarketParam(s, patch) {
  const p = s.list('om_param')[0];
  s.save('om_param', { ...(p?.data || {}), ...patch }, { id: p?.id, shared: false });
}

// ---------- Factures ----------
export function factTotals(f) {
  const d = f.data || f;
  const lignes = d.lignes || [];
  const sousTotal = lignes.reduce((x, l) => x + num(l.qte || 1) * num(l.pv), 0);
  const total = sousTotal + num(d.livraison);
  const paye = (d.paiements || []).reduce((x, p) => x + num(p.montant), 0);
  const achat = lignes.reduce((x, l) => x + num(l.qte || 1) * num(l.pa), 0);
  const cout = achat + num(d.frais);
  const benef = total - cout;
  const reste = Math.max(0, total - paye);
  const statut = total > 0 && paye >= total ? 'paid' : paye > 0 ? 'part' : 'unpaid';
  const sts = lignes.map((l) => l.statut || 'route');
  const livraison = !sts.length ? 'route' : sts.every((x) => x === 'livre') ? 'livre' : sts.some((x) => x === 'route') ? 'route' : sts.every((x) => x !== 'route') && sts.some((x) => x === 'dispo') ? 'dispo' : 'route';
  return { sousTotal, total, paye, reste, achat, cout, benef, statut, livraison, nb: lignes.reduce((x, l) => x + num(l.qte || 1), 0) };
}
export const STATUT_LABEL = { paid: 'Soldée', part: 'Acompte versé', unpaid: 'Non payée' };
export const LIV_LABEL = { route: 'En route', dispo: 'Disponible', livre: 'Livrée' };

export function nextNumero(s, date = today()) {
  const y = date.slice(0, 4);
  let max = 0;
  for (const f of s.list('facture')) {
    const m = String(f.data.numero || '').match(/^OM-(\d{4})-(\d+)$/);
    if (m && m[1] === y) max = Math.max(max, Number(m[2]));
  }
  return `OM-${y}-${String(max + 1).padStart(4, '0')}`;
}

export function clienteName(s, f) {
  const c = f.data.cliente ? s.getRec(f.data.cliente) : null;
  return c?.data.nom || f.data.client_nom || 'Cliente';
}

export function clienteStats(s, cid) {
  const fs = s.list('facture').filter((f) => f.data.cliente === cid);
  let total = 0, paye = 0, reste = 0;
  let last = '';
  for (const f of fs) {
    const t = factTotals(f);
    total += t.total; paye += t.paye; reste += t.reste;
    if (f.data.date > last) last = f.data.date;
  }
  const oldestUnpaid = fs.filter((f) => factTotals(f).reste > 0).map((f) => f.data.date).sort()[0] || null;
  return { factures: fs, nb: fs.length, total, paye, reste, last, oldestUnpaid };
}

// ---------- Encaissements et caisses ----------
// Chaque paiement reçu est découpé : part « capital » (prix fournisseur récupéré)
// et part « bénéfice », elle-même répartie selon les pourcentages.
export function encaissements(s) {
  const out = [];
  for (const f of s.list('facture')) {
    const t = factTotals(f);
    const ratio = t.total > 0 ? Math.max(0, Math.min(1, t.benef / t.total)) : 0;
    for (const p of f.data.paiements || []) {
      const m = num(p.montant);
      out.push({ facture: f, date: p.date, montant: m, benef: m * ratio, capital: m * (1 - ratio), mode: p.mode });
    }
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function caisses(s) {
  const prm = marketParam(s);
  const pct = prm.parts;
  const res = { capital: { in: 0, out: 0 } };
  PARTS.forEach((p) => { res[p.k] = { in: 0, out: 0 }; });
  for (const e of encaissements(s)) {
    if (!e.date || e.date < prm.debut) continue;
    res.capital.in += e.capital;
    PARTS.forEach((p) => { res[p.k].in += (e.benef * num(pct[p.k])) / 100; });
  }
  for (const m of s.list('om_mouvement')) {
    if (res[m.data.part]) res[m.data.part].out += num(m.data.montant);
  }
  // la part « Pour moi » alimente les affectations
  for (const a of s.list('affectation')) {
    if (a.data.source === 'om_moi') res.moi.out += num(a.data.montant);
  }
  for (const k of Object.keys(res)) { res[k].in = Math.round(res[k].in); res[k].solde = res[k].in - res[k].out; }
  return res;
}

export function marketMonth(s, mk) {
  let ca = 0, benef = 0, nb = 0, encaisse = 0, benefEnc = 0, reste = 0;
  for (const f of s.list('facture')) {
    const t = factTotals(f);
    if (monthKey(f.data.date) === mk) { ca += t.total; benef += t.benef; nb++; }
    reste += t.reste;
  }
  for (const e of encaissements(s)) if (e.date && monthKey(e.date) === mk) { encaisse += e.montant; benefEnc += e.benef; }
  return { ca, benef, nb, encaisse, benefEnc, reste };
}

// ---------- Reprise des anciennes ventes Foyer+ ----------
export function migrateOldSales(s) {
  const old = s.list('om_vente').filter((v) => v.owner_id === s.user?.id);
  if (!old.length) return 0;
  const byName = {};
  for (const c of s.list('cliente')) byName[(c.data.nom || '').toLowerCase().trim()] = c.id;
  const sorted = [...old].sort((a, b) => (a.data.date || '').localeCompare(b.data.date || ''));
  for (const v of sorted) {
    const d = v.data;
    const key = (d.client || 'Cliente').toLowerCase().trim();
    if (!byName[key]) byName[key] = s.save('cliente', { nom: d.client || 'Cliente', telephone: d.telephone || '' }, { shared: false }).id;
    const q = Math.max(1, num(d.quantite) || 1);
    const paid = d.statut === 'paye' ? num(d.facture) : d.statut === 'partiel' ? num(d.recu) : 0;
    s.save('facture', {
      numero: nextNumero(s, d.date || today()), date: d.date || today(), cliente: byName[key],
      lignes: [{ id: uid(), designation: d.produit || 'Article', qte: q, pv: num(d.facture) / q, pa: num(d.fournisseur) / q, statut: 'livre' }],
      livraison: 0, frais: num(d.frais), note: d.note || '',
      paiements: paid > 0 ? [{ id: uid(), date: d.date || today(), montant: paid, mode: 'especes' }] : [],
      repris: true,
    }, { shared: false });
    s.remove(v.id);
  }
  return old.length;
}
