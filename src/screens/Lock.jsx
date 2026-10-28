import React, { useEffect, useState } from 'react';
import { Delete, Fingerprint } from 'lucide-react';
import { getPrefs, setPrefs, verifyPin, setPin, biometryAvailable, biometryAuth } from '../lib/security.js';

export function PinPad({ title, sub, onDone, error, extra, len = 4 }) {
  const [pin, setPinV] = useState('');
  const [shake, setShake] = useState(false);
  useEffect(() => { if (error) { setShake(true); setPinV(''); const t = setTimeout(() => setShake(false), 400); return () => clearTimeout(t); } }, [error]);
  const press = (d) => {
    if (pin.length >= len) return;
    const p = pin + d;
    setPinV(p);
    if (p.length === len) setTimeout(() => { onDone(p); setPinV(''); }, 120);
  };
  useEffect(() => {
    const h = (e) => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') setPinV((p) => p.slice(0, -1)); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="pinpad">
      <h2>{title}</h2>
      {sub && <p className="muted">{sub}</p>}
      <div className={`dots ${shake ? 'shake' : ''}`}>{Array.from({ length: len }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      <p className="err-t">{error || ' '}</p>
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <span>{extra}</span>
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPinV(pin.slice(0, -1))} aria-label="Effacer"><Delete size={22} /></button>
      </div>
    </div>
  );
}

export function LockScreen({ user, onUnlock, onLogout }) {
  const prefs = getPrefs(user.id);
  const [err, setErr] = useState(null);
  const [bio, setBio] = useState(false);
  const tryBio = async () => { if (await biometryAuth()) { setPrefs(user.id, { failed: 0 }); onUnlock(); } };
  useEffect(() => {
    if (prefs.bio) biometryAvailable().then((ok) => { setBio(ok); if (ok) tryBio(); });
  }, []);
  return (
    <div className="lock">
      <div className="brand"><span className="logo">F<b>+</b></span></div>
      <PinPad title="Entrez votre code" sub={user.user_metadata?.display_name ? `Bonjour ${user.user_metadata.display_name}` : null} error={err}
        extra={bio ? <button className="bio" onClick={tryBio} aria-label="Empreinte"><Fingerprint size={28} /></button> : null}
        onDone={async (pin) => {
          if (await verifyPin(user.id, pin)) { onUnlock(); return; }
          const f = getPrefs(user.id).failed;
          if (f >= 5) { setPrefs(user.id, { failed: 0 }); onLogout(true); return; }
          setErr(`Code incorrect (${5 - f} essai${5 - f > 1 ? 's' : ''} restant${5 - f > 1 ? 's' : ''})`);
        }} />
      <button className="link" onClick={() => onLogout(false)}>Code oublié ? Se reconnecter</button>
    </div>
  );
}

export function PinSetup({ user, onDone }) {
  const [first, setFirst] = useState(null);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState('pin');
  const [bioOk, setBioOk] = useState(false);
  useEffect(() => { biometryAvailable().then(setBioOk); }, []);
  if (step === 'bio') {
    return (
      <div className="lock">
        <div className="brand"><Fingerprint size={64} /></div>
        <h2>Utiliser votre empreinte ?</h2>
        <p className="muted center">Déverrouillez Foyer+ d'un simple toucher. Le code PIN reste disponible.</p>
        <button className="btn primary full" onClick={async () => { if (await biometryAuth()) setPrefs(user.id, { bio: true }); onDone(); }}>Activer l'empreinte</button>
        <button className="btn ghost full" onClick={onDone}>Plus tard</button>
      </div>
    );
  }
  return (
    <div className="lock">
      <div className="brand"><span className="logo">F<b>+</b></span></div>
      <PinPad title={first ? 'Confirmez votre code' : 'Créez votre code secret'} sub="4 chiffres, demandés à chaque ouverture" error={err}
        onDone={async (pin) => {
          if (!first) { setFirst(pin); setErr(null); return; }
          if (pin !== first) { setFirst(null); setErr('Les codes ne correspondent pas, recommencez'); return; }
          await setPin(user.id, pin);
          if (bioOk) setStep('bio'); else onDone();
        }} />
    </div>
  );
}
