const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const money = (n) => `${nf.format(Math.round(Number(n) || 0)).replace(/ | /g, ' ')} F`;
export const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
export const pad = (n) => String(n).padStart(2, '0');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const monthKey = (d = today()) => String(d).slice(0, 7);
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const monthLabel = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const monthShort = (mk) => MONTHS_S[Number(mk.split('-')[1]) - 1];
export const addMonths = (mk, k) => {
  let [y, m] = mk.split('-').map(Number);
  m += k;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${pad(m)}`;
};
export const dateFr = (d) => {
  if (!d) return '';
  const [y, m, j] = String(d).slice(0, 10).split('-');
  return `${j}/${m}/${y}`;
};
export const dateLong = (d) => {
  if (!d) return '';
  const [y, m, j] = String(d).slice(0, 10).split('-').map(Number);
  return `${j} ${MONTHS_S[m - 1]} ${y}`;
};
export const addDays = (d, k) => {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + k);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
// avance une date selon une fréquence
export const nextDate = (d, freq) => {
  const x = new Date(d + 'T12:00:00');
  const day = x.getDate();
  if (freq === 'hebdomadaire') x.setDate(x.getDate() + 7);
  else if (freq === 'quinzaine') x.setDate(x.getDate() + 14);
  else {
    const k = freq === 'annuel' ? 12 : freq === 'trimestriel' ? 3 : 1;
    x.setDate(1);
    x.setMonth(x.getMonth() + k);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
  }
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
