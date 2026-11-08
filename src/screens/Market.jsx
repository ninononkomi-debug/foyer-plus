import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Users, Wallet, Search, Send, Phone, MessageCircle, Settings2, Trash2, Pencil, Plus, Truck, Receipt, ChevronRight, X, Check, CheckCircle2 } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, monthLabel, uid, daysBetween } from '../lib/format.js';
import {
  PARTS, ARTICLE_ST, repartFacture, toggleRepart, empruntsOuverts, empruntStats, detteResteM, MODES, marketParam, saveMarketParam, factTotals, STATUT_LABEL, LIV_LABEL,
  nextNumero, clienteName, clienteStats, caisses, marketMonth, migrateOldSales,
} from '../lib/market.js';
import { invoiceCanvas, statementCanvas, shareCanvas } from '../lib/docImage.js';
import { ScreenHead, Fab, Sheet, Field, MoneyInput, Segmented, Empty, Confirm, useToast, MonthNav, Progress } from '../components/ui.jsx';

const STC = { paid: 'paid', part: 'part', unpaid: 'unpaid' };

export default function Market({ go, month, setMonth }) {
  const s = useStore();
  const toast = useToast();
  const [tab, setTab] = useState('factures');
  const [sheet, setSheet] = useState(null);
  const prm = marketParam(s);

  useEffect(() => {
    const n = migrateOldSales(s);
    if (n) toast(`${n} ancienne(s) vente(s) reprise(s) en factures ✓`);
  }, [s.lastSyncAt]);

  return (
    <div className="screen">
      <ScreenHead title="OrlyMarket" sub="Privé · visible par vous seule"
        right={<button className="icon-btn" onClick={() => setSheet({ k: 'boutique' })} aria-label="Informations de la boutique"><Settings2 size={21} /></button>} />
      <Segmented value={tab} onChange={setTab} options={[['factures', 'Factures'], ['clientes', 'Clientes'], ['caisses', 'Enveloppes']]} />
      {tab === 'factures' && <Factures month={month} setMonth={setMonth} open={setSheet} />}
      {tab === 'clientes' && <Clientes open={setSheet} />}
      {tab === 'caisses' && <Caisses open={setSheet} />}

      {tab !== 'caisses' && <Fab onClick={() => setSheet(tab === 'clientes' ? { k: 'clienteForm' } : { k: 'factForm' })} label={tab === 'clientes' ? 'Nouvelle cliente' : 'Nouvelle facture'} icon={<Plus size={26} />} />}

      {sheet?.k === 'factForm' && <FactureForm rec={sheet.rec} clienteId={sheet.cliente} onClose={() => setSheet(null)} onSaved={(f) => setSheet({ k: 'fact', id: f.id })} />}
      {sheet?.k === 'fact' && <FactureDetail id={sheet.id} open={setSheet} onClose={() => setSheet(null)} />}
      {sheet?.k === 'pay' && <PaiementSheet id={sheet.id} solde={sheet.solde} back={() => setSheet({ k: 'fact', id: sheet.id })} after={() => setSheet({ k: 'img', kind: 'facture', id: sheet.id, back: { k: 'fact', id: sheet.id }, apresPaiement: true })} />}
      {sheet?.k === 'clienteForm' && <ClienteForm rec={sheet.rec} onClose={() => setSheet(sheet.rec ? { k: 'cliente', id: sheet.rec.id } : null)} />}
      {sheet?.k === 'cliente' && <ClienteDetail id={sheet.id} open={setSheet} onClose={() => setSheet(null)} />}
      {sheet?.k === 'img' && <ImageSheet {...sheet} onClose={() => setSheet(sheet.back || null)} />}
      {sheet?.k === 'boutique' && <BoutiqueSheet onClose={() => setSheet(null)} />}
      {sheet?.k === 'part' && <PartSheet part={sheet.part} onClose={() => setSheet(null)} />}
      {sheet?.k === 'pct' && <PctSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

// ======================= FACTURES =======================
function Factures({ month, setMonth, open }) {
  const s = useStore();
  const [filtre, setFiltre] = useState('mois');
  const [q, setQ] = useState('');
  const all = s.list('facture').map((f) => ({ f, t: factTotals(f), nom: clienteName(s, f) }));
  let list = all;
  if (filtre === 'mois') list = list.filter((x) => (x.f.data.date || '').startsWith(month));
  if (filtre === 'reste') list = list.filter((x) => x.t.reste > 0);
  if (filtre === 'route') list = list.filter((x) => x.t.livraison !== 'livre');
  if (q) { const k = q.toLowerCase(); list = list.filter((x) => x.nom.toLowerCase().includes(k) || (x.f.data.numero || '').toLowerCase().includes(k) || (x.f.data.lignes || []).some((l) => (l.designation || '').toLowerCase().includes(k))); }
  list.sort((a, b) => (b.f.data.date || '').localeCompare(a.f.data.date || '') || (b.f.data.numero || '').localeCompare(a.f.data.numero || ''));
  const m = marketMonth(s, month);
  const resteTot = all.reduce((x, a) => x + a.t.reste, 0);
  return (
    <>
      {filtre === 'mois' && <MonthNav value={month} onChange={setMonth} />}
      <div className="kpis">
        <div className="kpi accent"><small>Ventes de {monthLabel(month).split(' ')[0]}</small><b>{money(m.ca)}</b><span className="trend">{m.nb} facture{m.nb > 1 ? 's' : ''}</span></div>
        <div className="kpi"><small>Bénéfice du mois</small><b className="pos">{money(m.benef)}</b><span className="trend">Encaissé : {money(m.encaisse)}</span></div>
        <div className="kpi"><small>Reste à encaisser</small><b className={resteTot ? 'neg' : ''}>{money(resteTot)}</b><span className="trend">toutes factures</span></div>
        <div className="kpi"><small>Articles pas encore livrés</small><b>{all.filter((x) => x.t.livraison !== 'livre').length}</b><span className="trend">facture(s)</span></div>
      </div>
      <div className="search"><Search size={18} /><input placeholder="Cliente, article ou n° de facture" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button onClick={() => setQ('')}><X size={16} /></button>}</div>
      <div className="section-chips">
        {[['mois', 'Ce mois'], ['reste', 'À encaisser'], ['route', 'Pas livrées'], ['tout', 'Toutes']].map(([k, l]) => (
          <button key={k} className={`chip ${filtre === k ? 'on' : ''}`} onClick={() => setFiltre(k)}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <Empty icon={<Receipt size={34} />} title="Aucune facture" text="Créez une facture : articles, prix fournisseur, prix de vente, acompte. Vous l'envoyez ensuite en image sur WhatsApp." /> : (
        <div className="card list">
          {list.map(({ f, t, nom }) => (
            <button className="item" key={f.id} onClick={() => open({ k: 'fact', id: f.id })}>
              <span className={`ico ${t.statut === 'paid' ? 'green' : t.statut === 'part' ? 'amber' : 'red'}`}><FileText size={19} /></span>
              <div className="grow item-main">
                <b>{nom}</b>
                <small>{f.data.numero} · {dateFr(f.data.date)} <span className={`st ${t.livraison}`}>{LIV_LABEL[t.livraison]}</span></small>
              </div>
              <div className="right"><b>{money(t.total)}</b>{t.reste > 0 ? <small className="neg">Reste {money(t.reste)}</small> : <small className="pos">Soldée</small>}</div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function FactureForm({ rec, clienteId, onClose, onSaved }) {
  const s = useStore();
  const toast = useToast();
  const isNew = !rec;
  const [d, setD] = useState(() => rec ? JSON.parse(JSON.stringify(rec.data)) : {
    numero: nextNumero(s), date: today(), cliente: clienteId || '', livraison: '', frais: '', note_cliente: '', note: '',
    lignes: [{ id: uid(), designation: '', qte: 1, pv: '', pa: '', statut: 'route' }], paiements: [],
  });
  const [newC, setNewC] = useState({ nom: '', telephone: '' });
  const [acompte, setAcompte] = useState({ montant: '', mode: 'especes' });
  const [fin, setFin] = useState(() => ({ mode: rec?.data.emprunt ? 'emprunt' : 'moi', emprunt: rec?.data.emprunt || '', personne: '', montant: '', date: today() }));
  const emprunts = empruntsOuverts(s);
  const [err, setErr] = useState(null);
  const clientes = s.list('cliente').sort((a, b) => a.data.nom.localeCompare(b.data.nom));
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const upL = (i, k, v) => setD((x) => ({ ...x, lignes: x.lignes.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const t = factTotals({ ...d, paiements: [...(d.paiements || []), ...(num(acompte.montant) ? [{ montant: acompte.montant }] : [])] });

  const submit = () => {
    const lignes = d.lignes.filter((l) => (l.designation || '').trim());
    if (!d.cliente && !newC.nom.trim()) return setErr('Choisissez une cliente ou saisissez son nom.');
    if (!lignes.length) return setErr('Ajoutez au moins un article.');
    if (lignes.some((l) => !num(l.pv))) return setErr('Indiquez le prix de vente de chaque article.');
    let cid = d.cliente;
    if (!cid) cid = s.save('cliente', { nom: newC.nom.trim(), telephone: newC.telephone.trim() }, { shared: false }).id;
    const paiements = [...(d.paiements || [])];
    if (num(acompte.montant) > 0) paiements.push({ id: uid(), date: d.date, montant: num(acompte.montant), mode: acompte.mode });
    const data = { ...d, cliente: cid, lignes: lignes.map((l) => ({ ...l, qte: num(l.qte) || 1, pv: num(l.pv), pa: num(l.pa) })), remise: num(d.remise), remise_type: d.remise_type === 'pct' ? 'pct' : 'montant', livraison: num(d.livraison), frais: num(d.frais), paiements };
    if (fin.mode === 'emprunt') {
      let eid = fin.emprunt;
      if (!eid) {
        if (!fin.personne.trim() || !num(fin.montant)) return setErr("Indiquez à qui vous avez emprunté et le montant à rendre.");
        eid = s.save('dette', { type: 'dette', personne: fin.personne.trim(), montant: num(fin.montant), date: fin.date, motif: 'Commande OrlyMarket', source: 'market', remboursements: [] }, { shared: false }).id;
      }
      data.emprunt = eid;
    } else {
      data.emprunt = null;
    }
    const saved = s.save('facture', data, { id: rec?.id, shared: false });
    toast(isNew ? 'Facture créée ✓' : 'Facture modifiée ✓');
    onSaved(saved);
  };

  return (
    <Sheet title={isNew ? 'Nouvelle facture' : `Modifier ${d.numero}`} onClose={onClose}
      footer={<button className="btn primary full" onClick={submit}>{isNew ? 'Créer la facture' : 'Enregistrer'}</button>}>
      <div className="row gap">
        <Field label="N° de facture"><input value={d.numero} onChange={(e) => up('numero', e.target.value)} /></Field>
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => up('date', e.target.value)} /></Field>
      </div>
      <Field label="Cliente">
        <select value={d.cliente} onChange={(e) => up('cliente', e.target.value)}>
          <option value="">+ Nouvelle cliente</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.data.nom}{c.data.telephone ? ` · ${c.data.telephone}` : ''}</option>)}
        </select>
      </Field>
      {!d.cliente && (
        <div className="row gap">
          <Field label="Nom de la cliente"><input value={newC.nom} onChange={(e) => setNewC({ ...newC, nom: e.target.value })} placeholder="Ex. Clémentine" /></Field>
          <Field label="Téléphone"><input inputMode="tel" value={newC.telephone} onChange={(e) => setNewC({ ...newC, telephone: e.target.value })} placeholder="07X XX XX XX" /></Field>
        </div>
      )}
      <h3 className="sec-t">Articles</h3>
      {d.lignes.map((l, i) => {
        const q = num(l.qte) || 1;
        return (
          <div className="line-edit" key={l.id}>
            <div className="row">
              <span className="line-n">{i + 1}</span>
              <input className="mini-in grow" placeholder="Article (ex. Robe fillette 4 ans)" value={l.designation} onChange={(e) => upL(i, 'designation', e.target.value)} />
              {d.lignes.length > 1 && <button className="icon-btn danger" onClick={() => setD((x) => ({ ...x, lignes: x.lignes.filter((_, j) => j !== i) }))} aria-label="Retirer l'article"><Trash2 size={17} /></button>}
            </div>
            <div className="g3">
              <label>Nombre de pièces<input className="mini-in" inputMode="numeric" value={l.qte} onChange={(e) => upL(i, 'qte', e.target.value.replace(/\D/g, ''))} /></label>
              <label>Prix fournisseur (1 pièce)<MiniMoney value={l.pa} onChange={(v) => upL(i, 'pa', v)} /></label>
              <label>Mon prix de vente (1 pièce)<MiniMoney value={l.pv} onChange={(v) => upL(i, 'pv', v)} /></label>
            </div>
            <div className="line-total">
              <span>{q} × {money(l.pv)}</span>
              <b>= {money(q * num(l.pv))}</b>
            </div>
            {num(l.pa) > 0 && num(l.pv) > 0 && <small className="muted">Achat {money(q * num(l.pa))} · bénéfice sur cet article <b className={num(l.pv) >= num(l.pa) ? 'pos' : 'neg'}>{money(q * (num(l.pv) - num(l.pa)))}</b></small>}
            <div className="chips">
              {ARTICLE_ST.map(([k, lb]) => <button type="button" key={k} className={`chip ${l.statut === k ? 'on' : ''}`} onClick={() => upL(i, 'statut', k)}>{lb}</button>)}
            </div>
          </div>
        );
      })}
      <button className="btn soft" onClick={() => setD((x) => ({ ...x, lignes: [...x.lignes, { id: uid(), designation: '', qte: 1, pv: '', pa: '', statut: 'route' }] }))}><Plus size={17} /> Ajouter un article</button>
      <Field label="Remise accordée à la cliente">
        <div className="row gap">
          <div className="chips" style={{ flexShrink: 0 }}>
            <button type="button" className={`chip ${d.remise_type !== 'pct' ? 'on' : ''}`} onClick={() => up('remise_type', 'montant')}>En F</button>
            <button type="button" className={`chip ${d.remise_type === 'pct' ? 'on' : ''}`} onClick={() => up('remise_type', 'pct')}>En %</button>
          </div>
          {d.remise_type === 'pct'
            ? <input className="grow" inputMode="numeric" placeholder="Ex. 10" value={d.remise || ''} onChange={(e) => up('remise', Math.min(100, Number(e.target.value.replace(/\D/g, '') || 0)) || '')} />
            : <div className="grow"><MoneyInput value={d.remise || ''} onChange={(v) => up('remise', v)} /></div>}
        </div>
      </Field>
      <div className="row gap">
        <Field label="Livraison facturée" help="Payée par la cliente"><MoneyInput value={d.livraison} onChange={(v) => up('livraison', v)} /></Field>
        <Field label="Mes frais" help="Transport, colis… (non affichés)"><MoneyInput value={d.frais} onChange={(v) => up('frais', v)} /></Field>
      </div>
      <h3 className="sec-t">Marchandise payée avec</h3>
      <div className="chips">
        <button type="button" className={`chip ${fin.mode === 'moi' ? 'on' : ''}`} onClick={() => setFin({ ...fin, mode: 'moi' })}>Mon argent</button>
        <button type="button" className={`chip ${fin.mode === 'emprunt' ? 'on' : ''}`} onClick={() => setFin({ ...fin, mode: 'emprunt' })}>Un emprunt</button>
      </div>
      {fin.mode === 'emprunt' && (
        <div className="line-edit">
          <Field label="Quel emprunt ?" help="Un même emprunt peut servir à plusieurs factures.">
            <select value={fin.emprunt} onChange={(e) => setFin({ ...fin, emprunt: e.target.value })}>
              <option value="">+ Nouvel emprunt</option>
              {emprunts.map((e) => <option key={e.id} value={e.id}>{e.data.personne} · {dateFr(e.data.date)} · reste {money(detteResteM(e))}</option>)}
            </select>
          </Field>
          {!fin.emprunt && (
            <>
              <Field label="Emprunté à"><input value={fin.personne} onChange={(e) => setFin({ ...fin, personne: e.target.value })} placeholder="Ex. Sandra" /></Field>
              <Field label="Montant à rendre" help={`Prix fournisseur de cette facture : ${money(t.achat)}. Si l'emprunt couvre plusieurs factures, mettez le total à rendre.`}><MoneyInput value={fin.montant} onChange={(v) => setFin({ ...fin, montant: v })} /></Field>
              <Field label="Date de l'emprunt"><input type="date" value={fin.date} onChange={(e) => setFin({ ...fin, date: e.target.value })} /></Field>
            </>
          )}
          <p className="muted small">L'emprunt apparaît dans Foyer › Dettes › « Je dois ».</p>
        </div>
      )}
      {isNew && (
        <>
          <Field label="Acompte reçu aujourd'hui"><MoneyInput value={acompte.montant} onChange={(v) => setAcompte({ ...acompte, montant: v })} /></Field>
          {num(acompte.montant) > 0 && <div className="chips">{MODES.map(([k, l]) => <button type="button" key={k} className={`chip ${acompte.mode === k ? 'on' : ''}`} onClick={() => setAcompte({ ...acompte, mode: k })}>{l}</button>)}</div>}
        </>
      )}
      <div className="totals">
        <div className="kv"><span>Montant des articles ({t.nb} pièce{t.nb > 1 ? 's' : ''})</span><b>{money(t.sousTotal)}</b></div>
        {t.remise > 0 && <div className="kv"><span>Remise{d.remise_type === 'pct' ? ` (${num(d.remise)} %)` : ''}</span><b className="neg">- {money(t.remise)}</b></div>}
        {num(d.livraison) > 0 && <div className="kv"><span>Livraison</span><b>{money(d.livraison)}</b></div>}
        <div className="kv"><span>Total facture</span><b>{money(t.total)}</b></div>
        <div className="kv"><span>Coût fournisseur + frais</span><b>{money(t.cout)}</b></div>
        <div className="kv"><span>Mon bénéfice</span><b className={t.benef >= 0 ? 'pos' : 'neg'}>{money(t.benef)}</b></div>
        <div className="kv big"><span>Reste à payer</span><b>{money(t.reste)}</b></div>
      </div>
      <Field label="Message sur la facture (facultatif)"><input value={d.note_cliente || ''} onChange={(e) => up('note_cliente', e.target.value)} placeholder="Ex. Livraison prévue samedi" /></Field>
      <Field label="Note pour moi (non affichée)"><textarea rows={2} value={d.note || ''} onChange={(e) => up('note', e.target.value)} /></Field>
      {err && <div className="alert danger">{err}</div>}
    </Sheet>
  );
}

function MiniMoney({ value, onChange }) {
  const fmt = (v) => (v === '' || v === undefined || v === null ? '' : new Intl.NumberFormat('fr-FR').format(num(v)).replace(/ | /g, ' '));
  return <input className="mini-in" inputMode="numeric" placeholder="0" value={fmt(value)} onChange={(e) => { const r = e.target.value.replace(/[^\d]/g, ''); onChange(r === '' ? '' : Number(r)); }} />;
}

function FactureDetail({ id, open, onClose }) {
  const s = useStore();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const [delPay, setDelPay] = useState(null);
  const f = s.getRec(id);
  if (!f) return null;
  const d = f.data;
  const t = factTotals(f);
  const c = d.cliente ? s.getRec(d.cliente) : null;
  const cycle = (i) => {
    const order = ['route', 'dispo', 'livre'];
    const lignes = d.lignes.map((l, j) => (j === i ? { ...l, statut: order[(order.indexOf(l.statut || 'route') + 1) % 3] } : l));
    s.save('facture', { ...d, lignes }, { id: f.id });
  };
  const allDelivered = () => s.save('facture', { ...d, lignes: d.lignes.map((l) => ({ ...l, statut: 'livre' })) }, { id: f.id });
  return (
    <Sheet title={`Facture ${d.numero}`} onClose={onClose}
      footer={
        <div className="stack">
          <button className="btn primary full wa" onClick={() => open({ k: 'img', kind: 'facture', id: f.id, back: { k: 'fact', id: f.id } })}><FileText size={18} /> Voir la facture et l'envoyer</button>
          {t.reste > 0 && (
            <div className="row gap">
              <button className="btn soft grow" onClick={() => open({ k: 'pay', id: f.id })}>+ Avance reçue</button>
              <button className="btn soft grow" onClick={() => open({ k: 'pay', id: f.id, solde: true })}><CheckCircle2 size={17} /> Soldée</button>
            </div>
          )}
        </div>
      }>
      <div className="row between">
        <div><b style={{ fontSize: 18 }}>{c?.data.nom || 'Cliente'}</b><p className="muted small">{dateFr(d.date)}{c?.data.telephone ? ` · ${c.data.telephone}` : ''}</p></div>
        <span className={`st ${STC[t.statut]}`}>{STATUT_LABEL[t.statut]}</span>
      </div>
      <h3 className="sec-t">Articles <small className="muted">(touchez l'état pour le changer)</small></h3>
      <div className="card list">
        {d.lignes.map((l, i) => (
          <div className="item" key={l.id || i}>
            <div className="grow item-main"><b className="wrap">{l.designation}</b><small>{num(l.qte) || 1} pièce{(num(l.qte) || 1) > 1 ? 's' : ''} × {money(l.pv)} = <b>{money((num(l.qte) || 1) * num(l.pv))}</b> · achat {money(l.pa)}/pièce</small></div>
            <button className={`st ${l.statut || 'route'}`} onClick={() => cycle(i)}>{l.statut === 'livre' ? 'Livré' : LIV_LABEL[l.statut || 'route']}</button>
          </div>
        ))}
      </div>
      {t.livraison !== 'livre' && <button className="btn ghost sm" onClick={allDelivered}><Truck size={16} /> Tout est livré</button>}
      <div className="totals">
        <div className="kv"><span>Montant des articles</span><b>{money(t.sousTotal)}</b></div>
        {t.remise > 0 && <div className="kv"><span>Remise{d.remise_type === 'pct' ? ` (${num(d.remise)} %)` : ''}</span><b className="neg">- {money(t.remise)}</b></div>}
        {num(d.livraison) > 0 && <div className="kv"><span>Livraison</span><b>{money(d.livraison)}</b></div>}
        <div className="kv"><span>Total</span><b>{money(t.total)}</b></div>
        <div className="kv"><span>Déjà payé</span><b className="pos">{money(t.paye)}</b></div>
        <div className="kv big"><span>Reste à payer</span><b>{money(t.reste)}</b></div>
        <div className="kv"><span>Mon bénéfice</span><b className={t.benef >= 0 ? 'pos' : 'neg'}>{money(t.benef)}</b></div>
      </div>
      <EmpruntCard f={f} t={t} />
      <h3 className="sec-t">Répartition du bénéfice ({money(Math.max(0, t.benef))})</h3>
      <div className="card list">
        {repartFacture(s, f).map((p) => (
          <button className="task" key={p.k} onClick={() => toggleRepart(s, f, p.k)}>
            <span className={`check ${p.fait ? 'on' : ''}`}>{p.fait && <Check size={16} strokeWidth={3} />}</span>
            <div className="grow item-main"><b className={p.fait ? 'done-t' : ''}>{p.label} · {p.pct} %</b><small>{p.fait ? `Mis de côté le ${dateFr(p.date)}` : 'À mettre de côté'}</small></div>
            <b style={{ color: p.color }}>{money(p.montant)}</b>
          </button>
        ))}
      </div>
      {t.reste > 0 && <p className="muted small">Cochez quand vous avez réellement mis l'argent de côté. Le montant va dans l'enveloppe correspondante.</p>}
      <h3 className="sec-t">Versements</h3>
      {(d.paiements || []).length === 0 ? <p className="muted small">Aucun versement pour l'instant.</p> : (
        <div className="card list">
          {d.paiements.map((p) => (
            <div className="item" key={p.id}>
              <div className="grow item-main"><b>{money(p.montant)}</b><small>{dateFr(p.date)} · {(MODES.find((m) => m[0] === p.mode) || MODES[0])[1]}</small></div>
              <button className="icon-btn" onClick={() => setDelPay(p)} aria-label="Supprimer ce versement"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {d.note && <p className="muted small">Note : {d.note}</p>}
      <div className="row gap">
        <button className="btn ghost grow" onClick={() => open({ k: 'factForm', rec: f })}><Pencil size={16} /> Modifier</button>
        <button className="btn ghost danger-t" onClick={() => setDel(true)} aria-label="Supprimer la facture"><Trash2 size={17} /></button>
      </div>
      {del && <Confirm text={`Supprimer la facture ${d.numero} ?`} onNo={() => setDel(false)} onYes={() => { s.remove(f.id); toast('Facture supprimée'); onClose(); }} />}
      {delPay && <Confirm text={`Supprimer le versement de ${money(delPay.montant)} ?`} onNo={() => setDelPay(null)} onYes={() => { s.save('facture', { ...d, paiements: d.paiements.filter((p) => p.id !== delPay.id) }, { id: f.id }); setDelPay(null); }} />}
    </Sheet>
  );
}

function EmpruntCard({ f, t }) {
  const s = useStore();
  const e = f.data.emprunt ? s.getRec(f.data.emprunt) : null;
  if (!e) return <p className="muted small">Marchandise payée avec mon argent · prix fournisseur {money(t.achat)}.</p>;
  const st = empruntStats(s, e);
  return (
    <section className="card">
      <h3 className="card-t">Emprunt à {e.data.personne}</h3>
      <div className="kv"><span>Prix fournisseur de cette facture</span><b>{money(t.achat)}</b></div>
      <div className="kv"><span>Mon bénéfice sur cette facture</span><b className="pos">{money(t.benef)}</b></div>
      <div className="kv"><span>Emprunt total ({st.factures.length} facture{st.factures.length > 1 ? 's' : ''})</span><b>{money(e.data.montant)}</b></div>
      <div className="kv"><span>Déjà rendu</span><b className="pos">{money(st.rendu)}</b></div>
      <div className="kv big"><span>Reste à rendre</span><b className={st.reste ? 'neg' : 'pos'}>{st.reste ? money(st.reste) : 'Tout rendu ✓'}</b></div>
      {st.peutRendre > 0 && <div className="alert info">Les clientes ont déjà payé de quoi rendre {money(st.peutRendre)} à {e.data.personne}. Enregistrez le remboursement dans Foyer › Dettes.</div>}
    </section>
  );
}

function PaiementSheet({ id, back, after, solde }) {
  const s = useStore();
  const toast = useToast();
  const f = s.getRec(id);
  const t = f ? factTotals(f) : { reste: 0 };
  const [mode, setMode] = useState(solde ? 'tout' : 'avance');
  const [p, setP] = useState({ montant: solde ? t.reste : '', date: today(), mode: 'especes' });
  if (!f) return null;
  const montant = mode === 'tout' ? t.reste : num(p.montant);
  const save = () => {
    if (!montant) return toast("Indiquez le montant de l'avance", 'err');
    s.save('facture', { ...f.data, paiements: [...(f.data.paiements || []), { id: uid(), date: p.date, mode: p.mode, montant }] }, { id: f.id });
    toast(montant >= t.reste ? 'Facture soldée ✓' : `Avance de ${money(montant)} enregistrée ✓`);
    after();
  };
  return (
    <Sheet title={`Paiement · ${f.data.numero}`} onClose={back}
      footer={<button className="btn primary full" onClick={save}>{mode === 'tout' ? 'Marquer la facture soldée' : "Enregistrer l'avance"}</button>}>
      <div className="totals">
        <div className="kv"><span>Total de la facture</span><b>{money(t.total)}</b></div>
        <div className="kv"><span>Déjà versé</span><b className="pos">{money(t.paye)}</b></div>
        <div className="kv big"><span>Reste à payer</span><b>{money(t.reste)}</b></div>
      </div>
      <Segmented value={mode} onChange={setMode} options={[['avance', 'Une avance'], ['tout', 'Tout payé (soldée)']]} />
      {mode === 'avance'
        ? <Field label="Montant de l'avance"><MoneyInput value={p.montant} onChange={(v) => setP({ ...p, montant: v })} autoFocus /></Field>
        : <p className="muted">La cliente règle les <b>{money(t.reste)}</b> restants : la facture sera soldée.</p>}
      {mode === 'avance' && num(p.montant) > 0 && <p className="muted small">Après cette avance, il restera <b>{money(Math.max(0, t.reste - num(p.montant)))}</b>.</p>}
      <Field label="Date"><input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
      <Field label="Mode de paiement"><div className="chips">{MODES.map(([k, l]) => <button type="button" key={k} className={`chip ${p.mode === k ? 'on' : ''}`} onClick={() => setP({ ...p, mode: k })}>{l}</button>)}</div></Field>
      <p className="muted small">Ensuite, la facture à jour s'affiche pour que vous l'envoyiez à la cliente.</p>
    </Sheet>
  );
}

// ======================= IMAGE =======================
function ImageSheet({ kind, id, ids, cliente, onClose, apresPaiement }) {
  const s = useStore();
  const toast = useToast();
  const [url, setUrl] = useState(null);
  const [canvas, setCanvas] = useState(null);
  const [busy, setBusy] = useState(false);
  const prm = marketParam(s);
  const c = cliente ? s.getRec(cliente) : null;
  const f = id ? s.getRec(id) : null;
  const cl = (f && f.data.cliente ? s.getRec(f.data.cliente) : c)?.data || {};
  const factures = (ids || []).map((x) => s.getRec(x)).filter(Boolean);
  useEffect(() => {
    let alive = true;
    const p = kind === 'facture'
      ? invoiceCanvas({ facture: f, cliente: cl, boutique: prm.boutique })
      : statementCanvas({ factures, cliente: cl, boutique: prm.boutique });
    p.then((cv) => { if (!alive) return; setCanvas(cv); setUrl(cv.toDataURL('image/png')); }).catch((e) => toast(String(e.message || e), 'err'));
    return () => { alive = false; };
  }, []);
  const name = kind === 'facture' ? `Facture_${f?.data.numero}.png` : `Releve_paiements_${(cl.nom || 'cliente').replace(/\s+/g, '_')}.png`;
  const text = kind === 'facture' ? `Bonjour ${cl.nom || ''}, voici votre facture ${f?.data.numero}. Merci pour votre confiance ! OrlyMarket` : `Bonjour ${cl.nom || ''}, voici le relevé de vos paiements. Merci ! OrlyMarket`;
  const send = async () => {
    setBusy(true);
    try { await shareCanvas(canvas, name, text); } catch (e) { if (!/cancel/i.test(String(e?.message))) toast("L'envoi n'a pas abouti", 'err'); } finally { setBusy(false); }
  };
  return (
    <Sheet title={kind === 'facture' ? 'Aperçu de la facture' : 'Relevé des paiements'} onClose={onClose}
      footer={<button className="btn primary full wa" disabled={!canvas || busy} onClick={send}><Send size={18} /> {busy ? 'Ouverture…' : 'C’est bon, envoyer sur WhatsApp'}</button>}>
      {apresPaiement && <div className="alert info">Paiement enregistré. Voici la facture à jour : envoyez-la à la cliente.</div>}
      {kind !== 'facture' && <p className="muted small">Le relevé récapitule les factures de la cliente, ce qu'elle a déjà versé et ce qui lui reste à payer.</p>}
      {!prm.boutique.whatsapp && <div className="alert warn">Ajoutez votre numéro WhatsApp et vos numéros Airtel / Moov dans les informations de la boutique (roue en haut d'OrlyMarket).</div>}
      {url ? <img className="preview-img" src={url} alt="Aperçu" /> : <p className="muted center">Préparation de l'image…</p>}
      <p className="muted small center">Vérifiez la facture ci-dessus. Pour corriger, fermez cet aperçu et touchez « Modifier ». Sinon, envoyez : choisissez WhatsApp puis la cliente.</p>
    </Sheet>
  );
}

// ======================= CLIENTES =======================
function Clientes({ open }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [tri, setTri] = useState('reste');
  let list = s.list('cliente').map((c) => ({ c, st: clienteStats(s, c.id) }));
  if (q) { const k = q.toLowerCase(); list = list.filter((x) => x.c.data.nom.toLowerCase().includes(k) || (x.c.data.telephone || '').includes(k)); }
  list.sort((a, b) => (tri === 'reste' ? b.st.reste - a.st.reste : tri === 'nom' ? a.c.data.nom.localeCompare(b.c.data.nom) : b.st.total - a.st.total));
  const totDu = list.reduce((x, a) => x + a.st.reste, 0);
  const nbDu = list.filter((x) => x.st.reste > 0).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi accent"><small>Total dû par les clientes</small><b>{money(totDu)}</b><span className="trend">{nbDu} cliente{nbDu > 1 ? 's' : ''} avec un reste</span></div>
        <div className="kpi"><small>Clientes</small><b>{s.list('cliente').length}</b><span className="trend">dans votre carnet</span></div>
      </div>
      <div className="search"><Search size={18} /><input placeholder="Rechercher une cliente" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="section-chips">
        {[['reste', 'Doit le plus'], ['total', 'Meilleures clientes'], ['nom', 'A → Z']].map(([k, l]) => <button key={k} className={`chip ${tri === k ? 'on' : ''}`} onClick={() => setTri(k)}>{l}</button>)}
      </div>
      {list.length === 0 ? <Empty icon={<Users size={34} />} title="Aucune cliente" text="Les clientes sont ajoutées automatiquement quand vous créez une facture." /> : (
        <div className="card list">
          {list.map(({ c, st }) => {
            const age = st.oldestUnpaid ? daysBetween(st.oldestUnpaid, today()) : 0;
            return (
              <button className="item" key={c.id} onClick={() => open({ k: 'cliente', id: c.id })}>
                <span className="avatar sm">{c.data.nom[0]?.toUpperCase()}</span>
                <div className="grow item-main"><b>{c.data.nom}</b><small>{st.nb} facture{st.nb > 1 ? 's' : ''}{st.reste > 0 && age > 14 ? <span className="st late">depuis {age} j</span> : null}</small></div>
                <div className="right">{st.reste > 0 ? <b className="neg">{money(st.reste)}</b> : <b className="pos">À jour</b>}<small>sur {money(st.total)}</small></div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ClienteForm({ rec, onClose }) {
  const s = useStore();
  const toast = useToast();
  const [d, setD] = useState(rec?.data || { nom: '', telephone: '', quartier: '', note: '' });
  const [del, setDel] = useState(false);
  const save = () => {
    if (!d.nom.trim()) return;
    s.save('cliente', { ...d, nom: d.nom.trim() }, { id: rec?.id, shared: false });
    toast('Cliente enregistrée ✓');
    onClose();
  };
  return (
    <Sheet title={rec ? 'Modifier la cliente' : 'Nouvelle cliente'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}><Trash2 size={18} /></button>}<button className="btn primary grow" onClick={save}>Enregistrer</button></div>}>
      <Field label="Nom"><input value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} autoFocus /></Field>
      <Field label="Téléphone / WhatsApp"><input inputMode="tel" value={d.telephone || ''} onChange={(e) => setD({ ...d, telephone: e.target.value })} placeholder="07X XX XX XX" /></Field>
      <Field label="Quartier"><input value={d.quartier || ''} onChange={(e) => setD({ ...d, quartier: e.target.value })} /></Field>
      <Field label="Note (tailles, préférences…)"><textarea rows={2} value={d.note || ''} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
      {del && <Confirm text="Supprimer cette cliente ? Ses factures restent enregistrées." onNo={() => setDel(false)} onYes={() => { s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

const waNumber = (tel) => {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('241')) d = `241${d.replace(/^0/, '')}`;
  return d;
};

function ClienteDetail({ id, open, onClose }) {
  const s = useStore();
  const c = s.getRec(id);
  if (!c) return null;
  const st = clienteStats(s, id);
  const unpaid = st.factures.filter((f) => factTotals(f).reste > 0);
  const pointIds = (unpaid.length ? unpaid : st.factures).map((f) => f.id);
  const msg = `Bonjour ${c.data.nom}, petit rappel de OrlyMarket : il vous reste ${money(st.reste)} à régler. Merci !`;
  return (
    <Sheet title={c.data.nom} onClose={onClose}
      footer={
        <div className="stack">
          <button className="btn primary full wa" disabled={!st.nb} onClick={() => open({ k: 'img', kind: 'point', ids: pointIds, cliente: id, back: { k: 'cliente', id } })}><Send size={18} /> Envoyer le relevé des paiements</button>
          <button className="btn soft full" onClick={() => open({ k: 'factForm', cliente: id })}><Plus size={17} /> Nouvelle facture pour {c.data.nom}</button>
        </div>
      }>
      <div className="kpis">
        <div className="kpi"><small>Total acheté</small><b>{money(st.total)}</b></div>
        <div className="kpi"><small>Reste à payer</small><b className={st.reste ? 'neg' : 'pos'}>{money(st.reste)}</b></div>
      </div>
      <div className="row gap">
        {c.data.telephone && <a className="btn ghost grow" href={`tel:${c.data.telephone}`}><Phone size={16} /> Appeler</a>}
        {c.data.telephone && st.reste > 0 && <a className="btn ghost grow" href={`https://wa.me/${waNumber(c.data.telephone)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Relancer</a>}
        <button className="btn ghost" onClick={() => open({ k: 'clienteForm', rec: c })} aria-label="Modifier la fiche"><Pencil size={16} /></button>
      </div>
      {(c.data.quartier || c.data.note) && <p className="muted small">{[c.data.quartier, c.data.note].filter(Boolean).join(' · ')}</p>}
      <h3 className="sec-t">Factures</h3>
      {st.factures.length === 0 ? <p className="muted small">Aucune facture.</p> : (
        <div className="card list">
          {st.factures.sort((a, b) => b.data.date.localeCompare(a.data.date)).map((f) => {
            const t = factTotals(f);
            return (
              <button className="item" key={f.id} onClick={() => open({ k: 'fact', id: f.id })}>
                <div className="grow item-main"><b>{f.data.numero}</b><small>{dateFr(f.data.date)} · {(f.data.lignes || []).map((l) => l.designation).join(', ')}</small></div>
                <div className="right"><b>{money(t.total)}</b>{t.reste ? <small className="neg">Reste {money(t.reste)}</small> : <small className="pos">Soldée</small>}</div>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

// ======================= ENVELOPPES =======================
function Caisses({ open }) {
  const s = useStore();
  const prm = marketParam(s);
  const cs = caisses(s);
  const [filtre, setFiltre] = useState('afaire');
  const fs = s.list('facture').filter((f) => factTotals(f).benef > 0)
    .map((f) => ({ f, parts: repartFacture(s, f, prm.parts) }))
    .filter((x) => filtre === 'tout' || x.parts.some((p) => !p.fait))
    .sort((a, b) => (b.f.data.date || '').localeCompare(a.f.data.date || ''));
  const aFaire = PARTS.reduce((x, p) => x + cs[p.k].aFaire, 0);
  return (
    <>
      <EmpruntsResume />
      <p className="muted small">Chaque facture a son bénéfice réparti ({PARTS.map((p) => `${prm.parts[p.k]} %`).join(' / ')}). Quand vous cochez une part, son montant entre dans l'enveloppe : vous devez retrouver ce même argent mis de côté.</p>
      <div className="caisses">
        {PARTS.map((p) => (
          <button className="caisse" key={p.k} style={{ '--c': p.color }} onClick={() => open({ k: 'part', part: p.k })}>
            <span className="pc">{prm.parts[p.k]} %</span>
            <small>Enveloppe {p.short}</small>
            <b className={cs[p.k].solde < 0 ? 'neg' : ''}>{money(cs[p.k].solde)}</b>
            <small>{cs[p.k].out ? `mis ${money(cs[p.k].in)} · utilisé ${money(cs[p.k].out)}` : `à mettre : ${money(cs[p.k].aFaire)}`}</small>
          </button>
        ))}
      </div>
      {aFaire > 0 && <div className="alert warn">Encore {money(aFaire)} à mettre de côté dans les enveloppes.</div>}
      <div className="section-chips">
        {[['afaire', 'À répartir'], ['tout', 'Toutes les factures']].map(([k, l]) => <button key={k} className={`chip ${filtre === k ? 'on' : ''}`} onClick={() => setFiltre(k)}>{l}</button>)}
      </div>
      {fs.length === 0 ? <Empty icon={<Wallet size={34} />} title="Tout est réparti" text="Les bénéfices de vos factures sont tous dans les enveloppes." /> : fs.map(({ f, parts }) => {
        const t = factTotals(f);
        return (
          <section className="card" key={f.id}>
            <button className="card-h" style={{ width: '100%', textAlign: 'left' }} onClick={() => open({ k: 'fact', id: f.id })}>
              <div><b>{clienteName(s, f)}</b><p className="muted small">{f.data.numero} · {dateFr(f.data.date)} · {STATUT_LABEL[t.statut]}</p></div>
              <div className="right"><small className="muted">Bénéfice</small><b className="pos">{money(t.benef)}</b></div>
            </button>
            <div className="list" style={{ margin: '0 -14px' }}>
              {parts.map((p) => (
                <button className="task" key={p.k} onClick={() => toggleRepart(s, f, p.k)}>
                  <span className={`check ${p.fait ? 'on' : ''}`}>{p.fait && <Check size={16} strokeWidth={3} />}</span>
                  <div className="grow item-main"><b className={p.fait ? 'done-t' : ''}>{p.label}</b><small>{p.pct} %{p.fait ? ` · fait le ${dateFr(p.date)}` : ''}</small></div>
                  <b style={{ color: p.color }}>{money(p.montant)}</b>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button className="btn ghost full" onClick={() => open({ k: 'pct' })}>Modifier les pourcentages</button>
    </>
  );
}

function EmpruntsResume() {
  const s = useStore();
  const list = empruntsOuverts(s).map((e) => ({ e, st: empruntStats(s, e) })).filter((x) => x.st.reste > 0 && (x.e.data.source === 'market' || x.st.factures.length));
  if (!list.length) return null;
  return (
    <section className="card">
      <h3 className="card-t">Emprunts à rendre</h3>
      {list.map(({ e, st }) => (
        <div className="kv" key={e.id}><span>{e.data.personne} · {st.factures.length} facture{st.factures.length > 1 ? 's' : ''}{st.peutRendre ? ` · rendable ${money(st.peutRendre)}` : ''}</span><b className="neg">{money(st.reste)}</b></div>
      ))}
      <p className="muted small">Le prix fournisseur se rend à la personne ; vous gardez le bénéfice. Remboursements à noter dans Foyer › Dettes.</p>
    </section>
  );
}

function PartSheet({ part, onClose }) {
  const s = useStore();
  const toast = useToast();
  const info = PARTS.find((p) => p.k === part);
  const cs = caisses(s);
  const [d, setD] = useState({ montant: '', motif: '', date: today() });
  const [del, setDel] = useState(null);
  const hist = s.list('om_mouvement').filter((m) => m.data.part === part).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const entrees = [];
  for (const f of s.list('facture')) for (const p of repartFacture(s, f)) if (p.k === part && p.fait) entrees.push({ f, p });
  entrees.sort((a, b) => (b.p.date || '').localeCompare(a.p.date || ''));
  const save = () => {
    if (!num(d.montant) || !d.motif.trim()) return toast('Indiquez le montant et le motif', 'err');
    s.save('om_mouvement', { part, montant: num(d.montant), motif: d.motif.trim(), date: d.date }, { shared: false });
    toast('Enregistré ✓');
    setD({ montant: '', motif: '', date: today() });
  };
  const exemples = { relance: ['Achat de stock', 'Publicité', 'Nouveaux modèles'], charges: ['Transport', 'Emballages', 'Crédit internet', 'Frais Mobile Money'], epargne: ['Versement à la banque'], moi: ['Dépense personnelle'] }[part] || [];
  return (
    <Sheet title={`Enveloppe ${info.label}`} onClose={onClose}>
      <div className="hero small" style={{ background: info.color }}>
        <p>Dans l'enveloppe</p><h2>{money(cs[part].solde)}</h2>
        <small>Mis de côté {money(cs[part].in)} · utilisé {money(cs[part].out)} · encore à mettre {money(cs[part].aFaire)}</small>
      </div>
      <p className="muted small">{info.help}</p>
      <section className="card">
        <h3 className="card-t">Je prends de l'argent dans cette enveloppe</h3>
        <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
        <Field label="Motif"><input value={d.motif} onChange={(e) => setD({ ...d, motif: e.target.value })} placeholder={exemples[0]} /></Field>
        <div className="chips">{exemples.map((e) => <button type="button" key={e} className="chip" onClick={() => setD({ ...d, motif: e })}>{e}</button>)}</div>
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <button className="btn primary full" onClick={save}>Enregistrer</button>
      </section>
      <h3 className="sec-t">Historique</h3>
      {hist.length + entrees.length === 0 ? <p className="muted small">Rien pour l'instant.</p> : (
        <div className="card list">
          {hist.map((m) => (
            <div className="item" key={m.id}>
              <div className="grow item-main"><b>{m.data.motif}</b><small>{dateFr(m.data.date)} · sortie</small></div>
              <b className="neg">- {money(m.data.montant)}</b>
              <button className="icon-btn" onClick={() => setDel(m)} aria-label="Supprimer"><Trash2 size={16} /></button>
            </div>
          ))}
          {entrees.map(({ f, p }) => (
            <div className="item" key={f.id}>
              <div className="grow item-main"><b>{clienteName(s, f)}</b><small>{f.data.numero} · mis de côté le {dateFr(p.date)}</small></div>
              <b className="pos">+ {money(p.montant)}</b>
            </div>
          ))}
        </div>
      )}
      {del && <Confirm text="Supprimer cette sortie ?" onNo={() => setDel(null)} onYes={() => { s.remove(del.id); setDel(null); }} />}
    </Sheet>
  );
}

function PctSheet({ onClose }) {
  const s = useStore();
  const toast = useToast();
  const prm = marketParam(s);
  const [p, setP] = useState({ ...prm.parts });
  const [debut, setDebut] = useState(prm.debut);
  const total = PARTS.reduce((x, k) => x + num(p[k.k]), 0);
  return (
    <Sheet title="Répartition du bénéfice" onClose={onClose}
      footer={<button className="btn primary full" disabled={total !== 100} onClick={() => { saveMarketParam(s, { parts: p }); toast('Enregistré ✓'); onClose(); }}>Enregistrer ({total} %)</button>}>
      {PARTS.map((k) => (
        <Field key={k.k} label={`${k.label} : ${p[k.k]} %`} help={k.help}>
          <input type="range" min="0" max="100" step="5" value={p[k.k]} onChange={(e) => setP({ ...p, [k.k]: Number(e.target.value) })} />
        </Field>
      ))}
      {total !== 100 && <div className="alert warn">Le total doit faire 100 %.</div>}
      <p className="muted small">Les nouveaux pourcentages s'appliquent aux parts pas encore cochées.</p>
    </Sheet>
  );
}

function BoutiqueSheet({ onClose }) {
  const s = useStore();
  const toast = useToast();
  const prm = marketParam(s);
  const [b, setB] = useState({ ...prm.boutique });
  const F2 = (k, label, ph, help) => <Field label={label} help={help}><input value={b[k] || ''} onChange={(e) => setB({ ...b, [k]: e.target.value })} placeholder={ph} /></Field>;
  return (
    <Sheet title="Informations de la boutique" onClose={onClose}
      footer={<button className="btn primary full" onClick={() => { saveMarketParam(s, { boutique: b }); toast('Enregistré ✓'); onClose(); }}>Enregistrer</button>}>
      <p className="muted small">Ces informations apparaissent en haut et en bas de vos factures.</p>
      {F2('nom', 'Nom de la boutique', 'OrlyMarket')}
      {F2('slogan', 'Sous-titre', 'Boutique en ligne')}
      {F2('whatsapp', 'Numéro WhatsApp', '076 37 08 81')}
      {F2('adresse', 'Ville / quartier', 'Libreville')}
      {F2('airtel', 'Numéro Airtel Money', '07X XX XX XX', 'Affiché pour que la cliente paie le reste')}
      {F2('moov', 'Numéro Moov Money', '06X XX XX XX')}
      {F2('merci', 'Message de remerciement', 'Merci pour votre confiance !')}
    </Sheet>
  );
}
