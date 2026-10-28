import { num, monthKey, today, addMonths, norm } from './format.js';

export const inScope = (r, scope) =>
  scope === 'perso' ? !r.household_id : scope === 'foyer' ? !!r.household_id : true;

// Tous les mouvements d'argent (signés)
export function flows(store) {
  const out = [];
  for (const r of store.list('depense')) out.push({ id: r.id, rec: r, kind: 'depense', date: r.data.date, montant: -num(r.data.montant), wallet: r.data.portefeuille, categorie: r.data.categorie, label: r.data.description || r.data.categorie });
  for (const r of store.list('revenu')) out.push({ id: r.id, rec: r, kind: 'revenu', date: r.data.date, montant: num(r.data.montant), wallet: r.data.portefeuille, categorie: r.data.categorie, label: r.data.description || r.data.categorie });
  for (const r of store.list('loyer')) {
    const loc = store.getRec(r.data.locataire);
    out.push({ id: r.id, rec: r, kind: 'loyer', date: r.data.date, montant: num(r.data.montant), wallet: r.data.portefeuille, categorie: 'Loyers', label: `Loyer ${loc?.data.nom || ''}`.trim() });
  }
  for (const r of store.list('transfert')) {
    out.push({ id: r.id + ':o', rec: r, kind: 'transfert', date: r.data.date, montant: -num(r.data.montant), wallet: r.data.de, label: 'Transfert sortant' });
    out.push({ id: r.id + ':i', rec: r, kind: 'transfert', date: r.data.date, montant: num(r.data.montant), wallet: r.data.vers, label: 'Transfert entrant' });
  }
  for (const r of store.list('epargne')) {
    if (r.data.de) out.push({ id: r.id + ':o', rec: r, kind: 'epargne', date: r.data.date, montant: -num(r.data.montant), wallet: r.data.de, label: 'Mise en épargne' });
    if (r.data.vers) out.push({ id: r.id + ':i', rec: r, kind: 'epargne', date: r.data.date, montant: num(r.data.montant), wallet: r.data.vers, label: 'Mise en épargne' });
  }
  return out;
}

export function walletBalances(store) {
  const bal = {};
  for (const w of store.list('portefeuille')) bal[w.id] = num(w.data.solde_initial);
  for (const f of flows(store)) if (f.wallet && bal[f.wallet] !== undefined) bal[f.wallet] += f.montant;
  return bal;
}

export function monthStats(store, mk, scope = 'tout') {
  let revenus = 0, depenses = 0;
  const parCat = {};
  for (const f of flows(store)) {
    if (!f.date || monthKey(f.date) !== mk || !inScope(f.rec, scope)) continue;
    if (f.kind === 'depense') { depenses += -f.montant; parCat[f.categorie || 'Autres dépenses'] = (parCat[f.categorie || 'Autres dépenses'] || 0) - f.montant; }
    if (f.kind === 'revenu' || f.kind === 'loyer') revenus += f.montant;
  }
  return { revenus, depenses, solde: revenus - depenses, parCat };
}

export function lastMonths(store, mk, n = 6, scope = 'tout') {
  const res = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(mk, -i);
    const s = monthStats(store, m, scope);
    res.push({ mk: m, ...s });
  }
  return res;
}

export function categoriesMap(store) {
  const map = {};
  for (const c of store.list('categorie')) {
    const k = norm(c.data.nom);
    if (!map[k]) map[k] = c.data;
  }
  return map;
}
export const catInfo = (map, name) => map[norm(name)] || { nom: name || 'Autre', icone: '📦', couleur: '#94A3B8' };

// Budgets du mois : un budget sans mois = tous les mois
export function budgetStatus(store, mk, scope = 'tout') {
  const persoStats = monthStats(store, mk, 'perso').parCat;
  const foyerStats = monthStats(store, mk, 'foyer').parCat;
  const list = store.list('budget').filter((b) => inScope(b, scope) && (!b.data.mois || b.data.mois === mk));
  // un budget spécifique au mois remplace le budget permanent
  const chosen = {};
  for (const b of list) {
    const k = (b.household_id ? 'F' : 'P') + norm(b.data.categorie);
    if (!chosen[k] || b.data.mois) chosen[k] = b;
  }
  return Object.values(chosen).map((b) => {
    const stats = b.household_id ? foyerStats : persoStats;
    const k = Object.keys(stats).find((c) => norm(c) === norm(b.data.categorie));
    const depense = k ? stats[k] : 0;
    const montant = num(b.data.montant);
    return { rec: b, categorie: b.data.categorie, montant, depense, reste: montant - depense, pct: montant ? depense / montant : 0 };
  }).sort((a, b) => b.pct - a.pct);
}

export function detteReste(d) {
  const paid = (d.data.remboursements || []).reduce((s, x) => s + num(x.montant), 0);
  return Math.max(0, num(d.data.montant) - paid);
}

export function loyerMois(store, locataire, mk) {
  const paye = store.list('loyer').filter((p) => p.data.locataire === locataire.id && p.data.mois === mk).reduce((s, p) => s + num(p.data.montant), 0);
  const attendu = num(locataire.data.loyer);
  return { attendu, paye, reste: Math.max(0, attendu - paye) };
}
export function loyerEcheance(locataire, mk) {
  const j = Math.min(28, Math.max(1, parseInt(locataire.data.jour || 5, 10)));
  return `${mk}-${String(j).padStart(2, '0')}`;
}
export function locataireActifMois(l, mk) {
  if (l.data.actif === false) return false;
  if (l.data.debut && monthKey(l.data.debut) > mk) return false;
  if (l.data.fin && monthKey(l.data.fin) < mk) return false;
  return true;
}

export function objectifProgress(store, o) {
  const verse = store.list('epargne').filter((e) => e.data.objectif === o.id).reduce((s, e) => s + num(e.data.montant), 0) + num(o.data.deja);
  const cible = num(o.data.cible);
  return { verse, cible, pct: cible ? Math.min(1, verse / cible) : 0 };
}

export function omStats(store, mk) {
  const ventes = store.list('om_vente').filter((v) => !mk || monthKey(v.data.date) === mk);
  let ca = 0, cout = 0, recu = 0, frais = 0;
  for (const v of ventes) {
    ca += num(v.data.facture);
    cout += num(v.data.fournisseur);
    frais += num(v.data.frais);
    recu += v.data.statut === 'paye' ? num(v.data.facture) : num(v.data.recu);
  }
  return { nb: ventes.length, ca, cout, frais, benefice: ca - cout - frais, recu, impaye: ca - recu };
}

// Alertes affichées sur l'accueil
export function alerts(store) {
  const t = today();
  const mk = monthKey(t);
  const res = [];
  for (const l of store.list('locataire')) {
    if (!locataireActifMois(l, mk)) continue;
    const s = loyerMois(store, l, mk);
    const ech = loyerEcheance(l, mk);
    if (s.reste > 0 && ech <= t) res.push({ type: 'loyer', level: 'danger', text: `Loyer de ${l.data.nom} en retard`, amount: s.reste, go: 'locataires' });
    else if (s.reste > 0) res.push({ type: 'loyer', level: 'info', text: `Loyer de ${l.data.nom} attendu le ${ech.slice(8)}`, amount: s.reste, go: 'locataires' });
  }
  for (const d of store.list('dette')) {
    const reste = detteReste(d);
    if (!reste || !d.data.echeance) continue;
    const late = d.data.echeance < t;
    const soon = !late && d.data.echeance <= addDaysStr(t, 7);
    if (late || soon) res.push({ type: 'dette', level: late ? 'danger' : 'warn', text: `${d.data.type === 'creance' ? 'À récupérer de' : 'À rembourser à'} ${d.data.personne}${late ? ' (en retard)' : ''}`, amount: reste, go: 'dettes' });
  }
  for (const a of store.list('abonnement')) {
    if (a.data.actif === false || !a.data.prochaine) continue;
    if (a.data.prochaine <= addDaysStr(t, 5)) res.push({ type: 'abonnement', level: a.data.prochaine < t ? 'danger' : 'warn', text: `${a.data.nom} : échéance ${a.data.prochaine < t ? 'dépassée' : 'proche'}`, amount: num(a.data.montant), go: 'abonnements' });
  }
  for (const tn of store.list('tontine')) {
    if (tn.data.actif === false || !tn.data.prochaine) continue;
    if (tn.data.prochaine <= addDaysStr(t, 3)) res.push({ type: 'tontine', level: tn.data.prochaine < t ? 'danger' : 'warn', text: `Cotisation ${tn.data.nom}`, amount: num(tn.data.cotisation), go: 'tontines' });
  }
  for (const b of budgetStatus(store, mk)) {
    if (b.pct > 1) res.push({ type: 'budget', level: 'danger', text: `Budget ${b.categorie} dépassé`, amount: b.depense - b.montant, go: 'budget' });
    else if (b.pct >= 0.85) res.push({ type: 'budget', level: 'warn', text: `Budget ${b.categorie} presque atteint (${Math.round(b.pct * 100)} %)`, amount: b.reste, go: 'budget' });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return res.sort((a, b) => order[a.level] - order[b.level]);
}
function addDaysStr(d, k) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + k);
  return x.toISOString().slice(0, 10);
}
