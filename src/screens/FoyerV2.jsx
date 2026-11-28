import React, { useEffect, useState } from 'react';
import { Check, Plus, Trash2, Pencil, Settings2, Handshake, Users, PiggyBank, Wallet, KeyRound, CheckCircle2 } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, monthKey, monthLabel, uid, addMonths } from '../lib/format.js';
import { ScreenHead, Sheet, Field, MoneyInput, Segmented, MonthNav, Empty, Confirm, useToast, Progress, Fab } from '../components/ui.jsx';
import { caisses, empruntStats, factTotals, clienteName } from '../lib/market.js';
import { foyerRecapCanvas, shareCanvas } from '../lib/docImage.js';

// =====================================================================
// Données et calculs
// =====================================================================
export const TITULAIRES = [['moi', 'Moi'], ['monsieur', 'Monsieur']];

export function revenusFixes(s) {
  return s.list('revenu_fixe').sort((a, b) => (a.data.ordre || 0) - (b.data.ordre || 0));
}
// ---------------------------------------------------------------------
// Périodes : les salaires reçus fin novembre servent aux charges de décembre.
// On repart de zéro à partir de la période « décembre 2026 ».
// ---------------------------------------------------------------------
export const FOYER_START = '2026-12';
export function periodeActuelle() {
  const t = today();
  const mk = Number(t.slice(8)) >= 25 ? addMonths(monthKey(t), 1) : monthKey(t);
  return mk < FOYER_START ? FOYER_START : mk;
}
export const moisSalaire = (mk) => new Date(`${addMonths(mk, -1)}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' });

// Montant réellement reçu (seulement s'il a été noté : sinon « en attente »)
export const estRecu = (r, mk) => (r.data.recus || {})[mk] !== undefined;
export const recuMois = (r, mk) => (estRecu(r, mk) ? num(r.data.recus[mk]) : 0);
export const depensesCharges = (s, mk) => s.list('depense_charge').filter((d) => d.data.mois === mk);
export const imprevusMois = (s, mk) => s.list('imprevu').filter((d) => d.data.mois === mk);
export const sortiesLibres = (s, mk) => s.list('sortie_libre').filter((d) => d.data.mois === mk).sort((a, b) => (a.data.date || '').localeCompare(b.data.date || ''));
export function chargeDepense(s, mk, rid, cid) {
  return depensesCharges(s, mk).filter((d) => d.data.revenu === rid && d.data.charge === cid).reduce((x, d) => x + num(d.data.montant), 0);
}
export function budgetMois(s, mk) {
  const rs = revenusFixes(s);
  let revenus = 0, charges = 0, faites = 0, nb = 0, montantFait = 0, depense = 0, aMettre = 0, prevus = 0;
  const attente = [];
  const deps = depensesCharges(s, mk);
  for (const r of rs) {
    const ok = estRecu(r, mk);
    prevus += num(r.data.montant);
    if (ok) revenus += recuMois(r, mk); else attente.push(r);
    const f = (r.data.faits || {})[mk] || {};
    for (const c of r.data.charges || []) {
      if (ok) charges += num(c.montant);
      nb++;
      const dep = deps.filter((d) => d.data.revenu === r.id && d.data.charge === c.id).reduce((x, d) => x + num(d.data.montant), 0);
      depense += dep;
      if (f[c.id]) { faites++; montantFait += num(c.montant); } else aMettre += Math.max(0, num(c.montant) - dep);
    }
  }
  const imprevus = imprevusMois(s, mk).reduce((x, d) => x + num(d.data.montant), 0);
  // seuls les salaires réellement reçus comptent : pas d'argent « imaginaire »
  return { revenus, charges, reste: revenus - charges, faites, nb, montantFait, aRenseigner: [], attente, depense, aMettre, imprevus, prevus, recuAuMoinsUn: rs.some((r) => estRecu(r, mk)) };
}

// Feu tricolore : vert = on couvre les charges ET l'épargne prévue ; orange = charges couvertes
// mais pas tout l'objectif d'épargne ; rouge = les charges dépassent l'argent reçu.
export function feu(reste, cible) {
  if (reste < 0) return { lvl: 'red', label: 'AU ROUGE', ico: '⛔' };
  if (reste < cible) return { lvl: 'orange', label: 'À SURVEILLER', ico: '⚠️' };
  return { lvl: 'green', label: 'AU VERT', ico: '✅' };
}
// Bilan du mois en cascade : reçu − charges − enveloppes = reste libre
export function bilanMois(s, mk) {
  const b = budgetMois(s, mk);
  const E = cibleEpargne(s);
  const sorties = sortiesLibres(s, mk);
  const S = sorties.reduce((x, d) => x + num(d.data.montant), 0);
  const avant = b.revenus - b.charges - E; // reste libre avant les dépenses faites dessus
  const libre = avant - S;
  let lvl = 'wait';
  if (b.recuAuMoinsUn) lvl = b.revenus < b.charges ? 'red' : libre < 0 ? 'orange' : 'green';
  return { ...b, E, S, sorties, avant, libre, lvl };
}
export function cibleEpargne(s) {
  const d = s.list('epargne_foyer')[0]?.data || {};
  const f = { epargne: 20000, loisirs: 10000, divers: 15000, construction: 10000, ...(d.fixes || {}) };
  return Object.values(f).reduce((x, v) => x + num(v), 0);
}

// Remise en ordre des données du foyer (après chaque synchro, sur chaque téléphone) :
// 1. ce qui appartient au foyer mais a été enregistré « privé » (avant d'avoir rejoint le foyer) y est replacé ;
// 2. les revenus en double (même titulaire) sont fusionnés dans le plus ancien ;
// 3. un salaire noté « reçu en novembre » avant le changement de période compte pour décembre.
const FOYER_MODULES = ['revenu_fixe', 'loyer_cfg', 'loyer_mois', 'epargne_foyer', 'depense_charge', 'imprevu', 'sortie_libre', 'besoin'];
const older = (a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id);
export function normaliserFoyer(s) {
  if (!s.user || !s.lastSyncAt) return;
  const hh = s.householdId;
  let changed = false;
  if (hh) {
    for (const m of FOYER_MODULES) {
      for (const r of s.list(m)) if (!r.household_id && r.owner_id === s.user.id) { s.save(m, r.data, { id: r.id, householdId: hh }); changed = true; }
    }
    // revenus en double
    const revs = s.list('revenu_fixe').filter((r) => r.household_id === hh).sort(older);
    const byT = {};
    for (const r of revs) (byT[r.data.titulaire || r.data.nom] ||= []).push(r);
    for (const group of Object.values(byT)) {
      if (group.length < 2) continue;
      const keep = group[0];
      let data = { ...keep.data, recus: { ...(keep.data.recus || {}) }, faits: { ...(keep.data.faits || {}) } };
      for (const dup of group.slice(1)) {
        for (const [k, v] of Object.entries(dup.data.recus || {})) if (data.recus[k] === undefined) data.recus[k] = v;
        const cmap = {};
        for (const c of dup.data.charges || []) {
          const t = (data.charges || []).find((y) => (y.nom || '').toLowerCase() === (c.nom || '').toLowerCase());
          if (t) cmap[c.id] = t.id;
        }
        for (const [mk, f] of Object.entries(dup.data.faits || {})) {
          const cur = { ...(data.faits[mk] || {}) };
          for (const [cid, v] of Object.entries(f)) if (cmap[cid] && !cur[cmap[cid]]) cur[cmap[cid]] = v;
          data.faits[mk] = cur;
        }
        for (const d of s.list('depense_charge')) if (d.data.revenu === dup.id) s.save('depense_charge', { ...d.data, revenu: keep.id, charge: cmap[d.data.charge] || d.data.charge }, { id: d.id });
        s.remove(dup.id);
      }
      s.save('revenu_fixe', data, { id: keep.id });
      changed = true;
    }
    // un seul réglage de loyer et une seule épargne du foyer
    for (const m of ['loyer_cfg', 'epargne_foyer']) {
      const list = s.list(m).filter((r) => r.household_id === hh).sort(older);
      if (list.length < 2) continue;
      const keep = list[0];
      const data = { ...keep.data };
      if (m === 'epargne_foyer') {
        data.mois = { ...(keep.data.mois || {}) };
        for (const dup of list.slice(1)) for (const [k, v] of Object.entries(dup.data.mois || {})) if (!data.mois[k]) data.mois[k] = v;
      }
      for (const dup of list.slice(1)) s.remove(dup.id);
      s.save(m, data, { id: keep.id });
      changed = true;
    }
  }
  // salaire noté « reçu en novembre » avant le changement de période → période de décembre
  for (const r of s.list('revenu_fixe')) {
    const rc = r.data.recus || {};
    if (!r.data.shift1226 && rc['2026-11'] !== undefined && rc['2026-12'] === undefined) {
      s.save('revenu_fixe', { ...r.data, recus: { ...rc, '2026-12': rc['2026-11'] }, shift1226: true }, { id: r.id });
      changed = true;
    }
  }
  return changed;
}

// Premier lancement : les revenus et charges donnés par Orly
export function seedFoyer(s) {
  // jamais avant la première synchro : sinon on crée des copies au lieu d'utiliser celles du foyer
  if (!s.user?.local && (!s.lastSyncAt || s.syncError)) return false;
  if (s.list('revenu_fixe').length) return false;
  const L = (nom, montant) => ({ id: uid(), nom, montant });
  s.save('revenu_fixe', {
    nom: 'Revenu SEEG', titulaire: 'moi', montant: 850000, ordre: 1, faits: {},
    charges: [L('Loyer', 230000), L('Budget nourriture', 110000), L('Wi-Fi', 25000), L('Tontine', 20000), L('Taxi', 50000), L('Voiture', 50000), L('Crédit bancaire', 350000)],
  }, { shared: true });
  s.save('revenu_fixe', {
    nom: "Revenu Ministère de l'Accès à l'Eau et l'Électricité", titulaire: 'monsieur', montant: 243000, maj243: true, ordre: 2, faits: {},
    charges: [L('Taxi', 50000), L('Eau à boire', 20000), L('Produits de toilette', 25000), L('Crédit bancaire', 58000), L('Caisse famille', 5000)],
  }, { shared: true });
  if (!s.list('loyer_cfg').length) {
    s.save('loyer_cfg', { locataire: 'Locataire', montant: 150000, modele: [{ id: uid(), libelle: 'Tontine', montant: 50000 }] }, { shared: true });
  }
  return true;
}

export function tontinesEnCours(s) {
  return s.list('tontine').filter((t) => !t.data.terminee && t.data.actif !== false)
    .sort((a, b) => (a.data.date_fin || '9').localeCompare(b.data.date_fin || '9'));
}
const tMontant = (t) => num(t.data.montant ?? t.data.a_recevoir);
const detteReste = (d) => Math.max(0, num(d.data.montant) - (d.data.remboursements || []).reduce((x, r) => x + num(r.montant), 0));

// =====================================================================
// Écran Foyer
// =====================================================================
const SECTIONS = [['budget', 'Ce mois'], ['enveloppes', 'Enveloppes'], ['historique', 'Historique'], ['loyer', 'Loyer'], ['dettes', 'Dettes'], ['tontines', 'Tontines']];

export default function FoyerV2({ initial, isOrly }) {
  const s = useStore();
  const [sec, setSec] = useState(initial === 'epargne' || initial === 'imprevus' ? 'enveloppes' : (initial || 'budget'));
  const [month, setMonthRaw] = useState(periodeActuelle());
  const setMonth = (m) => setMonthRaw(m < FOYER_START ? FOYER_START : m);
  const [loyerMonth, setLoyerMonth] = useState(monthKey(today()));
  useEffect(() => {
    if (!isOrly || !s.ready) return;
    seedFoyer(s);
    // salaire de Monsieur donné par Orly : 243 000 F (si encore vide)
    const m = s.list('revenu_fixe').find((r) => r.data.titulaire === 'monsieur' && !num(r.data.montant) && !r.data.maj243);
    if (m) s.save('revenu_fixe', { ...m.data, montant: 243000, maj243: true }, { id: m.id });
  }, [s.ready, s.lastSyncAt]);
  return (
    <div className="screen">
      <ScreenHead title="Foyer" sub={s.household ? `${s.household.name} · ${s.members.filter((m) => m.household_id === s.householdId).length} membre(s)` : 'Revenus, loyer, dettes, tontines, épargne'} />
      <SyncLine />
      <div className="section-chips">
        {SECTIONS.map(([k, l]) => <button key={k} className={`chip ${sec === k ? 'on' : ''}`} onClick={() => setSec(k)}>{l}</button>)}
      </div>
      {['budget', 'enveloppes'].includes(sec) && <MonthNav value={month} onChange={setMonth} />}
      {['budget', 'enveloppes'].includes(sec) && <p className="periode">Salaires de fin {moisSalaire(month)} → charges de <b>{monthLabel(month)}</b></p>}
      {sec === 'loyer' && <MonthNav value={loyerMonth} onChange={setLoyerMonth} />}
      {sec === 'budget' && <Budget mk={month} />}
      {sec === 'loyer' && <Loyer mk={loyerMonth} />}
      {sec === 'dettes' && <Dettes />}
      {sec === 'tontines' && <Tontines />}
      {sec === 'historique' && <Historique />}
      {sec === 'enveloppes' && <Enveloppes mk={month} isOrly={isOrly} />}
    </div>
  );
}

// =====================================================================
// 1. Revenus & charges du mois
// =====================================================================
function Budget({ mk }) {
  const s = useStore();
  const [edit, setEdit] = useState(null);
  const [newRev, setNewRev] = useState(false);
  const [dep, setDep] = useState(null);
  const [imp, setImp] = useState(false);
  const [detail, setDetail] = useState(null);
  const [recu, setRecu] = useState(null);
  const [lib, setLib] = useState(null);
  const rs = revenusFixes(s);
  const b = bilanMois(s, mk);
  return (
    <>
      <Cascade b={b} rs={rs} mk={mk} onRecu={setRecu} onLibre={setLib} />
      <div className="row gap">
        <button className="btn primary grow act3" onClick={() => setDep({})}><Plus size={16} /> Dépense</button>
        <button className="btn soft grow act3" onClick={() => setImp(true)}><Plus size={16} /> Imprévu</button>
        <button className="btn soft grow act3" onClick={() => setLib({})}><Plus size={16} /> Reste libre</button>
      </div>
      <p className="muted small act-help"><b>Dépense</b> : sur une charge · <b>Imprévu</b> : pris dans une enveloppe · <b>Reste libre</b> : avec l'argent qui restait</p>
      <h3 className="sec-t">Les charges du mois <small className="muted">· {b.faites}/{b.nb} réglées</small></h3>
      {rs.length === 0 && <Empty icon={<Wallet size={34} />} title="Aucun revenu" text="Ajoutez votre revenu et ses charges." />}
      {rs.map((r) => <ChargesGroup key={r.id} r={r} mk={mk} onEdit={(c) => setEdit({ r, c })} onDetail={(c) => setDetail({ r, c })} onRev={() => setNewRev(r)} />)}
      <button className="link" onClick={() => setNewRev(true)}>+ Ajouter un revenu</button>
      {edit && <ChargeSheet r={edit.r} c={edit.c} onClose={() => setEdit(null)} />}
      {newRev && <RevenuSheet rec={newRev === true ? null : newRev} onClose={() => setNewRev(false)} />}
      {dep && <DepenseSheet mk={mk} preset={dep} onClose={() => setDep(null)} />}
      {imp && <ImprevuSheet mk={mk} onClose={() => setImp(false)} />}
      {recu && <RecuSheet r={recu} mk={mk} onClose={() => setRecu(null)} />}
      {lib && <LibreSheet mk={mk} rec={lib.id ? lib : null} onClose={() => setLib(null)} />}
      {detail && <ChargeDetail mk={mk} r={detail.r} c={detail.c} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} onDep={() => { setDep({ r: detail.r.id, c: detail.c.id }); setDetail(null); }} />}
    </>
  );
}

// Le bilan, lisible d'un coup d'œil : reçu − charges − enveloppes = reste libre
function Cascade({ b, rs, mk, onRecu, onLibre }) {
  const msg = {
    wait: ['⏳ EN ATTENTE DES SALAIRES', 'Touchez un salaire quand il est arrivé.'],
    red: ['⛔ AU ROUGE', `Les charges dépassent l'argent reçu de ${money(b.charges - b.revenus)}.`],
    orange: ['⚠️ À SURVEILLER', b.avant >= 0 ? `Vous avez dépensé ${money(-b.libre)} de plus que le reste libre.` : `Charges couvertes, mais il manque ${money(-b.avant)} pour remplir les enveloppes.`],
    green: [b.libre === 0 ? '✅ TOUT EST RÉPARTI' : '✅ AU VERT', b.libre === 0 ? 'Chaque franc a sa place. Il ne reste plus rien de libre ce mois, à part ce qui est dans les enveloppes.' : `Charges et enveloppes couvertes. Il reste ${money(b.libre)} de libre.`],
  }[b.lvl];
  return (
    <section className={`cascade ${b.lvl}`}>
      <span className="feu-pill">{msg[0]}</span>
      <div className="cas-big"><small>Reste libre du mois</small><b>{b.lvl === 'wait' ? '—' : money(b.libre)}</b></div>
      <p className="cas-msg">{msg[1]}</p>
      <div className="cas-lines">
        {rs.map((r) => (
          <button key={r.id} className="cas-line" onClick={() => onRecu(r)}>
            <span>{estRecu(r, mk) ? '✅' : '⏳'} Salaire {r.data.titulaire === 'monsieur' ? 'Monsieur' : 'Moi'}</span>
            <b>{estRecu(r, mk) ? `+ ${money(recuMois(r, mk))}` : 'en attente'}</b>
          </button>
        ))}
        <div className="cas-line"><span>− Charges du mois</span><b>- {money(b.charges)}</b></div>
        <div className="cas-line"><span>− Mis dans les enveloppes</span><b>- {money(b.E)}</b></div>
        {b.sorties.map((x) => (
          <button key={x.id} className="cas-line" onClick={() => onLibre(x)}>
            <span>− {x.data.motif}</span><b>- {money(x.data.montant)}</b>
          </button>
        ))}
        <div className="cas-line total"><span>= Reste libre</span><b>{b.lvl === 'wait' ? '—' : money(b.libre)}</b></div>
      </div>
      {b.lvl !== 'wait' && b.lvl !== 'red' && <button className="cas-use" onClick={() => onLibre({})}>{b.libre > 0 ? `Utiliser le reste libre (${money(b.libre)})` : '+ Noter une dépense sur le reste libre'}</button>}
    </section>
  );
}

// Une ligne par charge : montant prévu, et ce qui a déjà été dépensé
function ChargesGroup({ r, mk, onEdit, onDetail, onRev }) {
  const s = useStore();
  const [open, setOpen] = useState(true);
  const d = r.data;
  const faits = (d.faits || {})[mk] || {};
  const charges = d.charges || [];
  const tot = charges.reduce((x, c) => x + num(c.montant), 0);
  const nbF = charges.filter((c) => faits[c.id]).length;
  const toggle = (id) => {
    const f = { ...(d.faits || {}) };
    const m = { ...(f[mk] || {}) };
    if (m[id]) delete m[id]; else m[id] = today();
    f[mk] = m;
    s.save('revenu_fixe', { ...d, faits: f }, { id: r.id });
  };
  return (
    <section className="card grp">
      <button className="grp-h" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} {d.titulaire === 'monsieur' ? 'Charges de Monsieur' : 'Mes charges'}</span>
        <small>{nbF}/{charges.length} · {money(tot)}</small>
      </button>
      {open && (
        <>
          <div className="list" style={{ margin: '0 -14px' }}>
            {charges.map((c) => {
              const dep = chargeDepense(s, mk, r.id, c.id);
              const rest = num(c.montant) - dep;
              const ratio = dep / Math.max(1, num(c.montant));
              const col = rest < 0 ? '#DC2626' : ratio >= 0.75 ? '#D97706' : '#16A34A';
              return (
                <div className="task" key={c.id}>
                  <button className={`check ${faits[c.id] ? 'on' : ''}`} onClick={() => toggle(c.id)} aria-label={faits[c.id] ? 'Décocher' : 'Cocher'}>{faits[c.id] && <Check size={16} strokeWidth={3} />}</button>
                  <button className="grow item-main" style={{ textAlign: 'left' }} onClick={() => onDetail(c)}>
                    <b className={faits[c.id] ? 'done-t' : ''}>{c.nom}</b>
                    {!faits[c.id] && dep > 0 && <small style={{ color: col, fontWeight: 700 }}>{rest < 0 ? `dépassé de ${money(-rest)}` : `reste ${money(rest)}`}</small>}
                  </button>
                  <b className={faits[c.id] ? 'muted' : ''}>{money(c.montant)}</b>
                </div>
              );
            })}
          </div>
          <div className="row gap"><button className="link" onClick={() => onEdit(null)}>+ Ajouter une charge</button><span className="grow" /><button className="link" onClick={onRev}>Modifier le salaire</button></div>
        </>
      )}
    </section>
  );
}

function SyncLine() {
  const s = useStore();
  const n = s.members.filter((m) => m.household_id === s.householdId).length;
  const t = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className={`syncline ${s.syncError ? 'err' : ''}`}>
      <span>{s.syncing ? '🔄 Mise à jour…' : s.syncError ? `⚠️ Pas synchronisé : ${s.syncError}` : t ? `✅ À jour (${t})` : '…'}</span>
      <button onClick={() => s.sync()}>Actualiser</button>
      {s.household && n <= 1 && <small>⚠️ Vous êtes seul(e) dans ce foyer : votre conjoint ne voit pas vos saisies. Voir Profil › Mon foyer.</small>}
    </div>
  );
}

function FeuHero({ s, b }) {
  if (!b.recuAuMoinsUn) {
    return (
      <section className="feu wait">
        <span className="feu-pill">⏳ EN ATTENTE DES SALAIRES</span>
        <h2>0 F reçu</h2>
        <small>Rien n'est compté tant qu'un salaire n'est pas noté « reçu ». Prévu : {money(b.prevus)}.</small>
      </section>
    );
  }
  const cible = cibleEpargne(s);
  const f = feu(b.reste, cible);
  return (
    <section className={`feu ${f.lvl}`}>
      <span className="feu-pill">{f.ico} {f.label}</span>
      <h2>{b.reste >= 0 ? '+' : ''}{money(b.reste)}</h2>
      <small>Reste après les charges · reçu {money(b.revenus)} − charges {money(b.charges)}</small>
      <small className="feu-why">{f.lvl === 'red' ? `Les charges dépassent l'argent reçu de ${money(-b.reste)}.` : f.lvl === 'orange' ? `Les charges sont couvertes, mais il manque ${money(cible - b.reste)} pour l'épargne prévue (${money(cible)}).` : `Charges couvertes et épargne prévue (${money(cible)}) possible.`}{b.attente.length ? ` En attente : ${b.attente.map((r) => (r.data.titulaire === 'monsieur' ? 'salaire de Monsieur' : 'votre salaire')).join(', ')}.` : ''}</small>
    </section>
  );
}

function RevenuCard({ r, mk, onEdit, onDetail, onDep }) {
  const s = useStore();
  const [editRev, setEditRev] = useState(false);
  const [recuOpen, setRecuOpen] = useState(false);
  const d = r.data;
  const faits = (d.faits || {})[mk] || {};
  const charges = d.charges || [];
  const tot = charges.reduce((x, c) => x + num(c.montant), 0);
  const recu = recuMois(r, mk);
  const reste = recu - tot;
  const recuOk = estRecu(r, mk);
  const toggle = (id) => {
    const f = { ...(d.faits || {}) };
    const m = { ...(f[mk] || {}) };
    if (m[id]) delete m[id]; else m[id] = today();
    f[mk] = m;
    s.save('revenu_fixe', { ...d, faits: f }, { id: r.id });
  };
  return (
    <section className="card">
      <button className="card-h" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditRev(true)}>
        <div className="grow"><small className="muted">{d.titulaire === 'monsieur' ? 'Monsieur' : 'Moi'}</small><b className="wrap" style={{ display: 'block' }}>{d.nom}</b></div>
        <Pencil size={14} className="muted" />
      </button>
      {estRecu(r, mk) ? (
        <button className="recu-line ok" onClick={() => setRecuOpen(true)}>
          <span>✅ Salaire reçu (fin {moisSalaire(mk)})</span>
          <b>{money(recu)}</b>
          <small>toucher pour corriger le montant</small>
        </button>
      ) : (
        <button className="recu-line wait" onClick={() => setRecuOpen(true)}>
          <span>⏳ Salaire en attente (fin {moisSalaire(mk)})</span>
          <b>Prévu {money(d.montant)}</b>
          <small>Touchez ici quand le salaire est arrivé</small>
        </button>
      )}
      <div className="list" style={{ margin: '0 -14px' }}>
        {charges.map((c) => {
          const dep = chargeDepense(s, mk, r.id, c.id);
          const rest = num(c.montant) - dep;
          return (
            <div className="task" key={c.id}>
              <button className={`check ${faits[c.id] ? 'on' : ''}`} onClick={() => toggle(c.id)} aria-label={faits[c.id] ? 'Décocher' : 'Cocher'}>{faits[c.id] && <Check size={16} strokeWidth={3} />}</button>
              <button className="grow item-main" style={{ textAlign: 'left' }} onClick={() => onDetail(c)}>
                <b className={faits[c.id] ? 'done-t' : ''}>{c.nom}</b>
                <small>{faits[c.id] ? `Réglé le ${dateFr(faits[c.id])}` : dep ? <>Dépensé {money(dep)} · <span style={{ color: rest < 0 ? '#DC2626' : dep / Math.max(1, num(c.montant)) >= 0.75 ? '#D97706' : '#16A34A', fontWeight: 700 }}>{rest < 0 ? `dépassé de ${money(-rest)}` : `reste ${money(rest)}`}</span></> : 'Rien dépensé pour l’instant'}</small>
                {!faits[c.id] && dep > 0 && <span className="mini-bar"><i style={{ width: `${Math.min(100, (dep / Math.max(1, num(c.montant))) * 100)}%`, background: rest < 0 ? '#DC2626' : dep / Math.max(1, num(c.montant)) >= 0.75 ? '#F59E0B' : '#16A34A' }} /></span>}
              </button>
              <b className={faits[c.id] ? 'muted' : ''}>{money(c.montant)}</b>
            </div>
          );
        })}
      </div>
      <div className="row gap">
        <button className="btn soft sm grow" onClick={() => onDep(null)}><Plus size={15} /> Dépense</button>
        <button className="btn ghost sm grow" onClick={() => onEdit(null)}><Plus size={15} /> Charge</button>
      </div>
      {recuOk ? (
        <div className={`totals feu-tot ${reste < 0 ? 'red' : reste === 0 ? 'orange' : 'green'}`}>
          <div className="kv"><span>Reçu</span><b>{money(recu)}</b></div>
          <div className="kv"><span>Total des charges</span><b>{money(tot)}</b></div>
          <div className="kv big"><span>{reste < 0 ? '⛔ Manque' : '✅ Reste'}</span><b>{reste >= 0 ? '+' : ''}{money(reste)}</b></div>
        </div>
      ) : <p className="muted small">Total des charges : {money(tot)} · le reste sera calculé quand le salaire sera reçu.</p>}
      {editRev && <RevenuSheet rec={r} onClose={() => setEditRev(false)} />}
      {recuOpen && <RecuSheet r={r} mk={mk} onClose={() => setRecuOpen(false)} />}
    </section>
  );
}

function RecuSheet({ r, mk, onClose }) {
  const s = useStore();
  const [v, setV] = useState(estRecu(r, mk) ? recuMois(r, mk) : num(r.data.montant));
  return (
    <Sheet title={`Salaire reçu fin ${moisSalaire(mk)}`} onClose={onClose}
      footer={<button className="btn primary full" onClick={() => { s.save('revenu_fixe', { ...r.data, recus: { ...(r.data.recus || {}), [mk]: num(v) } }, { id: r.id }); onClose(); }}>Enregistrer</button>}>
      <p className="muted small">{r.data.nom} · salaire de fin {moisSalaire(mk)}, pour les charges de {monthLabel(mk)}. Montant prévu {money(r.data.montant)} : indiquez ce qui est vraiment arrivé (frais de banque, retenues…).</p>
      <Field label="Montant reçu"><MoneyInput value={v} onChange={setV} autoFocus /></Field>
      {estRecu(r, mk) && <button className="btn ghost full" onClick={() => { const x = { ...(r.data.recus || {}) }; delete x[mk]; s.save('revenu_fixe', { ...r.data, recus: x }, { id: r.id }); onClose(); }}>Pas encore reçu (remettre en attente)</button>}
    </Sheet>
  );
}

// Justificatif obligatoire : une explication écrite (pas de photo)
function JustifFields({ d, up }) {
  return (
    <Field label="Justificatif (obligatoire)" help="Expliquez par écrit à quoi a servi l'argent. Sans justificatif, la dépense ne peut pas être validée.">
      <textarea rows={2} value={d.justif || ''} onChange={(e) => up('justif', e.target.value)} placeholder="Ex. On a pris 10 000 F pour acheter le carburant à Total Oloumi" />
    </Field>
  );
}
const hasJustif = (d) => (d.justif || '').trim().length >= 3;

function DepenseSheet({ mk, preset, rec, onClose }) {
  const s = useStore();
  const toast = useToast();
  const rs = revenusFixes(s);
  const [d, setD] = useState(() => rec ? { ...rec.data } : { mois: mk, date: today(), revenu: preset?.r || rs[0]?.id || '', charge: preset?.c || '', montant: '', motif: '', justif: '' });
  const [del, setDel] = useState(false);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const r = rs.find((x) => x.id === d.revenu);
  const c = (r?.data.charges || []).find((x) => x.id === d.charge);
  const dejà = r && c ? chargeDepense(s, d.mois, r.id, c.id) - (rec ? num(rec.data.montant) : 0) : 0;
  const reste = c ? num(c.montant) - dejà - num(d.montant) : 0;
  const ok = d.revenu && d.charge && num(d.montant) > 0 && d.motif.trim() && hasJustif(d);
  const save = () => {
    if (!ok) return toast(!hasJustif(d) ? 'Ajoutez un justificatif : sans justificatif, pas de validation' : 'Complétez la dépense', 'err');
    s.save('depense_charge', { ...d, montant: num(d.montant), mois: rec ? rec.data.mois : mk }, { id: rec?.id, shared: rec ? undefined : true });
    toast('Dépense enregistrée ✓');
    onClose();
  };
  return (
    <Sheet title={rec ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" disabled={!ok} onClick={save}>Valider la dépense</button></div>}>
      <Field label="Sur quel salaire ?">
        <div className="chips">{rs.map((x) => <button type="button" key={x.id} className={`chip ${d.revenu === x.id ? 'on' : ''}`} onClick={() => setD({ ...d, revenu: x.id, charge: '' })}>{x.data.titulaire === 'monsieur' ? 'Monsieur' : 'Moi'} · {x.data.nom.replace(/^Revenu /, '').slice(0, 18)}</button>)}</div>
      </Field>
      {r && (
        <Field label="Quelle charge ?">
          <div className="chips">{(r.data.charges || []).map((x) => <button type="button" key={x.id} className={`chip ${d.charge === x.id ? 'on' : ''}`} onClick={() => up('charge', x.id)}>{x.nom}</button>)}</div>
        </Field>
      )}
      <div className="row gap">
        <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => up('montant', v)} /></Field>
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => up('date', e.target.value)} /></Field>
      </div>
      <Field label="Pour quoi ?"><input value={d.motif} onChange={(e) => up('motif', e.target.value)} placeholder="Ex. Carburant, vidange, pièces…" /></Field>
      <JustifFields d={d} up={up} />
      {c && <div className={`alert ${reste < 0 ? 'danger' : 'info'}`}>Budget {c.nom} : {money(c.montant)} · déjà dépensé {money(dejà)} · après cette dépense il reste <b>{money(reste)}</b> à garder pour {c.nom}.</div>}
      {del && <Confirm text="Supprimer cette dépense ?" onNo={() => setDel(false)} onYes={() => { s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

function ChargeDetail({ mk, r, c, onClose, onEdit, onDep }) {
  const s = useStore();
  const [edit, setEdit] = useState(null);
  const list = depensesCharges(s, mk).filter((d) => d.data.revenu === r.id && d.data.charge === c.id).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  const dep = list.reduce((x, d) => x + num(d.data.montant), 0);
  const reste = num(c.montant) - dep;
  return (
    <Sheet title={c.nom} onClose={onClose}
      footer={<div className="row gap"><button className="btn ghost grow" onClick={onEdit}><Pencil size={16} /> Modifier la charge</button><button className="btn primary grow" onClick={onDep}><Plus size={16} /> Dépense</button></div>}>
      <div className="totals">
        <div className="kv"><span>Budget du mois</span><b>{money(c.montant)}</b></div>
        <div className="kv"><span>Déjà dépensé</span><b>{money(dep)}</b></div>
        <div className="kv big"><span>{reste < 0 ? 'Dépassement' : 'Reste à garder'}</span><b className={reste < 0 ? 'neg' : 'pos'}>{money(Math.abs(reste))}</b></div>
      </div>
      <p className="muted small">{r.data.nom} · {monthLabel(mk)}</p>
      {list.length === 0 ? <p className="muted">Aucune dépense ce mois pour {c.nom}.</p> : (
        <div className="card list">
          {list.map((x) => (
            <button className="item" key={x.id} onClick={() => setEdit(x)}>
              <div className="grow item-main"><b>{x.data.motif}</b><small>{dateFr(x.data.date)} · {x.data.justif || ''}{x.data._by && s.profiles[x.data._by] ? ` · ${s.profiles[x.data._by].display_name}` : ''}</small></div>
              <b className="neg">- {money(x.data.montant)}</b>
            </button>
          ))}
        </div>
      )}
      {edit && <DepenseSheet mk={mk} rec={edit} onClose={() => setEdit(null)} />}
    </Sheet>
  );
}

function ChargeSheet({ r, c, onClose }) {
  const s = useStore();
  const [d, setD] = useState(c ? { ...c } : { id: uid(), nom: '', montant: '' });
  const [del, setDel] = useState(false);
  const charges = r.data.charges || [];
  const save = () => {
    if (!d.nom.trim() || !num(d.montant)) return;
    const next = c ? charges.map((x) => (x.id === c.id ? { ...d, montant: num(d.montant) } : x)) : [...charges, { ...d, montant: num(d.montant) }];
    s.save('revenu_fixe', { ...r.data, charges: next }, { id: r.id });
    onClose();
  };
  const tot = charges.filter((x) => x.id !== d.id).reduce((x, y) => x + num(y.montant), 0) + num(d.montant);
  const reste = num(r.data.montant) - tot;
  return (
    <Sheet title={c ? 'Modifier la charge' : 'Nouvelle charge'} onClose={onClose}
      footer={<div className="row gap">{c && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" onClick={save}>Enregistrer</button></div>}>
      <p className="muted small">{r.data.nom}</p>
      <Field label="Charge"><input value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} placeholder="Ex. Électricité, scolarité…" autoFocus={!c} /></Field>
      <Field label="Montant par mois"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      <div className={`alert ${reste < 0 ? 'danger' : 'info'}`}>Avec cette charge, il reste {money(reste)} sur ce revenu{reste < 0 ? ' : vous êtes dans le rouge.' : '.'}</div>
      {del && <Confirm text={`Supprimer « ${c.nom} » ?`} onNo={() => setDel(false)} onYes={() => { s.save('revenu_fixe', { ...r.data, charges: charges.filter((x) => x.id !== c.id) }, { id: r.id }); onClose(); }} />}
    </Sheet>
  );
}

function RevenuSheet({ rec, onClose }) {
  const s = useStore();
  const [d, setD] = useState(rec ? { ...rec.data } : { nom: '', titulaire: 'moi', montant: '', charges: [], faits: {}, ordre: 9 });
  const [del, setDel] = useState(false);
  const save = () => {
    if (!d.nom.trim()) return;
    s.save('revenu_fixe', { ...d, montant: num(d.montant) }, { id: rec?.id, shared: rec ? undefined : true });
    onClose();
  };
  return (
    <Sheet title={rec ? 'Modifier le revenu' : 'Nouveau revenu'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" onClick={save}>Enregistrer</button></div>}>
      <Field label="Nom du revenu"><input value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} placeholder="Ex. Revenu SEEG" /></Field>
      <Field label="De qui ?"><div className="chips">{TITULAIRES.map(([k, l]) => <button type="button" key={k} className={`chip ${d.titulaire === k ? 'on' : ''}`} onClick={() => setD({ ...d, titulaire: k })}>{l}</button>)}</div></Field>
      <Field label="Montant par mois"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      {del && <Confirm text="Supprimer ce revenu et ses charges ?" onNo={() => setDel(false)} onYes={() => { s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

// =====================================================================
// 2. Loyer du locataire
// =====================================================================
function Loyer({ mk }) {
  const s = useStore();
  const toast = useToast();
  const [cfgOpen, setCfgOpen] = useState(false);
  const [ligne, setLigne] = useState(null);
  const cfg = s.list('loyer_cfg')[0];
  const c = cfg?.data || { locataire: 'Locataire', montant: 150000, modele: [] };
  const rec = s.list('loyer_mois').find((x) => x.data.mois === mk);
  const d = rec?.data;
  const lignes = d?.lignes || [];
  const reparti = lignes.reduce((x, l) => x + num(l.montant), 0);
  const marquer = () => {
    s.save('loyer_mois', { mois: mk, verse: true, date: today(), montant: num(c.montant), lignes: (c.modele || []).map((m) => ({ id: uid(), libelle: m.libelle, montant: num(m.montant), env: m.env || '', fait: false })) }, { shared: true });
    toast('Loyer reçu ✓');
  };
  const saveLignes = (ls) => s.save('loyer_mois', { ...d, lignes: ls }, { id: rec.id });
  const hist = Array.from({ length: 6 }, (_, i) => addMonths(mk, -i)).map((m) => ({ m, r: s.list('loyer_mois').find((x) => x.data.mois === m) }));
  return (
    <>
      <section className="card">
        <div className="card-h">
          <div className="row gap"><span className="ico"><KeyRound size={19} /></span><div><b>{c.locataire}</b><p className="muted small">{money(c.montant)} chaque fin de mois</p></div></div>
          <button className="icon-btn" onClick={() => setCfgOpen(true)} aria-label="Réglages du loyer"><Settings2 size={19} /></button>
        </div>
        {d?.verse ? (
          <div className="alert info"><CheckCircle2 size={18} /> {monthLabel(mk)} : {money(d.montant)} versés le {dateFr(d.date)}</div>
        ) : (
          <>
            <div className="alert warn">{monthLabel(mk)} : pas encore versé</div>
            <button className="btn primary full" onClick={marquer}>Le locataire a versé {money(c.montant)}</button>
          </>
        )}
      </section>
      {d?.verse && (
        <section className="card">
          <h3 className="card-t">Ce qu'on fait des {money(d.montant)}</h3>
          <div className="list" style={{ margin: '0 -14px' }}>
            {lignes.map((l) => (
              <div className="task" key={l.id}>
                <button className={`check ${l.fait ? 'on' : ''}`} onClick={() => saveLignes(lignes.map((x) => (x.id === l.id ? { ...x, fait: !x.fait } : x)))}>{l.fait && <Check size={16} strokeWidth={3} />}</button>
                <button className="grow item-main" style={{ textAlign: 'left' }} onClick={() => setLigne(l)}><b className={l.fait ? 'done-t' : ''}>{l.libelle}</b>{l.env && <small>→ enveloppe {ENVS.find((e) => e[0] === l.env)?.[1]}</small>}</button>
                <b>{money(l.montant)}</b>
              </div>
            ))}
          </div>
          <div className="row gap">
            <button className="btn soft sm grow" onClick={() => setLigne({})}><Plus size={15} /> Ajouter une ligne</button>
            <button className="btn soft sm grow" onClick={() => setLigne({ libelle: 'Construction', env: 'construction' })}><Plus size={15} /> Construction</button>
          </div>
          <div className="totals">
            <div className="kv"><span>Réparti</span><b>{money(reparti)}</b></div>
            <div className="kv big"><span>Reste à répartir</span><b className={d.montant - reparti < 0 ? 'neg' : ''}>{money(num(d.montant) - reparti)}</b></div>
          </div>
          <button className="link danger-t" onClick={() => s.remove(rec.id)}>Annuler « versé » pour ce mois</button>
        </section>
      )}
      <h3 className="sec-t">Les derniers mois</h3>
      <div className="card list">
        {hist.map(({ m, r }) => (
          <div className="item" key={m}>
            <div className="grow item-main"><b style={{ textTransform: 'capitalize' }}>{monthLabel(m)}</b><small>{r?.data.verse ? `Versé le ${dateFr(r.data.date)}` : 'Pas encore versé'}</small></div>
            {r?.data.verse ? <span className="st ok">{money(r.data.montant)}</span> : <span className="st late">—</span>}
          </div>
        ))}
      </div>
      {ligne && <LigneSheet withEnv l={ligne} onClose={() => setLigne(null)} onSave={(x) => { saveLignes(ligne.id ? lignes.map((y) => (y.id === ligne.id ? x : y)) : [...lignes, x]); setLigne(null); }} onDelete={ligne.id ? () => { saveLignes(lignes.filter((y) => y.id !== ligne.id)); setLigne(null); } : null} />}
      {cfgOpen && <LoyerCfg cfg={cfg} onClose={() => setCfgOpen(false)} />}
    </>
  );
}

function LigneSheet({ l, onClose, onSave, onDelete, title, withEnv }) {
  const [d, setD] = useState({ id: l.id || uid(), libelle: l.libelle || '', montant: l.montant ?? '', fait: !!l.fait, env: l.env || '' });
  return (
    <Sheet title={title || (l.id ? 'Modifier' : 'Nouvelle ligne')} onClose={onClose}
      footer={<div className="row gap">{onDelete && <button className="btn ghost danger-t" onClick={onDelete}><Trash2 size={18} /></button>}<button className="btn primary grow" onClick={() => d.libelle.trim() && onSave({ ...d, montant: num(d.montant) })}>Enregistrer</button></div>}>
      <Field label="Libellé"><input value={d.libelle} onChange={(e) => setD({ ...d, libelle: e.target.value })} autoFocus placeholder="Ex. Scolarité, réparation…" /></Field>
      <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      {withEnv && (
        <Field label="Verser dans une enveloppe du foyer ?" help="Quand la ligne est cochée, le montant s'ajoute à l'enveloppe.">
          <div className="chips">{ENVS.map(([k, lb]) => <button type="button" key={k || 'none'} className={`chip ${d.env === k ? 'on' : ''}`} onClick={() => setD({ ...d, env: k, libelle: d.libelle || (k ? `Enveloppe ${lb}` : '') })}>{lb}</button>)}</div>
        </Field>
      )}
    </Sheet>
  );
}

function LoyerCfg({ cfg, onClose }) {
  const s = useStore();
  const [d, setD] = useState(cfg ? JSON.parse(JSON.stringify(cfg.data)) : { locataire: 'Locataire', montant: 150000, modele: [] });
  const upM = (i, k, v) => setD((x) => ({ ...x, modele: x.modele.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));
  return (
    <Sheet title="Locataire" onClose={onClose}
      footer={<button className="btn primary full" onClick={() => { s.save('loyer_cfg', { ...d, montant: num(d.montant), modele: d.modele.filter((m) => m.libelle.trim()).map((m) => ({ ...m, montant: num(m.montant) })) }, { id: cfg?.id, shared: cfg ? undefined : true }); onClose(); }}>Enregistrer</button>}>
      <Field label="Nom du locataire"><input value={d.locataire} onChange={(e) => setD({ ...d, locataire: e.target.value })} /></Field>
      <Field label="Loyer mensuel"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      <h3 className="sec-t">Répartition proposée chaque mois</h3>
      {d.modele.map((m, i) => (
        <div className="row gap" key={m.id}>
          <input className="mini-in grow" value={m.libelle} onChange={(e) => upM(i, 'libelle', e.target.value)} placeholder="Libellé" />
          <div style={{ width: 130 }}><MoneyInput value={m.montant} onChange={(v) => upM(i, 'montant', v)} /></div>
          <button className="icon-btn danger" onClick={() => setD((x) => ({ ...x, modele: x.modele.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>
        </div>
      ))}
      <button className="btn soft sm" onClick={() => setD((x) => ({ ...x, modele: [...x.modele, { id: uid(), libelle: '', montant: '' }] }))}><Plus size={15} /> Ajouter</button>
    </Sheet>
  );
}

// =====================================================================
// 3. Dettes : je dois / on me doit, avec chaque avance
// =====================================================================
function Dettes() {
  const s = useStore();
  const [tab, setTab] = useState('dette');
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const all = s.list('dette');
  const list = all.filter((d) => (d.data.type || 'dette') === tab).sort((a, b) => (detteReste(b) > 0) - (detteReste(a) > 0) || detteReste(b) - detteReste(a));
  const tot = (t) => all.filter((d) => (d.data.type || 'dette') === t).reduce((x, d) => x + detteReste(d), 0);
  return (
    <>
      <div className="kpis">
        <div className="kpi"><small>Je dois encore</small><b className="neg">{money(tot('dette'))}</b></div>
        <div className="kpi"><small>On me doit encore</small><b className="pos">{money(tot('creance'))}</b></div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[['dette', 'Je dois'], ['creance', 'On me doit']]} />
      {list.length === 0 ? <Empty icon={<Handshake size={34} />} title="Rien à signaler" text={tab === 'dette' ? 'Ajoutez ce que vous devez : la personne et le montant.' : 'Ajoutez qui vous doit de l’argent : la personne et le montant.'} /> : (
        <div className="card list">
          {list.map((d) => {
            const reste = detteReste(d);
            const verse = num(d.data.montant) - reste;
            return (
              <button className="item col" key={d.id} onClick={() => setDetail(d.id)}>
                <div className="row" style={{ width: '100%' }}>
                  <div className="grow item-main"><b>{d.data.personne}</b><small>{d.data.source === 'market' ? 'OrlyMarket · ' : ''}{(d.data.remboursements || []).length} versement{(d.data.remboursements || []).length > 1 ? 's' : ''}{d.data.motif && d.data.source !== 'market' ? ` · ${d.data.motif}` : ''}</small></div>
                  <div className="right">{reste ? <b className={tab === 'dette' ? 'neg' : 'pos'}>{money(reste)}</b> : <b className="pos">Soldé ✓</b>}<small>sur {money(d.data.montant)}</small></div>
                </div>
                <Progress value={num(d.data.montant) ? verse / num(d.data.montant) : 0} color={reste ? 'var(--violet)' : 'var(--pos)'} />
              </button>
            );
          })}
        </div>
      )}
      <Fab onClick={() => setForm({ type: tab })} label="Ajouter" icon={<Plus size={26} />} />
      {form && <DetteForm rec={form.id ? form : null} type={form.type} onClose={() => setForm(null)} />}
      {detail && <DetteDetail id={detail} onEdit={(r) => { setDetail(null); setForm(r); }} onClose={() => setDetail(null)} />}
    </>
  );
}

function DetteForm({ rec, type, onClose }) {
  const s = useStore();
  const [d, setD] = useState(rec ? { ...rec.data } : { type, personne: '', montant: '', date: today(), motif: '', remboursements: [] });
  const save = () => {
    if (!d.personne.trim() || !num(d.montant)) return;
    s.save('dette', { ...d, montant: num(d.montant) }, { id: rec?.id, shared: rec ? undefined : false });
    onClose();
  };
  return (
    <Sheet title={rec ? 'Modifier' : d.type === 'creance' ? 'Quelqu’un me doit' : 'Je dois'} onClose={onClose} footer={<button className="btn primary full" onClick={save}>Enregistrer</button>}>
      <Field label="Type"><div className="chips">{[['dette', 'Je dois'], ['creance', 'On me doit']].map(([k, l]) => <button type="button" key={k} className={`chip ${d.type === k ? 'on' : ''}`} onClick={() => setD({ ...d, type: k })}>{l}</button>)}</div></Field>
      <Field label="Nom de la personne"><input value={d.personne} onChange={(e) => setD({ ...d, personne: e.target.value })} placeholder="Ex. Vanessa" autoFocus={!rec} /></Field>
      <Field label="Montant total"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      <Field label="Date"><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
      <Field label="Motif (facultatif)"><input value={d.motif || ''} onChange={(e) => setD({ ...d, motif: e.target.value })} /></Field>
    </Sheet>
  );
}

function DetteDetail({ id, onEdit, onClose }) {
  const s = useStore();
  const toast = useToast();
  const [av, setAv] = useState({ montant: '', date: today() });
  const [del, setDel] = useState(null);
  const d = s.getRec(id);
  if (!d) return null;
  const reste = detteReste(d);
  const rs = [...(d.data.remboursements || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const moi = (d.data.type || 'dette') === 'dette';
  const add = (m) => {
    if (!num(m)) return;
    s.save('dette', { ...d.data, remboursements: [...(d.data.remboursements || []), { id: uid(), date: av.date, montant: Math.min(num(m), reste) }] }, { id: d.id });
    setAv({ montant: '', date: today() });
    toast(num(m) >= reste ? 'Soldé ✓' : 'Avance enregistrée ✓');
  };
  let cumul = 0;
  return (
    <Sheet title={d.data.personne} onClose={onClose}
      footer={<div className="row gap"><button className="btn ghost danger-t" onClick={() => setDel('all')}><Trash2 size={18} /></button><button className="btn ghost grow" onClick={() => onEdit(d)}><Pencil size={16} /> Modifier</button></div>}>
      <div className="totals">
        <div className="kv"><span>{moi ? 'Je lui dois' : 'Me doit'} au départ</span><b>{money(d.data.montant)}</b></div>
        <div className="kv"><span>Déjà {moi ? 'rendu' : 'reçu'}</span><b className="pos">{money(num(d.data.montant) - reste)}</b></div>
        <div className="kv big"><span>Reste</span><b>{money(reste)}</b></div>
      </div>
      {(() => {
        const st = empruntStats(s, d);
        if (d.data.source !== 'market' && !st.factures.length) return null;
        return (
          <section className="card">
            <h3 className="card-t">Factures OrlyMarket liées à cet emprunt</h3>
            {st.factures.length === 0 ? <p className="muted small">Aucune facture rattachée.</p> : st.factures.map((f) => {
              const t = factTotals(f);
              return <div className="kv" key={f.id}><span>{f.data.numero} · {clienteName(s, f)} · payé {money(t.paye)}/{money(t.total)}</span><b>{money(t.achat)}</b></div>;
            })}
            <div className="kv"><span>Total prix fournisseur</span><b>{money(st.fournisseur)}</b></div>
            <div className="kv"><span>Bénéfice pour moi</span><b className="pos">{money(st.benef)}</b></div>
            {st.peutRendre > 0 ? <div className="alert info">Les clientes ont déjà payé de quoi rendre {money(st.peutRendre)}.</div> : st.reste > 0 && <p className="muted small">Les clientes n'ont pas encore assez payé pour rendre davantage.</p>}
          </section>
        );
      })()}
      <h3 className="sec-t">Historique</h3>
      <div className="card list">
        <div className="item"><div className="grow item-main"><b>Montant de départ</b><small>{dateFr(d.data.date)}</small></div><b>{money(d.data.montant)}</b></div>
        {rs.map((r) => { cumul += num(r.montant); return (
          <div className="item" key={r.id || r.date + r.montant}>
            <div className="grow item-main"><b>{moi ? 'Avance envoyée' : 'Avance reçue'} : {money(r.montant)}</b><small>{dateFr(r.date)} · il restait ensuite {money(num(d.data.montant) - cumul)}</small></div>
            <button className="icon-btn" onClick={() => setDel(r)} aria-label="Supprimer"><Trash2 size={16} /></button>
          </div>
        ); })}
      </div>
      {reste > 0 && (
        <section className="card">
          <h3 className="card-t">{moi ? 'Je viens d’envoyer une avance' : 'Je viens de recevoir une avance'}</h3>
          <Field label="Montant"><MoneyInput value={av.montant} onChange={(v) => setAv({ ...av, montant: v })} /></Field>
          <Field label="Date"><input type="date" value={av.date} onChange={(e) => setAv({ ...av, date: e.target.value })} /></Field>
          <div className="row gap">
            <button className="btn primary grow" onClick={() => add(av.montant)}>Enregistrer l'avance</button>
            <button className="btn soft" onClick={() => add(reste)}>Tout soldé</button>
          </div>
        </section>
      )}
      {del === 'all' && <Confirm text={`Supprimer ${d.data.personne} et son historique ?`} onNo={() => setDel(null)} onYes={() => { s.remove(d.id); onClose(); }} />}
      {del && del !== 'all' && <Confirm text={`Supprimer l'avance de ${money(del.montant)} ?`} onNo={() => setDel(null)} onYes={() => { s.save('dette', { ...d.data, remboursements: (d.data.remboursements || []).filter((r) => r !== del && (!del.id || r.id !== del.id)) }, { id: d.id }); setDel(null); }} />}
    </Sheet>
  );
}

// =====================================================================
// 4. Tontines : montant à recevoir, répartition, date de fin
// =====================================================================
function Tontines() {
  const s = useStore();
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const all = s.list('tontine').sort((a, b) => (!!a.data.terminee - !!b.data.terminee) || (a.data.date_fin || '9').localeCompare(b.data.date_fin || '9'));
  const enCours = tontinesEnCours(s);
  return (
    <>
      <div className="kpis">
        <div className="kpi accent"><small>Tontines en cours</small><b>{enCours.length}</b><span className="trend">{enCours[0]?.data.date_fin ? `prochaine fin : ${dateFr(enCours[0].data.date_fin)}` : ''}</span></div>
        <div className="kpi"><small>À recevoir</small><b>{money(enCours.reduce((x, t) => x + tMontant(t), 0))}</b></div>
      </div>
      {all.length === 0 ? <Empty icon={<Users size={34} />} title="Aucune tontine" text="Ajoutez une tontine : son nom, le montant que vous allez recevoir et sa date de fin." /> : (
        <div className="stack">
          {all.map((t) => {
            const ls = t.data.lignes || [];
            const rep = ls.reduce((x, l) => x + num(l.montant), 0);
            return (
              <button className="card" key={t.id} onClick={() => setDetail(t.id)}>
                <div className="card-h">
                  <div><b>{t.data.nom}</b><p className="muted small">{t.data.date_fin ? `Fin le ${dateFr(t.data.date_fin)}` : 'Date de fin à préciser'}</p></div>
                  {t.data.terminee ? <span className="st ok">Terminée</span> : <span className="st soon">En cours</span>}
                </div>
                <div className="kv"><span>Je vais recevoir</span><b>{money(tMontant(t))}</b></div>
                {ls.length > 0 && <div className="kv"><span>Réparti</span><b>{money(rep)} · {ls.filter((l) => l.fait).length}/{ls.length} fait</b></div>}
                {t.data.projet && <p className="muted small">Projet : {t.data.projet}</p>}
              </button>
            );
          })}
        </div>
      )}
      <Fab onClick={() => setForm('new')} label="Nouvelle tontine" icon={<Plus size={26} />} />
      {form && <TontineForm rec={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {detail && <TontineDetail id={detail} onEdit={(r) => { setDetail(null); setForm(r); }} onClose={() => setDetail(null)} />}
    </>
  );
}

function TontineForm({ rec, onClose }) {
  const s = useStore();
  const [d, setD] = useState(rec ? { ...rec.data, montant: rec.data.montant ?? rec.data.a_recevoir } : { nom: '', montant: '', cotisation: '', date_debut: today(), date_fin: '', projet: '', lignes: [], terminee: false });
  const [del, setDel] = useState(false);
  const save = () => {
    if (!d.nom.trim()) return;
    s.save('tontine', { ...d, montant: num(d.montant), cotisation: num(d.cotisation) }, { id: rec?.id, shared: rec ? undefined : false });
    onClose();
  };
  return (
    <Sheet title={rec ? 'Modifier la tontine' : 'Nouvelle tontine'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" onClick={save}>Enregistrer</button></div>}>
      <Field label="Nom de la tontine"><input value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} autoFocus={!rec} /></Field>
      <Field label="Montant que je vais recevoir"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      <Field label="Ma cotisation (facultatif)"><MoneyInput value={d.cotisation} onChange={(v) => setD({ ...d, cotisation: v })} /></Field>
      <div className="row gap">
        <Field label="Début"><input type="date" value={d.date_debut || ''} onChange={(e) => setD({ ...d, date_debut: e.target.value })} /></Field>
        <Field label="Fin de la tontine"><input type="date" value={d.date_fin || ''} onChange={(e) => setD({ ...d, date_fin: e.target.value })} /></Field>
      </div>
      <Field label="Projet à réaliser avec cet argent (facultatif)"><textarea rows={2} value={d.projet || ''} onChange={(e) => setD({ ...d, projet: e.target.value })} placeholder="Ex. Acheter un congélateur" /></Field>
      <label className="toggle-row"><span>Tontine terminée</span><input type="checkbox" className="switch" checked={!!d.terminee} onChange={(e) => setD({ ...d, terminee: e.target.checked })} /></label>
      {del && <Confirm text="Supprimer cette tontine ?" onNo={() => setDel(false)} onYes={() => { s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

function TontineDetail({ id, onEdit, onClose }) {
  const s = useStore();
  const [ligne, setLigne] = useState(null);
  const t = s.getRec(id);
  if (!t) return null;
  const d = t.data;
  const ls = d.lignes || [];
  const rep = ls.reduce((x, l) => x + num(l.montant), 0);
  const save = (next) => s.save('tontine', { ...d, lignes: next }, { id: t.id });
  return (
    <Sheet title={d.nom} onClose={onClose}
      footer={<div className="row gap"><button className="btn ghost grow" onClick={() => onEdit(t)}><Pencil size={16} /> Modifier</button>{!d.terminee && <button className="btn soft grow" onClick={() => s.save('tontine', { ...d, terminee: true, date_fin: d.date_fin || today() }, { id: t.id })}>Tontine terminée</button>}</div>}>
      <div className="totals">
        <div className="kv"><span>Je vais recevoir</span><b>{money(tMontant(t))}</b></div>
        <div className="kv"><span>Fin</span><b>{d.date_fin ? dateFr(d.date_fin) : '—'}{d.terminee ? ' · terminée' : ''}</b></div>
        {num(d.cotisation) > 0 && <div className="kv"><span>Ma cotisation</span><b>{money(d.cotisation)}</b></div>}
      </div>
      {d.projet && <p><b>Projet :</b> {d.projet}</p>}
      <h3 className="sec-t">Ce que je vais faire de cet argent</h3>
      {ls.length === 0 ? <p className="muted small">Ajoutez les lignes : « Scolarité 100 000 », « Rideaux 40 000 »…</p> : (
        <div className="card list">
          {ls.map((l) => (
            <div className="task" key={l.id}>
              <button className={`check ${l.fait ? 'on' : ''}`} onClick={() => save(ls.map((x) => (x.id === l.id ? { ...x, fait: !x.fait } : x)))}>{l.fait && <Check size={16} strokeWidth={3} />}</button>
              <button className="grow item-main" style={{ textAlign: 'left' }} onClick={() => setLigne(l)}><b className={l.fait ? 'done-t' : ''}>{l.libelle}</b></button>
              <b>{money(l.montant)}</b>
            </div>
          ))}
        </div>
      )}
      <button className="btn soft sm" onClick={() => setLigne({})}><Plus size={15} /> Ajouter une ligne</button>
      <div className="totals">
        <div className="kv"><span>Réparti</span><b>{money(rep)}</b></div>
        <div className="kv big"><span>Reste à répartir</span><b className={tMontant(t) - rep < 0 ? 'neg' : ''}>{money(tMontant(t) - rep)}</b></div>
      </div>
      {ligne && <LigneSheet l={ligne} onClose={() => setLigne(null)} onSave={(x) => { save(ligne.id ? ls.map((y) => (y.id === ligne.id ? x : y)) : [...ls, x]); setLigne(null); }} onDelete={ligne.id ? () => { save(ls.filter((y) => y.id !== ligne.id)); setLigne(null); } : null} />}
    </Sheet>
  );
}

// =====================================================================
// 5. Épargne du foyer : montants fixes pris sur le reste des deux salaires
//    (le loyer du locataire n'entre pas ici : il a déjà sa propre répartition)
// =====================================================================
const EP_PARTS = [
  { k: 'epargne', label: 'Épargne', color: '#0F8A55', help: 'On n’y touche pas' },
  { k: 'loisirs', label: 'Loisirs', color: '#2563A8', help: 'Sorties, vacances, plaisirs' },
  { k: 'divers', label: 'Divers / imprévus', color: '#B7700A', help: 'Imprévus du mois' },
  { k: 'construction', label: 'Construction', color: '#7C2D12', help: 'Objectif : construire. Un peu chaque mois, même petit.' },
];
const FIX_DEF = { epargne: 20000, loisirs: 10000, divers: 15000, construction: 10000 };
// ce qu'il y avait déjà dans chaque enveloppe au départ (donné par Orly)
const DEPART_DEF = { epargne: 25000, loisirs: 0, divers: 0, construction: 0 };
export const ENVS = [['', 'Aucune'], ['construction', 'Construction'], ['epargne', 'Épargne'], ['loisirs', 'Loisirs'], ['divers', 'Divers / imprévus']];

// Totaux des enveloppes : départ + mois cochés + lignes du loyer versées dans une enveloppe
export function enveloppesFoyer(s) {
  const rec = s.list('epargne_foyer')[0];
  const d = rec?.data || {};
  const depart = { ...DEPART_DEF, ...(d.depart || {}) };
  const tot = {};
  const detail = {};
  EP_PARTS.forEach((p) => { tot[p.k] = num(depart[p.k]); detail[p.k] = { depart: num(depart[p.k]), salaires: 0, loyer: 0 }; });
  Object.entries(d.mois || {}).filter(([mk]) => mk >= FOYER_START).forEach(([, x]) => EP_PARTS.forEach((p) => { if (x[p.k]?.fait) { tot[p.k] += num(x[p.k].montant); detail[p.k].salaires += num(x[p.k].montant); } }));
  for (const x of s.list('imprevu')) {
    if ((x.data.mois || '') < FOYER_START) continue;
    const k = x.data.env || 'divers';
    if (tot[k] !== undefined) { tot[k] -= num(x.data.montant); detail[k].sorties = (detail[k].sorties || 0) + num(x.data.montant); }
  }
  for (const l of s.list('loyer_mois')) for (const ln of l.data.lignes || []) {
    if (ln.fait && ln.env && tot[ln.env] !== undefined) { tot[ln.env] += num(ln.montant); detail[ln.env].loyer += num(ln.montant); }
  }
  return { tot, detail, depart };
}

function EpargneFoyer({ mk, isOrly }) {
  const s = useStore();
  const toast = useToast();
  const [fixOpen, setFixOpen] = useState(false);
  const rec = s.list('epargne_foyer')[0];
  const d = rec?.data || { mois: {} };
  const fixes = { ...FIX_DEF, ...(d.fixes || {}) };
  const b = budgetMois(s, mk);
  const base = Math.max(0, b.reste);
  const totalFixe = EP_PARTS.reduce((x, p) => x + num(fixes[p.k]), 0);
  const libre = base - totalFixe;
  const m = (d.mois || {})[mk] || {};
  const save = (data) => s.save('epargne_foyer', data, { id: rec?.id, shared: rec ? undefined : true });
  const toggle = (k, montant) => {
    const mois = { ...(d.mois || {}) };
    const x = { ...(mois[mk] || {}) };
    if (x[k]?.fait) delete x[k]; else x[k] = { fait: true, montant, date: today() };
    mois[mk] = x;
    save({ ...d, fixes, depart: env.depart, mois });
  };
  const env = enveloppesFoyer(s);
  const cumul = env.tot;
  const om = isOrly ? caisses(s).epargne.solde : null;
  const rs = revenusFixes(s).filter((r) => num(r.data.montant) > 0);
  return (
    <>
      <section className={`feu ${!b.recuAuMoinsUn ? 'wait' : libre < 0 ? (base > 0 ? 'orange' : 'red') : 'green'}`}>
        <span className="feu-pill">{!b.recuAuMoinsUn ? '⏳ EN ATTENTE DES SALAIRES' : libre < 0 ? (base > 0 ? '⚠️ ÉPARGNE INCOMPLÈTE' : '⛔ RIEN À ÉPARGNER') : '✅ ÉPARGNE POSSIBLE'}</span>
        <h2>{money(base)}</h2>
        <small>Reste de nos salaires reçus après les charges · loyer non compté</small>
      </section>
      {b.aRenseigner.length > 0 && <div className="alert warn">Revenu à renseigner : {b.aRenseigner.map((r) => r.data.nom).join(', ')}.</div>}
      {libre < 0 && <div className="alert danger">Le reste ({money(base)}) ne couvre pas les montants prévus ({money(totalFixe)}). Il manque {money(-libre)} : baissez les montants ou revoyez les charges.</div>}
      <div className="card list">
        {EP_PARTS.map((p) => {
          const done = m[p.k]?.fait;
          const montant = done ? num(m[p.k].montant) : num(fixes[p.k]);
          return (
            <div className="task" key={p.k}>
              <button className={`check ${done ? 'on' : ''}`} onClick={() => toggle(p.k, montant)} disabled={!done && !montant}>{done && <Check size={16} strokeWidth={3} />}</button>
              <div className="grow item-main"><b className={done ? 'done-t' : ''}>{p.label}</b><small>{done ? `Mis de côté le ${dateFr(m[p.k].date)}` : p.help}</small></div>
              <b style={{ color: p.color }}>{money(montant)}</b>
            </div>
          );
        })}
      </div>
      <div className="totals">
        <div className="kv"><span>Mis de côté prévu</span><b>{money(totalFixe)}</b></div>
        <div className="kv big"><span>Reste libre pour le mois</span><b className={libre < 0 ? 'neg' : 'pos'}>{money(libre)}</b></div>
      </div>
      <p className="muted small">Cochez quand l'argent est vraiment mis de côté. Les enveloppes s'additionnent mois après mois. Dans « Loyer », une ligne peut aussi être versée dans une enveloppe (par exemple Construction).</p>
      <div className="caisses">
        {EP_PARTS.map((p) => (
          <div className="caisse" key={p.k} style={{ '--c': p.color }}>
            <small>Enveloppe {p.label}</small><b>{money(cumul[p.k])}</b>
            <small>{[env.detail[p.k].depart && `départ ${money(env.detail[p.k].depart)}`, env.detail[p.k].salaires && `salaires ${money(env.detail[p.k].salaires)}`, env.detail[p.k].loyer && `loyer ${money(env.detail[p.k].loyer)}`, env.detail[p.k].sorties && `sorties -${money(env.detail[p.k].sorties)}`].filter(Boolean).join(' · ') || 'vide pour l’instant'}</small>
          </div>
        ))}
        {om !== null && <div className="caisse" style={{ '--c': '#D3145A' }}><small>Épargne OrlyMarket</small><b>{money(om)}</b></div>}
      </div>
      <button className="btn ghost full" onClick={() => setFixOpen(true)}>Modifier les montants</button>
      {fixOpen && <FixSheet fixes={fixes} depart={env.depart} base={base} onClose={() => setFixOpen(false)} onSave={(f, dep) => { save({ ...d, fixes: f, depart: dep, mois: d.mois || {} }); toast('Enregistré ✓'); setFixOpen(false); }} />}
    </>
  );
}

function FixSheet({ fixes, depart, base, onClose, onSave }) {
  const [f, setF] = useState({ ...fixes });
  const [dep, setDep] = useState({ ...depart });
  const total = EP_PARTS.reduce((x, k) => x + num(f[k.k]), 0);
  return (
    <Sheet title="Enveloppes du foyer" onClose={onClose} footer={<button className="btn primary full" onClick={() => onSave(Object.fromEntries(EP_PARTS.map((k) => [k.k, num(f[k.k])])), Object.fromEntries(EP_PARTS.map((k) => [k.k, num(dep[k.k])])))}>Enregistrer</button>}>
      <h3 className="sec-t">À mettre de côté chaque mois</h3>
      <p className="muted small">Pris sur le reste de vos deux salaires ({money(base)}).</p>
      {EP_PARTS.map((k) => (
        <Field key={k.k} label={k.label} help={k.help}><MoneyInput value={f[k.k]} onChange={(v) => setF({ ...f, [k.k]: v })} /></Field>
      ))}
      <div className={`alert ${total > base ? 'danger' : 'info'}`}>Total {money(total)} · reste libre {money(base - total)}</div>
      <h3 className="sec-t">Déjà dans chaque enveloppe aujourd'hui</h3>
      {EP_PARTS.map((k) => (
        <Field key={k.k} label={k.label}><MoneyInput value={dep[k.k]} onChange={(v) => setDep({ ...dep, [k.k]: v })} /></Field>
      ))}
    </Sheet>
  );
}

// =====================================================================
// 6. Imprévus du mois : pris dans les enveloppes (Imprévus, Loisirs…)
// =====================================================================
const IMP_ENVS = [['divers', 'Imprévus'], ['loisirs', 'Loisirs'], ['epargne', 'Épargne'], ['construction', 'Construction']];
function Imprevus({ mk }) {
  const s = useStore();
  const [form, setForm] = useState(null);
  const env = enveloppesFoyer(s);
  const list = imprevusMois(s, mk).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  const tot = list.reduce((x, d) => x + num(d.data.montant), 0);
  return (
    <>
      <section className={`feu ${env.tot.divers <= 0 ? 'red' : env.tot.divers < num((s.list('epargne_foyer')[0]?.data.fixes || {}).divers ?? 15000) ? 'orange' : 'green'}`}>
        <span className="feu-pill">{env.tot.divers <= 0 ? '⛔ ENVELOPPE VIDE' : env.tot.divers < num((s.list('epargne_foyer')[0]?.data.fixes || {}).divers ?? 15000) ? '⚠️ ENVELOPPE BASSE' : '✅ ENVELOPPE OK'}</span>
        <p style={{ margin: 0, opacity: .9 }}>Enveloppe Imprévus · disponible</p>
        <h2>{money(env.tot.divers)}</h2>
        <small>Imprévus de {monthLabel(mk).split(' ')[0]} : {money(tot)} · Loisirs disponibles : {money(env.tot.loisirs)}</small>
      </section>
      {env.tot.divers < 0 && <div className="alert danger">L'enveloppe Imprévus est vide : il manque {money(-env.tot.divers)}.</div>}
      <button className="btn primary full" onClick={() => setForm({})}><Plus size={18} /> Ajouter un imprévu</button>
      {list.length === 0 ? <Empty title="Aucun imprévu ce mois" text="Notez ici les dépenses imprévues : elles sont retirées de l'enveloppe Imprévus (ou Loisirs…)." /> : (
        <div className="card list">
          {list.map((x) => (
            <button className="item" key={x.id} onClick={() => setForm(x)}>
              <div className="grow item-main"><b>{x.data.motif}</b><small>{dateFr(x.data.date)} · {IMP_ENVS.find((e) => e[0] === x.data.env)?.[1] || 'Imprévus'} · {x.data.justif || ''}{x.data._by && s.profiles[x.data._by] ? ` · ${s.profiles[x.data._by].display_name}` : ''}</small></div>
              <b className="neg">- {money(x.data.montant)}</b>
            </button>
          ))}
        </div>
      )}
      {form && <ImprevuSheet mk={mk} rec={form.id ? form : null} onClose={() => setForm(null)} />}
    </>
  );
}

function ImprevuSheet({ mk, rec, onClose }) {
  const s = useStore();
  const toast = useToast();
  const [d, setD] = useState(() => rec ? { ...rec.data } : { date: today(), env: 'divers', montant: '', motif: '', justif: '' });
  const [del, setDel] = useState(false);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const env = enveloppesFoyer(s);
  const dispo = num(env.tot[d.env]) + (rec && rec.data.env === d.env ? num(rec.data.montant) : 0);
  const ok = num(d.montant) > 0 && d.motif.trim() && hasJustif(d);
  const save = () => {
    if (!ok) return toast(!hasJustif(d) ? 'Ajoutez un justificatif : sans justificatif, pas de validation' : 'Complétez l’imprévu', 'err');
    s.save('imprevu', { ...d, montant: num(d.montant), mois: rec ? rec.data.mois : mk }, { id: rec?.id, shared: rec ? undefined : true });
    toast('Imprévu enregistré ✓');
    onClose();
  };
  return (
    <Sheet title={rec ? "Modifier l'imprévu" : 'Nouvel imprévu'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" disabled={!ok} onClick={save}>Valider l'imprévu</button></div>}>
      <Field label="Pris dans l'enveloppe"><div className="chips">{IMP_ENVS.map(([k, l]) => <button type="button" key={k} className={`chip ${d.env === k ? 'on' : ''}`} onClick={() => up('env', k)}>{l}</button>)}</div></Field>
      <div className="row gap">
        <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => up('montant', v)} /></Field>
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => up('date', e.target.value)} /></Field>
      </div>
      <Field label="Quel imprévu ?"><input value={d.motif} onChange={(e) => up('motif', e.target.value)} placeholder="Ex. Médicaments, réparation, cotisation…" /></Field>
      <JustifFields d={d} up={up} />
      <div className={`alert ${dispo - num(d.montant) < 0 ? 'danger' : 'info'}`}>Dans l'enveloppe : {money(dispo)} · après cet imprévu : <b>{money(dispo - num(d.montant))}</b></div>
      {del && <Confirm text="Supprimer cet imprévu ?" onNo={() => setDel(false)} onYes={() => { s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

// =====================================================================
// Historique : un récap par mois, envoyable en image
// =====================================================================
export function recapMois(s, mk) {
  const b = bilanMois(s, mk);
  const rs = revenusFixes(s);
  const qui = (r) => (r.data.titulaire === 'monsieur' ? 'Monsieur' : 'Moi');
  const deps = depensesCharges(s, mk);
  const groupes = rs.map((r) => {
    const f = (r.data.faits || {})[mk] || {};
    const lignes = (r.data.charges || []).map((c) => ({ nom: c.nom, prevu: num(c.montant), dep: chargeDepense(s, mk, r.id, c.id), fait: !!f[c.id] }));
    return { titre: r.data.titulaire === 'monsieur' ? 'Charges de Monsieur' : 'Mes charges', lignes, faites: lignes.filter((l) => l.fait).length, total: lignes.reduce((x, l) => x + l.prevu, 0) };
  });
  const chargeNom = (d) => { const r = rs.find((x) => x.id === d.data.revenu); return (r?.data.charges || []).find((c) => c.id === d.data.charge)?.nom || '—'; };
  const ep = s.list('epargne_foyer')[0]?.data || {};
  const fixes = { ...FIX_DEF, ...(ep.fixes || {}) };
  const mm = (ep.mois || {})[mk] || {};
  const env = enveloppesFoyer(s);
  const envL = Object.fromEntries(IMP_ENVS);
  const lo = s.list('loyer_mois').find((x) => x.data.mois === mk);
  const byDate = (a, c) => (a.date || '').localeCompare(c.date || '');
  return {
    mk, titre: `Charges de ${monthLabel(mk)} · salaires de fin ${moisSalaire(mk)}`, edite: dateFr(today()),
    lvl: b.lvl, libre: b.libre, charges: b.charges, E: b.E, revenus: b.revenus, S: b.S,
    salaires: rs.map((r) => ({ qui: qui(r), recu: estRecu(r, mk), montant: recuMois(r, mk) })),
    groupes,
    depenses: deps.map((d) => ({ ...d.data, charge: chargeNom(d) })).sort(byDate),
    enveloppes: EP_PARTS.map((p) => ({ label: p.label, prevu: num(fixes[p.k]), fait: !!mm[p.k]?.fait, solde: env.tot[p.k] || 0 })),
    imprevus: imprevusMois(s, mk).map((d) => ({ ...d.data, env: envL[d.data.env] || 'Imprévus' })).sort(byDate),
    sorties: b.sorties.map((d) => d.data),
    loyer: lo ? { verse: !!lo.data.verse, montant: num(lo.data.montant), lignes: lo.data.lignes || [] } : null,
  };
}

function Historique() {
  const s = useStore();
  const [open, setOpen] = useState(null);
  const fin = periodeActuelle();
  const mois = [];
  for (let m = fin; m >= FOYER_START; m = addMonths(m, -1)) mois.push(m);
  const PILL = { green: ['✅', 'Au vert'], orange: ['⚠️', 'À surveiller'], red: ['⛔', 'Au rouge'], wait: ['⏳', 'En attente'] };
  return (
    <>
      <p className="muted small">Chaque mois : ce qui est entré, les charges, les enveloppes, les imprévus et les dépenses. Touchez un mois pour voir le récap en image et l'envoyer.</p>
      {mois.map((m) => {
        const r = recapMois(s, m);
        const imp = r.imprevus.reduce((x, d) => x + num(d.montant), 0);
        const dep = r.depenses.reduce((x, d) => x + num(d.montant), 0);
        const lv = r.lvl === 'green' && r.libre === 0 ? ['✅', 'Tout est réparti'] : PILL[r.lvl];
        return (
          <button key={m} className={`card hist-card st-${r.lvl}`} onClick={() => setOpen(m)}>
            <div className="card-h"><b className="hist-t">{monthLabel(m)}</b><span className={`hist-pill ${r.lvl}`}>{lv[0]} {lv[1]}</span></div>
            <div className="kv"><span>Salaires reçus</span><b>{money(r.revenus)}</b></div>
            <div className="kv"><span>Charges ({r.groupes.reduce((x, g) => x + g.faites, 0)}/{r.groupes.reduce((x, g) => x + g.lignes.length, 0)} réglées)</span><b>{money(r.charges)}</b></div>
            {dep > 0 && <div className="kv"><span>dont dépenses notées</span><b>{money(dep)}</b></div>}
            <div className="kv"><span>Mis dans les enveloppes</span><b>{money(r.E)}</b></div>
            {imp > 0 && <div className="kv"><span>Imprévus (pris dans les enveloppes)</span><b>{money(imp)}</b></div>}
            {r.S > 0 && <div className="kv"><span>Dépensé sur le reste libre</span><b>{money(r.S)}</b></div>}
            <div className="kv big"><span>Reste libre</span><b>{r.lvl === 'wait' ? '—' : money(r.libre)}</b></div>
            <small className="link">Voir le récap en image ›</small>
          </button>
        );
      })}
      {open && <RecapSheet mk={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function RecapSheet({ mk, onClose }) {
  const s = useStore();
  const toast = useToast();
  const [cv, setCv] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    foyerRecapCanvas(recapMois(s, mk)).then((c) => { if (alive) setCv(c); }).catch((e) => toast(String(e.message || e), 'err'));
    return () => { alive = false; };
  }, [mk]);
  const send = async () => {
    setBusy(true);
    try { await shareCanvas(cv, `Recap_foyer_${mk}.png`, `Récap du foyer · ${monthLabel(mk)}`); } catch (e) { if (!/cancel/i.test(String(e?.message))) toast("L'envoi n'a pas abouti", 'err'); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Récap · ${monthLabel(mk)}`} onClose={onClose}
      footer={<button className="btn primary full" disabled={!cv || busy} onClick={send}>{busy ? 'Ouverture…' : 'Envoyer / enregistrer l’image'}</button>}>
      {cv ? <img className="preview-img" src={cv.toDataURL('image/png')} alt="Récap du mois" /> : <p className="muted center">Préparation de l'image…</p>}
      <p className="muted small center">Envoyez-la sur WhatsApp (à votre époux, ou à vous-même pour la garder).</p>
    </Sheet>
  );
}

// Dépense prise sur le reste libre (complément de courses, remboursement, aide…)
function LibreSheet({ mk, rec, onClose }) {
  const s = useStore();
  const toast = useToast();
  const b = bilanMois(s, mk);
  const [d, setD] = useState(() => rec ? { ...rec.data } : { date: today(), montant: '', motif: '', justif: '', dette: '' });
  const [del, setDel] = useState(false);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const dispo = b.libre + (rec ? num(rec.data.montant) : 0);
  const dettes = s.list('dette').filter((x) => (x.data.type || 'dette') === 'dette' && (detteReste(x) > 0 || x.id === rec?.data.dette));
  const ok = num(d.montant) > 0 && d.motif.trim() && hasJustif(d);
  // Remboursement : ajoute (ou met à jour) le versement dans Dettes
  const syncDette = (data, remove) => {
    const oldId = rec?.data.dette;
    const vid = data.remb || uid();
    if (oldId && (remove || oldId !== data.dette)) {
      const o = s.getRec(oldId);
      if (o) s.save('dette', { ...o.data, remboursements: (o.data.remboursements || []).filter((v) => v.id !== rec.data.remb) }, { id: o.id });
    }
    if (remove || !data.dette) return { ...data, remb: undefined };
    const x = s.getRec(data.dette);
    if (!x) return data;
    const autres = (x.data.remboursements || []).filter((v) => v.id !== vid);
    s.save('dette', { ...x.data, remboursements: [...autres, { id: vid, date: data.date, montant: num(data.montant), from: 'reste_libre' }] }, { id: x.id });
    return { ...data, remb: vid };
  };
  const save = () => {
    if (!ok) return toast(!hasJustif(d) ? 'Ajoutez un justificatif : sans justificatif, pas de validation' : 'Complétez la dépense', 'err');
    const data = syncDette({ ...d, montant: num(d.montant), mois: rec ? rec.data.mois : mk });
    s.save('sortie_libre', data, { id: rec?.id, shared: rec ? undefined : true });
    toast('Enregistré ✓');
    onClose();
  };
  return (
    <Sheet title={rec ? 'Modifier' : 'Dépense sur le reste libre'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" disabled={!ok} onClick={save}>Valider</button></div>}>
      <p className="muted small">Pour l'argent qui restait après les charges et les enveloppes : un complément de courses, un remboursement, une aide donnée…</p>
      <div className="row gap">
        <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => up('montant', v)} autoFocus={!rec} /></Field>
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => up('date', e.target.value)} /></Field>
      </div>
      <Field label="Pour quoi ?"><input value={d.motif} onChange={(e) => up('motif', e.target.value)} placeholder="Ex. Complément courses, quittance examen…" /></Field>
      <div className="chips">{['Complément courses', 'Remboursement', 'Donné à Monsieur', 'Donné à Madame'].map((m) => <button type="button" key={m} className={`chip ${d.motif === m ? 'on' : ''}`} onClick={() => up('motif', m)}>{m}</button>)}</div>
      <JustifFields d={d} up={up} />
      {dettes.length > 0 && (
        <Field label="C'est pour rembourser une dette ? (facultatif)" help="Le versement sera aussi noté dans Dettes.">
          <div className="chips">
            <button type="button" className={`chip ${!d.dette ? 'on' : ''}`} onClick={() => up('dette', '')}>Non</button>
            {dettes.map((x) => <button type="button" key={x.id} className={`chip ${d.dette === x.id ? 'on' : ''}`} onClick={() => setD((y) => ({ ...y, dette: x.id, motif: y.motif || `Remboursement ${x.data.personne}` }))}>{x.data.personne} · reste {money(detteReste(x))}</button>)}
          </div>
        </Field>
      )}
      <div className={`alert ${dispo - num(d.montant) < 0 ? 'danger' : 'info'}`}>Reste libre : {money(dispo)} · après : <b>{money(dispo - num(d.montant))}</b>{dispo - num(d.montant) === 0 ? ' · tout est réparti ✓' : ''}</div>
      {del && <Confirm text="Supprimer cette dépense ?" onNo={() => setDel(false)} onYes={() => { if (rec.data.dette) syncDette(rec.data, true); s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

// =====================================================================
// Enveloppes : ce qu'on met de côté chaque mois, et ce qu'on y prend
// =====================================================================
function Enveloppes({ mk, isOrly }) {
  const s = useStore();
  const toast = useToast();
  const [fixOpen, setFixOpen] = useState(false);
  const [imp, setImp] = useState(null);
  const rec = s.list('epargne_foyer')[0];
  const d = rec?.data || { mois: {} };
  const fixes = { ...FIX_DEF, ...(d.fixes || {}) };
  const env = enveloppesFoyer(s);
  const m = (d.mois || {})[mk] || {};
  const b = bilanMois(s, mk);
  const sorties = imprevusMois(s, mk).sort((a, c) => (c.data.date || '').localeCompare(a.data.date || ''));
  const save = (data) => s.save('epargne_foyer', data, { id: rec?.id, shared: rec ? undefined : true });
  const toggle = (k, montant) => {
    const mois = { ...(d.mois || {}) };
    const x = { ...(mois[mk] || {}) };
    if (x[k]?.fait) delete x[k]; else x[k] = { fait: true, montant, date: today() };
    mois[mk] = x;
    save({ ...d, fixes, depart: env.depart, mois });
  };
  const om = isOrly ? caisses(s).epargne.solde : null;
  return (
    <>
      <p className="muted small">Chaque mois, on met un montant fixe dans chaque enveloppe : cochez quand c'est fait. Un imprévu se prend dans une enveloppe.</p>
      <div className="card list">
        {EP_PARTS.map((p) => {
          const done = m[p.k]?.fait;
          const montant = done ? num(m[p.k].montant) : num(fixes[p.k]);
          const solde = env.tot[p.k];
          return (
            <div className="task env-row" key={p.k}>
              <button className={`check ${done ? 'on' : ''}`} onClick={() => toggle(p.k, montant)} disabled={!done && !montant} aria-label="Mis de côté">{done && <Check size={16} strokeWidth={3} />}</button>
              <div className="grow item-main">
                <b>{p.label}</b>
                <small>{done ? `+ ${money(montant)} mis ce mois ✓` : `à mettre : ${money(montant)}`}</small>
              </div>
              <div className="right"><small className="muted">dans l'enveloppe</small><b style={{ color: solde < 0 ? '#DC2626' : solde === 0 ? '#D97706' : '#15803D' }}>{money(solde)}</b></div>
            </div>
          );
        })}
      </div>
      <button className="btn primary full" onClick={() => setImp({})}><Plus size={18} /> Prendre dans une enveloppe (imprévu)</button>
      <h3 className="sec-t">Pris ce mois <small className="muted">· {money(sorties.reduce((x, y) => x + num(y.data.montant), 0))}</small></h3>
      {sorties.length === 0 ? <p className="muted small">Rien pour l'instant.</p> : (
        <div className="card list">
          {sorties.map((x) => (
            <button className="item" key={x.id} onClick={() => setImp(x)}>
              <div className="grow item-main"><b>{x.data.motif}</b><small>{dateFr(x.data.date)} · {IMP_ENVS.find((e) => e[0] === x.data.env)?.[1] || 'Imprévus'}{x.data.justif ? ` · ${x.data.justif}` : ''}</small></div>
              <b className="neg">- {money(x.data.montant)}</b>
            </button>
          ))}
        </div>
      )}
      {om !== null && <p className="muted small">À part : épargne OrlyMarket {money(om)}.</p>}
      <button className="btn ghost full" onClick={() => setFixOpen(true)}>Modifier les montants des enveloppes</button>
      {fixOpen && <FixSheet fixes={fixes} depart={env.depart} base={Math.max(0, b.revenus - b.charges)} onClose={() => setFixOpen(false)} onSave={(f, dep) => { save({ ...d, fixes: f, depart: dep, mois: d.mois || {} }); toast('Enregistré ✓'); setFixOpen(false); }} />}
      {imp && <ImprevuSheet mk={mk} rec={imp.id ? imp : null} onClose={() => setImp(null)} />}
    </>
  );
}
