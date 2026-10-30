import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Users, Wallet, Search, Send, Phone, MessageCircle, Settings2, Trash2, Pencil, Plus, Truck, Receipt, ChevronRight, X } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, monthLabel, uid, daysBetween } from '../lib/format.js';
import {
  PARTS, CAPITAL, ARTICLE_ST, MODES, marketParam, saveMarketParam, factTotals, STATUT_LABEL, LIV_LABEL,
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
    if (!prm.raw.debut) saveMarketParam(s, { debut: prm.debut, parts: prm.parts });
  }, [s.lastSyncAt]);

  return (
    <div className="screen">
      <ScreenHead title="OrlyMarket" sub="Privé · visible par vous seule"
        right={<button className="icon-btn" onClick={() => setSheet({ k: 'boutique' })} aria-label="Informations de la boutique"><Settings2 size={21} /></button>} />
      <Segmented value={tab} onChange={setTab} options={[['factures', 'Factures'], ['clientes', 'Clientes'], ['caisses', 'Bénéfice']]} />
      {tab === 'factures' && <Factures month={month} setMonth={setMonth} open={setSheet} />}
      {tab === 'clientes' && <Clientes open={setSheet} />}
      {tab === 'caisses' && <Caisses open={setSheet} go={go} month={month} setMonth={setMonth} />}

      {tab !== 'caisses' && <Fab onClick={() => setSheet(tab === 'clientes' ? { k: 'clienteForm' } : { k: 'factForm' })} label={tab === 'clientes' ? 'Nouvelle cliente' : 'Nouvelle facture'} icon={<Plus size={26} />} />}

      {sheet?.k === 'factForm' && <FactureForm rec={sheet.rec} clienteId={sheet.cliente} onClose={() => setSheet(null)} onSaved={(f) => setSheet({ k: 'fact', id: f.id })} />}
      {sheet?.k === 'fact' && <FactureDetail id={sheet.id} open={setSheet} onClose={() => setSheet(null)} />}
      {sheet?.k === 'pay' && <PaiementSheet id={sheet.id} back={() => setSheet({ k: 'fact', id: sheet.id })} />}
      {sheet?.k === 'clienteForm' && <ClienteForm rec={sheet.rec} onClose={() => setSheet(sheet.rec ? { k: 'cliente', id: sheet.rec.id } : null)} />}
      {sheet?.k === 'cliente' && <ClienteDetail id={sheet.id} open={setSheet} onClose={() => setSheet(null)} />}
      {sheet?.k === 'img' && <ImageSheet {...sheet} onClose={() => setSheet(sheet.back || null)} />}
      {sheet?.k === 'boutique' && <BoutiqueSheet onClose={() => setSheet(null)} />}
      {sheet?.k === 'part' && <PartSheet part={sheet.part} go={go} onClose={() => setSheet(null)} />}
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
    const data = { ...d, cliente: cid, lignes: lignes.map((l) => ({ ...l, qte: num(l.qte) || 1, pv: num(l.pv), pa: num(l.pa) })), livraison: num(d.livraison), frais: num(d.frais), paiements };
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
      {d.lignes.map((l, i) => (
        <div className="line-edit" key={l.id}>
          <div className="row">
            <input className="mini-in grow" placeholder="Article (ex. Robe fillette 4 ans)" value={l.designation} onChange={(e) => upL(i, 'designation', e.target.value)} />
            {d.lignes.length > 1 && <button className="icon-btn danger" onClick={() => setD((x) => ({ ...x, lignes: x.lignes.filter((_, j) => j !== i) }))} aria-label="Retirer l'article"><Trash2 size={17} /></button>}
          </div>
          <div className="g3">
            <label>Qté<input className="mini-in" inputMode="numeric" value={l.qte} onChange={(e) => upL(i, 'qte', e.target.value.replace(/\D/g, ''))} /></label>
            <label>Prix fournisseur<MiniMoney value={l.pa} onChange={(v) => upL(i, 'pa', v)} /></label>
            <label>Prix de vente<MiniMoney value={l.pv} onChange={(v) => upL(i, 'pv', v)} /></label>
          </div>
          <div className="chips">
            {ARTICLE_ST.map(([k, lb]) => <button type="button" key={k} className={`chip ${l.statut === k ? 'on' : ''}`} onClick={() => upL(i, 'statut', k)}>{lb}</button>)}
          </div>
        </div>
      ))}
      <button className="btn soft" onClick={() => setD((x) => ({ ...x, lignes: [...x.lignes, { id: uid(), designation: '', qte: 1, pv: '', pa: '', statut: 'route' }] }))}><Plus size={17} /> Ajouter un article</button>
      <div className="row gap">
        <Field label="Livraison facturée" help="Payée par la cliente"><MoneyInput value={d.livraison} onChange={(v) => up('livraison', v)} /></Field>
        <Field label="Mes frais" help="Transport, colis… (non affichés)"><MoneyInput value={d.frais} onChange={(v) => up('frais', v)} /></Field>
      </div>
      {isNew && (
        <>
          <Field label="Acompte reçu aujourd'hui"><MoneyInput value={acompte.montant} onChange={(v) => setAcompte({ ...acompte, montant: v })} /></Field>
          {num(acompte.montant) > 0 && <div className="chips">{MODES.map(([k, l]) => <button type="button" key={k} className={`chip ${acompte.mode === k ? 'on' : ''}`} onClick={() => setAcompte({ ...acompte, mode: k })}>{l}</button>)}</div>}
        </>
      )}
      <div className="totals">
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
          <button className="btn primary full wa" onClick={() => open({ k: 'img', kind: 'facture', id: f.id, back: { k: 'fact', id: f.id } })}><Send size={18} /> Envoyer la facture en image</button>
          <div className="row gap">
            {t.reste > 0 && <button className="btn soft grow" onClick={() => open({ k: 'pay', id: f.id })}>+ Paiement reçu</button>}
            <button className="btn ghost grow" onClick={() => open({ k: 'img', kind: 'point', ids: [f.id], cliente: d.cliente, back: { k: 'fact', id: f.id } })}>Point de paiement</button>
          </div>
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
            <div className="grow item-main"><b>{l.designation}</b><small>{num(l.qte)} × {money(l.pv)} · achat {money(l.pa)}</small></div>
            <button className={`st ${l.statut || 'route'}`} onClick={() => cycle(i)}>{l.statut === 'livre' ? 'Livré' : LIV_LABEL[l.statut || 'route']}</button>
          </div>
        ))}
      </div>
      {t.livraison !== 'livre' && <button className="btn ghost sm" onClick={allDelivered}><Truck size={16} /> Tout est livré</button>}
      <div className="totals">
        {num(d.livraison) > 0 && <div className="kv"><span>Livraison</span><b>{money(d.livraison)}</b></div>}
        <div className="kv"><span>Total</span><b>{money(t.total)}</b></div>
        <div className="kv"><span>Déjà payé</span><b className="pos">{money(t.paye)}</b></div>
        <div className="kv big"><span>Reste à payer</span><b>{money(t.reste)}</b></div>
        <div className="kv"><span>Mon bénéfice</span><b className={t.benef >= 0 ? 'pos' : 'neg'}>{money(t.benef)}</b></div>
      </div>
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

function PaiementSheet({ id, back }) {
  const s = useStore();
  const toast = useToast();
  const f = s.getRec(id);
  const t = f ? factTotals(f) : { reste: 0 };
  const [p, setP] = useState({ montant: t.reste, date: today(), mode: 'especes' });
  if (!f) return null;
  const save = () => {
    if (!num(p.montant)) return;
    s.save('facture', { ...f.data, paiements: [...(f.data.paiements || []), { id: uid(), ...p, montant: num(p.montant) }] }, { id: f.id });
    toast('Paiement enregistré ✓');
    back();
  };
  return (
    <Sheet title={`Paiement · ${f.data.numero}`} onClose={back} footer={<button className="btn primary full" onClick={save}>Enregistrer le paiement</button>}>
      <p className="muted small">Reste à payer : <b>{money(t.reste)}</b></p>
      <Field label="Montant reçu"><MoneyInput value={p.montant} onChange={(v) => setP({ ...p, montant: v })} autoFocus /></Field>
      <Field label="Date"><input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
      <Field label="Mode de paiement"><div className="chips">{MODES.map(([k, l]) => <button type="button" key={k} className={`chip ${p.mode === k ? 'on' : ''}`} onClick={() => setP({ ...p, mode: k })}>{l}</button>)}</div></Field>
      <p className="muted small">Le bénéfice de ce paiement est réparti automatiquement dans vos 4 parts.</p>
    </Sheet>
  );
}

// ======================= IMAGE =======================
function ImageSheet({ kind, id, ids, cliente, onClose }) {
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
  const name = kind === 'facture' ? `Facture_${f?.data.numero}.png` : `Point_paiement_${(cl.nom || 'cliente').replace(/\s+/g, '_')}.png`;
  const text = kind === 'facture' ? `Bonjour ${cl.nom || ''}, voici votre facture ${f?.data.numero}. Merci pour votre confiance ! OrlyMarket` : `Bonjour ${cl.nom || ''}, voici le point de vos paiements. Merci ! OrlyMarket`;
  const send = async () => {
    setBusy(true);
    try { await shareCanvas(canvas, name, text); } catch (e) { if (!/cancel/i.test(String(e?.message))) toast("L'envoi n'a pas abouti", 'err'); } finally { setBusy(false); }
  };
  return (
    <Sheet title={kind === 'facture' ? 'Facture en image' : 'Point de paiement'} onClose={onClose}
      footer={<button className="btn primary full wa" disabled={!canvas || busy} onClick={send}><Send size={18} /> {busy ? 'Ouverture…' : 'Envoyer (WhatsApp…)'}</button>}>
      {!prm.boutique.whatsapp && <div className="alert warn">Ajoutez votre numéro WhatsApp et vos numéros Airtel / Moov dans les informations de la boutique (roue en haut d'OrlyMarket).</div>}
      {url ? <img className="preview-img" src={url} alt="Aperçu" /> : <p className="muted center">Préparation de l'image…</p>}
      <p className="muted small center">Choisissez WhatsApp puis la cliente : l'image part directement dans la discussion.</p>
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
          <button className="btn primary full wa" disabled={!st.nb} onClick={() => open({ k: 'img', kind: 'point', ids: pointIds, cliente: id, back: { k: 'cliente', id } })}><Send size={18} /> Envoyer le point de paiement</button>
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

// ======================= BÉNÉFICE / CAISSES =======================
function Caisses({ open, go, month, setMonth }) {
  const s = useStore();
  const prm = marketParam(s);
  const cs = caisses(s);
  const m = marketMonth(s, month);
  const totalPct = PARTS.reduce((x, p) => x + num(prm.parts[p.k]), 0);
  return (
    <>
      <section className="hero small">
        <p>Bénéfice encaissé depuis le {dateFr(prm.debut)}</p>
        <h2>{money(PARTS.reduce((x, p) => x + cs[p.k].in, 0))}</h2>
        <small>Le bénéfice entre dans vos parts au fur et à mesure que les clientes paient.</small>
      </section>
      <div className="caisses">
        {PARTS.map((p) => (
          <button className="caisse" key={p.k} style={{ '--c': p.color }} onClick={() => open({ k: 'part', part: p.k })}>
            <span className="pc">{prm.parts[p.k]} %</span>
            <small>{p.label}</small>
            <b className={cs[p.k].solde < 0 ? 'neg' : ''}>{money(cs[p.k].solde)}</b>
            <small>reçu {money(cs[p.k].in)} · utilisé {money(cs[p.k].out)}</small>
          </button>
        ))}
        <button className="caisse wide" style={{ '--c': CAPITAL.color }} onClick={() => open({ k: 'part', part: 'capital' })}>
          <small>{CAPITAL.label}</small>
          <b>{money(cs.capital.solde)}</b>
          <small>{CAPITAL.help}</small>
        </button>
      </div>
      {totalPct !== 100 && <div className="alert warn">Le total des pourcentages fait {totalPct} % au lieu de 100 %.</div>}
      {cs.moi.solde > 0 && (
        <button className="card card-link" onClick={() => go('affectation')}>
          <span className="ico blue"><Wallet size={19} /></span>
          <div className="grow"><b>Répartir « Pour moi » ({money(cs.moi.solde)})</b><p className="muted small">Décidez à quoi sert cet argent dans Affectation.</p></div>
          <ChevronRight size={18} />
        </button>
      )}
      <MonthNav value={month} onChange={setMonth} />
      <section className="card">
        <h3 className="card-t">Le mois en bref</h3>
        <div className="kv"><span>Ventes facturées</span><b>{money(m.ca)}</b></div>
        <div className="kv"><span>Bénéfice des ventes</span><b className="pos">{money(m.benef)}</b></div>
        <div className="kv"><span>Argent encaissé</span><b>{money(m.encaisse)}</b></div>
        <div className="kv"><span>dont bénéfice à répartir</span><b>{money(m.benefEnc)}</b></div>
        {PARTS.map((p) => <div className="kv" key={p.k}><span><i className="dot" style={{ background: p.color }} /> {p.label} ({prm.parts[p.k]} %)</span><b>{money((m.benefEnc * num(prm.parts[p.k])) / 100)}</b></div>)}
      </section>
      <button className="btn ghost full" onClick={() => open({ k: 'pct' })}>Modifier les pourcentages ou la date de départ</button>
    </>
  );
}

function PartSheet({ part, go, onClose }) {
  const s = useStore();
  const toast = useToast();
  const info = part === 'capital' ? CAPITAL : PARTS.find((p) => p.k === part);
  const cs = caisses(s);
  const [d, setD] = useState({ montant: '', motif: '', date: today(), versEpargne: part === 'epargne' });
  const [del, setDel] = useState(null);
  const hist = s.list('om_mouvement').filter((m) => m.data.part === part).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const affs = part === 'moi' ? s.list('affectation').filter((a) => a.data.source === 'om_moi') : [];
  const save = () => {
    if (!num(d.montant) || !d.motif.trim()) return toast('Indiquez le montant et le motif', 'err');
    let lien = null;
    if (part === 'epargne' && d.versEpargne) lien = s.save('epargne', { date: d.date, montant: num(d.montant), origine: 'OrlyMarket · part épargne' }, { shared: false }).id;
    s.save('om_mouvement', { part, montant: num(d.montant), motif: d.motif.trim(), date: d.date, lien }, { shared: false });
    toast('Enregistré ✓');
    setD({ montant: '', motif: '', date: today(), versEpargne: part === 'epargne' });
  };
  const exemples = { relance: ['Achat de stock', 'Publicité Facebook', 'Nouveaux modèles'], charges: ['Transport', 'Emballages', 'Crédit internet', 'Frais Mobile Money'], epargne: ['Versement épargne'], capital: ['Achat fournisseur', 'Commande Chine', 'Commande Dubaï'], moi: ['Retrait personnel'] }[part] || [];
  return (
    <Sheet title={info.label} onClose={onClose}>
      <div className="hero small" style={{ background: info.color }}>
        <p>Disponible</p><h2>{money(cs[part].solde)}</h2>
        <small>Reçu {money(cs[part].in)} · utilisé {money(cs[part].out)}</small>
      </div>
      <p className="muted small">{info.help}</p>
      {part === 'moi' ? (
        <button className="btn primary full" onClick={() => { onClose(); go('affectation'); }}>Répartir dans Affectation</button>
      ) : (
        <section className="card">
          <h3 className="card-t">Utiliser de l'argent de cette part</h3>
          <Field label="Montant"><MoneyInput value={d.montant} onChange={(v) => setD({ ...d, montant: v })} /></Field>
          <Field label="Motif"><input value={d.motif} onChange={(e) => setD({ ...d, motif: e.target.value })} placeholder={exemples[0]} /></Field>
          <div className="chips">{exemples.map((e) => <button type="button" key={e} className="chip" onClick={() => setD({ ...d, motif: e })}>{e}</button>)}</div>
          <Field label="Date"><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          {part === 'epargne' && (
            <label className="toggle-row"><span>Ajouter aussi à mon épargne (Foyer)<small>Le montant apparaît dans Épargne & objectifs</small></span>
              <input type="checkbox" className="switch" checked={d.versEpargne} onChange={(e) => setD({ ...d, versEpargne: e.target.checked })} /></label>
          )}
          <button className="btn primary full" onClick={save}>Enregistrer</button>
        </section>
      )}
      <h3 className="sec-t">Historique</h3>
      {hist.length + affs.length === 0 ? <p className="muted small">Rien pour l'instant.</p> : (
        <div className="card list">
          {affs.map((a) => <div className="item" key={a.id}><div className="grow item-main"><b>{a.data.titre}</b><small>{dateFr(a.data.date)} · Affectation</small></div><b className="neg">- {money(a.data.montant)}</b></div>)}
          {hist.map((m) => (
            <div className="item" key={m.id}>
              <div className="grow item-main"><b>{m.data.motif}</b><small>{dateFr(m.data.date)}</small></div>
              <b className="neg">- {money(m.data.montant)}</b>
              <button className="icon-btn" onClick={() => setDel(m)} aria-label="Supprimer"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {del && <Confirm text="Supprimer cette sortie ?" onNo={() => setDel(null)} onYes={() => { if (del.data.lien) s.remove(del.data.lien); s.remove(del.id); setDel(null); }} />}
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
      footer={<button className="btn primary full" disabled={total !== 100} onClick={() => { saveMarketParam(s, { parts: p, debut }); toast('Enregistré ✓'); onClose(); }}>Enregistrer ({total} %)</button>}>
      {PARTS.map((k) => (
        <Field key={k.k} label={`${k.label} : ${p[k.k]} %`} help={k.help}>
          <input type="range" min="0" max="100" step="5" value={p[k.k]} onChange={(e) => setP({ ...p, [k.k]: Number(e.target.value) })} />
        </Field>
      ))}
      {total !== 100 && <div className="alert warn">Le total doit faire 100 %.</div>}
      <Field label="Je respecte la répartition à partir du" help="Les paiements reçus avant cette date ne sont pas répartis.">
        <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
      </Field>
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
