import React, { useState } from 'react';
import { Check, Plus, Trash2, Pencil, ListChecks, Wallet, ChevronRight } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, uid } from '../lib/format.js';
import { detteReste, categoriesMap } from '../lib/compute.js';
import { caisses } from '../lib/market.js';
import { ScreenHead, Fab, Sheet, Field, MoneyInput, Empty, Confirm, useToast, Progress, Segmented } from '../components/ui.jsx';

const TYPES = [['simple', 'À faire'], ['depense', 'Dépense'], ['dette', 'Rembourser une dette']];

export function affStats(a) {
  const lignes = a.data.lignes || [];
  const affecte = lignes.reduce((x, l) => x + num(l.montant), 0);
  const fait = lignes.filter((l) => l.fait).reduce((x, l) => x + num(l.montant), 0);
  const nbFait = lignes.filter((l) => l.fait).length;
  return { affecte, fait, aFaire: affecte - fait, libre: num(a.data.montant) - affecte, nb: lignes.length, nbFait, fini: lignes.length > 0 && nbFait === lignes.length };
}

// Coche / décoche une ligne et met à jour le reste de l'application
export function toggleLigne(s, a, ligneId) {
  const lignes = (a.data.lignes || []).map((l) => ({ ...l }));
  const l = lignes.find((x) => x.id === ligneId);
  if (!l) return;
  if (!l.fait) {
    l.fait = true;
    l.fait_le = today();
    if (l.type === 'depense' && l.enreg !== false) {
      l.lien = s.save('depense', { date: today(), montant: num(l.montant), categorie: l.categorie || 'Autres dépenses', description: `${l.libelle} · ${a.data.titre}` }, { shared: false }).id;
    }
    if (l.type === 'dette' && l.dette) {
      const d = s.getRec(l.dette);
      if (d) {
        const rid = uid();
        s.save('dette', { ...d.data, remboursements: [...(d.data.remboursements || []), { id: rid, date: today(), montant: num(l.montant), note: `Affectation : ${a.data.titre}` }] }, { id: d.id });
        l.lien = rid;
      }
    }
  } else {
    l.fait = false;
    l.fait_le = null;
    if (l.type === 'depense' && l.lien) s.remove(l.lien);
    if (l.type === 'dette' && l.dette && l.lien) {
      const d = s.getRec(l.dette);
      if (d) s.save('dette', { ...d.data, remboursements: (d.data.remboursements || []).filter((r) => r.id !== l.lien) }, { id: d.id });
    }
    l.lien = null;
  }
  s.save('affectation', { ...a.data, lignes }, { id: a.id });
}

export default function Affectation({ go, showMarket }) {
  const s = useStore();
  const [sheet, setSheet] = useState(null);
  const [tab, setTab] = useState('cours');
  const all = s.list('affectation').map((a) => ({ a, st: affStats(a) }));
  const cours = all.filter((x) => !x.st.fini).sort((x, y) => (y.a.data.date || '').localeCompare(x.a.data.date || ''));
  const finies = all.filter((x) => x.st.fini).sort((x, y) => (y.a.data.date || '').localeCompare(x.a.data.date || ''));
  const list = tab === 'cours' ? cours : finies;
  const aFaire = cours.reduce((x, c) => x + c.st.aFaire, 0);
  const libre = cours.reduce((x, c) => x + Math.max(0, c.st.libre), 0);
  const moi = showMarket ? caisses(s).moi.solde : 0;
  return (
    <div className="screen">
      <ScreenHead title="Affectation" sub="Décidez à quoi sert chaque argent, puis cochez" />
      <div className="kpis">
        <div className="kpi accent"><small>Reste à faire</small><b>{money(aFaire)}</b><span className="trend">{cours.length} affectation{cours.length > 1 ? 's' : ''} en cours</span></div>
        <div className="kpi"><small>Pas encore affecté</small><b>{money(libre)}</b><span className="trend">argent sans destination</span></div>
      </div>
      {moi > 0 && (
        <button className="card card-link" onClick={() => setSheet({ k: 'form', source: 'om_moi', montant: moi })}>
          <span className="ico blue"><Wallet size={19} /></span>
          <div className="grow"><b>Ma part OrlyMarket : {money(moi)}</b><p className="muted small">Votre 15 % est disponible. Touchez pour le répartir.</p></div>
          <ChevronRight size={18} />
        </button>
      )}
      <Segmented value={tab} onChange={setTab} options={[['cours', `En cours (${cours.length})`], ['finies', `Terminées (${finies.length})`]]} />
      {list.length === 0 ? (
        <Empty icon={<ListChecks size={34} />} title={tab === 'cours' ? 'Aucune affectation en cours' : 'Rien de terminé pour le moment'}
          text="Exemple : « Argent de Clémentine – 150 000 F » → rendre 50 000 F à Sandra, payer l'école 60 000 F, recharger le compteur 20 000 F… puis cochez au fur et à mesure." />
      ) : (
        <div className="stack">
          {list.map(({ a, st }) => (
            <button className="card" key={a.id} onClick={() => setSheet({ k: 'detail', id: a.id })}>
              <div className="card-h">
                <div><b>{a.data.titre}</b><p className="muted small">{dateFr(a.data.date)} · {a.data.source === 'om_moi' ? 'Ma part OrlyMarket' : (a.data.origine || 'Autre entrée')}</p></div>
                <b>{money(a.data.montant)}</b>
              </div>
              <Progress value={st.nb ? st.nbFait / st.nb : 0} color={st.fini ? 'var(--pos)' : 'var(--violet)'} />
              <div className="row between small"><span className="muted">{st.nbFait}/{st.nb} fait{st.nbFait > 1 ? 's' : ''}</span>
                <span>{st.aFaire > 0 ? <>Reste <b>{money(st.aFaire)}</b></> : <b className="pos">Tout est fait</b>}{st.libre > 0 ? <span className="muted"> · {money(st.libre)} libre</span> : null}{st.libre < 0 ? <span className="neg"> · dépassé de {money(-st.libre)}</span> : null}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <Fab onClick={() => setSheet({ k: 'form' })} label="Nouvelle affectation" icon={<Plus size={26} />} />
      {sheet?.k === 'form' && <AffForm rec={sheet.rec} source={sheet.source} montant={sheet.montant} showMarket={showMarket} onClose={() => setSheet(sheet.rec ? { k: 'detail', id: sheet.rec.id } : null)} onSaved={(r) => setSheet({ k: 'detail', id: r.id })} />}
      {sheet?.k === 'detail' && <AffDetail id={sheet.id} onEdit={(rec) => setSheet({ k: 'form', rec })} onClose={() => setSheet(null)} />}
    </div>
  );
}

function AffDetail({ id, onEdit, onClose }) {
  const s = useStore();
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState(false);
  const a = s.getRec(id);
  if (!a) return null;
  const st = affStats(a);
  const lignes = a.data.lignes || [];
  return (
    <Sheet title={a.data.titre} onClose={onClose}
      footer={<div className="row gap"><button className="btn ghost danger-t" onClick={() => setDel(true)} aria-label="Supprimer"><Trash2 size={18} /></button><button className="btn ghost grow" onClick={() => onEdit(a)}><Pencil size={16} /> Modifier</button><button className="btn primary grow" onClick={() => setAdd(true)}><Plus size={16} /> Ligne</button></div>}>
      <div className="hero small">
        <p>{a.data.source === 'om_moi' ? 'Ma part OrlyMarket' : (a.data.origine || 'Montant reçu')} · {dateFr(a.data.date)}</p>
        <h2>{money(a.data.montant)}</h2>
        <Progress value={st.nb ? st.nbFait / st.nb : 0} color="#fff" />
        <small>Fait : {money(st.fait)} · Reste à faire : {money(st.aFaire)}{st.libre ? ` · Non affecté : ${money(st.libre)}` : ''}</small>
      </div>
      {st.libre < 0 && <div className="alert warn">Les lignes dépassent le montant de {money(-st.libre)}.</div>}
      {lignes.length === 0 ? <p className="muted">Ajoutez ce que cet argent doit payer.</p> : (
        <div className="card list">
          {lignes.map((l) => {
            const dette = l.type === 'dette' && l.dette ? s.getRec(l.dette) : null;
            return (
              <button className="task" key={l.id} onClick={() => toggleLigne(s, a, l.id)}>
                <span className={`check ${l.fait ? 'on' : ''}`}>{l.fait && <Check size={16} strokeWidth={3} />}</span>
                <div className="grow item-main">
                  <b className={l.fait ? 'done-t' : ''}>{l.libelle}</b>
                  <small>{l.type === 'dette' ? `Dette · ${dette?.data.personne || '—'}${dette ? ` (reste ${money(detteReste(dette))})` : ''}` : l.type === 'depense' ? `Dépense · ${l.categorie || 'Autres'}` : 'À faire'}{l.fait && l.fait_le ? ` · fait le ${dateFr(l.fait_le)}` : ''}</small>
                </div>
                <b className={l.fait ? 'muted' : ''}>{money(l.montant)}</b>
              </button>
            );
          })}
        </div>
      )}
      <p className="muted small">Cocher une dépense l'ajoute à vos dépenses ; cocher un remboursement le déduit de la dette. Décocher annule.</p>
      {add && <LigneSheet onClose={() => setAdd(false)} onSave={(l) => { s.save('affectation', { ...a.data, lignes: [...lignes, l] }, { id: a.id }); setAdd(false); }} />}
      {del && <Confirm text="Supprimer cette affectation ? Les dépenses et remboursements déjà cochés restent enregistrés." onNo={() => setDel(false)} onYes={() => { s.remove(a.id); onClose(); }} />}
    </Sheet>
  );
}

function LigneEditor({ l, up, dettes, cats }) {
  return (
    <>
      <Field label="Libellé"><input value={l.libelle} onChange={(e) => up('libelle', e.target.value)} placeholder="Ex. Rendre l'argent de Sandra" /></Field>
      <Field label="Montant"><MoneyInput value={l.montant} onChange={(v) => up('montant', v)} /></Field>
      <Field label="Type"><div className="chips">{TYPES.map(([k, lb]) => <button type="button" key={k} className={`chip ${l.type === k ? 'on' : ''}`} onClick={() => up('type', k)}>{lb}</button>)}</div></Field>
      {l.type === 'depense' && (
        <Field label="Catégorie de dépense">
          <select value={l.categorie || ''} onChange={(e) => up('categorie', e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      )}
      {l.type === 'dette' && (
        dettes.length === 0 ? <p className="muted small">Aucune dette enregistrée. Ajoutez-la d'abord dans Foyer › Dettes, ou choisissez « À faire ».</p> : (
          <Field label="Quelle dette ?">
            <select value={l.dette || ''} onChange={(e) => up('dette', e.target.value)}>
              <option value="">Choisir…</option>
              {dettes.map((d) => <option key={d.id} value={d.id}>{d.data.personne} · reste {money(detteReste(d))}</option>)}
            </select>
          </Field>
        )
      )}
    </>
  );
}

function useLists() {
  const s = useStore();
  const dettes = s.list('dette').filter((d) => (d.data.type || 'dette') === 'dette' && detteReste(d) > 0);
  const cats = Object.values(categoriesMap(s)).filter((c) => c.type === 'depense').map((c) => c.nom);
  return { dettes, cats };
}

function LigneSheet({ onClose, onSave }) {
  const { dettes, cats } = useLists();
  const [l, setL] = useState({ id: uid(), libelle: '', montant: '', type: 'simple', categorie: cats[0] || 'Autres dépenses', fait: false });
  const up = (k, v) => setL((x) => ({ ...x, [k]: v, ...(k === 'dette' && v && !x.libelle ? { libelle: `Rembourser ${dettes.find((d) => d.id === v)?.data.personne || ''}` } : {}) }));
  return (
    <Sheet title="Nouvelle ligne" onClose={onClose} footer={<button className="btn primary full" onClick={() => l.libelle.trim() && num(l.montant) && onSave({ ...l, montant: num(l.montant) })}>Ajouter</button>}>
      <LigneEditor l={l} up={up} dettes={dettes} cats={cats} />
    </Sheet>
  );
}

function AffForm({ rec, source, montant, showMarket, onClose, onSaved }) {
  const s = useStore();
  const toast = useToast();
  const { dettes, cats } = useLists();
  const [d, setD] = useState(() => rec ? JSON.parse(JSON.stringify(rec.data)) : {
    titre: source === 'om_moi' ? 'Ma part OrlyMarket' : '', source: source || 'autre', origine: '', montant: montant ? Math.round(montant) : '', date: today(), revenu: false,
    lignes: [],
  });
  const [err, setErr] = useState(null);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const newLine = () => ({ id: uid(), libelle: '', montant: '', type: 'simple', categorie: cats[0] || 'Autres dépenses', fait: false });
  const upL = (i) => (k, v) => setD((x) => ({ ...x, lignes: x.lignes.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'dette' && v && !l.libelle ? { libelle: `Rembourser ${dettes.find((dd) => dd.id === v)?.data.personne || ''}` } : {}) } : l)) }));
  const affecte = (d.lignes || []).reduce((x, l) => x + num(l.montant), 0);
  const submit = () => {
    if (!d.titre.trim()) return setErr('Donnez un nom (ex. Argent de Clémentine).');
    if (!num(d.montant)) return setErr('Indiquez le montant.');
    const lignes = (d.lignes || []).filter((l) => (l.libelle || '').trim() && num(l.montant)).map((l) => ({ ...l, montant: num(l.montant) }));
    const data = { ...d, titre: d.titre.trim(), montant: num(d.montant), lignes };
    if (!rec && d.source === 'autre' && d.revenu) {
      data.revenu_lien = s.save('revenu', { date: d.date, montant: num(d.montant), categorie: 'Autres revenus', description: d.titre.trim() }, { shared: false }).id;
    }
    const saved = s.save('affectation', data, { id: rec?.id, shared: false });
    toast('Enregistré ✓');
    onSaved(saved);
  };
  return (
    <Sheet title={rec ? 'Modifier' : 'Nouvelle affectation'} onClose={onClose} footer={<button className="btn primary full" onClick={submit}>Enregistrer</button>}>
      {showMarket && !rec && (
        <Field label="D'où vient cet argent ?">
          <div className="chips">
            <button type="button" className={`chip ${d.source === 'om_moi' ? 'on' : ''}`} onClick={() => up('source', 'om_moi')}>Ma part OrlyMarket (15 %)</button>
            <button type="button" className={`chip ${d.source === 'autre' ? 'on' : ''}`} onClick={() => up('source', 'autre')}>Autre entrée</button>
          </div>
        </Field>
      )}
      <Field label="Nom"><input value={d.titre} onChange={(e) => up('titre', e.target.value)} placeholder="Ex. Argent de Clémentine" /></Field>
      {d.source === 'autre' && <Field label="Origine (facultatif)"><input value={d.origine || ''} onChange={(e) => up('origine', e.target.value)} placeholder="Salaire, cadeau, remboursement…" /></Field>}
      <div className="row gap">
        <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => up('montant', v)} /></Field>
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => up('date', e.target.value)} /></Field>
      </div>
      {d.source === 'om_moi' && <p className="muted small">Ce montant est retiré de votre part « Pour moi » d'OrlyMarket.</p>}
      {!rec && d.source === 'autre' && (
        <label className="toggle-row"><span>Ajouter aussi à mes revenus<small>À laisser désactivé si ce revenu est déjà enregistré dans Foyer.</small></span>
          <input type="checkbox" className="switch" checked={!!d.revenu} onChange={(e) => up('revenu', e.target.checked)} /></label>
      )}
      <h3 className="sec-t">À quoi sert cet argent ?</h3>
      {(d.lignes || []).map((l, i) => (
        <div className="line-edit" key={l.id}>
          <LigneEditor l={l} up={upL(i)} dettes={dettes} cats={cats} />
          <button className="btn ghost sm danger-t" onClick={() => setD((x) => ({ ...x, lignes: x.lignes.filter((_, j) => j !== i) }))}><Trash2 size={15} /> Retirer</button>
        </div>
      ))}
      <button className="btn soft" onClick={() => setD((x) => ({ ...x, lignes: [...(x.lignes || []), newLine()] }))}><Plus size={17} /> Ajouter une ligne</button>
      <div className="totals">
        <div className="kv"><span>Montant</span><b>{money(d.montant)}</b></div>
        <div className="kv"><span>Affecté</span><b>{money(affecte)}</b></div>
        <div className="kv big"><span>Reste à affecter</span><b className={num(d.montant) - affecte < 0 ? 'neg' : ''}>{money(num(d.montant) - affecte)}</b></div>
      </div>
      {err && <div className="alert danger">{err}</div>}
    </Sheet>
  );
}
