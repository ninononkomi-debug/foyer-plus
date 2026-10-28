import React, { useEffect, useRef, useState } from 'react';
import { Home, ListOrdered, LayoutGrid, Settings as Cog, Plus } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { supabase } from './lib/supabase.js';
import { store, useStore } from './lib/store.js';
import { getPrefs } from './lib/security.js';
import { refreshNotifications } from './lib/notify.js';
import { LOCAL_MODE } from './config.js';
import { monthKey, today } from './lib/format.js';
import { ToastProvider } from './components/ui.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Operations, { OperationForm } from './screens/Operations.jsx';
import { ModulesHome, Budget, Epargne, Tontines, Abonnements, Patrimoine, Dettes, Portefeuilles } from './screens/Modules.jsx';
import { OrlyMarket, Locataires } from './screens/Business.jsx';
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

const Splash = () => <div className="lock"><span className="logo big">F<b>+</b></span></div>;

function Main({ onLogout }) {
  const s = useStore();
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState(null);
  const [month, setMonth] = useState(monthKey(today()));
  const [scope, setScope] = useState('tout');
  const [form, setForm] = useState(null);
  const scrollRef = useRef();

  const go = (k) => {
    const tabs = { home: 1, ops: 1, modules: 1, settings: 1 };
    if (tabs[k]) { setTab(k); setSub(null); } else setSub(k);
    scrollRef.current?.scrollTo(0, 0);
  };
  const back = () => { setSub(null); scrollRef.current?.scrollTo(0, 0); };
  window.__appBack = () => {
    if (sub) { back(); return true; }
    if (tab !== 'home') { setTab('home'); return true; }
    return false;
  };
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [tab]);
  if (!s.ready) return <Splash />;

  const props = { go, back, month, setMonth, scope, setScope };
  const subs = {
    budget: Budget, epargne: Epargne, tontines: Tontines, abonnements: Abonnements, patrimoine: Patrimoine,
    dettes: Dettes, portefeuilles: Portefeuilles, orlymarket: OrlyMarket, locataires: Locataires,
  };
  let screen;
  if (sub && subs[sub]) { const C = subs[sub]; screen = <C {...props} />; }
  else if (tab === 'home') screen = <Dashboard {...props} />;
  else if (tab === 'ops') screen = <Operations {...props} openForm={(rec) => setForm({ rec })} />;
  else if (tab === 'modules') screen = <ModulesHome go={go} />;
  else screen = <Settings go={go} onLogout={onLogout} />;

  const T = ({ k, icon, label }) => (
    <button className={tab === k && !sub ? 'on' : tab === k ? 'half' : ''} onClick={() => go(k)} aria-label={label}>
      {icon}<span>{label}</span>
    </button>
  );
  return (
    <div className="app">
      <main className="content" ref={scrollRef}>{screen}</main>
      <nav className="tabbar">
        <T k="home" icon={<Home size={22} />} label="Accueil" />
        <T k="ops" icon={<ListOrdered size={22} />} label="Opérations" />
        <button className="add" onClick={() => setForm({})} aria-label="Ajouter une opération"><Plus size={28} /></button>
        <T k="modules" icon={<LayoutGrid size={22} />} label="Modules" />
        <T k="settings" icon={<Cog size={22} />} label="Réglages" />
      </nav>
      {form && <OperationForm rec={form.rec} onClose={() => setForm(null)} />}
    </div>
  );
}
