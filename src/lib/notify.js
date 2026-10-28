import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative, getPrefs } from './security.js';
import { budgetStatus, detteReste, loyerMois, loyerEcheance, locataireActifMois } from './compute.js';
import { money, monthKey, today, addDays, addMonths, num } from './format.js';

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
    try { await LocalNotifications.createChannel({ id: 'foyer', name: 'Rappels Foyer+', importance: 4, visibility: 0 }); } catch (e) { /* */ }
    channelDone = true;
  }
  const prefs = getPrefs(store.user.id);
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });

  const now = new Date();
  const t = today();
  const list = [];
  let id = 100;
  const add = (title, body, when) => {
    if (when <= now) return;
    list.push({ id: id++, title, body, schedule: { at: when, allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#7C3AED' });
  };

  if (prefs.notif.daily) {
    list.push({ id: 1, title: 'Foyer+ 📝', body: "Avez-vous noté vos dépenses d'aujourd'hui ?", schedule: { on: { hour: prefs.reminderHour, minute: prefs.reminderMinute }, allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#7C3AED' });
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
      if (a.data.actif === false || !a.data.prochaine) continue;
      add('Abonnement demain 🔁', `${a.data.nom} : ${money(a.data.montant)}`, at(addDays(a.data.prochaine, -1), 18));
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
      list.push({ id: id++, title: 'Budget dépassé 🎯', body: `${b.categorie} : ${money(b.depense)} dépensés pour un budget de ${money(b.montant)}`, schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true }, channelId: 'foyer', smallIcon: 'ic_stat_foyer', iconColor: '#7C3AED' });
    }
  }
  list.sort((a, b) => (a.schedule.at?.getTime?.() || 0) - (b.schedule.at?.getTime?.() || 0));
  if (list.length) await LocalNotifications.schedule({ notifications: list.slice(0, 60) });
}
export { num };
