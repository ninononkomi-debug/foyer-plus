import React, { useEffect, useState } from 'react';
import { ChevronRight, LogOut, Copy, Share2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import { useStore } from '../lib/store.js';
import { supabase, frError } from '../lib/supabase.js';
import { getPrefs, setPrefs, setPin, biometryAvailable, biometryAuth, isNative } from '../lib/security.js';
import { refreshNotifications, requestNotifPermission, ensureExactAlarms } from '../lib/notify.js';
import UpdateBanner from '../components/UpdateBanner.jsx';
import avatar from '../assets/orly-avatar.jpg';
import { exportExcel, exportPdf } from '../lib/export.js';
import { LOCAL_MODE, APP_VERSION } from '../config.js';
import { monthKey, today, monthLabel } from '../lib/format.js';
import { ScreenHead, Sheet, Field, Segmented, useToast, RecordForm, Confirm, MonthNav } from '../components/ui.jsx';
import { PinPad } from './Lock.jsx';

export default function Settings({ go, onLogout, sections, setSections }) {
  const s = useStore();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const prefs = usePrefs(s.user.id);
  const me = s.profiles[s.user.id]?.display_name || s.user.user_metadata?.display_name || '';

  const Row = ({ icon, label, value, onClick }) => (
    <button className="item" onClick={onClick}>
      <span className="emoji">{icon}</span>
      <div className="grow item-main"><b>{label}</b>{value && <small>{value}</small>}</div>
      <ChevronRight size={18} />
    </button>
  );

  return (
    <div className="screen">
      <ScreenHead title="Réglages" />
      <div className="profile-card">
        {sections.market ? <img className="photo-av" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} src={avatar} alt="" /> : <div className="avatar">{(me || s.user.email || '?')[0].toUpperCase()}</div>}
        <div className="grow"><b>{me || 'Mon profil'}</b><small>{LOCAL_MODE ? 'Mode test (sans compte)' : s.user.email}</small></div>
      </div>

      <h3 className="sec-t">Compte & foyer</h3>
      <div className="card list">
        {!LOCAL_MODE && <Row icon="👤" label="Mon profil" value={me} onClick={() => setSheet('profil')} />}
        {!LOCAL_MODE && <Row icon="🏠" label="Mon foyer" value={s.household ? `${s.household.name} · ${s.members.filter((m) => m.household_id === s.householdId).length} membre(s)` : 'Inviter mon conjoint'} onClick={() => setSheet('foyer')} />}
        <Row icon="🏷️" label="Catégories" value="Dépenses et sources de revenus" onClick={() => setSheet('categories')} />
        <Row icon="👛" label="Porte-monnaie" onClick={() => go('portefeuilles')} />
      </div>

      <h3 className="sec-t">Sécurité</h3>
      <div className="card list">
        <Row icon="🔐" label="Code PIN et empreinte" value={prefs.bio ? 'Empreinte activée' : 'Code PIN'} onClick={() => setSheet('securite')} />
        {!LOCAL_MODE && <Row icon="🔑" label="Changer le mot de passe" onClick={() => setSheet('password')} />}
      </div>

      <h3 className="sec-t">Préférences</h3>
      <div className="card list">
        <Row icon="🔔" label="Notifications et rappels" value={prefs.notif.daily ? `Rappel chaque jour à ${prefs.reminderHour}h${String(prefs.reminderMinute).padStart(2, '0')}` : 'Rappel quotidien désactivé'} onClick={() => setSheet('notif')} />
        <div className="item">
          <span className="emoji">🌓</span>
          <div className="grow item-main"><b>Thème</b></div>
          <Segmented value={prefs.theme === 'dark' ? 'dark' : 'light'} onChange={(v) => setPrefs(s.user.id, { theme: v })} options={[['light', 'Clair'], ['dark', 'Sombre']]} />
        </div>
      </div>

      <h3 className="sec-t">Sections affichées</h3>
      <div className="card list">
        <label className="toggle-row item"><span>OrlyMarket<small>Factures, clientes et bénéfice (privé)</small></span><input type="checkbox" className="switch" checked={sections.market} onChange={(e) => setSections({ ...sections, market: e.target.checked })} /></label>
        <label className="toggle-row item"><span>Affectation<small>Répartir un argent reçu et cocher</small></span><input type="checkbox" className="switch" checked={sections.affectation} onChange={(e) => setSections({ ...sections, affectation: e.target.checked })} /></label>
      </div>

      <h3 className="sec-t">Mise à jour</h3>
      <UpdateBanner force />
      <div className="card list">
        <Row icon="⬆️" label="Rechercher une mise à jour" value={`Version installée : ${APP_VERSION}`} onClick={() => { localStorage.removeItem('fp:updcheck'); window.location.reload(); }} />
      </div>

      <h3 className="sec-t">Données</h3>
      <div className="card list">
        <Row icon="📊" label="Exporter en Excel" value="Toutes vos données, une feuille par module" onClick={async () => { try { await exportExcel(s); toast('Export Excel prêt ✓'); } catch (e) { toast(frError(e), 'err'); } }} />
        <Row icon="📄" label="Relevé mensuel PDF" onClick={() => setSheet('pdf')} />
        {!LOCAL_MODE && <Row icon="🔄" label="Synchroniser maintenant" value={s.syncing ? 'Synchronisation…' : s.lastSyncAt ? `Dernière synchro ${s.lastSyncAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${s.outbox.size ? ` · ${s.outbox.size} en attente` : ''}` : s.syncError ? `Erreur : ${s.syncError}` : 'Jamais'} onClick={() => s.sync()} />}
      </div>

      {!LOCAL_MODE && <button className="btn ghost danger-t full mt" onClick={() => setSheet('logout')}><LogOut size={18} /> Se déconnecter</button>}
      <p className="muted center small">Orly version {APP_VERSION} · données chiffrées en transit et protégées par votre code</p>

      {sheet === 'profil' && <ProfilSheet onClose={() => setSheet(null)} />}
      {sheet === 'foyer' && <FoyerSheet onClose={() => setSheet(null)} />}
      {sheet === 'securite' && <SecuriteSheet onClose={() => setSheet(null)} />}
      {sheet === 'password' && <PasswordSheet onClose={() => setSheet(null)} />}
      {sheet === 'notif' && <NotifSheet onClose={() => setSheet(null)} />}
      {sheet === 'categories' && <CategoriesSheet onClose={() => setSheet(null)} />}
      {sheet === 'pdf' && <PdfSheet onClose={() => setSheet(null)} />}
      {sheet === 'logout' && <Confirm text="Se déconnecter ? Vos données restent sauvegardées en ligne." yes="Déconnexion" onNo={() => setSheet(null)} onYes={onLogout} />}
    </div>
  );
}

export function usePrefs(userId) {
  const [p, setP] = useState(() => getPrefs(userId));
  useEffect(() => {
    const h = () => setP(getPrefs(userId));
    window.addEventListener('fp-prefs', h);
    return () => window.removeEventListener('fp-prefs', h);
  }, [userId]);
  return p;
}

function ProfilSheet({ onClose }) {
  const s = useStore();
  const toast = useToast();
  const [name, setName] = useState(s.profiles[s.user.id]?.display_name || '');
  const save = async () => {
    const { error } = await supabase.from('profiles').upsert({ id: s.user.id, display_name: name.trim() });
    if (error) return toast(frError(error), 'err');
    await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    await s.sync();
    toast('Profil enregistré ✓');
    onClose();
  };
  return (
    <Sheet title="Mon profil" onClose={onClose} footer={<button className="btn primary full" onClick={save}>Enregistrer</button>}>
      <Field label="Prénom affiché" help="Votre conjoint verra ce nom sur les lignes que vous ajoutez."><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="E-mail"><input value={s.user.email} disabled /></Field>
    </Sheet>
  );
}

function FoyerSheet({ onClose }) {
  const s = useStore();
  const toast = useToast();
  const [name, setName] = useState('Famille Mackita');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState(false);
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast(ok); } catch (e) { toast(frError(e), 'err'); } finally { setBusy(false); }
  };
  const h = s.household;
  const members = s.members.filter((m) => m.household_id === s.householdId);
  const invite = `Rejoins notre foyer sur l'application Orly 🏠\nCode d'invitation : ${h?.invite_code}\n(Réglages › Mon foyer › Rejoindre un foyer)`;
  return (
    <Sheet title="Mon foyer" onClose={onClose}>
      {!h ? (
        <>
          <p>Le foyer est l'espace commun avec votre conjoint : budget, dépenses du foyer, locataires, patrimoine et objectifs communs. Vos données personnelles et OrlyMarket restent privées.</p>
          <h3 className="sec-t">Créer le foyer</h3>
          <Field label="Nom du foyer"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <button className="btn primary full" disabled={busy} onClick={() => run(() => s.createHousehold(name), 'Foyer créé ✓')}>Créer le foyer</button>
          <h3 className="sec-t">… ou rejoindre un foyer</h3>
          <Field label="Code d'invitation reçu"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex. 7F3A9C21" autoCapitalize="characters" /></Field>
          <button className="btn ghost full" disabled={busy || code.length < 6} onClick={() => run(() => s.joinHousehold(code), 'Foyer rejoint ✓')}>Rejoindre</button>
        </>
      ) : (
        <>
          <div className="hero small"><p>Foyer</p><h2>{h.name}</h2></div>
          <h3 className="sec-t">Inviter mon conjoint</h3>
          <p className="muted small">Votre conjoint installe l'application Orly, crée son compte, puis saisit ce code dans Réglages › Mon foyer.</p>
          <div className="invite-code">{h.invite_code}</div>
          <div className="row gap">
            <button className="btn soft grow" onClick={() => { navigator.clipboard?.writeText(h.invite_code); toast('Code copié ✓'); }}><Copy size={16} /> Copier</button>
            <button className="btn primary grow" onClick={() => (isNative ? Share.share({ text: invite }) : navigator.share ? navigator.share({ text: invite }) : navigator.clipboard?.writeText(invite))}><Share2 size={16} /> Partager</button>
          </div>
          <h3 className="sec-t">Membres</h3>
          <div className="list">
            {members.map((m) => (
              <div className="item" key={m.user_id}>
                <div className="avatar sm">{(s.profiles[m.user_id]?.display_name || '?')[0].toUpperCase()}</div>
                <div className="grow item-main"><b>{m.user_id === s.user.id ? `${s.profiles[m.user_id]?.display_name || 'Moi'} (moi)` : s.profiles[m.user_id]?.display_name || 'Membre'}</b><small>{m.role === 'admin' ? 'Créateur' : 'Membre'}</small></div>
              </div>
            ))}
          </div>
          <button className="btn ghost full" disabled={busy} onClick={() => run(() => s.renewCode(), 'Nouveau code généré ✓')}>Générer un nouveau code</button>
          <button className="btn ghost danger-t full" onClick={() => setLeave(true)}>Quitter le foyer</button>
          {leave && <Confirm text="Quitter le foyer ? Vous ne verrez plus les données communes." yes="Quitter" onNo={() => setLeave(false)} onYes={() => { setLeave(false); run(() => s.leaveHousehold(), 'Vous avez quitté le foyer'); }} />}
        </>
      )}
    </Sheet>
  );
}

function SecuriteSheet({ onClose }) {
  const s = useStore();
  const toast = useToast();
  const prefs = usePrefs(s.user.id);
  const [bioOk, setBioOk] = useState(false);
  const [changing, setChanging] = useState(false);
  const [first, setFirst] = useState(null);
  useEffect(() => { biometryAvailable().then(setBioOk); }, []);
  if (changing) {
    return (
      <Sheet title="Nouveau code PIN" onClose={() => setChanging(false)}>
        <PinPad title={first ? 'Confirmez le code' : 'Choisissez un code à 4 chiffres'} onDone={async (pin) => {
          if (!first) return setFirst(pin);
          if (pin !== first) { toast('Les codes ne correspondent pas', 'err'); setFirst(null); return; }
          await setPin(s.user.id, pin);
          toast('Code PIN modifié ✓');
          setChanging(false); setFirst(null);
        }} />
      </Sheet>
    );
  }
  return (
    <Sheet title="Code PIN et empreinte" onClose={onClose}>
      <button className="btn soft full" onClick={() => setChanging(true)}>Changer mon code PIN</button>
      <label className="toggle-row">
        <span>Déverrouiller avec l'empreinte<small>{bioOk ? 'Disponible sur ce téléphone' : isNative ? "Aucune empreinte enregistrée dans le téléphone" : "Disponible dans l'application Android"}</small></span>
        <input type="checkbox" className="switch" disabled={!bioOk} checked={prefs.bio} onChange={async (e) => {
          if (e.target.checked) { if (await biometryAuth()) setPrefs(s.user.id, { bio: true }); }
          else setPrefs(s.user.id, { bio: false });
        }} />
      </label>
      <Field label="Verrouiller l'application">
        <Segmented value={String(prefs.lockDelay)} onChange={(v) => setPrefs(s.user.id, { lockDelay: Number(v) })} options={[['0', 'Tout de suite'], ['60', 'Après 1 min'], ['300', 'Après 5 min']]} />
      </Field>
      <p className="muted small">Après 5 codes erronés, l'application vous déconnecte. Vos données sont protégées en ligne : chacun ne voit que ses données privées et celles du foyer.</p>
    </Sheet>
  );
}

function PasswordSheet({ onClose }) {
  const toast = useToast();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const save = async () => {
    if (p1.length < 8) return toast('8 caractères minimum', 'err');
    if (p1 !== p2) return toast('Les mots de passe ne correspondent pas', 'err');
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) return toast(frError(error), 'err');
    toast('Mot de passe modifié ✓');
    onClose();
  };
  return (
    <Sheet title="Changer le mot de passe" onClose={onClose} footer={<button className="btn primary full" onClick={save}>Enregistrer</button>}>
      <Field label="Nouveau mot de passe"><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Confirmer"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
    </Sheet>
  );
}

function NotifSheet({ onClose }) {
  const s = useStore();
  const prefs = usePrefs(s.user.id);
  const toast = useToast();
  const setN = (k, v) => { setPrefs(s.user.id, { notif: { ...prefs.notif, [k]: v } }); refreshNotifications(s); };
  const items = [
    ['taches', 'Tâches de la journée', "À l'heure prévue, et un résumé chaque matin"],
    ['abonnements', 'Abonnements', '7 jours avant, 2 jours avant et le jour même'],
    ['daily', 'Rappel de saisie quotidien', 'Pour ne rien oublier le soir'],
    ['budget', 'Budget dépassé', 'Quand une catégorie dépasse son plafond'],
    ['loyers', 'Loyers', 'Loyer attendu ou en retard'],
    ['dettes', 'Dettes et créances', "La veille et le jour de l'échéance"],
    ['tontine', 'Tontine', 'La veille de la cotisation et de votre tour'],
  ];
  return (
    <Sheet title="Notifications" onClose={onClose}>
      {!isNative && <div className="alert warn">Les notifications fonctionnent dans l'application Android.</div>}
      {isNative && <button className="btn soft full" onClick={async () => { const ok = await requestNotifPermission(); const ex = ok && await ensureExactAlarms(); toast(ok ? (ex ? 'Notifications autorisées ✓' : 'Activez « Alarmes et rappels » pour Orly, puis revenez') : 'Autorisez les notifications dans les réglages du téléphone', ok ? 'ok' : 'err'); refreshNotifications(s); }}>Autoriser les notifications et alarmes</button>}
      <p className="muted small">Les rappels sont programmés dans le téléphone : ils arrivent même application fermée et sans internet.</p>
      {items.map(([k, l, h]) => (
        <label className="toggle-row" key={k}>
          <span>{l}<small>{h}</small></span>
          <input type="checkbox" className="switch" checked={!!prefs.notif[k]} onChange={(e) => setN(k, e.target.checked)} />
        </label>
      ))}
      {prefs.notif.daily && (
        <Field label="Heure du rappel quotidien">
          <input type="time" value={`${String(prefs.reminderHour).padStart(2, '0')}:${String(prefs.reminderMinute).padStart(2, '0')}`} onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            setPrefs(s.user.id, { reminderHour: h || 0, reminderMinute: m || 0 });
            refreshNotifications(s);
          }} />
        </Field>
      )}
    </Sheet>
  );
}

function CategoriesSheet({ onClose }) {
  const s = useStore();
  const [form, setForm] = useState(null);
  const [type, setType] = useState('depense');
  const cats = s.list('categorie').filter((c) => c.data.type === type).sort((a, b) => a.data.nom.localeCompare(b.data.nom));
  return (
    <Sheet title="Catégories" onClose={onClose} footer={<button className="btn primary full" onClick={() => setForm('new')}>+ Nouvelle catégorie</button>}>
      <Segmented value={type} onChange={setType} options={[['depense', 'Dépenses'], ['revenu', 'Revenus']]} />
      <div className="list">
        {cats.map((c) => (
          <button className="item" key={c.id} onClick={() => setForm(c)}>
            <span className="cat-badge" style={{ '--c': c.data.couleur }}>{c.data.icone}</span>
            <div className="grow item-main"><b>{c.data.nom}</b></div>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      {form && <RecordForm title={form === 'new' ? 'Nouvelle catégorie' : 'Modifier la catégorie'} module="categorie" rec={form === 'new' ? null : form} defaults={{ type }} lockShared={false} onClose={() => setForm(null)}
        fields={[
          { k: 'nom', label: 'Nom', required: true },
          { k: 'type', label: 'Type', type: 'select', chips: true, options: [['depense', 'Dépense'], ['revenu', 'Revenu']], required: true },
          { k: 'icone', label: 'Icône', type: 'select', chips: true, def: '📦', options: ['🛒', '🚕', '🏠', '💡', '💊', '🎒', '👗', '📱', '🎉', '🤝', '🧹', '💅', '🫙', '💳', '🔁', '📦', '⛪', '🍽️', '⛽', '🐶', '🎁', '💼', '🛍️', '🔑', '💰', '✈️', '👶', '📚'].map((e) => [e, e]) },
          { k: 'couleur', label: 'Couleur', type: 'select', chips: true, def: '#7C3AED', options: ['#7C3AED', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9', '#EF4444', '#6366F1', '#14B8A6', '#F97316', '#64748B'].map((c) => [c, <span key={c} className="swatch" style={{ background: c }} />]) },
        ]} />}
    </Sheet>
  );
}

function PdfSheet({ onClose }) {
  const s = useStore();
  const toast = useToast();
  const [mk, setMk] = useState(monthKey(today()));
  const [scope, setScope] = useState('tout');
  return (
    <Sheet title="Relevé mensuel PDF" onClose={onClose} footer={<button className="btn primary full" onClick={async () => { try { await exportPdf(s, mk, scope); toast('PDF prêt ✓'); } catch (e) { toast(frError(e), 'err'); } }}>Créer le PDF</button>}>
      <MonthNav value={mk} onChange={setMk} />
      {s.householdId && <Segmented value={scope} onChange={setScope} options={[['tout', 'Tout'], ['perso', 'Perso'], ['foyer', 'Foyer']]} />}
      <p className="muted small">Le relevé de {monthLabel(mk)} contient le résumé, les budgets, les dépenses par catégorie et la liste des opérations.</p>
    </Sheet>
  );
}
