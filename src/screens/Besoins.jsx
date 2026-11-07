import React, { useState } from 'react';
import { Check, Plus, Trash2, ShoppingCart } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num } from '../lib/format.js';
import { ScreenHead, Empty, Confirm } from '../components/ui.jsx';

export const POUR = [['maison', 'Maison'], ['monsieur', 'Monsieur'], ['moi', 'Moi']];

export default function Besoins() {
  const s = useStore();
  const [pour, setPour] = useState('maison');
  const [txt, setTxt] = useState('');
  const [prix, setPrix] = useState('');
  const [voirFaits, setVoirFaits] = useState(false);
  const [del, setDel] = useState(null);
  const all = s.list('besoin');
  const add = () => {
    if (!txt.trim()) return;
    s.save('besoin', { libelle: txt.trim(), pour, prix: num(prix) || null, fait: false }, { shared: true });
    setTxt(''); setPrix('');
  };
  const toggle = (b) => s.save('besoin', { ...b.data, fait: !b.data.fait }, { id: b.id });
  const aFaire = all.filter((b) => !b.data.fait);
  const budget = aFaire.reduce((x, b) => x + num(b.data.prix), 0);
  return (
    <div className="screen">
      <ScreenHead title="Besoins" sub="Ce qu'il faut acheter, pour la maison, pour Monsieur, pour moi" />
      <section className="card">
        <div className="chips">{POUR.map(([k, l]) => <button key={k} type="button" className={`chip ${pour === k ? 'on' : ''}`} onClick={() => setPour(k)}>{l}</button>)}</div>
        <input className="mini-in" style={{ width: '100%' }} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Ex. Nouveaux rideaux" />
        <div className="row gap">
          <input className="mini-in grow" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value.replace(/\D/g, ''))} placeholder="Prix (facultatif)" />
          <button className="btn primary" onClick={add}><Plus size={18} /> Ajouter</button>
        </div>
        <p className="muted small">{aFaire.length} besoin{aFaire.length > 1 ? 's' : ''} à acheter{budget ? ` · environ ${money(budget)}` : ''}</p>
      </section>
      {all.length === 0 && <Empty icon={<ShoppingCart size={34} />} title="Aucun besoin" text="Écrivez ce qu'il faut acheter et cochez quand c'est fait." />}
      {POUR.map(([k, l]) => {
        const list = all.filter((b) => (b.data.pour || 'maison') === k && (voirFaits || !b.data.fait))
          .sort((a, b) => (a.data.fait - b.data.fait) || (a.created_at || '').localeCompare(b.created_at || ''));
        const n = all.filter((b) => (b.data.pour || 'maison') === k && !b.data.fait).length;
        if (!list.length) return null;
        return (
          <React.Fragment key={k}>
            <h3 className="sec-t">{l} <small className="muted">· {n} à acheter</small></h3>
            <div className="card list">
              {list.map((b) => (
                <div className="task" key={b.id}>
                  <button className={`check ${b.data.fait ? 'on' : ''}`} onClick={() => toggle(b)} aria-label={b.data.fait ? 'Décocher' : 'Cocher'}>{b.data.fait && <Check size={16} strokeWidth={3} />}</button>
                  <button className="grow item-main" style={{ textAlign: 'left' }} onClick={() => toggle(b)}><b className={b.data.fait ? 'done-t' : ''}>{b.data.libelle}</b></button>
                  {num(b.data.prix) > 0 && <span className="muted small">{money(b.data.prix)}</span>}
                  {b.data.fait && <button className="icon-btn" onClick={() => setDel(b)} aria-label="Supprimer"><Trash2 size={16} /></button>}
                </div>
              ))}
            </div>
          </React.Fragment>
        );
      })}
      {all.some((b) => b.data.fait) && <button className="btn ghost full" onClick={() => setVoirFaits(!voirFaits)}>{voirFaits ? 'Masquer les achats faits' : `Voir les achats faits (${all.filter((b) => b.data.fait).length})`}</button>}
      {del && <Confirm text={`Retirer « ${del.data.libelle} » de la liste ?`} onNo={() => setDel(null)} onYes={() => { s.remove(del.id); setDel(null); }} />}
    </div>
  );
}
