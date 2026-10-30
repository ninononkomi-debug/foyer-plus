// Tâches de la journée (avec répétition) et abonnements
import { today, addDays, daysBetween, num } from './format.js';

export const REPET = [
  ['aucune', 'Une fois'],
  ['jour', 'Tous les jours'],
  ['ouvre', 'Du lundi au vendredi'],
  ['semaine', 'Chaque semaine'],
  ['mois', 'Chaque mois'],
];
export const RAPPELS = [[0, "À l'heure"], [10, '10 min avant'], [30, '30 min avant'], [60, '1 h avant'], [-1, 'Pas de rappel']];
export const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const dow = (d) => new Date(d + 'T12:00:00').getDay();

export function occursOn(t, d) {
  const x = t.data;
  if (!x.date || d < x.date) return false;
  if (x.fin_rep && d > x.fin_rep) return false;
  switch (x.repetition || 'aucune') {
    case 'jour': return true;
    case 'ouvre': { const w = dow(d); return w >= 1 && w <= 5; }
    case 'semaine': return dow(d) === dow(x.date);
    case 'mois': return d.slice(8) === x.date.slice(8);
    default: return d === x.date;
  }
}
export const isDone = (t, d) => !!(t.data.faits || {})[d];

export function tasksOn(s, d) {
  return s.list('tache').filter((t) => occursOn(t, d))
    .sort((a, b) => (a.data.heure || '99').localeCompare(b.data.heure || '99') || (a.data.titre || '').localeCompare(b.data.titre || ''));
}
// tâches uniques non faites des jours passés
export function lateTasks(s) {
  const t0 = today();
  return s.list('tache').filter((t) => (t.data.repetition || 'aucune') === 'aucune' && t.data.date < t0 && !isDone(t, t.data.date))
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
}
export function toggleTask(s, t, d) {
  const faits = { ...(t.data.faits || {}) };
  if (faits[d]) delete faits[d]; else faits[d] = new Date().toISOString();
  s.save('tache', { ...t.data, faits }, { id: t.id });
}

// ---------- Abonnements ----------
export function aboEcheance(a) {
  const d = a.data;
  const dates = [d.prochaine, d.fin].filter(Boolean).sort();
  return dates[0] || null;
}
export function aboStatus(a) {
  const e = aboEcheance(a);
  if (!e || a.data.actif === false) return { e, j: null, level: 'off' };
  const j = daysBetween(today(), e);
  return { e, j, level: j < 0 ? 'late' : j <= 2 ? 'late' : j <= 7 ? 'soon' : 'ok' };
}
export function aboLabel(j) {
  if (j === null) return '';
  if (j < 0) return `dépassé de ${-j} j`;
  if (j === 0) return "aujourd'hui";
  if (j === 1) return 'demain';
  return `dans ${j} j`;
}
export function aboMensuel(list) {
  return list.filter((a) => a.data.actif !== false).reduce((x, a) => {
    const k = { hebdomadaire: 4.33, quinzaine: 2.17, mensuel: 1, trimestriel: 1 / 3, annuel: 1 / 12, unique: 0 }[a.data.frequence || 'mensuel'] ?? 1;
    return x + num(a.data.montant) * k;
  }, 0);
}
export { addDays };
