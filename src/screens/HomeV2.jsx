import React, { useEffect, useState } from 'react';
import {
  Bell, Settings, Crown, Wallet, CalendarClock, Users, PiggyBank, FileText, Mail, House, KeyRound, Handshake,
  CalendarDays, CalendarCog, ClipboardList, ReceiptText, BarChart3, ListChecks, LogIn, ChevronRight, Star, ArrowUp, ArrowDown, ArrowRight, Eye, EyeOff,
} from 'lucide-react';
import { useStore } from '../lib/store.js';
import { money, today, num } from '../lib/format.js';
import { tasksOn, lateTasks, isDone } from '../lib/agenda.js';
import { seedFoyer } from './FoyerV2.jsx';
import { marketCards, foyerCards, marketDonut, foyerDonut, topClients, alertes } from '../lib/overview.js';
import UpdateBanner from '../components/UpdateBanner.jsx';
import avatar from '../assets/orly-avatar.jpg';

const AV_COLORS = [['#DCEBFF', '#2E7CF6'], ['#EBDDFB', '#7B2FBE'], ['#FFE3D3', '#E8590C']];

export const TILES = [
  { k: 'market:factures', label: 'Factures', I: FileText, c: '#7B2FBE', bg: 'linear-gradient(160deg,#F6EEFF,#EBDDFB)', market: true },
  { k: 'market:clientes', label: 'Clients', I: Users, c: '#2E5BD8', bg: 'linear-gradient(160deg,#EEF4FF,#DCE8FF)', market: true },
  { k: 'market:caisses', label: 'Enveloppe', I: Mail, c: '#E6337A', bg: 'linear-gradient(160deg,#FFF0F6,#FFDDEB)', market: true },
  { k: 'foyer:budget', label: 'Foyer', I: House, c: '#F28C1B', bg: 'linear-gradient(160deg,#FFF6EA,#FFE7C7)' },
  { k: 'foyer:loyer', label: 'Loyer', I: KeyRound, c: '#16A34A', bg: 'linear-gradient(160deg,#EEFBF1,#D6F3DE)' },
  { k: 'foyer:dettes', label: 'Dettes', I: Handshake, c: '#7B2FBE', bg: 'linear-gradient(160deg,#F6EEFF,#EBDDFB)' },
  { k: 'foyer:tontines', label: 'Tontines', I: Users, c: '#16A34A', bg: 'linear-gradient(160deg,#EEFBF1,#D6F3DE)' },
  { k: 'foyer:epargne', label: 'Épargne', I: PiggyBank, c: '#E6337A', bg: 'linear-gradient(160deg,#FFF0F6,#FFDDEB)' },
  { k: 'agenda:jour', label: 'Agenda', I: CalendarDays, c: '#2E5BD8', bg: 'linear-gradient(160deg,#EEF4FF,#DCE8FF)' },
  { k: 'agenda:abos', label: 'Abonnements', I: CalendarCog, c: '#8B3FD9', bg: 'linear-gradient(160deg,#F6EEFF,#EBDDFB)' },
  { k: 'besoins', label: 'Besoins', I: ClipboardList, c: '#16A34A', bg: 'linear-gradient(160deg,#EEFBF1,#D6F3DE)' },
  { k: 'journal', label: 'Encaissements & Dépenses', I: ReceiptText, c: '#E6337A', bg: 'linear-gradient(160deg,#FFF0F6,#FFDDEB)' },
  { k: 'rapports', label: 'Rapports', I: BarChart3, c: '#2E5BD8', bg: 'linear-gradient(160deg,#EEF4FF,#DCE8FF)' },
  { k: 'taches', label: 'Liste des tâches', I: ListChecks, c: '#7B2FBE', bg: 'linear-gradient(160deg,#F6EEFF,#EBDDFB)' },
  { k: 'profil', label: 'Plus d’options', I: LogIn, c: '#F28C1B', bg: 'linear-gradient(160deg,#FFF6EA,#FFE7C7)' },
];

export function Donut({ items, size = 108, center }) {
  const total = items.reduce((x, i) => x + i.v, 0);
  const useV = total > 0;
  const vals = items.map((i) => (useV ? i.v : num(i.pct) || 1));
  const sum = vals.reduce((x, v) => x + v, 0) || 1;
  const r = 38, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Répartition">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#F1EAF5" strokeWidth="18" />
      {vals.map((v, i) => {
        const len = (v / sum) * C;
        const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={items[i].color} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 1.2)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />;
        off += len;
        return el;
      })}
      <text x="50" y="55" textAnchor="middle" fontSize="15" fontWeight="800" fill="#2A1A3A">{center}</text>
    </svg>
  );
}

function Kpi({ I, ico, bg, title, value, sub, color, arrow, onClick, cls = '' }) {
  return (
    <button className={`mk-kpi ${cls}`} style={{ background: bg }} onClick={onClick}>
      <I size={26} color={ico} strokeWidth={2.2} />
      <small>{title}</small>
      <b style={color ? { color } : undefined}>{value}</b>
      {sub && <span className="mk-sub" style={{ color: arrow?.color }}>{arrow?.I && <arrow.I size={13} strokeWidth={2.6} />} {sub}</span>}
    </button>
  );
}

export default function HomeV2({ go, sections }) {
  const s = useStore();
  const isOrly = sections.market;
  const [ctx, setCtx] = useState(() => (isOrly ? (localStorage.getItem('orly:ctx') || 'market') : 'foyer'));
  const [hide, setHide] = useState(() => localStorage.getItem('fp:hide') === '1');
  const H = (v) => (hide ? '••••••' : money(v));
  useEffect(() => { if (isOrly && s.ready) seedFoyer(s); }, [s.ready, s.lastSyncAt]);
  const setC = (c) => { setCtx(c); try { localStorage.setItem('orly:ctx', c); } catch (e) { /* */ } };
  const me = s.profiles[s.user?.id]?.display_name || s.user?.user_metadata?.display_name || (isOrly ? 'Orly' : '');
  const t0 = today();
  const todo = [...lateTasks(s), ...tasksOn(s, t0).filter((t) => !isDone(t, t0))];
  const nbAlert = alertes(s, sections).length;
  const view = isOrly ? ctx : 'foyer';

  let cards, donut, donutTitle;
  if (view === 'market') {
    const c = marketCards(s);
    const ev = c.solde.evol;
    cards = [
      <Kpi key="1" I={Wallet} ico="#16A34A" bg="linear-gradient(160deg,#F0FBF2,#DDF4E3)" title="Solde disponible" value={H(c.solde.v)} sub={ev === null ? c.solde.sub : `${ev >= 0 ? '+' : ''}${ev} %`} arrow={ev === null ? null : { I: ev >= 0 ? ArrowUp : ArrowDown, color: ev >= 0 ? '#16A34A' : '#DC2626' }} onClick={() => go('journal')} />,
      <Kpi key="2" I={CalendarClock} ico="#E6337A" bg="linear-gradient(160deg,#FFF1F6,#FFE0EC)" title="Factures en attente" value={c.attente.n} color="#E11D48" sub={H(c.attente.v)} arrow={{ I: ArrowRight, color: '#E11D48' }} onClick={() => go('market:factures')} />,
      <Kpi key="3" I={Users} ico="#7B2FBE" bg="linear-gradient(160deg,#F6F0FF,#E9DEFA)" title="Clients actifs" value={c.clients.n} sub={H(c.clients.v)} arrow={{ I: ArrowRight, color: '#7B2FBE' }} onClick={() => go('market:clientes')} />,
      <Kpi key="4" I={PiggyBank} ico="#F28C1B" bg="linear-gradient(160deg,#FFF7EC,#FFE9CC)" title="Mon épargne" value={H(c.epargne.v)} sub={c.epargne.sub} arrow={{ I: ArrowUp, color: '#E8590C' }} onClick={() => go('market:caisses')} />,
    ];
    donut = marketDonut(s); donutTitle = 'Répartition de mes enveloppes';
  } else {
    const c = foyerCards(s);
    cards = [
      <Kpi key="1" cls={`st-${c.solde.lvl}`} I={Wallet} ico={c.solde.lvl === 'red' ? '#DC2626' : c.solde.lvl === 'orange' ? '#D97706' : c.solde.lvl === 'wait' ? '#64748B' : '#16A34A'} bg="#fff" title="Reste libre" value={c.solde.lvl === 'wait' ? '—' : H(c.solde.v)} color={c.solde.lvl === 'red' ? '#B91C1C' : c.solde.lvl === 'orange' ? '#C2410C' : c.solde.lvl === 'green' ? '#15803D' : '#475569'} sub={c.solde.sub} arrow={{ I: c.solde.lvl === 'red' ? ArrowDown : ArrowUp, color: c.solde.lvl === 'red' ? '#B91C1C' : c.solde.lvl === 'orange' ? '#C2410C' : c.solde.lvl === 'wait' ? '#475569' : '#15803D' }} onClick={() => go('foyer:budget')} />,
      <Kpi key="2" I={CalendarClock} ico="#E6337A" bg="linear-gradient(160deg,#FFF1F6,#FFE0EC)" title="Charges à régler" value={c.charges.n} color="#E11D48" sub={H(c.charges.v)} arrow={{ I: ArrowRight, color: '#E11D48' }} onClick={() => go('foyer:budget')} />,
      <Kpi key="3" I={Users} ico="#7B2FBE" bg="linear-gradient(160deg,#F6F0FF,#E9DEFA)" title="Tontines en cours" value={c.tontines.n} sub={H(c.tontines.v)} arrow={{ I: ArrowRight, color: '#7B2FBE' }} onClick={() => go('foyer:tontines')} />,
      <Kpi key="4" I={PiggyBank} ico="#F28C1B" bg="linear-gradient(160deg,#FFF7EC,#FFE9CC)" title="Mon épargne" value={H(c.epargne.v)} sub={c.epargne.sub} arrow={{ I: ArrowUp, color: '#E8590C' }} onClick={() => go('foyer:epargne')} />,
    ];
    donut = foyerDonut(s); donutTitle = 'Mes enveloppes du foyer';
  }
  const totalDonut = donut.reduce((x, d) => x + d.v, 0);
  const tops = view === 'market' ? topClients(s) : null;
  const dettes = view === 'foyer' ? s.list('dette').map((d) => ({ d, r: Math.max(0, num(d.data.montant) - (d.data.remboursements || []).reduce((x, y) => x + num(y.montant), 0)) })).filter((x) => x.r > 0).sort((a, b) => b.r - a.r).slice(0, 3) : null;

  return (
    <div className="home2">
      <header className="h2-head">
        {isOrly ? <img className="h2-av" src={avatar} alt="" /> : <span className="h2-av letter">{(me || '?')[0].toUpperCase()}</span>}
        <div className="grow">
          <h1>Bonjour{me ? ` ${me.split(' ')[0]}` : ''} ! <Crown size={22} color="#E8A93A" fill="#F5C451" strokeWidth={1.6} /></h1>
          <p className="h2-tag">Gérez mieux, vivez sereinement !</p>
        </div>
        <button className="h2-ico" onClick={() => { localStorage.setItem('fp:hide', hide ? '0' : '1'); setHide(!hide); }} aria-label={hide ? 'Afficher les montants' : 'Masquer les montants'}>{hide ? <EyeOff size={22} /> : <Eye size={22} />}</button>
        <button className="h2-ico" onClick={() => go('notifs')} aria-label="Notifications"><Bell size={24} />{nbAlert > 0 && <i className="h2-badge">{nbAlert}</i>}</button>
        <button className="h2-ico" onClick={() => go('profil')} aria-label="Réglages"><Settings size={24} /></button>
      </header>

      <UpdateBanner />

      {isOrly && (
        <div className="h2-switch">
          <button className={view === 'market' ? 'on' : ''} onClick={() => setC('market')}>OrlyMarket</button>
          <button className={view === 'foyer' ? 'on' : ''} onClick={() => setC('foyer')}>Foyer</button>
        </div>
      )}

      <div className="mk-kpis">{cards}</div>

      <div className="h2-row">
        <button className="h2-card" onClick={() => go(view === 'market' ? 'market:caisses' : 'foyer:epargne')}>
          <div className="h2-card-h"><span><BarChart3 size={18} color="#F28C1B" /> {donutTitle}</span><span className="h2-more">Voir plus <ChevronRight size={14} /></span></div>
          <div className="h2-donut">
            <Donut items={donut} center={totalDonut > 0 ? (hide ? '•••' : `${Math.round(totalDonut / 1000)}k`) : '100%'} />
            <ul>
              {donut.map((d) => (
                <li key={d.k}><i style={{ background: d.color }} />{d.label} : <b>{d.pct !== undefined && !totalDonut ? `${d.pct}%` : totalDonut ? (d.pct !== undefined ? `${d.pct}%` : H(d.v)) : H(d.v)}</b>{totalDonut > 0 && d.pct !== undefined && <small> · {H(d.v)}</small>}</li>
              ))}
            </ul>
          </div>
        </button>
        {view === 'market' ? (
          <button className="h2-card" onClick={() => go('market:clientes')}>
            <div className="h2-card-h"><span><Star size={18} color="#F5B301" fill="#F5C451" /> Mes meilleurs clients</span><span className="h2-more">Voir plus <ChevronRight size={14} /></span></div>
            {tops.length === 0 ? <p className="muted small">Vos meilleures clientes apparaîtront ici.</p> : (
              <div className="h2-tops">
                {tops.map(({ c, total }, i) => (
                  <div key={c.id} className="h2-top">
                    <span className="h2-top-av" style={{ background: AV_COLORS[i][0], color: AV_COLORS[i][1] }}>{(c.data.nom || '?')[0].toUpperCase()}</span>
                    <small>{c.data.nom.length > 14 ? `${c.data.nom.slice(0, 13)}…` : c.data.nom}</small>
                    <b>{H(total)}</b>
                  </div>
                ))}
              </div>
            )}
          </button>
        ) : (
          <button className="h2-card" onClick={() => go('foyer:dettes')}>
            <div className="h2-card-h"><span><Handshake size={18} color="#7B2FBE" /> Dettes en cours</span><span className="h2-more">Voir plus <ChevronRight size={14} /></span></div>
            {dettes.length === 0 ? <p className="muted small">Aucune dette en cours.</p> : (
              <div className="h2-tops">
                {dettes.map(({ d, r }, i) => (
                  <div key={d.id} className="h2-top">
                    <span className="h2-top-av" style={{ background: AV_COLORS[i][0], color: AV_COLORS[i][1] }}>{(d.data.personne || '?')[0].toUpperCase()}</span>
                    <small>{(d.data.type || 'dette') === 'dette' ? 'Je dois à' : 'Me doit'} {d.data.personne}</small>
                    <b style={{ color: (d.data.type || 'dette') === 'dette' ? '#DC2626' : '#16A34A' }}>{H(r)}</b>
                  </div>
                ))}
              </div>
            )}
          </button>
        )}
      </div>

      <div className="h2-tiles">
        {TILES.filter((t) => isOrly || !t.market).map(({ k, label, I, c, bg }) => (
          <button key={k} className="h2-tile" style={{ background: bg }} onClick={() => go(k)}>
            <I size={30} color={c} strokeWidth={2} fill={`${c}33`} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <button className="h2-next" onClick={() => go('taches')}>
        <span className="h2-next-ico"><CalendarDays size={24} color="#E6337A" /></span>
        <div className="grow">
          <b>Prochaines tâches</b>
          {todo.length === 0 ? <small>Rien de prévu aujourd'hui</small> : todo.slice(0, 2).map((t) => <small key={t.id}><i />{t.data.heure ? `${t.data.heure} · ` : ''}{t.data.titre}</small>)}
        </div>
        <span className="h2-pill">Aujourd'hui <ChevronRight size={16} /></span>
      </button>
    </div>
  );
}
