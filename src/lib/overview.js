// Calculs pour l'accueil, les notifications, le journal et les rapports
import { num, today, monthKey, addMonths, addDays, daysBetween, dateFr, money } from './format.js';
import { factTotals, caisses, marketParam, PARTS, clienteName, clienteStats, empruntsOuverts, empruntStats, marketMonth, encaissements } from './market.js';
import { tasksOn, lateTasks, isDone, aboStatus, aboLabel } from './agenda.js';
import { budgetMois, tontinesEnCours, enveloppesFoyer, revenusFixes } from '../screens/FoyerV2.jsx';

const pctEvol = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

// ---------------- Accueil : cartes du haut ----------------
export function marketCards(s) {
  const mk = monthKey(today());
  const prev = addMonths(mk, -1);
  const m = marketMonth(s, mk);
  const p = marketMonth(s, prev);
  const fs = s.list('facture').map((f) => ({ f, t: factTotals(f) }));
  const attente = fs.filter((x) => x.t.reste > 0);
  const limite = addDays(today(), -90);
  const actives = s.list('cliente').filter((c) => s.list('facture').some((f) => f.data.cliente === c.id && (f.data.date || '') >= limite));
  const ventesActives = actives.reduce((x, c) => x + clienteStats(s, c.id).total, 0);
  const cs = caisses(s);
  const epargneMois = s.list('facture').reduce((x, f) => {
    const r = (f.data.repart || {}).epargne;
    return x + (r?.fait && monthKey(r.date || '') === mk ? 1 : 0);
  }, 0);
  return {
    solde: { v: m.encaisse, sub: 'encaissé ce mois', evol: pctEvol(m.encaisse, p.encaisse) },
    attente: { n: attente.length, v: attente.reduce((x, a) => x + a.t.reste, 0) },
    clients: { n: actives.length, v: ventesActives },
    epargne: { v: cs.epargne.solde, sub: epargneMois ? `${epargneMois} versement${epargneMois > 1 ? 's' : ''} ce mois` : 'enveloppe épargne' },
  };
}

export function foyerCards(s) {
  const mk = monthKey(today());
  const b = budgetMois(s, mk);
  const t = tontinesEnCours(s);
  const env = enveloppesFoyer(s);
  return {
    solde: { v: b.reste, sub: `${b.faites}/${b.nb} charges réglées` },
    charges: { n: b.nb - b.faites, v: b.charges - b.montantFait },
    tontines: { n: t.length, v: t.reduce((x, r) => x + num(r.data.montant ?? r.data.a_recevoir), 0) },
    epargne: { v: env.tot.epargne || 0, sub: 'enveloppe épargne' },
  };
}

// ---------------- Enveloppes pour l'anneau ----------------
export function marketDonut(s) {
  const prm = marketParam(s);
  const cs = caisses(s);
  return PARTS.map((p) => ({ k: p.k, label: p.short === 'Pour moi' ? 'Moi-même' : p.short, pct: prm.parts[p.k], v: Math.max(0, cs[p.k].solde), color: DONUT_COLORS[p.k] }));
}
export function foyerDonut(s) {
  const env = enveloppesFoyer(s);
  const L = { epargne: 'Épargne', loisirs: 'Loisirs', divers: 'Imprévus', construction: 'Construction' };
  return Object.keys(L).map((k) => ({ k, label: L[k], v: Math.max(0, env.tot[k] || 0), color: DONUT_COLORS[k] }));
}
export const DONUT_COLORS = { relance: '#8B3FD9', epargne: '#16A34A', charges: '#F28C1B', moi: '#E6337A', loisirs: '#2E7CF6', divers: '#F28C1B', construction: '#8B3FD9' };

export function topClients(s, n = 3) {
  return s.list('cliente').map((c) => ({ c, total: clienteStats(s, c.id).total })).filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total).slice(0, n);
}

// ---------------- Notifications ----------------
export function alertes(s, sections) {
  const out = [];
  const t0 = today();
  const day = Number(t0.slice(8));
  const late = lateTasks(s);
  if (late.length) out.push({ lvl: 'danger', ico: 'task', title: `${late.length} tâche${late.length > 1 ? 's' : ''} en retard`, text: late.slice(0, 3).map((x) => x.data.titre).join(', '), go: 'taches' });
  const todo = tasksOn(s, t0).filter((x) => !isDone(x, t0));
  if (todo.length) out.push({ lvl: 'info', ico: 'task', title: `${todo.length} tâche${todo.length > 1 ? 's' : ''} aujourd'hui`, text: todo.slice(0, 3).map((x) => `${x.data.heure ? `${x.data.heure} ` : ''}${x.data.titre}`).join(' · '), go: 'taches' });
  for (const a of s.list('abonnement')) {
    const st = aboStatus(a);
    if (st.level === 'late' || st.level === 'soon') out.push({ lvl: st.level === 'late' ? 'danger' : 'warn', ico: 'abo', title: `${a.data.nom} : ${st.j < 0 ? 'échéance dépassée' : `fin ${aboLabel(st.j)}`}`, text: money(a.data.montant), go: 'agenda:abos' });
  }
  const b = budgetMois(s, monthKey(t0));
  if (b.reste < 0) out.push({ lvl: 'danger', ico: 'foyer', title: 'Foyer dans le rouge ce mois', text: `Il manque ${money(-b.reste)}`, go: 'foyer' });
  if (day >= 10 && b.nb - b.faites > 0) out.push({ lvl: 'warn', ico: 'foyer', title: `${b.nb - b.faites} charge${b.nb - b.faites > 1 ? 's' : ''} pas encore réglée${b.nb - b.faites > 1 ? 's' : ''}`, text: money(b.charges - b.montantFait), go: 'foyer' });
  const prevMk = addMonths(monthKey(t0), -1);
  const nomPrev = new Date(`${prevMk}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' });
  const loyer = s.list('loyer_mois').find((x) => x.data.mois === prevMk);
  if (!loyer?.data.verse && s.list('loyer_cfg').length) out.push({ lvl: day > 10 ? 'danger' : 'warn', ico: 'loyer', title: day > 10 ? `Loyer de ${nomPrev} en retard` : `Loyer de ${nomPrev} attendu (délai le 10)`, text: s.list('loyer_cfg')[0].data.locataire, go: 'foyer:loyer' });
  const bp = budgetMois(s, prevMk);
  if (bp.nb && bp.faites < bp.nb) out.push({ lvl: day > 5 ? 'danger' : 'warn', ico: 'foyer', title: `${nomPrev[0].toUpperCase()}${nomPrev.slice(1)} pas bouclé : ${bp.nb - bp.faites} charge${bp.nb - bp.faites > 1 ? 's' : ''} non réglée${bp.nb - bp.faites > 1 ? 's' : ''}`, text: day > 5 ? 'Le délai du 5 est dépassé' : 'À mettre à jour avant le 5', go: 'foyer' });
  for (const tn of tontinesEnCours(s)) {
    if (tn.data.date_fin && daysBetween(t0, tn.data.date_fin) <= 30 && daysBetween(t0, tn.data.date_fin) >= 0) out.push({ lvl: 'info', ico: 'tontine', title: `Tontine « ${tn.data.nom} » : fin le ${dateFr(tn.data.date_fin)}`, text: `À recevoir : ${money(tn.data.montant ?? tn.data.a_recevoir)}`, go: 'foyer:tontines' });
  }
  if (sections.market) {
    for (const c of s.list('cliente')) {
      const st = clienteStats(s, c.id);
      if (st.reste > 0 && st.oldestUnpaid && daysBetween(st.oldestUnpaid, t0) > 14) out.push({ lvl: 'warn', ico: 'client', title: `${c.data.nom} doit encore ${money(st.reste)}`, text: `depuis ${daysBetween(st.oldestUnpaid, t0)} jours`, go: 'market:clientes' });
    }
    for (const e of empruntsOuverts(s)) {
      const st = empruntStats(s, e);
      if (st.peutRendre > 0) out.push({ lvl: 'info', ico: 'dette', title: `Vous pouvez rendre ${money(st.peutRendre)} à ${e.data.personne}`, text: 'Les clientes ont payé', go: 'foyer:dettes' });
    }
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b2) => order[a.lvl] - order[b2.lvl]);
}

// ---------------- Journal : encaissements et dépenses ----------------
export function journal(s, sections) {
  const out = [];
  if (sections.market) {
    for (const e of encaissements(s)) out.push({ date: e.date, lib: `Paiement ${clienteName(s, e.facture)}`, sub: e.facture.data.numero, v: e.montant, src: 'market' });
    for (const m of s.list('om_mouvement')) out.push({ date: m.data.date, lib: m.data.motif, sub: `Enveloppe ${PARTS.find((p) => p.k === m.data.part)?.short || ''}`, v: -num(m.data.montant), src: 'market' });
  }
  for (const l of s.list('loyer_mois')) if (l.data.verse) out.push({ date: l.data.date || `${l.data.mois}-28`, lib: 'Loyer reçu', sub: l.data.mois, v: num(l.data.montant), src: 'foyer' });
  for (const r of revenusFixes(s)) {
    for (const [mk, f] of Object.entries(r.data.faits || {})) {
      for (const c of r.data.charges || []) if (f[c.id]) out.push({ date: typeof f[c.id] === 'string' && f[c.id].length === 10 ? f[c.id] : `${mk}-01`, lib: c.nom, sub: r.data.titulaire === 'monsieur' ? 'Charge · Monsieur' : 'Charge · Moi', v: -num(c.montant), src: 'foyer' });
    }
  }
  for (const d of s.list('dette')) {
    const moi = (d.data.type || 'dette') === 'dette';
    for (const x of d.data.remboursements || []) out.push({ date: x.date, lib: moi ? `Remboursé à ${d.data.personne}` : `Reçu de ${d.data.personne}`, sub: 'Dette', v: moi ? -num(x.montant) : num(x.montant), src: 'foyer' });
  }
  for (const x of s.list('depense_charge')) {
    const r = s.getRec(x.data.revenu);
    const c = (r?.data.charges || []).find((y) => y.id === x.data.charge);
    out.push({ date: x.data.date, lib: x.data.motif, sub: `Dépense ${c ? `· ${c.nom}` : ''}`, v: -num(x.data.montant), src: 'foyer' });
  }
  for (const x of s.list('imprevu')) out.push({ date: x.data.date, lib: x.data.motif, sub: 'Imprévu', v: -num(x.data.montant), src: 'foyer' });
  for (const x of s.list('depense')) out.push({ date: x.data.date, lib: x.data.description || x.data.categorie || 'Dépense', sub: x.data.categorie || 'Saisie', v: -num(x.data.montant), src: 'saisie', id: x.id });
  for (const x of s.list('revenu')) out.push({ date: x.data.date, lib: x.data.description || x.data.categorie || 'Entrée', sub: x.data.categorie || 'Saisie', v: num(x.data.montant), src: 'saisie', id: x.id });
  return out.filter((x) => x.date).sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------- Rapports ----------------
export function serieMarket(s, n = 6) {
  const mk = monthKey(today());
  return Array.from({ length: n }, (_, i) => addMonths(mk, i - n + 1)).map((m) => {
    const x = marketMonth(s, m);
    return { m, ventes: x.ca, benef: x.benef, encaisse: x.encaisse };
  });
}
export function serieFoyer(s, n = 6) {
  const mk = monthKey(today());
  return Array.from({ length: n }, (_, i) => addMonths(mk, i - n + 1)).map((m) => {
    const b = budgetMois(s, m);
    const ep = (s.list('epargne_foyer')[0]?.data.mois || {})[m] || {};
    const mis = Object.values(ep).reduce((x, v) => x + (v?.fait ? num(v.montant) : 0), 0);
    return { m, revenus: b.revenus, charges: b.montantFait, mis };
  });
}
