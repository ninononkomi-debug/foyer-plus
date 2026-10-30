import React, { useState } from 'react';
import { Eye, EyeOff, AlertTriangle, Info, ChevronRight, CalendarClock, ShoppingBag, ListChecks, Home as HomeIco, Repeat, Users } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, monthKey, today, dateLong, monthLabel, daysBetween } from '../lib/format.js';
import { monthStats, alerts } from '../lib/compute.js';
import { tasksOn, lateTasks, isDone, aboStatus, aboLabel } from '../lib/agenda.js';
import { marketMonth, caisses, clienteStats, PARTS } from '../lib/market.js';
import { affStats } from './Affectation.jsx';
import { TaskRow } from './Agenda.jsx';
import UpdateBanner from '../components/UpdateBanner.jsx';
import avatar from '../assets/orly-avatar.jpg';

export default function Home({ go, sections }) {
  const s = useStore();
  const [hide, setHide] = useState(() => localStorage.getItem('fp:hide') === '1');
  const toggleHide = () => { localStorage.setItem('fp:hide', hide ? '0' : '1'); setHide(!hide); };
  const H = (v) => (hide ? '••••••' : money(v));
  const t0 = today();
  const mk = monthKey(t0);
  const me = s.profiles[s.user?.id]?.display_name || s.user?.user_metadata?.display_name || '';
  const isOrly = sections.market;

  const tasks = tasksOn(s, t0);
  const late = lateTasks(s);
  const todo = [...late.map((t) => ({ t, d: t.data.date })), ...tasks.filter((t) => !isDone(t, t0)).map((t) => ({ t, d: t0 }))];
  const doneN = tasks.filter((t) => isDone(t, t0)).length;

  const abos = s.list('abonnement').map((a) => ({ a, st: aboStatus(a) })).filter((x) => x.st.level === 'late' || x.st.level === 'soon').sort((x, y) => x.st.j - y.st.j);
  const al = alerts(s).filter((a) => a.type !== 'abonnement');
  const foyer = monthStats(s, mk, 'tout');

  const om = isOrly ? marketMonth(s, mk) : null;
  const cs = isOrly ? caisses(s) : null;
  const creances = isOrly ? s.list('cliente').map((c) => ({ c, st: clienteStats(s, c.id) })).filter((x) => x.st.reste > 0 && x.st.oldestUnpaid && daysBetween(x.st.oldestUnpaid, t0) > 14) : [];
  const affs = sections.affectation ? s.list('affectation').map((a) => ({ a, st: affStats(a) })).filter((x) => !x.st.fini) : [];
  const affReste = affs.reduce((x, a) => x + a.st.aFaire, 0);

  return (
    <div className="screen">
      <header className="welcome">
        {isOrly ? <img className="photo-av" src={avatar} alt="Orly" /> : <span className="letter-av">{(me || '?')[0].toUpperCase()}</span>}
        <div className="grow">
          <h1>Bonjour{me ? ` ${me.split(' ')[0]}` : ''}</h1>
          <p>{(() => { const x = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return x[0].toUpperCase() + x.slice(1); })()}</p>
        </div>
        <button className="icon-btn" onClick={toggleHide} aria-label={hide ? 'Afficher les montants' : 'Masquer les montants'}>{hide ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </header>

      <UpdateBanner />

      <div className="kpis">
        {isOrly && <button className="kpi accent" onClick={() => go('market')}><small>OrlyMarket · {monthLabel(mk).split(' ')[0]}</small><b>{H(om.benef)}</b><span className="trend">bénéfice · {om.nb} facture{om.nb > 1 ? 's' : ''}</span></button>}
        {isOrly && <button className="kpi" onClick={() => go('market')}><small>Clientes : reste à encaisser</small><b className={om.reste ? 'neg' : ''}>{H(om.reste)}</b><span className="trend">toutes factures</span></button>}
        <button className={`kpi ${isOrly ? '' : 'accent'}`} onClick={() => go('foyer')}><small>Foyer · solde du mois</small><b className={!isOrly ? '' : foyer.solde < 0 ? 'neg' : 'pos'}>{hide ? '••••••' : `${foyer.solde >= 0 ? '+' : ''}${money(foyer.solde)}`}</b><span className="trend">{H(foyer.depenses)} dépensés</span></button>
        <button className="kpi" onClick={() => go('agenda')}><small>Tâches du jour</small><b>{doneN}/{tasks.length}</b><span className="trend">{late.length ? `${late.length} en retard` : 'faites'}</span></button>
      </div>

      <section className="card">
        <div className="card-h"><h3 className="card-t">Aujourd'hui</h3><button className="link" onClick={() => go('agenda')}>Agenda</button></div>
        {todo.length === 0 ? <p className="muted small">{tasks.length ? 'Tout est fait pour aujourd’hui. Bravo !' : 'Aucune tâche prévue aujourd’hui.'}</p> : (
          <div className="list" style={{ margin: '0 -14px' }}>{todo.slice(0, 6).map(({ t, d }) => <TaskRow key={t.id + d} t={t} d={d} showDate={d !== t0} onOpen={() => go('agenda')} />)}</div>
        )}
        {todo.length > 6 && <button className="link" onClick={() => go('agenda')}>+ {todo.length - 6} autre(s)</button>}
      </section>

      {(abos.length > 0 || al.length > 0 || creances.length > 0) && (
        <section className="card">
          <h3 className="card-t">À surveiller</h3>
          {abos.slice(0, 4).map(({ a, st }) => (
            <button key={a.id} className={`alert-row ${st.level === 'late' ? 'danger' : 'warn'}`} onClick={() => go('agenda:abos')}>
              <Repeat size={18} /><span className="grow">{a.data.nom} : {st.j < 0 ? 'échéance dépassée' : `fin ${aboLabel(st.j)}`}</span><b>{H(a.data.montant)}</b>
            </button>
          ))}
          {creances.slice(0, 3).map(({ c, st }) => (
            <button key={c.id} className="alert-row warn" onClick={() => go('market')}>
              <Users size={18} /><span className="grow">{c.data.nom} doit encore payer</span><b>{H(st.reste)}</b>
            </button>
          ))}
          {al.slice(0, 4).map((a, i) => (
            <button key={i} className={`alert-row ${a.level}`} onClick={() => go(a.go)}>
              {a.level === 'info' ? <Info size={18} /> : <AlertTriangle size={18} />}<span className="grow">{a.text}</span><b>{H(a.amount)}</b>
            </button>
          ))}
        </section>
      )}

      {isOrly && (
        <button className="card" onClick={() => go('market')}>
          <div className="card-h"><h3 className="card-t">Mes 4 parts OrlyMarket</h3><ChevronRight size={18} /></div>
          <div className="caisses">
            {PARTS.map((p) => <div className="caisse" key={p.k} style={{ '--c': p.color }}><small>{p.short}</small><b>{H(cs[p.k].solde)}</b></div>)}
          </div>
        </button>
      )}

      {sections.affectation && affs.length > 0 && (
        <button className="card card-link" onClick={() => go('affectation')}>
          <span className="ico"><ListChecks size={19} /></span>
          <div className="grow"><b>Affectation : {H(affReste)} à faire</b><p className="muted small">{affs.length} en cours · {affs.map((x) => x.a.data.titre).slice(0, 2).join(', ')}</p></div>
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
