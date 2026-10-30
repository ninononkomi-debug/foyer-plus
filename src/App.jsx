import React, { useEffect, useRef, useState } from 'react';
import { LayoutDashboard as Home2, ShoppingBag, House, CalendarCheck, ListChecks, Settings as Cog } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { supabase } from './lib/supabase.js';
import { store, useStore } from './lib/store.js';
import { getPrefs, setPrefs } from './lib/security.js';
import { refreshNotifications, requestNotifPermission, ensureExactAlarms } from './lib/notify.js';
import { isNative } from './lib/security.js';
import { LOCAL_MODE } from './config.js';
import { monthKey, today } from './lib/format.js';
import { ToastProvider, ScreenHead } from './components/ui.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Operations, { OperationForm } from './screens/Operations.jsx';
import { Budget, Epargne, Tontines, Patrimoine, Dettes, Portefeuilles } from './screens/Modules.jsx';
import { Locataires } from './screens/Business.jsx';
import Home from './screens/Home.jsx';
import Market from './screens/Market.jsx';
import Agenda from './screens/Agenda.jsx';
import Affectation from './screens/Affectation.jsx';
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
  const [tab, setTab] = useState('home');
  const [tabArg, setTabArg] = useState(null);
  const [sub, setSub] = useState(null);
  const [month, setMonth] = useState(monthKey(today()));
  const [scope, setScope] = useState('tout');
  const [form, setForm] = useState(null);
  const scrollRef = useRef();

  const TABS = { home: 1, market: 1, foyer: 1, agenda: 1, affectation: 1, settings: 1 };
  const go = (k) => {
    const [base, arg] = String(k).split(':');
    if (TABS[base]) { setTab(base); setTabArg(arg || null); setSub(null); }
    else {
      // un module du foyer s'ouvre dans l'onglet Foyer (abonnements → Agenda)
      if (base === 'abonnements') { setTab('agenda'); setTabArg('abos'); setSub(null); }
      else { if (!['settings', 'foyer'].includes(tab)) setTab('foyer'); setSub(base); }
    }
    scrollRef.current?.scrollTo(0, 0);
  };
  const back = () => { setSub(null); scrollRef.current?.scrollTo(0, 0); };
  window.__appBack = () => {
    if (sub) { back(); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    return false;
  };
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [tab]);
  // première ouverture d'Orly : autoriser notifications + alarmes exactes (tâches à l'heure pile)
  useEffect(() => {
    if (!isNative || localStorage.getItem('orly:notifAsked')) return;
    localStorage.setItem('orly:notifAsked', '1');
    (async () => { if (await requestNotifPermission()) await ensureExactAlarms(); refreshNotifications(store); })();
  }, []);
  if (!s.ready) return <Splash />;

  const props = { go, back, month, setMonth, scope, setScope };
  const subs = {
    budget: Budget, epargne: Epargne, tontines: Tontines, patrimoine: Patrimoine,
    dettes: Dettes, portefeuilles: Portefeuilles, locataires: Locataires,
  };
  let screen;
  if (sub === 'ops') screen = <Operations {...props} openForm={(rec) => setForm({ rec })} />;
  else if (sub && subs[sub]) { const C = subs[sub]; screen = <C {...props} />; }
  else if (tab === 'home') screen = <Home go={go} sections={sections} />;
  else if (tab === 'market' && sections.market) screen = <Market go={go} month={month} setMonth={setMonth} />;
  else if (tab === 'foyer') screen = <Dashboard {...props} onAdd={() => setForm({})} />;
  else if (tab === 'agenda') screen = <Agenda key={tabArg || 'jour'} initial={tabArg} />;
  else if (tab === 'affectation' && sections.affectation) screen = <Affectation go={go} showMarket={sections.market} />;
  else if (tab === 'settings') screen = <Settings go={go} onLogout={onLogout} sections={sections} setSections={setSections} />;
  else screen = <Home go={go} sections={sections} />;

  const T = ({ k, icon: I, label }) => (
    <button className={`tab ${tab === k ? 'on' : ''}`} onClick={() => go(k)} aria-label={label} aria-current={tab === k ? 'page' : undefined}>
      <I size={22} /><span>{label}</span>
    </button>
  );
  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <span className="rail-brand" aria-hidden="true">O</span>
        <T k="home" icon={Home2} label="Accueil" />
        {sections.market && <T k="market" icon={ShoppingBag} label="Market" />}
        <T k="foyer" icon={House} label="Foyer" />
        <T k="agenda" icon={CalendarCheck} label="Agenda" />
        {sections.affectation && <T k="affectation" icon={ListChecks} label="Affecter" />}
        <span className="spacer" />
        <T k="settings" icon={Cog} label="Réglages" />
      </nav>
      <main className="content" ref={scrollRef}>{screen}</main>
      {form && <OperationForm rec={form.rec} onClose={() => setForm(null)} />}
    </div>
  );
}
