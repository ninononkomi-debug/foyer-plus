import React, { useState } from 'react';
import { Phone, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { omStats, loyerMois, loyerEcheance, locataireActifMois } from '../lib/compute.js';
import { money, num, today, dateFr, monthKey, monthLabel } from '../lib/format.js';
import { ScreenHead, Fab, RecordForm, Money, Progress, Empty, MonthNav, Segmented, Sheet, Field, MoneyInput, WalletSelect, useToast, SharedTag, Confirm } from '../components/ui.jsx';

const STATUTS = [['paye', '✅ Payé'], ['partiel', '🟡 Partiel'], ['impaye', '🔴 Non payé']];
const PARTS = [['epargne', 'Épargne', '#7C3AED'], ['reinvest', 'Réinvestissement', '#EC4899'], ['perso', 'Dépenses perso', '#F59E0B'], ['tontine', 'Tontine', '#10B981']];

// ================= ORLYMARKET =================
export function OrlyMarket({ back, month, setMonth }) {
  const s = useStore();
  const toast = useToast();
  const [tab, setTab] = useState('ventes');
  const [form, setForm] = useState(null);
  const [edit, setEdit] = useState(false);
  const st = omStats(s, month);
  const ventes = s.list('om_vente').filter((v) => monthKey(v.data.date) === month).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const param = s.list('om_param')[0];
  const pct = param?.data.pct || { epargne: 30, reinvest: 40, perso: 20, tontine: 10 };
  const done = param?.data.done || {};
  const totalPct = PARTS.reduce((x, [k]) => x + num(pct[k]), 0);
  const ben = (v) => num(v.data.facture) - num(v.data.fournisseur) - num(v.data.frais);
  const part = (b, k) => Math.round((b * num(pct[k])) / 100);
  const saveParam = (patch) => s.save('om_param', { pct, done, ...(param?.data || {}), ...patch }, { id: param?.id, shared: false });

  const transfer = (k) => {
    const amount = part(st.benefice, k);
    if (amount <= 0) return;
    if (k === 'epargne') s.save('epargne', { date: today(), montant: amount, origine: `OrlyMarket ${monthLabel(month)}` }, { shared: false });
    if (k === 'perso') s.save('revenu', { date: today(), montant: amount, categorie: 'OrlyMarket', description: `Part perso ${monthLabel(month)}` }, { shared: false });
    saveParam({ done: { ...done, [`${month}:${k}`]: today() } });
    toast('Enregistré ✓');
  };

  return (
    <div className="screen">
      <ScreenHead title="OrlyMarket" sub="🔒 Privé" onBack={back} />
      <MonthNav value={month} onChange={setMonth} />
      <section className="hero small">
        <p>Bénéfice du mois</p>
        <h2>{money(st.benefice)}</h2>
        <div className="hero-row"><div><small>Chiffre d'affaires</small><b>{money(st.ca)}</b></div><div><small>Fournisseurs + frais</small><b>{money(st.cout + st.frais)}</b></div></div>
        <div className="hero-row"><div><small>Ventes</small><b>{st.nb}</b></div><div><small>Impayés</small><b>{money(st.impaye)}</b></div></div>
      </section>
      <Segmented value={tab} onChange={setTab} options={[['ventes', 'Ventes'], ['repartition', 'Répartition du bénéfice']]} />

      {tab === 'ventes' && (ventes.length === 0 ? <Empty icon="🛍️" title="Aucune vente ce mois" text="Ajoutez chaque commande : client, produit, prix facturé et prix fournisseur." /> : (
        <div className="card list">
          {ventes.map((v) => (
            <button className="item" key={v.id} onClick={() => setForm(v)}>
              <span className="emoji">{v.data.statut === 'paye' ? '✅' : v.data.statut === 'partiel' ? '🟡' : '🔴'}</span>
              <div className="grow item-main"><b>{v.data.client}</b><small>{v.data.produit}{v.data.quantite > 1 ? ` ×${v.data.quantite}` : ''} · {dateFr(v.data.date)}</small></div>
              <div className="right"><b>{money(v.data.facture)}</b><small className={ben(v) >= 0 ? 'pos' : 'neg'}>+{money(ben(v))}</small></div>
            </button>
          ))}
        </div>
      ))}

      {tab === 'repartition' && (
        <>
          <section className="card">
            <div className="card-h"><h3 className="card-t">Répartition de {money(st.benefice)}</h3><button className="link" onClick={() => setEdit(true)}>Modifier les %</button></div>
            {totalPct !== 100 && <div className="alert warn">Le total des pourcentages fait {totalPct} % (au lieu de 100 %).</div>}
            {PARTS.map(([k, l, c]) => (
              <div className="budget-line" key={k}>
                <div className="row"><span className="dot" style={{ background: c }} /><span className="grow">{l} <small className="muted">{pct[k]} %</small></span><b>{money(part(st.benefice, k))}</b></div>
                <Progress value={num(pct[k]) / 100} color={c} />
                {(k === 'epargne' || k === 'perso') && st.benefice > 0 && (
                  done[`${month}:${k}`]
                    ? <small className="muted">✓ Enregistré le {dateFr(done[`${month}:${k}`])}</small>
                    : <button className="btn soft sm" onClick={() => transfer(k)}>{k === 'epargne' ? 'Verser dans mon épargne' : 'Ajouter à mes revenus'}</button>
                )}
              </div>
            ))}
          </section>
          {ventes.length > 0 && (
            <section className="card table-wrap">
              <h3 className="card-t">Détail par client</h3>
              <table className="table">
                <thead><tr><th>Client</th><th>Bénéf.</th>{PARTS.map(([k, l]) => <th key={k}>{l.split(' ')[0].slice(0, 7)}</th>)}</tr></thead>
                <tbody>
                  {ventes.map((v) => {
                    const b = ben(v);
                    return <tr key={v.id}><td>{v.data.client}</td><td>{money(b)}</td>{PARTS.map(([k]) => <td key={k}>{money(part(b, k))}</td>)}</tr>;
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      <Fab onClick={() => setForm('new')} />
      {edit && <PctSheet pct={pct} onClose={() => setEdit(false)} onSave={(p) => { saveParam({ pct: p }); setEdit(false); toast('Pourcentages enregistrés ✓'); }} />}
      {form && <RecordForm title={form === 'new' ? 'Nouvelle vente' : 'Modifier la vente'} module="om_vente" rec={form === 'new' ? null : form} lockShared={false} onClose={() => setForm(null)}
        fields={[
          { k: 'date', label: 'Date', type: 'date', def: today, required: true },
          { k: 'client', label: 'Client', required: true },
          { k: 'telephone', label: 'Téléphone du client' },
          { k: 'produit', label: 'Produit', required: true, placeholder: 'Ex. Robe enfant, baskets homme…' },
          { k: 'rayon', label: 'Rayon', type: 'select', chips: true, options: [['femme', 'Femme'], ['homme', 'Homme'], ['enfant', 'Enfant'], ['maison', 'Maison']] },
          { k: 'quantite', label: 'Quantité', type: 'number', def: 1 },
          { k: 'facture', label: 'Montant facturé', type: 'money', required: true },
          { k: 'fournisseur', label: 'Montant fournisseur', type: 'money', required: true },
          { k: 'frais', label: 'Frais (livraison, transport…)', type: 'money' },
          { k: '_ben', type: 'custom', render: (d) => <div className="kv big-kv"><span>Bénéfice</span><b className={num(d.facture) - num(d.fournisseur) - num(d.frais) >= 0 ? 'pos' : 'neg'}>{money(num(d.facture) - num(d.fournisseur) - num(d.frais))}</b></div> },
          { k: 'statut', label: 'Statut du paiement', type: 'select', chips: true, options: STATUTS, def: 'impaye', required: true },
          { k: 'recu', label: 'Montant déjà reçu', type: 'money', show: (d) => d.statut === 'partiel' },
          { k: 'note', label: 'Note', type: 'textarea' },
        ]} />}
    </div>
  );
}

function PctSheet({ pct, onClose, onSave }) {
  const [p, setP] = useState({ ...pct });
  const total = PARTS.reduce((x, [k]) => x + num(p[k]), 0);
  return (
    <Sheet title="Répartition (en %)" onClose={onClose} footer={<button className="btn primary full" disabled={total !== 100} onClick={() => onSave(p)}>Enregistrer ({total} %)</button>}>
      {PARTS.map(([k, l]) => (
        <Field key={k} label={`${l} : ${p[k]} %`}>
          <input type="range" min="0" max="100" step="5" value={p[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} />
        </Field>
      ))}
      {total !== 100 && <div className="alert warn">Le total doit faire 100 %.</div>}
    </Sheet>
  );
}

// ================= LOCATAIRES =================
export function Locataires({ back, month, setMonth }) {
  const s = useStore();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const [detail, setDetail] = useState(null);
  const locs = s.list('locataire').filter((l) => locataireActifMois(l, month)).sort((a, b) => a.data.nom.localeCompare(b.data.nom));
  const inactifs = s.list('locataire').filter((l) => !locataireActifMois(l, month));
  const rows = locs.map((l) => ({ l, ...loyerMois(s, l, month), ech: loyerEcheance(l, month) }));
  const tot = rows.reduce((a, r) => ({ attendu: a.attendu + r.attendu, paye: a.paye + r.paye, reste: a.reste + r.reste }), { attendu: 0, paye: 0, reste: 0 });
  return (
    <div className="screen">
      <ScreenHead title="Locataires" onBack={back} />
      <MonthNav value={month} onChange={setMonth} />
      <section className="hero small">
        <p>Loyers encaissés</p>
        <h2>{money(tot.paye)} <small>/ {money(tot.attendu)}</small></h2>
        <Progress value={tot.attendu ? tot.paye / tot.attendu : 0} color="#fff" />
        <small>Reste à encaisser : {money(tot.reste)}</small>
      </section>
      {rows.length === 0 ? <Empty icon="🔑" title="Aucun locataire" text="Ajoutez vos locataires et leur loyer : l'application vous rappelle les loyers en retard." /> : (
        <div className="card list">
          {rows.map(({ l, attendu, paye, reste, ech }) => {
            const late = reste > 0 && ech < today();
            return (
              <div className="item col" key={l.id}>
                <div className="row" onClick={() => setDetail(l)}>
                  <span className="emoji">{reste === 0 ? '✅' : late ? '🔴' : '🟡'}</span>
                  <div className="grow item-main"><b>{l.data.nom}</b><small>{l.data.logement ? `${l.data.logement} · ` : ''}échéance le {ech.slice(8)} <SharedTag rec={l} /></small></div>
                  <div className="right"><b className={reste ? (late ? 'neg' : '') : 'pos'}>{reste ? money(reste) : 'Payé'}</b><small>{money(paye)} / {money(attendu)}</small></div>
                </div>
                {reste > 0 && <button className="btn soft sm" onClick={() => setPay({ l, reste })}>Enregistrer un paiement</button>}
              </div>
            );
          })}
        </div>
      )}
      {inactifs.length > 0 && <p className="muted small">{inactifs.length} locataire(s) inactif(s) ce mois : {inactifs.map((l) => <button key={l.id} className="link" onClick={() => setForm(l)}>{l.data.nom}</button>)}</p>}
      <Fab onClick={() => setForm('new')} />
      {pay && <LoyerSheet loc={pay.l} montant={pay.reste} month={month} onClose={() => setPay(null)} onSave={(d) => {
        s.save('loyer', { ...d, locataire: pay.l.id }, { shared: !!pay.l.household_id });
        toast('Paiement enregistré ✓'); setPay(null);
      }} />}
      {detail && <LocataireDetail l={detail} onClose={() => setDetail(null)} onEdit={() => { setForm(detail); setDetail(null); }} />}
      {form && <RecordForm title={form === 'new' ? 'Nouveau locataire' : 'Modifier le locataire'} module="locataire" rec={form === 'new' ? null : form} sharedDefault onClose={() => setForm(null)}
        fields={[
          { k: 'nom', label: 'Nom du locataire', required: true },
          { k: 'logement', label: 'Logement', placeholder: 'Ex. Studio 2, Akanda' },
          { k: 'loyer', label: 'Loyer mensuel', type: 'money', required: true },
          { k: 'jour', label: "Jour d'échéance (1 à 28)", type: 'number', def: 5 },
          { k: 'telephone', label: 'Téléphone' },
          { k: 'caution', label: 'Caution versée', type: 'money' },
          { k: 'debut', label: "Début du bail", type: 'date' },
          { k: 'fin', label: 'Fin du bail', type: 'date' },
          { k: 'actif', label: 'Locataire actif', type: 'toggle', defOn: true },
        ]} />}
    </div>
  );
}

function LoyerSheet({ loc, montant, month, onClose, onSave, rec }) {
  const [d, setD] = useState(rec?.data || { montant, date: today(), mois: month, portefeuille: '' });
  return (
    <Sheet title={`Loyer · ${loc.data.nom}`} onClose={onClose} footer={<button className="btn primary full" onClick={() => num(d.montant) > 0 && onSave({ ...d, montant: num(d.montant) })}>Enregistrer</button>}>
      <Field label="Montant reçu"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
      <Field label="Mois concerné"><input type="month" value={d.mois} onChange={(e) => setD({ ...d, mois: e.target.value })} /></Field>
      <Field label="Date du paiement"><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
      <WalletSelect value={d.portefeuille} onChange={(v) => setD({ ...d, portefeuille: v })} allowEmpty label="Reçu sur" />
      <p className="muted small">Le loyer est compté automatiquement dans vos revenus.</p>
    </Sheet>
  );
}

function LocataireDetail({ l, onClose, onEdit }) {
  const s = useStore();
  const [del, setDel] = useState(null);
  const pays = s.list('loyer').filter((p) => p.data.locataire === l.id).sort((a, b) => b.data.mois.localeCompare(a.data.mois) || b.data.date.localeCompare(a.data.date));
  return (
    <Sheet title={l.data.nom} onClose={onClose} footer={<button className="btn ghost full" onClick={onEdit}>Modifier la fiche</button>}>
      <div className="kv"><span>Logement</span><b>{l.data.logement || '—'}</b></div>
      <div className="kv"><span>Loyer</span><b>{money(l.data.loyer)}</b></div>
      <div className="kv"><span>Caution</span><b>{money(l.data.caution)}</b></div>
      {l.data.telephone && <a className="btn soft full" href={`tel:${l.data.telephone}`}><Phone size={16} /> Appeler {l.data.telephone}</a>}
      <h3 className="sec-t">Historique des paiements</h3>
      {pays.length === 0 ? <p className="muted">Aucun paiement.</p> : (
        <div className="list">
          {pays.map((p) => (
            <div className="item" key={p.id}>
              <div className="grow item-main"><b>{monthLabel(p.data.mois)}</b><small>Payé le {dateFr(p.data.date)}</small></div>
              <Money v={p.data.montant} className="pos" />
              <button className="icon-btn" onClick={() => setDel(p)} aria-label="Supprimer"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {del && <Confirm text="Supprimer ce paiement ?" onNo={() => setDel(null)} onYes={() => { s.remove(del.id); setDel(null); }} />}
    </Sheet>
  );
}
