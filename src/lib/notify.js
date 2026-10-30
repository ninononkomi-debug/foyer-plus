import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative, getPrefs } from './security.js';
import { budgetStatus, detteReste, loyerMois, loyerEcheance, locataireActifMois } from './compute.js';
import { money, monthKey, today, addDays, addMonths, num } from './format.js';
import { tasksOn, isDone, aboEcheance } from './agenda.js';
import { checkUpdate } from './update.js';

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
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });

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

  if (prefs.notif.daily) {
    list.push({ id: 1, title: 'Orly 📝', body: "Avez-vous noté vos dépenses d'aujourd'hui ?", schedule: { on: { hour: prefs.reminderHour, minute: prefs.reminderMinute }, allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#D3145A' });
  }

  if (prefs.notif.loyers) {
    for (const mk of [monthKey(t), addMonths(monthKey(t), 1)]) {
      for (const l of store.list('locataire')) {
        if (!locataireActifMois(l, mk)) continue;
        const s = loyerMois(store, l, mk);
        if (s.reste <= 0) continue;
        const ech = loyerEcheance(l, mk);
        add('Loyer attendu 🔑', `${l.data.nom} : ${money(s.reste)} à encaisser aujourd'hui`, at(ech));
        add('Loyer en retard ⚠️', `${l.data.nom} n'a pas encore payé ${money(s.reste)}`, at(addDays(ech, 3)));
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
  if (prefs.notif.budget) {
    const mk = monthKey(t);
    for (const b of budgetStatus(store, mk)) {
      if (b.pct <= 1) continue;
      const k = onceKey(`budget:${mk}:${b.rec.id}`);
      if (localStorage.getItem(k)) continue;
      localStorage.setItem(k, '1');
      list.push({ id: id++, title: 'Budget dépassé 🎯', body: `${b.categorie} : ${money(b.depense)} dépensés pour un budget de ${money(b.montant)}`, schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#D3145A' });
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
