import React, { useEffect, useState } from 'react';
import { Check, Plus, Trash2, Pencil, Settings2, Handshake, Users, PiggyBank, Wallet, KeyRound, CheckCircle2 } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, monthKey, monthLabel, uid, addMonths } from '../lib/format.js';
import { ScreenHead, Sheet, Field, MoneyInput, Segmented, MonthNav, Empty, Confirm, useToast, Progress, Fab } from '../components/ui.jsx';
import { caisses } from '../lib/market.js';

// =====================================================================
// Données et calculs
// =====================================================================
export const TITULAIRES = [['moi', 'Moi'], ['monsieur', 'Monsieur']];

export function revenusFixes(s) {
  return s.list('revenu_fixe').sort((a, b) => (a.data.ordre || 0) - (b.data.ordre || 0));
}
export function budgetMois(s, mk) {
  const rs = revenusFixes(s);
  let revenus = 0, charges = 0, faites = 0, nb = 0, montantFait = 0;
  const aRenseigner = [];
  for (const r of rs) {
    const ok = num(r.data.montant) > 0;
    if (ok) revenus += num(r.data.montant); else aRenseigner.push(r);
    const f = (r.data.faits || {})[mk] || {};
    for (const c of r.data.charges || []) {
      if (ok) charges += num(c.montant);
      nb++;
      if (f[c.id]) { faites++; montantFait += num(c.montant); }
    }
  }
  // un revenu sans montant n'entre pas dans le calcul (sinon le foyer paraît « dans le rouge » à tort)
  return { revenus, charges, reste: revenus - charges, faites, nb, montantFait, aRenseigner };
}

// Premier lancement : les revenus et charges donnés par Orly
export function seedFoyer(s) {
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
const SECTIONS = [['budget', 'Revenus & charges'], ['loyer', 'Loyer'], ['dettes', 'Dettes'], ['tontines', 'Tontines'], ['epargne', 'Épargne']];

export default function FoyerV2({ initial, isOrly }) {
  const s = useStore();
  const [sec, setSec] = useState(initial || 'budget');
  const [month, setMonth] = useState(monthKey(today()));
  useEffect(() => {
    if (!isOrly || !s.ready) return;
    seedFoyer(s);
    // salaire de Monsieur donné par Orly : 243 000 F (si encore vide)
    const m = s.list('revenu_fixe').find((r) => r.data.titulaire === 'monsieur' && !num(r.data.montant) && !r.data.maj243);
    if (m) s.save('revenu_fixe', { ...m.data, montant: 243000, maj243: true }, { id: m.id });
  }, [s.ready, s.lastSyncAt]);
  return (
    <div className="screen">
      <ScreenHead title="Foyer" sub={s.household ? s.household.name : 'Revenus, loyer, dettes, tontines, épargne'} />
      <div className="section-chips">
        {SECTIONS.map(([k, l]) => <button key={k} className={`chip ${sec === k ? 'on' : ''}`} onClick={() => setSec(k)}>{l}</button>)}
      </div>
      {['budget', 'loyer', 'epargne'].includes(sec) && <MonthNav value={month} onChange={setMonth} />}
      {sec === 'budget' && <Budget mk={month} />}
      {sec === 'loyer' && <Loyer mk={month} />}
      {sec === 'dettes' && <Dettes />}
      {sec === 'tontines' && <Tontines />}
      {sec === 'epargne' && <EpargneFoyer mk={month} isOrly={isOrly} />}
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
  const rs = revenusFixes(s);
  const b = budgetMois(s, mk);
  return (
    <>
      <section className={`hero small ${b.reste < 0 ? 'danger' : ''}`} style={b.reste < 0 ? { background: 'linear-gradient(135deg,#9F1239,#E11D48)' } : undefined}>
        <p>{monthLabel(mk)} · revenus − charges</p>
        <h2>{b.reste >= 0 ? '+' : ''}{money(b.reste)}</h2>
        <small>{b.reste < 0 ? '⚠️ Vous êtes dans le rouge' : 'Vous êtes dans le vert'} · revenus {money(b.revenus)} · charges {money(b.charges)}</small>
      </section>
      <section className="card">
        <div className="row between"><b>Charges réglées ce mois</b><span className="muted small">{b.faites}/{b.nb}</span></div>
        <Progress value={b.nb ? b.faites / b.nb : 0} />
        <p className="muted small">{money(b.montantFait)} réglés</p>
      </section>
      {b.aRenseigner.length > 0 && <div className="alert warn">Montant à renseigner : {b.aRenseigner.map((r) => r.data.nom).join(', ')}. Touchez le nom du revenu pour l'indiquer ; il sera alors compté dans le total.</div>}
      {rs.length === 0 && <Empty icon={<Wallet size={34} />} title="Aucun revenu" text="Ajoutez votre revenu et ses charges." />}
      {rs.map((r) => <RevenuCard key={r.id} r={r} mk={mk} onEdit={(c) => setEdit({ r, c })} />)}
      <button className="btn ghost full" onClick={() => setNewRev(true)}><Plus size={17} /> Ajouter un revenu</button>
      {edit && <ChargeSheet r={edit.r} c={edit.c} onClose={() => setEdit(null)} />}
      {newRev && <RevenuSheet onClose={() => setNewRev(false)} />}
    </>
  );
}

function RevenuCard({ r, mk, onEdit }) {
  const s = useStore();
  const [editRev, setEditRev] = useState(false);
  const d = r.data;
  const faits = (d.faits || {})[mk] || {};
  const charges = d.charges || [];
  const tot = charges.reduce((x, c) => x + num(c.montant), 0);
  const reste = num(d.montant) - tot;
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
        <div className="right"><b>{num(d.montant) ? money(d.montant) : <span className="neg">À renseigner</span>}</b><Pencil size={14} className="muted" /></div>
      </button>
      <div className="list" style={{ margin: '0 -14px' }}>
        {charges.map((c) => (
          <div className="task" key={c.id}>
            <button className={`check ${faits[c.id] ? 'on' : ''}`} onClick={() => toggle(c.id)} aria-label={faits[c.id] ? 'Décocher' : 'Cocher'}>{faits[c.id] && <Check size={16} strokeWidth={3} />}</button>
            <button className="grow item-main" style={{ textAlign: 'left' }} onClick={() => onEdit(c)}>
              <b className={faits[c.id] ? 'done-t' : ''}>{c.nom}</b>
              <small>{faits[c.id] ? `Fait le ${dateFr(faits[c.id])}` : 'À faire ce mois'}</small>
            </button>
            <b className={faits[c.id] ? 'muted' : ''}>{money(c.montant)}</b>
          </div>
        ))}
      </div>
      <button className="btn soft sm" onClick={() => onEdit(null)}><Plus size={15} /> Ajouter une charge</button>
      <div className="totals">
        <div className="kv"><span>Total des charges</span><b>{money(tot)}</b></div>
        <div className="kv big"><span>Reste</span><b className={reste < 0 ? 'neg' : 'pos'}>{reste >= 0 ? '+' : ''}{money(reste)}</b></div>
      </div>
      {reste < 0 && <div className="alert danger">Ce revenu est dans le rouge de {money(-reste)}.</div>}
      {editRev && <RevenuSheet rec={r} onClose={() => setEditRev(false)} />}
    </section>
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
                  <div className="grow item-main"><b>{d.data.personne}</b><small>{(d.data.remboursements || []).length} versement{(d.data.remboursements || []).length > 1 ? 's' : ''}{d.data.motif ? ` · ${d.data.motif}` : ''}</small></div>
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
  Object.values(d.mois || {}).forEach((x) => EP_PARTS.forEach((p) => { if (x[p.k]?.fait) { tot[p.k] += num(x[p.k].montant); detail[p.k].salaires += num(x[p.k].montant); } }));
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
      <section className="hero small">
        <p>Reste de nos deux salaires · {monthLabel(mk).split(' ')[0]}</p>
        <h2>{money(base)}</h2>
        <small>{rs.map((r) => `${r.data.titulaire === 'monsieur' ? 'Monsieur' : 'Moi'} ${money(num(r.data.montant) - (r.data.charges || []).reduce((x, c) => x + num(c.montant), 0))}`).join(' · ')} · loyer non compté</small>
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
            <small>{[env.detail[p.k].depart && `départ ${money(env.detail[p.k].depart)}`, env.detail[p.k].salaires && `salaires ${money(env.detail[p.k].salaires)}`, env.detail[p.k].loyer && `loyer ${money(env.detail[p.k].loyer)}`].filter(Boolean).join(' · ') || 'vide pour l’instant'}</small>
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
