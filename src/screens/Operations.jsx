import React, { useMemo, useState } from 'react';
import { Search, Paperclip, Trash2, ArrowLeftRight } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { flows, inScope, monthStats } from '../lib/compute.js';
import { monthKey, dateLong, norm, today, num } from '../lib/format.js';
import { Money, MonthNav, Segmented, Empty, CatBadge, SharedTag, Sheet, Field, MoneyInput, CategorySelect, WalletSelect, SpaceSelect, PhotoInput, Confirm, useToast, ScreenHead } from '../components/ui.jsx';

export default function Operations({ go, back, scope, month, setMonth, openForm }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState('tout');
  const st = monthStats(s, month, scope);
  const list = useMemo(() => {
    const nq = norm(q);
    return flows(s)
      .filter((f) => f.date && monthKey(f.date) === month && inScope(f.rec, scope))
      .filter((f) => !(f.kind === 'transfert' || f.kind === 'epargne') || f.id.endsWith(':o'))
      .filter((f) => type === 'tout' || (type === 'depense' ? f.kind === 'depense' : type === 'revenu' ? f.kind === 'revenu' || f.kind === 'loyer' : f.kind === 'transfert' || f.kind === 'epargne'))
      .filter((f) => !nq || norm(`${f.label} ${f.categorie} ${f.rec.data.description || ''} ${f.rec.data.note || ''}`).includes(nq))
      .sort((a, b) => (b.date + b.rec.created_at).localeCompare(a.date + a.rec.created_at));
  }, [s.version, q, type, month, scope]);
  const groups = [];
  for (const f of list) {
    const g = groups[groups.length - 1];
    if (g && g.date === f.date) g.items.push(f); else groups.push({ date: f.date, items: [f] });
  }
  const wname = (id) => s.getRec(id)?.data.nom || '';
  const open = (f) => {
    if (f.kind === 'loyer') return go('locataires');
    if (f.kind === 'epargne') return go('epargne');
    openForm(f.rec);
  };

  return (
    <div className="screen">
      <ScreenHead title="Opérations" onBack={back} />
      <MonthNav value={month} onChange={setMonth} />
      <div className="mini-stats">
        <div><small>Revenus</small><Money v={st.revenus} className="pos" /></div>
        <div><small>Dépenses</small><Money v={st.depenses} className="neg" /></div>
        <div><small>Solde</small><Money v={st.solde} sign /></div>
      </div>
      <div className="search"><Search size={18} /><input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Segmented value={type} onChange={setType} options={[['tout', 'Tout'], ['depense', 'Dépenses'], ['revenu', 'Revenus'], ['transfert', 'Transferts']]} />
      {groups.length === 0 ? (
        <Empty icon="🧾" title="Aucune opération" text="Appuyez sur + pour ajouter une dépense ou un revenu." />
      ) : groups.map((g) => (
        <div key={g.date} className="group">
          <h4 className="group-t">{g.date === today() ? "Aujourd'hui" : dateLong(g.date)}</h4>
          <div className="card list">
            {g.items.map((f) => (
              <button className="item" key={f.id} onClick={() => open(f)}>
                {f.kind === 'transfert' || f.kind === 'epargne' ? <span className="cat-badge" style={{ '--c': '#64748B' }}><ArrowLeftRight size={16} /></span> : <CatBadge name={f.categorie} />}
                <div className="grow item-main">
                  <b>{f.kind === 'transfert' ? `${wname(f.rec.data.de)} → ${wname(f.rec.data.vers)}` : f.label}</b>
                  <small>{f.kind === 'transfert' ? 'Transfert' : f.categorie}{f.wallet && f.kind !== 'transfert' ? ` · ${wname(f.wallet)}` : ''} <SharedTag rec={f.rec} />{f.rec.data.photo || f.rec.data._photo_pending ? <Paperclip size={12} /> : null}</small>
                </div>
                {f.kind === 'transfert' || f.kind === 'epargne' ? <Money v={-f.montant} className="muted" /> : <Money v={f.montant} sign />}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="fab" onClick={() => openForm(null)} aria-label="Ajouter une opération">+</button>
    </div>
  );
}

// ---------- Formulaire opération (dépense / revenu / transfert) ----------
export function OperationForm({ rec, onClose, initialType = 'depense' }) {
  const s = useStore();
  const toast = useToast();
  const [type, setType] = useState(rec ? rec.module : initialType);
  const [d, setD] = useState(() => ({ date: today(), ...(rec?.data || {}) }));
  const [shared, setShared] = useState(rec ? !!rec.household_id : false);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const save = (again) => {
    if (!num(d.montant)) return setErr('Indiquez un montant.');
    if (type === 'transfert') {
      if (!d.de || !d.vers || d.de === d.vers) return setErr('Choisissez deux porte-monnaie différents.');
    } else if (!d.categorie) return setErr(type === 'revenu' ? 'Choisissez une source.' : 'Choisissez une catégorie.');
    const data = { ...d, montant: num(d.montant) };
    if (rec && rec.module !== type) {
      s.remove(rec.id);
      s.save(type, data, { shared });
    } else s.save(type, data, { id: rec?.id, shared });
    toast(rec ? 'Modifié ✓' : 'Enregistré ✓');
    if (again) { setD({ date: d.date, portefeuille: d.portefeuille }); setErr(null); } else onClose();
  };

  return (
    <Sheet title={rec ? "Modifier l'opération" : 'Nouvelle opération'} onClose={onClose}
      footer={
        <div className="row gap">
          {rec ? <button className="btn ghost danger-t" onClick={() => setConfirm(true)} aria-label="Supprimer"><Trash2 size={18} /></button>
            : <button className="btn ghost" onClick={() => save(true)}>+ Autre</button>}
          <button className="btn primary grow" onClick={() => save(false)}>Enregistrer</button>
        </div>
      }>
      <Segmented value={type} onChange={(t) => { setType(t); up('categorie', undefined); }} options={[['depense', '− Dépense'], ['revenu', '+ Revenu'], ['transfert', '⇄ Transfert']]} />
      <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => up('montant', v)} autoFocus={!rec} /></Field>
      {type !== 'transfert' && <CategorySelect type={type} value={d.categorie} onChange={(v) => up('categorie', v)} />}
      <Field label="Date"><input type="date" value={d.date || ''} onChange={(e) => up('date', e.target.value)} /></Field>
      {type !== 'transfert' && <Field label="Description"><input value={d.description || ''} onChange={(e) => up('description', e.target.value)} placeholder={type === 'revenu' ? 'Ex. salaire octobre' : 'Ex. marché Mont-Bouët'} /></Field>}
      {type === 'transfert' ? (
        <>
          <WalletSelect label="De" value={d.de} onChange={(v) => up('de', v)} />
          <WalletSelect label="Vers" value={d.vers} onChange={(v) => up('vers', v)} />
        </>
      ) : <WalletSelect value={d.portefeuille} onChange={(v) => up('portefeuille', v)} allowEmpty />}
      <SpaceSelect value={shared} onChange={setShared} />
      {type === 'depense' && <PhotoInput value={d.photo} pending={d._photo_pending} onChange={(r) => {
        if (r.pending) up('_photo_pending', r.pending);
        if (r.remove) setD((x) => { const y = { ...x }; delete y._photo_pending; delete y.photo; return y; });
      }} />}
      <Field label="Note"><textarea rows={2} value={d.note || ''} onChange={(e) => up('note', e.target.value)} /></Field>
      {rec && rec.owner_id !== s.user.id && <p className="muted small">Ajouté par {s.nameOf(rec.owner_id)}</p>}
      {err && <div className="alert danger">{err}</div>}
      {confirm && <Confirm text="Supprimer cette opération ?" onNo={() => setConfirm(false)} onYes={() => { s.remove(rec.id); toast('Supprimé'); onClose(); }} />}
    </Sheet>
  );
}
