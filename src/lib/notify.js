import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative, getPrefs } from './security.js';
import { detteReste } from './compute.js';
import { money, monthKey, today, addDays, addMonths, num } from './format.js';
import { tasksOn, isDone, aboEcheance } from './agenda.js';
import { checkUpdate } from './update.js';
import { budgetMois } from '../screens/FoyerV2.jsx';

let channelDone = false;
let timer = null;

export async function requestNotifPermission() {
  if (!isNative) return false;
  try {
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch (e) {
    return false;
  }
}

// Android 12+ : autoriser les alarmes exactes pour que les tâches sonnent à l'heure pile
export async function ensureExactAlarms() {
  if (!isNative) return true;
  try {
    const r = await LocalNotifications.checkExactNotificationSetting();
    if (r.exact_alarm === 'granted') return true;
    await LocalNotifications.changeExactNotificationSetting();
    return false;
  } catch (e) {
    return true;
  }
}

export function refreshNotifications(store) {
  clearTimeout(timer);
  timer = setTimeout(() => doRefresh(store).catch((e) => console.warn('notif', e)), 1500);
}

const at = (d, h = 9, m = 0) => {
  const [y, mo, j] = d.split('-').map(Number);
  return new Date(y, mo - 1, j, h, m, 0);
};
const onceKey = (k) => `fp:notified:${k}`;

async function doRefresh(store) {
  if (!isNative || !store.user) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') return;
  if (!channelDone) {
    try { await LocalNotifications.createChannel({ id: 'foyer', name: 'Rappels Orly', importance: 4, visibility: 0 }); } catch (e) { /* */ }
    try { await LocalNotifications.createChannel({ id: 'taches', name: 'Tâches à l’heure', importance: 5, visibility: 0, vibration: true }); } catch (e) { /* */ }
    channelDone = true;
  }
  const prefs = getPrefs(store.user.id);
  const pending = await LocalNotifications.getPending();
  const toCancel = pending.notifications.filter((n) => n.id < 5000);
  if (toCancel.length) await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) });

  const now = new Date();
  const t = today();
  const list = [];
  let id = 100;
  const add = (title, body, when, channelId = 'foyer') => {
    if (when <= now) return;
    list.push({ id: id++, title, body, schedule: { at: when, allowWhileIdle: true }, channelId, smallIcon: 'ic_stat_foyer', iconColor: '#D3145A' });
  };

  // Tâches de la journée : à l'heure prévue (moins le rappel) + résumé du matin
  if (prefs.notif.taches) {
    for (let k = 0; k < 8; k++) {
      const d = addDays(t, k);
      const ts = tasksOn(store, d).filter((x) => !isDone(x, d));
      for (const x of ts) {
        if (!x.data.heure || x.data.rappel === -1) continue;
        const [h, m] = x.data.heure.split(':').map(Number);
        const w = at(d, h, m);
        w.setMinutes(w.getMinutes() - (num(x.data.rappel) || 0));
        const r = num(x.data.rappel);
        add(`⏰ ${x.data.titre}`, r ? `Dans ${r >= 60 ? `${r / 60} h` : `${r} min`}, à ${x.data.heure}` : `C'est l'heure (${x.data.heure})`, w, 'taches');
      }
      if (ts.length) add('Votre journée 📋', `${ts.length} tâche${ts.length > 1 ? 's' : ''} aujourd'hui : ${ts.slice(0, 3).map((x) => x.data.titre).join(', ')}${ts.length > 3 ? '…' : ''}`, at(d, prefs.morningHour ?? 7, 0));
    }
  }

  // Fin de mois (plus de rappel chaque jour) : dernier jour à 18 h, puis alerte le 5 si le mois n'est pas bouclé
  {
    const mk = monthKey(t);
    const next = addMonths(mk, 1);
    const [y, m] = mk.split('-').map(Number);
    const last = `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const b = budgetMois(store, mk);
    const nom = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
    if (b.nb && b.faites < b.nb) {
      add(`Fin ${nom} 📝`, `Pensez à saisir les dépenses et à cocher les charges de ${nom} (${b.nb - b.faites} restante${b.nb - b.faites > 1 ? 's' : ''}).`, at(last, 18));
      add(`Nous sommes le 5 ⚠️`, `${b.nb - b.faites} charge${b.nb - b.faites > 1 ? 's' : ''} de ${nom} pas encore réglée${b.nb - b.faites > 1 ? 's' : ''} ou non saisie${b.nb - b.faites > 1 ? 's' : ''}. Mettez le Foyer à jour.`, at(`${next}-05`, 9));
    }
    // le mois précédent, s'il n'est toujours pas bouclé et qu'on est avant le 5
    const prev = addMonths(mk, -1);
    const bp = budgetMois(store, prev);
    if (bp.nb && bp.faites < bp.nb) {
      const [py, pm] = prev.split('-').map(Number);
      const pnom = new Date(py, pm - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
      add(`Nous sommes le 5 ⚠️`, `${bp.nb - bp.faites} charge${bp.nb - bp.faites > 1 ? 's' : ''} de ${pnom} pas encore réglée${bp.nb - bp.faites > 1 ? 's' : ''} ou non saisie${bp.nb - bp.faites > 1 ? 's' : ''}. Mettez le Foyer à jour.`, at(`${mk}-05`, 9));
    }
  }

  // Loyer : la locataire paie à la fin du mois, dernier délai le 10 du mois suivant
  if (prefs.notif.loyers) {
    const cfg = store.list('loyer_cfg')[0];
    if (cfg) {
      for (const mk of [addMonths(monthKey(t), -1), monthKey(t)]) {
        const l = store.list('loyer_mois').find((x) => x.data.mois === mk);
        if (l?.data.verse) continue;
        const [y, m] = mk.split('-').map(Number);
        const nom = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
        const nx = addMonths(mk, 1);
        add('Loyer attendu 🔑', `Loyer de ${nom} (${money(cfg.data.montant)}) : délai jusqu'au 10. Pensez à le noter dès qu'il est versé.`, at(`${nx}-05`, 9));
        add('Loyer en retard ⚠️', `${cfg.data.locataire} n'a pas encore versé le loyer de ${nom} (${money(cfg.data.montant)}). Dernier délai aujourd'hui.`, at(`${nx}-10`, 9));
      }
    }
  }
  if (prefs.notif.dettes) {
    for (const d of store.list('dette')) {
      const reste = detteReste(d);
      if (!reste || !d.data.echeance) continue;
      const txt = d.data.type === 'creance' ? `${d.data.personne} doit vous rembourser ${money(reste)}` : `Remboursement de ${money(reste)} à ${d.data.personne}`;
      add('Échéance demain 🤝', txt, at(addDays(d.data.echeance, -1), 18));
      add("Échéance aujourd'hui 🤝", txt, at(d.data.echeance));
    }
  }
  if (prefs.notif.abonnements) {
    for (const a of store.list('abonnement')) {
      if (a.data.actif === false) continue;
      const e = aboEcheance(a);
      if (!e) continue;
      const fin = a.data.fin && e === a.data.fin ? 'se termine' : 'arrive à échéance';
      add('Abonnement bientôt fini 🔁', `${a.data.nom} ${fin} dans 7 jours (${money(a.data.montant)})`, at(addDays(e, -7), 9));
      add('Abonnement : plus que 2 jours ⚠️', `${a.data.nom} ${fin} après-demain (${money(a.data.montant)})`, at(addDays(e, -2), 9));
      add("Abonnement : c'est aujourd'hui ⚠️", `${a.data.nom} ${fin} aujourd'hui. Pensez à renouveler (${money(a.data.montant)}).`, at(e, 8));
    }
  }
  if (prefs.notif.tontine) {
    for (const tn of store.list('tontine')) {
      if (tn.data.actif === false) continue;
      if (tn.data.prochaine) add('Cotisation tontine demain 🫙', `${tn.data.nom} : ${money(tn.data.cotisation)}`, at(addDays(tn.data.prochaine, -1), 18));
      if (tn.data.mon_tour && !tn.data.recu) add('Votre tour de tontine 🎉', `${tn.data.nom} : vous recevez ${money(tn.data.a_recevoir)}`, at(tn.data.mon_tour));
    }
  }
  // Nouvelle version disponible : une seule notification par version
  try {
    const v = await checkUpdate();
    if (v && localStorage.getItem('fp:updnotif') !== v) {
      localStorage.setItem('fp:updnotif', v);
      list.push({ id: 2, title: 'Mise à jour disponible ✨', body: `La version ${v.replace(/^v/, '')} d'Orly est prête. Ouvrez l'application et appuyez sur « Installer ».`, schedule: { at: new Date(Date.now() + 4000), allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#D3145A' });
    }
  } catch (e) { /* */ }
  list.sort((a, b) => (a.schedule.at?.getTime?.() || 0) - (b.schedule.at?.getTime?.() || 0));
  if (list.length) await LocalNotifications.schedule({ notifications: list.slice(0, 200) });
}
export { num };

// Le conjoint a ajouté ou modifié quelque chose : notification immédiate
const LIB = {
  depense_charge: (d) => `une dépense de ${money(d.montant)}${d.motif ? ` (${d.motif})` : ''}`,
  imprevu: (d) => `un imprévu de ${money(d.montant)}${d.motif ? ` (${d.motif})` : ''}`,
  revenu_fixe: () => 'les revenus et charges du foyer',
  loyer_mois: () => 'le loyer',
  besoin: (d) => `un besoin : ${d.libelle || ''}`,
  epargne_foyer: () => "l'épargne du foyer",
  dette: (d) => `la dette « ${d.personne || ''} »`,
  tontine: (d) => `la tontine « ${d.nom || ''} »`,
  abonnement: (d) => `l'abonnement « ${d.nom || ''} »`,
  tache: (d) => `la tâche « ${d.titre || ''} »`,
};
let partnerId = 5000;
export async function notifyPartnerChanges(store, changes) {
  if (!isNative) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    const notifs = changes.slice(-5).map(({ rec, before }) => {
      const qui = store.profiles[rec.data._by]?.display_name || 'Votre conjoint';
      const quoi = (LIB[rec.module] || (() => 'une information'))(rec.data);
      const verbe = rec.deleted ? 'a supprimé' : before ? 'a modifié' : 'a ajouté';
      partnerId = partnerId >= 5900 ? 5000 : partnerId + 1;
      return { id: partnerId, title: 'Foyer : nouveauté 🏠', body: `${qui} ${verbe} ${quoi}.`, schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#7B2FBE' };
    });
    if (notifs.length > 1) notifs.splice(0, notifs.length, { ...notifs[notifs.length - 1], title: `${changes.length} nouveautés dans le foyer`, body: notifs.map((n) => n.body).join(' ') });
    await LocalNotifications.schedule({ notifications: notifs });
  } catch (e) { /* */ }
}
