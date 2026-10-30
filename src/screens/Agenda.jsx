import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Repeat, Bell, CalendarClock, AlertTriangle } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, dateLong, addDays, nextDate } from '../lib/format.js';
import { FREQUENCES } from '../lib/defaults.js';
import { REPET, RAPPELS, JOURS, tasksOn, lateTasks, isDone, toggleTask, aboStatus, aboLabel, aboMensuel } from '../lib/agenda.js';
import { ScreenHead, Fab, Sheet, Field, MoneyInput, Empty, Confirm, useToast, Segmented, RecordForm, Progress, SharedTag } from '../components/ui.jsx';
import { PaySheet } from './Modules.jsx';

export default function Agenda({ initial }) {
  const [tab, setTab] = useState(initial || 'jour');
  return (
    <div className="screen">
      <ScreenHead title="Agenda" sub="Ma journée et mes abonnements" />
      <Segmented value={tab} onChange={setTab} options={[['jour', 'Ma journée'], ['abos', 'Abonnements']]} />
      {tab === 'jour' ? <Journee /> : <Abonnements />}
    </div>
  );
}

// ======================= MA JOURNÉE =======================
function weekStart(d) {
  const x = new Date(d + 'T12:00:00');
  const w = (x.getDay() + 6) % 7; // lundi = 0
  return addDays(d, -w);
}

function Journee() {
  const s = useStore();
  const t0 = today();
  const [day, setDay] = useState(t0);
  const [form, setForm] = useState(null);
  const ws = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const list = tasksOn(s, day);
  const late = day === t0 ? lateTasks(s) : [];
  const done = list.filter((t) => isDone(t, day)).length;
  const timed = list.filter((t) => t.data.heure);
  const untimed = list.filter((t) => !t.data.heure);
  return (
    <>
      <div className="row between">
        <button className="icon-btn" onClick={() => setDay(addDays(day, -7))} aria-label="Semaine précédente"><ChevronLeft size={20} /></button>
        <b style={{ textTransform: 'capitalize' }}>{dateLong(day)}</b>
        <button className="icon-btn" onClick={() => setDay(addDays(day, 7))} aria-label="Semaine suivante"><ChevronRight size={20} /></button>
      </div>
      <div className="week">
        {days.map((d) => (
          <button key={d} className={`${d === day ? 'on' : ''} ${d === t0 ? 'today' : ''}`} onClick={() => setDay(d)}>
            {JOURS[new Date(d + 'T12:00:00').getDay()]}<b>{Number(d.slice(8))}</b>{tasksOn(s, d).some((t) => !isDone(t, d)) ? <i /> : <i style={{ visibility: 'hidden' }} />}
          </button>
        ))}
      </div>
      {day !== t0 && <button className="link" onClick={() => setDay(t0)}>Revenir à aujourd'hui</button>}
      {list.length > 0 && (
        <section className="card">
          <div className="row between"><b>{done}/{list.length} tâche{list.length > 1 ? 's' : ''} faite{done > 1 ? 's' : ''}</b><span className="muted small">{list.length - done} restante{list.length - done > 1 ? 's' : ''}</span></div>
          <Progress value={list.length ? done / list.length : 0} />
        </section>
      )}
      {late.length > 0 && (
        <>
          <h3 className="sec-t" style={{ color: 'var(--danger)' }}>En retard</h3>
          <div className="card list">{late.map((t) => <TaskRow key={t.id} t={t} d={t.data.date} onOpen={() => setForm(t)} showDate />)}</div>
        </>
      )}
      {list.length === 0 && late.length === 0 ? (
        <Empty icon={<CalendarClock size={34} />} title="Rien de prévu" text="Ajoutez ce que vous devez faire, avec l'heure : vous recevez une notification même si l'application est fermée." />
      ) : (
        <>
          {timed.length > 0 && <div className="card list">{timed.map((t) => <TaskRow key={t.id} t={t} d={day} onOpen={() => setForm(t)} />)}</div>}
          {untimed.length > 0 && (<><h3 className="sec-t">Dans la journée</h3><div className="card list">{untimed.map((t) => <TaskRow key={t.id} t={t} d={day} onOpen={() => setForm(t)} />)}</div></>)}
        </>
      )}
      <Fab onClick={() => setForm({ new: true, date: day })} label="Nouvelle tâche" icon={<Plus size={26} />} />
      {form && <TaskForm rec={form.new ? null : form} date={form.date} onClose={() => setForm(null)} />}
    </>
  );
}

export function TaskRow({ t, d, onOpen, showDate }) {
  const s = useStore();
  const ok = isDone(t, d);
  return (
    <div className={`task ${t.data.priorite === 'haute' ? 'high' : ''}`}>
      <button className={`check round ${ok ? 'on' : ''}`} onClick={() => toggleTask(s, t, d)} aria-label={ok ? 'Marquer non fait' : 'Marquer fait'}>{ok && <Check size={15} strokeWidth={3} />}</button>
      <span className={`time ${t.data.heure ? '' : 'none'}`}>{t.data.heure || '—'}</span>
      <button className="grow item-main" style={{ textAlign: 'left' }} onClick={onOpen}>
        <b className={ok ? 'done-t' : ''}>{t.data.titre}</b>
        <small>
          {showDate ? `${dateFr(t.data.date)} · ` : ''}
          {(t.data.repetition || 'aucune') !== 'aucune' && <><Repeat size={12} /> {REPET.find((r) => r[0] === t.data.repetition)?.[1]}</>}
          {t.data.heure && t.data.rappel !== -1 && <> <Bell size={12} /></>}
          {t.data.note ? ` ${t.data.note}` : ''}
        </small>
      </button>
    </div>
  );
}

function TaskForm({ rec, date, onClose }) {
  const s = useStore();
  const toast = useToast();
  const [d, setD] = useState(rec ? { ...rec.data } : { titre: '', date: date || today(), heure: '', rappel: 0, repetition: 'aucune', priorite: 'normale', note: '', faits: {} });
  const [del, setDel] = useState(false);
  const up = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!d.titre.trim()) return;
    s.save('tache', { ...d, titre: d.titre.trim() }, { id: rec?.id, shared: false });
    toast(rec ? 'Tâche modifiée ✓' : 'Tâche ajoutée ✓');
    onClose();
  };
  const sugg = ['Appeler le fournisseur', 'Livrer une commande', 'Publier sur le statut', 'Faire le point des paiements', 'Réunion', 'Aller chercher les enfants'];
  return (
    <Sheet title={rec ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={onClose}
      footer={<div className="row gap">{rec && <button className="btn ghost danger-t" onClick={() => setDel(true)}>Supprimer</button>}<button className="btn primary grow" onClick={save}>Enregistrer</button></div>}>
      <Field label="Que devez-vous faire ?"><input value={d.titre} onChange={(e) => up('titre', e.target.value)} autoFocus={!rec} placeholder="Ex. Livrer la commande de Clémentine" /></Field>
      {!rec && <div className="chips">{sugg.map((x) => <button type="button" key={x} className="chip" onClick={() => up('titre', x)}>{x}</button>)}</div>}
      <div className="row gap">
        <Field label="Date"><input type="date" value={d.date} onChange={(e) => up('date', e.target.value)} /></Field>
        <Field label="Heure (facultatif)"><input type="time" value={d.heure || ''} onChange={(e) => up('heure', e.target.value)} /></Field>
      </div>
      {d.heure && <Field label="Rappel"><div className="chips">{RAPPELS.map(([k, l]) => <button type="button" key={k} className={`chip ${num(d.rappel) === k ? 'on' : ''}`} onClick={() => up('rappel', k)}>{l}</button>)}</div></Field>}
      <Field label="Répéter"><div className="chips">{REPET.map(([k, l]) => <button type="button" key={k} className={`chip ${(d.repetition || 'aucune') === k ? 'on' : ''}`} onClick={() => up('repetition', k)}>{l}</button>)}</div></Field>
      {(d.repetition || 'aucune') !== 'aucune' && <Field label="Jusqu'au (facultatif)"><input type="date" value={d.fin_rep || ''} onChange={(e) => up('fin_rep', e.target.value)} /></Field>}
      <label className="toggle-row"><span>Important<small>Signalé par un point rouge</small></span><input type="checkbox" className="switch" checked={d.priorite === 'haute'} onChange={(e) => up('priorite', e.target.checked ? 'haute' : 'normale')} /></label>
      <Field label="Note"><input value={d.note || ''} onChange={(e) => up('note', e.target.value)} placeholder="Lieu, numéro à appeler…" /></Field>
      {del && <Confirm text={(d.repetition || 'aucune') !== 'aucune' ? 'Supprimer cette tâche et toutes ses répétitions ?' : 'Supprimer cette tâche ?'} onNo={() => setDel(false)} onYes={() => { s.remove(rec.id); onClose(); }} />}
    </Sheet>
  );
}

// ======================= ABONNEMENTS =======================
const FREQ2 = [...FREQUENCES, ['unique', 'Une seule fois (date de fin)']];

function Abonnements() {
  const s = useStore();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const list = s.list('abonnement').map((a) => ({ a, st: aboStatus(a) }))
    .sort((x, y) => (x.a.data.actif === false) - (y.a.data.actif === false) || (x.st.e || '9').localeCompare(y.st.e || '9'));
  const soon = list.filter((x) => x.st.level === 'late' || x.st.level === 'soon').length;
  const mensuel = aboMensuel(list.map((x) => x.a));
  return (
    <>
      <div className="kpis">
        <div className="kpi accent"><small>Coût par mois</small><b>{money(mensuel)}</b><span className="trend">{money(mensuel * 12)} par an</span></div>
        <div className="kpi"><small>À renouveler sous 7 jours</small><b className={soon ? 'neg' : ''}>{soon}</b><span className="trend">alertes 7 j, 2 j et le jour même</span></div>
      </div>
      {list.length === 0 ? <Empty icon={<Repeat size={34} />} title="Aucun abonnement" text="Canal+, forfait internet, téléphone, salle de sport, assurance, scolarité… L'application vous prévient avant la fin." /> : (
        <div className="card list">
          {list.map(({ a, st }) => (
            <div className="item" key={a.id}>
              <span className={`ico ${st.level === 'late' ? 'red' : st.level === 'soon' ? 'amber' : st.level === 'ok' ? 'green' : 'ink'}`} onClick={() => setForm(a)}>{st.level === 'late' ? <AlertTriangle size={18} /> : <Repeat size={18} />}</span>
              <div className="grow item-main" onClick={() => setForm(a)}>
                <b className={`wrap ${a.data.actif === false ? 'muted' : ''}`}>{a.data.nom}</b>
                <small>{money(a.data.montant)} · {st.e ? (a.data.fin && st.e === a.data.fin ? `fin le ${dateFr(st.e)}` : `le ${dateFr(st.e)}`) : '—'} {st.j !== null && <span className={`st ${st.level}`}>{aboLabel(st.j)}</span>} <SharedTag rec={a} /></small>
              </div>
              {a.data.actif !== false && (a.data.frequence || 'mensuel') !== 'unique' && <button className="btn soft sm" onClick={() => setPay(a)}>Renouvelé</button>}
            </div>
          ))}
        </div>
      )}
      <Fab onClick={() => setForm('new')} label="Nouvel abonnement" icon={<Plus size={26} />} />
      {pay && <PaySheet title={`Renouvellement ${pay.data.nom}`} montant={num(pay.data.montant)} onClose={() => setPay(null)} onPay={(m, w) => {
        s.save('depense', { date: today(), montant: m, categorie: pay.data.categorie || 'Abonnements', description: pay.data.nom, portefeuille: w || pay.data.portefeuille }, { shared: !!pay.household_id });
        s.save('abonnement', { ...pay.data, prochaine: nextDate(pay.data.prochaine || today(), pay.data.frequence || 'mensuel') }, { id: pay.id });
        toast('Renouvellement enregistré ✓'); setPay(null);
      }} />}
      {form && <RecordForm title={form === 'new' ? 'Nouvel abonnement' : "Modifier l'abonnement"} module="abonnement" rec={form === 'new' ? null : form} onClose={() => setForm(null)}
        fields={[
          { k: 'nom', label: 'Nom', required: true, placeholder: 'Ex. Canal+, forfait Airtel, salle de sport' },
          { k: 'montant', label: 'Montant', type: 'money', required: true },
          { k: 'frequence', label: 'Se renouvelle', type: 'select', options: FREQ2, def: 'mensuel', required: true },
          { k: 'prochaine', label: 'Prochaine échéance (date de fin de la période en cours)', type: 'date', def: today, required: true, help: 'Vous êtes prévenue 7 jours avant, 2 jours avant et le jour même.' },
          { k: 'fin', label: "Fin définitive de l'abonnement (facultatif)", type: 'date', help: 'Par exemple la fin d’un contrat ou d’une assurance.' },
          { k: 'categorie', label: 'Catégorie', type: 'category' },
          { k: 'portefeuille', label: 'Payé avec', type: 'wallet' },
          { k: 'actif', label: 'Actif', type: 'toggle', defOn: true },
        ]} />}
    </>
  );
}
