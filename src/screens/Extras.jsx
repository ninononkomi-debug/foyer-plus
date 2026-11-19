import React, { useState } from 'react';
import { Plus, AlertTriangle, Info, Bell, ChevronRight, Check, Repeat, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, num, today, dateFr, monthKey, monthLabel, addDays } from '../lib/format.js';
import { journal, alertes, serieMarket, serieFoyer } from '../lib/overview.js';
import { tasksOn, lateTasks, isDone, toggleTask } from '../lib/agenda.js';
import { ScreenHead, MonthNav, Empty, Segmented } from '../components/ui.jsx';
import { TaskRow } from './Agenda.jsx';

// ======================= ENCAISSEMENTS & DÉPENSES =======================
export function Journal({ sections, onAdd }) {
  const s = useStore();
  const [month, setMonth] = useState(monthKey(today()));
  const [src, setSrc] = useState('tout');
  let list = journal(s, sections).filter((x) => x.date.startsWith(month));
  if (src !== 'tout') list = list.filter((x) => (src === 'foyer' ? x.src !== 'market' : x.src === 'market'));
  const ent = list.filter((x) => x.v > 0).reduce((a, x) => a + x.v, 0);
  const sor = list.filter((x) => x.v < 0).reduce((a, x) => a - x.v, 0);
  const days = [];
  for (const x of list) { if (!days.length || days[days.length - 1].d !== x.date) days.push({ d: x.date, items: [] }); days[days.length - 1].items.push(x); }
  return (
    <div className="screen">
      <ScreenHead title="Encaissements & Dépenses" sub="Tout l'argent qui entre et qui sort" />
      <MonthNav value={month} onChange={setMonth} />
      {sections.market && <Segmented value={src} onChange={setSrc} options={[['tout', 'Tout'], ['market', 'OrlyMarket'], ['foyer', 'Foyer']]} />}
      <div className="kpis">
        <div className="kpi"><small>Entrées</small><b className="pos">+ {money(ent)}</b></div>
        <div className="kpi"><small>Sorties</small><b className="neg">- {money(sor)}</b></div>
      </div>
      <section className="hero small"><p>Solde du mois</p><h2>{ent - sor >= 0 ? '+' : ''}{money(ent - sor)}</h2><small>Rempli automatiquement : paiements des clientes, loyer, charges cochées, dettes, enveloppes. Ajoutez le reste avec +.</small></section>
      {days.length === 0 ? <Empty title="Rien ce mois-ci" text="Les paiements, charges cochées et remboursements apparaissent ici tout seuls." /> : days.map(({ d, items }) => (
        <React.Fragment key={d}>
          <h3 className="sec-t">{dateFr(d)}</h3>
          <div className="card list">
            {items.map((x, i) => (
              <div className="item" key={i}>
                <span className={`ico ${x.v > 0 ? 'green' : 'red'}`}>{x.v > 0 ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}</span>
                <div className="grow item-main"><b className="wrap">{x.lib}</b><small>{x.sub}{x.src === 'market' ? ' · OrlyMarket' : ''}</small></div>
                <b className={x.v > 0 ? 'pos' : 'neg'}>{x.v > 0 ? '+' : '-'} {money(Math.abs(x.v))}</b>
              </div>
            ))}
          </div>
        </React.Fragment>
      ))}
      <button className="fab" onClick={onAdd} aria-label="Ajouter une entrée ou une dépense"><Plus size={26} /></button>
    </div>
  );
}

// ======================= RAPPORTS =======================
function Bars({ data, keys, fmt }) {
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Math.abs(num(d[k.k])))));
  const W = 320, H = 170, pad = 22, bw = (W - pad) / data.length;
  const kw = (bw - 10) / keys.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="Graphique">
      <line x1={pad} x2={W} y1={H} y2={H} stroke="#E6DDEA" />
      {data.map((d, i) => (
        <g key={d.m}>
          {keys.map((k, j) => {
            const v = Math.max(0, num(d[k.k]));
            const h = (v / max) * (H - 14);
            return <rect key={k.k} x={pad + i * bw + 5 + j * kw} y={H - h} width={kw - 2} height={h} rx="3" fill={k.c}><title>{`${k.l} : ${fmt(v)}`}</title></rect>;
          })}
          <text x={pad + i * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="#7A6F80">{monthLabel(d.m).slice(0, 4)}</text>
        </g>
      ))}
    </svg>
  );
}
function Legend({ keys }) {
  return <div className="legend">{keys.map((k) => <span key={k.k}><i style={{ background: k.c }} />{k.l}</span>)}</div>;
}

export function Rapports({ sections }) {
  const s = useStore();
  const [n, setN] = useState(6);
  const sm = sections.market ? serieMarket(s, n) : [];
  const sf = serieFoyer(s, n);
  const KM = [{ k: 'ventes', l: 'Ventes', c: '#8B3FD9' }, { k: 'encaisse', l: 'Encaissé', c: '#2E7CF6' }, { k: 'benef', l: 'Bénéfice', c: '#16A34A' }];
  const KF = [{ k: 'revenus', l: 'Salaires', c: '#8B3FD9' }, { k: 'charges', l: 'Charges réglées', c: '#E6337A' }, { k: 'mis', l: 'Mis de côté', c: '#16A34A' }];
  const sum = (arr, k) => arr.reduce((x, d) => x + num(d[k]), 0);
  return (
    <div className="screen">
      <ScreenHead title="Rapports" sub="Vos chiffres mois par mois" />
      <Segmented value={String(n)} onChange={(v) => setN(Number(v))} options={[['6', '6 mois'], ['12', '12 mois']]} />
      {sections.market && (
        <section className="card">
          <h3 className="card-t">OrlyMarket</h3>
          <Bars data={sm} keys={KM} fmt={money} />
          <Legend keys={KM} />
          <div className="kv"><span>Ventes sur la période</span><b>{money(sum(sm, 'ventes'))}</b></div>
          <div className="kv"><span>Encaissé</span><b>{money(sum(sm, 'encaisse'))}</b></div>
          <div className="kv"><span>Bénéfice</span><b className="pos">{money(sum(sm, 'benef'))}</b></div>
        </section>
      )}
      <section className="card">
        <h3 className="card-t">Foyer</h3>
        <Bars data={sf} keys={KF} fmt={money} />
        <Legend keys={KF} />
        <div className="kv"><span>Charges réglées sur la période</span><b>{money(sum(sf, 'charges'))}</b></div>
        <div className="kv"><span>Mis de côté (enveloppes)</span><b className="pos">{money(sum(sf, 'mis'))}</b></div>
      </section>
      <section className="card">
        <h3 className="card-t">Détail par mois</h3>
        {[...sf].reverse().map((f, i) => {
          const m = sm.length ? [...sm].reverse()[i] : null;
          return (
            <div className="kv" key={f.m}>
              <span style={{ textTransform: 'capitalize' }}>{monthLabel(f.m)}</span>
              <b>{m ? `${money(m.benef)} bénéf. · ` : ''}{money(f.charges)} charges</b>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ======================= NOTIFICATIONS =======================
export function Notifs({ go, sections }) {
  const s = useStore();
  const list = alertes(s, sections);
  return (
    <div className="screen">
      <ScreenHead title="Notifications" sub="Ce qui demande votre attention" />
      {list.length === 0 ? <Empty icon={<Bell size={34} />} title="Tout est en ordre" text="Aucune alerte pour le moment." /> : (
        <div className="card list">
          {list.map((a, i) => (
            <button key={i} className="item" onClick={() => go(a.go)}>
              <span className={`ico ${a.lvl === 'danger' ? 'red' : a.lvl === 'warn' ? 'amber' : 'blue'}`}>{a.lvl === 'info' ? <Info size={18} /> : <AlertTriangle size={18} />}</span>
              <div className="grow item-main"><b className="wrap">{a.title}</b>{a.text && <small>{a.text}</small>}</div>
              <ChevronRight size={18} className="muted" />
            </button>
          ))}
        </div>
      )}
      <p className="muted small">Les rappels importants (tâches, abonnements, dettes) arrivent aussi en notification sur le téléphone, même application fermée.</p>
    </div>
  );
}

// ======================= LISTE DES TÂCHES =======================
export function Taches({ go }) {
  const s = useStore();
  const t0 = today();
  const late = lateTasks(s);
  const jours = Array.from({ length: 14 }, (_, i) => addDays(t0, i)).map((d) => ({ d, ts: tasksOn(s, d) })).filter((x) => x.ts.length);
  return (
    <div className="screen">
      <ScreenHead title="Liste des tâches" sub="Ce que vous avez à faire, jour par jour" />
      {late.length > 0 && (<><h3 className="sec-t" style={{ color: 'var(--danger)' }}>En retard</h3><div className="card list">{late.map((t) => <TaskRow key={t.id} t={t} d={t.data.date} showDate onOpen={() => go('agenda:jour')} />)}</div></>)}
      {jours.length === 0 && late.length === 0 ? <Empty title="Aucune tâche" text="Ajoutez vos tâches dans l'Agenda." /> : jours.map(({ d, ts }) => (
        <React.Fragment key={d}>
          <h3 className="sec-t">{d === t0 ? "Aujourd'hui" : d === addDays(t0, 1) ? 'Demain' : dateFr(d)} <small className="muted">· {ts.filter((t) => isDone(t, d)).length}/{ts.length}</small></h3>
          <div className="card list">{ts.map((t) => <TaskRow key={t.id + d} t={t} d={d} onOpen={() => go('agenda:jour')} />)}</div>
        </React.Fragment>
      ))}
      <button className="btn primary full" onClick={() => go('agenda:jour')}><Plus size={18} /> Ajouter une tâche dans l'Agenda</button>
    </div>
  );
}
