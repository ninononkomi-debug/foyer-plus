import React, { useState } from 'react';
import { ChevronRight, Check, Plus } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { budgetStatus, inScope, objectifProgress, walletBalances, detteReste, categoriesMap } from '../lib/compute.js';
import { money, num, today, dateFr, nextDate, monthKey, daysBetween, monthLabel } from '../lib/format.js';
import { FREQUENCES, WALLET_TYPES } from '../lib/defaults.js';
import { ScreenHead, Fab, RecordForm, Money, Progress, Empty, CatBadge, SharedTag, MonthNav, Segmented, Sheet, Field, MoneyInput, WalletSelect, useToast, Confirm } from '../components/ui.jsx';

export function ModulesHome({ go }) {
  const s = useStore();
  const tiles = [
    ['budget', '🎯', 'Budget', 'Plafonds par catégorie'],
    ['epargne', '🐷', 'Épargne & objectifs', 'Projets et versements'],
    ['tontines', '🫙', 'Tontines', 'Cotisations et tours'],
    ['abonnements', '🔁', 'Abonnements', 'Canal+, internet, …'],
    ['orlymarket', '🛍️', 'OrlyMarket', 'Ventes et bénéfices'],
    ['locataires', '🔑', 'Locataires', 'Loyers attendus et payés'],
    ['patrimoine', '🏡', 'Patrimoine', 'Biens et valeur nette'],
    ['dettes', '🤝', 'Dettes & créances', 'Qui doit quoi'],
    ['portefeuilles', '👛', 'Porte-monnaie', 'Espèces, banque, Mobile Money'],
  ];
  return (
    <div className="screen">
      <ScreenHead title="Modules" sub={s.household ? `Foyer : ${s.household.name}` : null} />
      <div className="tiles">
        {tiles.map(([k, i, t, sub]) => (
          <button key={k} className="tile" onClick={() => go(k)}>
            <span className="tile-i">{i}</span>
            <b>{t}</b>
            <small>{sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= BUDGET =================
export function Budget({ back, month, setMonth, scope }) {
  const s = useStore();
  const [form, setForm] = useState(null);
  const list = budgetStatus(s, month, scope);
  const tot = list.reduce((a, b) => ({ m: a.m + b.montant, d: a.d + b.depense }), { m: 0, d: 0 });
  const cats = Object.values(categoriesMap(s)).filter((c) => c.type === 'depense').map((c) => [c.nom, `${c.icone} ${c.nom}`]);
  return (
    <div className="screen">
      <ScreenHead title="Budget" onBack={back} />
      <MonthNav value={month} onChange={setMonth} />
      <section className="hero small">
        <p>Dépensé sur le budget</p>
        <h2>{money(tot.d)} <small>/ {money(tot.m)}</small></h2>
        <Progress value={tot.m ? tot.d / tot.m : 0} color="#fff" />
      </section>
      {list.length === 0 ? <Empty icon="🎯" title="Aucun budget" text="Fixez un plafond mensuel par catégorie, l'application vous alerte en cas de dépassement." /> : (
        <div className="card list">
          {list.map((b) => (
            <button className="item col" key={b.rec.id} onClick={() => setForm(b.rec)}>
              <div className="row"><CatBadge name={b.categorie} /><div className="grow item-main"><b>{b.categorie}</b><small>{b.rec.data.mois ? `Uniquement ${monthLabel(b.rec.data.mois)}` : 'Chaque mois'} <SharedTag rec={b.rec} /></small></div>
                <div className="right"><b className={b.reste < 0 ? 'neg' : ''}>{b.reste < 0 ? `−${money(-b.reste)}` : money(b.reste)}</b><small>{b.reste < 0 ? 'dépassé' : 'restant'}</small></div></div>
              <Progress value={b.pct} danger />
              <small className="muted">{money(b.depense)} dépensés sur {money(b.montant)}</small>
            </button>
          ))}
        </div>
      )}
      <Fab onClick={() => setForm('new')} />
      {form && <RecordForm title={form === 'new' ? 'Nouveau budget' : 'Modifier le budget'} module="budget" rec={form === 'new' ? null : form} onClose={() => setForm(null)}
        fields={[
          { k: 'categorie', label: 'Catégorie', type: 'select', options: cats, required: true },
          { k: 'montant', label: 'Plafond mensuel', type: 'money', required: true },
          { k: 'mois', label: 'Uniquement pour un mois (facultatif)', type: 'month', help: 'Laissez vide pour appliquer chaque mois.' },
        ]} />}
    </div>
  );
}

// ================= ÉPARGNE & OBJECTIFS =================
export function Epargne({ back }) {
  const s = useStore();
  const [form, setForm] = useState(null);
  const [vers, setVers] = useState(null);
  const objectifs = s.list('objectif').sort((a, b) => (a.data.echeance || '9').localeCompare(b.data.echeance || '9'));
  const versements = s.list('epargne').sort((a, b) => b.data.date.localeCompare(a.data.date));
  const total = versements.reduce((x, v) => x + num(v.data.montant), 0) + objectifs.reduce((x, o) => x + num(o.data.deja), 0);
  return (
    <div className="screen">
      <ScreenHead title="Épargne & objectifs" onBack={back} />
      <section className="hero small"><p>Total épargné</p><h2>{money(total)}</h2></section>
      <div className="card-h"><h3 className="sec-t">Objectifs</h3><button className="link" onClick={() => setForm('new')}>+ Objectif</button></div>
      {objectifs.length === 0 ? <Empty icon="🎯" title="Aucun objectif" text="Ex. rentrée scolaire, voyage, fonds d'urgence, terrain…" /> : objectifs.map((o) => {
        const p = objectifProgress(s, o);
        const left = o.data.echeance ? daysBetween(today(), o.data.echeance) : null;
        const mois = left > 0 ? Math.max(1, Math.round(left / 30)) : null;
        return (
          <div className="card" key={o.id}>
            <div className="row" onClick={() => setForm(o)}>
              <span className="emoji">{o.data.icone || '🎯'}</span>
              <div className="grow item-main"><b>{o.data.nom}</b><small>{o.data.echeance ? `Avant le ${dateFr(o.data.echeance)}` : 'Sans date'} <SharedTag rec={o} /></small></div>
              <b>{Math.round(p.pct * 100)} %</b>
            </div>
            <Progress value={p.pct} />
            <div className="row between small"><span>{money(p.verse)} / {money(p.cible)}</span>{mois && p.verse < p.cible && <span className="muted">≈ {money((p.cible - p.verse) / mois)} / mois</span>}</div>
            <button className="btn soft full" onClick={() => setVers({ objectif: o.id, shared: !!o.household_id })}><Plus size={16} /> Verser</button>
          </div>
        );
      })}
      <div className="card-h"><h3 className="sec-t">Versements</h3><button className="link" onClick={() => setVers({})}>+ Versement</button></div>
      {versements.length === 0 ? <p className="muted">Aucun versement.</p> : (
        <div className="card list">
          {versements.slice(0, 50).map((v) => (
            <button className="item" key={v.id} onClick={() => setVers({ rec: v })}>
              <span className="emoji">🐷</span>
              <div className="grow item-main"><b>{v.data.origine || s.getRec(v.data.objectif)?.data.nom || 'Épargne'}</b><small>{dateFr(v.data.date)} <SharedTag rec={v} /></small></div>
              <Money v={v.data.montant} className="pos" />
            </button>
          ))}
        </div>
      )}
      {form && <RecordForm title={form === 'new' ? 'Nouvel objectif' : "Modifier l'objectif"} module="objectif" rec={form === 'new' ? null : form} onClose={() => setForm(null)} sharedDefault
        fields={[
          { k: 'nom', label: 'Nom', required: true, placeholder: 'Ex. Rentrée scolaire 2027' },
          { k: 'icone', label: 'Icône', type: 'select', chips: true, def: '🎯', options: ['🎯', '🏠', '🚗', '🎓', '✈️', '💍', '🆘', '🏥', '🎄', '📱'].map((e) => [e, e]) },
          { k: 'cible', label: 'Montant visé', type: 'money', required: true },
          { k: 'deja', label: 'Déjà mis de côté', type: 'money' },
          { k: 'echeance', label: 'Date limite', type: 'date' },
        ]} />}
      {vers && <RecordForm title={vers.rec ? 'Modifier le versement' : 'Nouveau versement'} module="epargne" rec={vers.rec || null} defaults={{ objectif: vers.objectif }} sharedDefault={vers.shared} onClose={() => setVers(null)}
        fields={[
          { k: 'montant', label: 'Montant', type: 'money', required: true, autoFocus: true },
          { k: 'date', label: 'Date', type: 'date', def: today, required: true },
          { k: 'objectif', label: 'Pour l’objectif', type: 'select', options: objectifs.map((o) => [o.id, o.data.nom]) },
          { k: 'origine', label: 'Origine', placeholder: 'Ex. part épargne OrlyMarket, salaire…' },
          { k: 'de', label: 'Pris sur (facultatif)', type: 'wallet' },
          { k: 'vers', label: 'Placé sur (facultatif)', type: 'wallet' },
        ]} />}
    </div>
  );
}

// ================= TONTINES =================
export function Tontines({ back }) {
  const s = useStore();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const list = s.list('tontine').sort((a, b) => (a.data.prochaine || '9').localeCompare(b.data.prochaine || '9'));
  const payer = (t, montant, portefeuille) => {
    s.save('depense', { date: today(), montant, categorie: 'Tontine', description: `Cotisation ${t.data.nom}`, portefeuille }, { shared: !!t.household_id });
    const hist = [...(t.data.historique || []), { date: today(), montant }];
    s.save('tontine', { ...t.data, historique: hist, prochaine: t.data.prochaine ? nextDate(t.data.prochaine, t.data.frequence || 'mensuel') : '' }, { id: t.id });
    toast('Cotisation enregistrée ✓');
  };
  const recevoir = (t) => {
    s.save('revenu', { date: today(), montant: num(t.data.a_recevoir), categorie: 'Tontine reçue', description: `Tour ${t.data.nom}` }, { shared: !!t.household_id });
    s.save('tontine', { ...t.data, recu: true }, { id: t.id });
    toast('Tour reçu enregistré ✓');
  };
  return (
    <div className="screen">
      <ScreenHead title="Tontines" onBack={back} />
      {list.length === 0 ? <Empty icon="🫙" title="Aucune tontine" text="Suivez vos cotisations, la date de votre tour et ce que vous allez recevoir." /> : list.map((t) => {
        const paid = (t.data.historique || []).reduce((x, h) => x + num(h.montant), 0);
        return (
          <div className="card" key={t.id}>
            <div className="row" onClick={() => setForm(t)}>
              <span className="emoji">🫙</span>
              <div className="grow item-main"><b>{t.data.nom}</b><small>{money(t.data.cotisation)} · {(FREQUENCES.find((f) => f[0] === t.data.frequence) || FREQUENCES[2])[1].toLowerCase()} <SharedTag rec={t} /></small></div>
              <ChevronRight size={18} />
            </div>
            <div className="kv"><span>Prochaine cotisation</span><b className={t.data.prochaine && t.data.prochaine < today() ? 'neg' : ''}>{dateFr(t.data.prochaine) || '—'}</b></div>
            <div className="kv"><span>Mon tour</span><b>{t.data.mon_tour ? dateFr(t.data.mon_tour) : '—'}{t.data.recu ? ' ✓ reçu' : ''}</b></div>
            <div className="kv"><span>À recevoir</span><b>{money(t.data.a_recevoir)}</b></div>
            <div className="kv"><span>Total cotisé</span><b>{money(paid)}</b></div>
            <div className="row gap">
              <button className="btn soft grow" onClick={() => setPay(t)}><Check size={16} /> Cotisation payée</button>
              {!t.data.recu && num(t.data.a_recevoir) > 0 && <button className="btn ghost" onClick={() => recevoir(t)}>Tour reçu</button>}
            </div>
          </div>
        );
      })}
      <Fab onClick={() => setForm('new')} />
      {pay && <PaySheet title={`Cotisation ${pay.data.nom}`} montant={num(pay.data.cotisation)} onClose={() => setPay(null)} onPay={(m, w) => { payer(pay, m, w); setPay(null); }} />}
      {form && <RecordForm title={form === 'new' ? 'Nouvelle tontine' : 'Modifier la tontine'} module="tontine" rec={form === 'new' ? null : form} onClose={() => setForm(null)}
        fields={[
          { k: 'nom', label: 'Nom de la tontine', required: true },
          { k: 'cotisation', label: 'Cotisation', type: 'money', required: true },
          { k: 'frequence', label: 'Fréquence', type: 'select', options: FREQUENCES, def: 'mensuel', required: true },
          { k: 'prochaine', label: 'Prochaine cotisation', type: 'date', def: today },
          { k: 'mon_tour', label: 'Date de mon tour', type: 'date' },
          { k: 'a_recevoir', label: 'Montant à recevoir', type: 'money' },
          { k: 'membres', label: 'Nombre de membres', type: 'number' },
          { k: 'responsable', label: 'Responsable / contact' },
          { k: 'actif', label: 'Tontine active', type: 'toggle', defOn: true },
        ]} />}
    </div>
  );
}

export function PaySheet({ title, montant, onClose, onPay }) {
  const [m, setM] = useState(montant);
  const [w, setW] = useState('');
  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary full" onClick={() => onPay(num(m), w)}>Confirmer le paiement</button>}>
      <Field label="Montant payé"><MoneyInput value={m} onChange={setM} /></Field>
      <WalletSelect value={w} onChange={setW} allowEmpty />
      <p className="muted small">Une dépense sera ajoutée automatiquement dans vos opérations.</p>
    </Sheet>
  );
}

// ================= ABONNEMENTS =================
export function Abonnements({ back }) {
  const s = useStore();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const list = s.list('abonnement').sort((a, b) => (a.data.prochaine || '9').localeCompare(b.data.prochaine || '9'));
  const mensuel = list.filter((a) => a.data.actif !== false).reduce((x, a) => {
    const k = { hebdomadaire: 4.33, quinzaine: 2.17, mensuel: 1, trimestriel: 1 / 3, annuel: 1 / 12 }[a.data.frequence || 'mensuel'];
    return x + num(a.data.montant) * k;
  }, 0);
  return (
    <div className="screen">
      <ScreenHead title="Abonnements" onBack={back} />
      <section className="hero small"><p>Coût mensuel estimé</p><h2>{money(mensuel)}</h2><small>{money(mensuel * 12)} par an</small></section>
      {list.length === 0 ? <Empty icon="🔁" title="Aucun abonnement" text="Canal+, internet, forfait mobile, salle de sport, scolarité…" /> : (
        <div className="card list">
          {list.map((a) => {
            const late = a.data.prochaine && a.data.prochaine < today();
            return (
              <div className="item" key={a.id}>
                <span className="emoji" onClick={() => setForm(a)}>🔁</span>
                <div className="grow item-main" onClick={() => setForm(a)}>
                  <b className={a.data.actif === false ? 'muted' : ''}>{a.data.nom}</b>
                  <small className={late ? 'neg' : ''}>{money(a.data.montant)} · {a.data.prochaine ? `le ${dateFr(a.data.prochaine)}` : '—'} <SharedTag rec={a} /></small>
                </div>
                {a.data.actif !== false && <button className="btn soft sm" onClick={() => setPay(a)}>Payé</button>}
              </div>
            );
          })}
        </div>
      )}
      <Fab onClick={() => setForm('new')} />
      {pay && <PaySheet title={`Paiement ${pay.data.nom}`} montant={num(pay.data.montant)} onClose={() => setPay(null)} onPay={(m, w) => {
        s.save('depense', { date: today(), montant: m, categorie: pay.data.categorie || 'Abonnements', description: pay.data.nom, portefeuille: w || pay.data.portefeuille }, { shared: !!pay.household_id });
        s.save('abonnement', { ...pay.data, prochaine: nextDate(pay.data.prochaine || today(), pay.data.frequence || 'mensuel') }, { id: pay.id });
        toast('Paiement enregistré ✓'); setPay(null);
      }} />}
      {form && <RecordForm title={form === 'new' ? 'Nouvel abonnement' : "Modifier l'abonnement"} module="abonnement" rec={form === 'new' ? null : form} onClose={() => setForm(null)}
        fields={[
          { k: 'nom', label: 'Nom', required: true, placeholder: 'Ex. Canal+' },
          { k: 'montant', label: 'Montant', type: 'money', required: true },
          { k: 'frequence', label: 'Fréquence', type: 'select', options: FREQUENCES, def: 'mensuel', required: true },
          { k: 'prochaine', label: 'Prochaine échéance', type: 'date', def: today, required: true },
          { k: 'categorie', label: 'Catégorie', type: 'category' },
          { k: 'portefeuille', label: 'Payé avec', type: 'wallet' },
          { k: 'actif', label: 'Actif', type: 'toggle', defOn: true },
        ]} />}
    </div>
  );
}

// ================= PATRIMOINE =================
export function Patrimoine({ back }) {
  const s = useStore();
  const [form, setForm] = useState(null);
  const list = s.list('patrimoine').sort((a, b) => num(b.data.valeur) - num(a.data.valeur));
  const bal = walletBalances(s);
  const liquide = s.list('portefeuille').reduce((x, w) => x + (bal[w.id] || 0), 0);
  const actifs = list.reduce((x, a) => x + num(a.data.valeur), 0);
  const dettes = s.list('dette').filter((d) => d.data.type !== 'creance').reduce((x, d) => x + detteReste(d), 0);
  const creances = s.list('dette').filter((d) => d.data.type === 'creance').reduce((x, d) => x + detteReste(d), 0);
  const net = actifs + liquide + creances - dettes;
  return (
    <div className="screen">
      <ScreenHead title="Patrimoine" onBack={back} />
      <section className="hero small">
        <p>Valeur nette</p><h2>{money(net)}</h2>
        <div className="hero-row"><div><small>Biens</small><b>{money(actifs)}</b></div><div><small>Porte-monnaie</small><b>{money(liquide)}</b></div></div>
        <div className="hero-row"><div><small>Créances</small><b>{money(creances)}</b></div><div><small>Dettes</small><b>−{money(dettes)}</b></div></div>
      </section>
      {list.length === 0 ? <Empty icon="🏡" title="Aucun bien" text="Maison, terrain, voiture, stock OrlyMarket, bijoux…" /> : (
        <div className="card list">
          {list.map((a) => (
            <button className="item" key={a.id} onClick={() => setForm(a)}>
              <span className="emoji">{a.data.icone || '🏡'}</span>
              <div className="grow item-main"><b>{a.data.actif}</b><small>Mis à jour le {dateFr(a.data.date)} <SharedTag rec={a} /></small></div>
              <Money v={a.data.valeur} />
            </button>
          ))}
        </div>
      )}
      <Fab onClick={() => setForm('new')} />
      {form && <RecordForm title={form === 'new' ? 'Nouveau bien' : 'Modifier le bien'} module="patrimoine" rec={form === 'new' ? null : form} onClose={() => setForm(null)} sharedDefault
        fields={[
          { k: 'actif', label: 'Bien', required: true, placeholder: 'Ex. Terrain Owendo' },
          { k: 'icone', label: 'Type', type: 'select', chips: true, def: '🏡', options: [['🏡', '🏡 Immobilier'], ['🌍', '🌍 Terrain'], ['🚗', '🚗 Véhicule'], ['📦', '📦 Stock'], ['💍', '💍 Bijoux'], ['📈', '📈 Placement'], ['🧰', '🧰 Autre']] },
          { k: 'valeur', label: 'Valeur actuelle', type: 'money', required: true },
          { k: 'date', label: 'Date de mise à jour', type: 'date', def: today },
          { k: 'note', label: 'Note', type: 'textarea' },
        ]} />}
    </div>
  );
}

// ================= DETTES & CRÉANCES =================
export function Dettes({ back }) {
  const s = useStore();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('dette');
  const [remb, setRemb] = useState(null);
  const all = s.list('dette');
  const list = all.filter((d) => (d.data.type || 'dette') === tab).sort((a, b) => detteReste(b) - detteReste(a));
  const tot = (t) => all.filter((d) => (d.data.type || 'dette') === t).reduce((x, d) => x + detteReste(d), 0);
  return (
    <div className="screen">
      <ScreenHead title="Dettes & créances" onBack={back} />
      <div className="mini-stats two">
        <div><small>Je dois</small><Money v={tot('dette')} className="neg" /></div>
        <div><small>On me doit</small><Money v={tot('creance')} className="pos" /></div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[['dette', 'Je dois'], ['creance', 'On me doit']]} />
      {list.length === 0 ? <Empty icon="🤝" title="Rien à signaler" /> : (
        <div className="card list">
          {list.map((d) => {
            const reste = detteReste(d);
            return (
              <div className="item col" key={d.id}>
                <div className="row" onClick={() => setForm(d)}>
                  <span className="emoji">{reste === 0 ? '✅' : tab === 'dette' ? '📤' : '📥'}</span>
                  <div className="grow item-main"><b>{d.data.personne}</b><small>{d.data.motif || ''}{d.data.echeance ? ` · échéance ${dateFr(d.data.echeance)}` : ''} <SharedTag rec={d} /></small></div>
                  <div className="right"><b className={reste ? (tab === 'dette' ? 'neg' : 'pos') : 'muted'}>{money(reste)}</b><small>sur {money(d.data.montant)}</small></div>
                </div>
                {reste > 0 && <button className="btn soft sm" onClick={() => setRemb(d)}>{tab === 'dette' ? 'Enregistrer un remboursement' : 'Enregistrer un paiement reçu'}</button>}
              </div>
            );
          })}
        </div>
      )}
      <Fab onClick={() => setForm('new')} />
      {remb && <PaySheet title={remb.data.personne} montant={detteReste(remb)} onClose={() => setRemb(null)} onPay={(m, w) => {
        const r = [...(remb.data.remboursements || []), { date: today(), montant: m }];
        s.save('dette', { ...remb.data, remboursements: r }, { id: remb.id });
        if (remb.data.type === 'creance') s.save('revenu', { date: today(), montant: m, categorie: 'Remboursement reçu', description: remb.data.personne, portefeuille: w }, { shared: !!remb.household_id });
        else s.save('depense', { date: today(), montant: m, categorie: 'Remboursement dette', description: remb.data.personne, portefeuille: w }, { shared: !!remb.household_id });
        toast('Enregistré ✓'); setRemb(null);
      }} />}
      {form && <RecordForm title={form === 'new' ? 'Nouvelle ligne' : 'Modifier'} module="dette" rec={form === 'new' ? null : form} defaults={{ type: tab }} onClose={() => setForm(null)}
        fields={[
          { k: 'type', label: 'Type', type: 'select', chips: true, options: [['dette', 'Je dois'], ['creance', 'On me doit']], required: true },
          { k: 'personne', label: 'Personne', required: true },
          { k: 'montant', label: 'Montant', type: 'money', required: true },
          { k: 'date', label: 'Date', type: 'date', def: today },
          { k: 'echeance', label: 'Échéance', type: 'date', help: 'Vous recevrez un rappel.' },
          { k: 'motif', label: 'Motif' },
          { k: 'telephone', label: 'Téléphone' },
        ]} />}
    </div>
  );
}

// ================= PORTE-MONNAIE =================
export function Portefeuilles({ back }) {
  const s = useStore();
  const [form, setForm] = useState(null);
  const bal = walletBalances(s);
  const list = s.list('portefeuille').sort((a, b) => (a.household_id ? 1 : 0) - (b.household_id ? 1 : 0));
  const total = list.filter((w) => w.data.actif !== false).reduce((x, w) => x + (bal[w.id] || 0), 0);
  return (
    <div className="screen">
      <ScreenHead title="Porte-monnaie" onBack={back} />
      <section className="hero small"><p>Total disponible</p><h2>{money(total)}</h2></section>
      <div className="card list">
        {list.map((w) => {
          const t = WALLET_TYPES.find((x) => x[0] === w.data.type) || WALLET_TYPES[4];
          return (
            <button className="item" key={w.id} onClick={() => setForm(w)}>
              <span className="emoji">{t[2]}</span>
              <div className="grow item-main"><b className={w.data.actif === false ? 'muted' : ''}>{w.data.nom}</b><small>{t[1]} <SharedTag rec={w} /></small></div>
              <Money v={bal[w.id] || 0} className={bal[w.id] < 0 ? 'neg' : ''} />
            </button>
          );
        })}
      </div>
      <p className="muted small">Astuce : indiquez le solde de départ de chaque porte-monnaie, l'application calcule ensuite le solde automatiquement à partir de vos opérations.</p>
      <Fab onClick={() => setForm('new')} />
      {form && <RecordForm title={form === 'new' ? 'Nouveau porte-monnaie' : 'Modifier'} module="portefeuille" rec={form === 'new' ? null : form} onClose={() => setForm(null)}
        fields={[
          { k: 'nom', label: 'Nom', required: true, placeholder: 'Ex. BGFI, Airtel Money…' },
          { k: 'type', label: 'Type', type: 'select', chips: true, options: WALLET_TYPES.map((t) => [t[0], `${t[2]} ${t[1]}`]), def: 'especes', required: true },
          { k: 'solde_initial', label: 'Solde de départ', type: 'money', def: 0 },
          { k: 'date', label: 'Date du solde de départ', type: 'date', def: today },
          { k: 'actif', label: 'Actif', type: 'toggle', defOn: true },
        ]} />}
    </div>
  );
}
