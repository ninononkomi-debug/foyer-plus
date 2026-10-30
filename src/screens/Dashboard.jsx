import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw, CloudOff, AlertTriangle, Info, ChevronRight, ListOrdered, Target, PiggyBank, Users, Building2, Handshake, Wallet, KeyRound, Plus } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { monthStats, lastMonths, walletBalances, categoriesMap, catInfo, alerts, budgetStatus, omStats } from '../lib/compute.js';
import { money, monthKey, today, monthLabel } from '../lib/format.js';
import { Money, Donut, Bars, Segmented, MonthNav, Progress, CatBadge } from '../components/ui.jsx';
import { WALLET_TYPES } from '../lib/defaults.js';
import { LOCAL_MODE } from '../config.js';

export default function Dashboard({ go, scope, setScope, month, setMonth, onAdd }) {
  const s = useStore();
  const [hide, setHide] = useState(() => localStorage.getItem('fp:hide') === '1');
  const toggleHide = () => { localStorage.setItem('fp:hide', hide ? '0' : '1'); setHide(!hide); };
  const st = monthStats(s, month, scope);
  const months = lastMonths(s, month, 6, scope);
  const cmap = categoriesMap(s);
  const cats = Object.entries(st.parCat).sort((a, b) => b[1] - a[1]);
  const donut = cats.slice(0, 6).map(([n, v]) => ({ value: v, color: catInfo(cmap, n).couleur }));
  if (cats.length > 6) donut.push({ value: cats.slice(6).reduce((x, [, v]) => x + v, 0), color: '#CBD5E1' });
  const bal = walletBalances(s);
  const wallets = s.list('portefeuille').filter((w) => w.data.actif !== false && (scope === 'tout' || (scope === 'foyer') === !!w.household_id));
  const totalWallets = wallets.reduce((x, w) => x + (bal[w.id] || 0), 0);
  const al = month === monthKey(today()) ? alerts(s).filter((a) => scope === 'tout' || true) : [];
  const budgets = budgetStatus(s, month, scope).slice(0, 4);
  const me = s.profiles[s.user?.id]?.display_name || s.user?.user_metadata?.display_name || '';
  const H = (v) => (hide ? '••••••' : money(v));
  const mods = [
    ['ops', ListOrdered, 'Opérations', ''], ['budget', Target, 'Budget', 'amber'], ['epargne', PiggyBank, 'Épargne', 'green'], ['tontines', Users, 'Tontines', 'blue'],
    ['dettes', Handshake, 'Dettes', 'red'], ['portefeuilles', Wallet, 'Porte-monnaie', 'ink'], ['patrimoine', Building2, 'Patrimoine', 'blue'], ['locataires', KeyRound, 'Locataires', 'amber'],
  ];

  return (
    <div className="screen">
      <header className="home-head">
        <div>
          <h1>Foyer</h1>
          <p className="hello">{s.household ? s.household.name : 'Mes finances'}</p>
        </div>
        <div className="row gap-s">
          <SyncBadge />
          <button className="icon-btn" onClick={toggleHide} aria-label={hide ? 'Afficher les montants' : 'Masquer les montants'}>{hide ? <EyeOff size={20} /> : <Eye size={20} />}</button>
        </div>
      </header>

      <div className="mod-grid">
        {mods.map(([k, I, l, c]) => <button key={k} className="mod" onClick={() => go(k)}><span className={`ico ${c}`}><I size={19} /></span>{l}</button>)}
      </div>
      {s.householdId && (
        <Segmented value={scope} onChange={setScope} options={[['tout', 'Tout'], ['perso', '🔒 Perso'], ['foyer', '🏠 Foyer']]} />
      )}
      <MonthNav value={month} onChange={setMonth} />

      <section className="hero">
        <p>Solde de {monthLabel(month).split(' ')[0]} · Foyer</p>
        <h2>{hide ? '••••••' : <>{st.solde >= 0 ? '+' : ''}{money(st.solde)}</>}</h2>
        <div className="hero-row">
          <div><small>Revenus</small><b>{H(st.revenus)}</b></div>
          <div><small>Dépenses</small><b>{H(st.depenses)}</b></div>
        </div>
      </section>

      {al.length > 0 && (
        <section className="card">
          <h3 className="card-t">À surveiller</h3>
          {al.slice(0, 5).map((a, i) => (
            <button key={i} className={`alert-row ${a.level}`} onClick={() => go(a.go)}>
              {a.level === 'info' ? <Info size={18} /> : <AlertTriangle size={18} />}
              <span className="grow">{a.text}</span>
              <b>{H(a.amount)}</b>
            </button>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-h"><h3 className="card-t">Mes porte-monnaie</h3><button className="link" onClick={() => go('portefeuilles')}>Gérer</button></div>
        <p className="big">{H(totalWallets)}</p>
        <div className="wallets">
          {wallets.map((w) => {
            const t = WALLET_TYPES.find((x) => x[0] === w.data.type) || WALLET_TYPES[4];
            return (
              <div className="wallet" key={w.id}>
                <span>{t[2]}</span>
                <small>{w.data.nom}</small>
                <b className={bal[w.id] < 0 ? 'neg' : ''}>{H(bal[w.id] || 0)}</b>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 className="card-t">Dépenses par catégorie</h3>
        {cats.length === 0 ? <p className="muted">Aucune dépense ce mois-ci.</p> : (
          <div className="donut-wrap">
            <Donut data={donut} label={hide ? '••••' : money(st.depenses)} sub={`${cats.length} catégorie${cats.length > 1 ? 's' : ''}`} />
            <ul className="legend">
              {cats.slice(0, 6).map(([n, v]) => (
                <li key={n}><CatBadge name={n} /><span className="grow">{n}</span><b>{st.depenses ? Math.round((v / st.depenses) * 100) : 0} %</b></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {budgets.length > 0 && (
        <section className="card">
          <div className="card-h"><h3 className="card-t">Budgets</h3><button className="link" onClick={() => go('budget')}>Tout voir</button></div>
          {budgets.map((b) => (
            <div className="budget-line" key={b.rec.id}>
              <div className="row"><CatBadge name={b.categorie} /><span className="grow">{b.categorie}</span><small className={b.pct > 1 ? 'neg' : 'muted'}>{H(b.depense)} / {H(b.montant)}</small></div>
              <Progress value={b.pct} danger />
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h3 className="card-t">6 derniers mois</h3>
        <Bars months={months} />
        <div className="legend-inline"><span><i className="dot rev" />Revenus</span><span><i className="dot dep" />Dépenses</span></div>
      </section>


      <button className="fab" onClick={onAdd} aria-label="Ajouter une opération"><Plus size={26} /></button>
      {LOCAL_MODE && <p className="muted center small">Mode test : données enregistrées uniquement sur cet appareil.</p>}
    </div>
  );
}

function SyncBadge() {
  const s = useStore();
  if (LOCAL_MODE) return null;
  const off = s.syncError === 'hors ligne' || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const pending = s.outbox.size;
  return (
    <button className={`sync ${s.syncing ? 'spin' : ''} ${off ? 'off' : ''}`} onClick={() => s.sync()} aria-label="Synchroniser">
      {off ? <CloudOff size={18} /> : <RefreshCw size={18} />}
      {pending > 0 && <span className="badge">{pending}</span>}
    </button>
  );
}
