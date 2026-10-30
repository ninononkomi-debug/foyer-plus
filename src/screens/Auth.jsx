import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { supabase, frError } from '../lib/supabase.js';
import { Field } from '../components/ui.jsx';
import { isNative } from '../lib/security.js';

const WEB_URL = import.meta.env.VITE_WEB_URL || '';

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', pass: '', pass2: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    const email = f.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ t: 'err', m: 'Adresse e-mail invalide.' });
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: f.pass });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (!f.name.trim()) throw new Error('Indiquez votre prénom.');
        if (f.pass.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        if (f.pass !== f.pass2) throw new Error('Les deux mots de passe ne correspondent pas.');
        const { data, error } = await supabase.auth.signUp({ email, password: f.pass, options: { data: { display_name: f.name.trim() }, emailRedirectTo: WEB_URL || window.location.origin } });
        if (error) throw error;
        if (!data.session) { setMsg({ t: 'ok', m: `Compte créé ! Ouvrez l'e-mail envoyé à ${email} et cliquez sur le lien de confirmation, puis revenez vous connecter.` }); setMode('login'); }
      } else {
        const redirectTo = isNative ? WEB_URL : window.location.origin + window.location.pathname;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMsg({ t: 'ok', m: 'E-mail envoyé. Cliquez sur le lien reçu pour choisir un nouveau mot de passe, puis reconnectez-vous ici.' });
        setMode('login');
      }
    } catch (err) {
      setMsg({ t: 'err', m: frError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-top">
        <span className="logo big brand-o">O</span>
        <h1 className="wordmark">Orly</h1>
        <p>Mon commerce, mon foyer, mes journées. Tout au même endroit.</p>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Connexion' : mode === 'signup' ? 'Créer mon compte' : 'Mot de passe oublié'}</h2>
        {mode === 'signup' && <Field label="Prénom"><input value={f.name} onChange={up('name')} autoComplete="given-name" /></Field>}
        <Field label="E-mail"><input type="email" value={f.email} onChange={up('email')} autoComplete="email" inputMode="email" /></Field>
        {mode !== 'reset' && (
          <Field label="Mot de passe">
            <div className="pass">
              <input type={show ? 'text' : 'password'} value={f.pass} onChange={up('pass')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label="Afficher le mot de passe">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </Field>
        )}
        {mode === 'signup' && <Field label="Confirmer le mot de passe"><input type={show ? 'text' : 'password'} value={f.pass2} onChange={up('pass2')} autoComplete="new-password" /></Field>}
        {msg && <div className={`alert ${msg.t === 'err' ? 'danger' : 'ok'}`}>{msg.m}</div>}
        <button className="btn primary full" disabled={busy}>{busy ? 'Patientez…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Recevoir le lien'}</button>
        {mode === 'login' && <button type="button" className="link center" onClick={() => setMode('reset')}>Mot de passe oublié ?</button>}
        <div className="auth-switch">
          {mode === 'login' ? <>Pas encore de compte ? <button type="button" className="link" onClick={() => { setMode('signup'); setMsg(null); }}>Créer un compte</button></>
            : <button type="button" className="link" onClick={() => { setMode('login'); setMsg(null); }}>← Retour à la connexion</button>}
        </div>
      </form>
      <p className="secure"><ShieldCheck size={16} /> Données chiffrées · Chaque compte est protégé</p>
    </div>
  );
}

export function NewPasswordScreen({ onDone }) {
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [msg, setMsg] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    if (p.length < 8) return setMsg('8 caractères minimum.');
    if (p !== p2) return setMsg('Les mots de passe ne correspondent pas.');
    const { error } = await supabase.auth.updateUser({ password: p });
    if (error) return setMsg(frError(error));
    onDone();
  };
  return (
    <div className="auth">
      <div className="auth-top"><span className="logo big brand-o">O</span><h1>Nouveau mot de passe</h1></div>
      <form className="auth-card" onSubmit={save}>
        <Field label="Nouveau mot de passe"><input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirmer"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
        {msg && <div className="alert danger">{msg}</div>}
        <button className="btn primary full">Enregistrer</button>
      </form>
    </div>
  );
}
