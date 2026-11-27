import React, { useEffect, useRef, useState } from 'react';
import { House as Home2, BarChart3, Bell, User, ChevronLeft } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { supabase } from './lib/supabase.js';
import { store, useStore } from './lib/store.js';
import { getPrefs, setPrefs } from './lib/security.js';
import { refreshNotifications, requestNotifPermission, ensureExactAlarms, notifyPartnerChanges } from './lib/notify.js';
store.onPartnerChange = (changes) => notifyPartnerChanges(store, changes);
import { isNative } from './lib/security.js';
import { LOCAL_MODE } from './config.js';
import { monthKey, today } from './lib/format.js';
import { ToastProvider, ScreenHead } from './components/ui.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Operations, { OperationForm } from './screens/Operations.jsx';
import { Budget, Epargne, Tontines, Patrimoine, Dettes, Portefeuilles } from './screens/Modules.jsx';
import { Locataires } from './screens/Business.jsx';
import HomeV2 from './screens/HomeV2.jsx';
import { Journal, Rapports, Notifs, Taches } from './screens/Extras.jsx';
import { alertes } from './lib/overview.js';
import Market from './screens/Market.jsx';
import Agenda from './screens/Agenda.jsx';
import FoyerV2, { normaliserFoyer } from './screens/FoyerV2.jsx';
import Besoins from './screens/Besoins.jsx';
import Settings, { usePrefs } from './screens/Settings.jsx';
import { AuthScreen, NewPasswordScreen } from './screens/Auth.jsx';
import { LockScreen, PinSetup } from './screens/Lock.jsx';

const LOCAL_USER = { id: 'local', local: true, email: '', user_metadata: {} };

export default function App() {
  const [user, setUser] = useState(LOCAL_MODE ? LOCAL_USER : undefined);
  const [recovery, setRecovery] = useState(false);
  const [locked, setLocked] = useState(true);
  const [needPin, setNeedPin] = useState(false);
  const hiddenAt = useRef(null);

  // Session
  useEffect(() => {
    if (LOCAL_MODE) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      if (evt === 'PASSWORD_RECOVERY') setRecovery(true);
      setUser((u) => {
        const n = sess?.user || null;
        return u?.id === n?.id ? (u || n) : n;
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Chargement des données de l'utilisateur
  useEffect(() => {
    if (!user) { setLocked(true); return; }
    store.init(user);
    const p = getPrefs(user.id);
    setNeedPin(!p.pinHash);
    setLocked(!!p.pinHash);
  }, [user?.id]);

  // Verrouillage auto, synchro et notifications
  useEffect(() => {
    if (!user) return;
    const onHide = () => { hiddenAt.current = Date.now(); };
    const onShow = () => {
      const p = getPrefs(user.id);
      if (p.pinHash && hiddenAt.current && Date.now() - hiddenAt.current >= p.lockDelay * 1000) setLocked(true);
      hiddenAt.current = null;
      store.sync();
    };
    const vis = () => (document.hidden ? onHide() : onShow());
    document.addEventListener('visibilitychange', vis);
    let l1, l2;
    CapApp.addListener('appStateChange', ({ isActive }) => (isActive ? onShow() : onHide())).then((h) => { l1 = h; }).catch(() => {});
    CapApp.addListener('backButton', () => {
      if (window.__sheetClose) return window.__sheetClose();
      if (window.__appBack && window.__appBack()) return;
      CapApp.minimizeApp();
    }).then((h) => { l2 = h; }).catch(() => {});
    const online = () => store.sync();
    window.addEventListener('online', online);
    const iv = setInterval(() => store.sync(), 120000);
    const unsub = store.subscribe(() => refreshNotifications(store));
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', online);
      clearInterval(iv);
      unsub();
      l1?.remove(); l2?.remove();
    };
  }, [user?.id]);

  const logout = async (wipe) => {
    await store.logoutClear(wipe);
    if (!LOCAL_MODE) await supabase.auth.signOut();
    setLocked(true);
  };

  let content;
  if (user === undefined) content = <Splash />;
  else if (recovery) content = <NewPasswordScreen onDone={() => setRecovery(false)} />;
  else if (!user) content = <AuthScreen />;
  else if (needPin) content = <PinSetup user={user} onDone={() => { setNeedPin(false); setLocked(false); }} />;
  else if (locked) content = <LockScreen user={user} onUnlock={() => setLocked(false)} onLogout={logout} />;
  else content = <Main onLogout={() => logout(false)} />;

  return (
    <ThemeRoot userId={user?.id}>
      <ToastProvider>{content}</ToastProvider>
    </ThemeRoot>
  );
}

function ThemeRoot({ userId, children }) {
  const prefs = usePrefs(userId || 'none');
  useEffect(() => {
    const t = userId ? prefs.theme : 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [prefs.theme, userId]);
  return children;
}

const Splash = () => <div className="lock"><span className="logo big brand-o">O</span></div>;

function useSections(s) {
  const prefs = usePrefs(s.user?.id || 'none');
  const myRole = s.members.find((m) => m.household_id === s.householdId && m.user_id === s.user?.id)?.role;
  const isGuest = !!s.householdId && myRole && myRole !== 'admin';
  const def = { market: !isGuest, affectation: !isGuest };
  const sections = { ...def, ...(prefs.sections || {}) };
  const setSections = (v) => setPrefs(s.user.id, { sections: v });
  return [sections, setSections];
}

function Main({ onLogout }) {
  const s = useStore();
  const [sections, setSections] = useSections(s);
  const [page, setPage] = useState('home');
  const [arg, setArg] = useState(null);
  const [month, setMonth] = useState(monthKey(today()));
  const [form, setForm] = useState(null);
  const scrollRef = useRef();

  const PAGES = { home: 1, market: 1, foyer: 1, agenda: 1, besoins: 1, journal: 1, rapports: 1, notifs: 1, profil: 1, taches: 1, settings: 1 };
  const go = (k) => {
    let [base, a] = String(k).split(':');
    if (base === 'settings') base = 'profil';
    if (base === 'abonnements') { base = 'agenda'; a = 'abos'; }
    if (!PAGES[base]) { const map = { dettes: 'dettes', tontines: 'tontines', locataires: 'loyer', epargne: 'epargne' }; a = map[base] || 'budget'; base = 'foyer'; }
    if (base === 'market' && !sections.market) base = 'home';
    setPage(base); setArg(a || null);
    scrollRef.current?.scrollTo(0, 0);
  };
  window.__appBack = () => { if (page !== 'home') { setPage('home'); return true; } return false; };
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [page, arg]);
  useEffect(() => { try { if (s.ready) normaliserFoyer(s); } catch (e) { console.warn('normaliser', e); } }, [s.ready, s.lastSyncAt]);
  useEffect(() => {
    if (!isNative || localStorage.getItem('orly:notifAsked')) return;
    localStorage.setItem('orly:notifAsked', '1');
    (async () => { if (await requestNotifPermission()) await ensureExactAlarms(); refreshNotifications(store); })();
  }, []);
  if (!s.ready) return <Splash />;

  const nbAlert = alertes(s, sections).length;
  let screen;
  if (page === 'market') screen = <Market key={arg || 'f'} go={go} month={month} setMonth={setMonth} initial={arg} />;
  else if (page === 'foyer') screen = <FoyerV2 key={arg || 'budget'} initial={arg} isOrly={sections.market} />;
  else if (page === 'agenda') screen = <Agenda key={arg || 'jour'} initial={arg} />;
  else if (page === 'besoins') screen = <Besoins />;
  else if (page === 'journal') screen = <Journal sections={sections} onAdd={() => setForm({})} />;
  else if (page === 'rapports') screen = <Rapports sections={sections} />;
  else if (page === 'notifs') screen = <Notifs go={go} sections={sections} />;
  else if (page === 'taches') screen = <Taches go={go} />;
  else if (page === 'profil') screen = <Settings go={go} onLogout={onLogout} sections={sections} setSections={setSections} />;
  else screen = <HomeV2 go={go} sections={sections} />;

  const NAV = [['home', Home2, 'Accueil'], ['rapports', BarChart3, 'Rapports'], ['notifs', Bell, 'Notifications'], ['profil', User, 'Profil']];
  const isMain = NAV.some((n) => n[0] === page);
  return (
    <div className="shell2">
      <div className="waves" aria-hidden="true">
        <svg className="wave-top" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M180 0 C 260 40, 330 10, 400 60 L400 0 Z" fill="url(#wg1)" /><path d="M210 0 C 280 34, 340 6, 400 44" fill="none" stroke="#E8B04A" strokeWidth="2.5" /><defs><linearGradient id="wg1" x1="0" x2="1"><stop offset="0" stopColor="#B04FE0" /><stop offset="1" stopColor="#6A1FB0" /></linearGradient></defs></svg>
        <svg className="wave-bottom" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 120 L0 50 C 80 90, 140 70, 220 120 Z" fill="url(#wg2)" /><path d="M0 64 C 80 100, 150 82, 230 120" fill="none" stroke="#E8B04A" strokeWidth="2.5" /><defs><linearGradient id="wg2" x1="0" x2="1"><stop offset="0" stopColor="#6A1FB0" /><stop offset="1" stopColor="#C04BD8" /></linearGradient></defs></svg>
      </div>
      <main className="content2" ref={scrollRef}>
        {!isMain && <button className="back-home" onClick={() => go('home')}><ChevronLeft size={18} /> Accueil</button>}
        {screen}
      </main>
      <nav className="botnav" aria-label="Navigation">
        {NAV.map(([k, I, l]) => (
          <button key={k} className={page === k ? 'on' : ''} onClick={() => go(k)} aria-current={page === k ? 'page' : undefined}>
            <span className="bn-ico"><I size={24} />{k === 'notifs' && nbAlert > 0 && <i className="h2-badge">{nbAlert}</i>}</span>
            <span>{l}</span>
          </button>
        ))}
      </nav>
      {form && <OperationForm rec={form.rec} onClose={() => setForm(null)} />}
    </div>
  );
}
