import { registerPlugin } from '@capacitor/core';
import { GH_REPO, APP_VERSION } from '../config.js';
import { isNative } from './security.js';

// Plugin natif (MainActivity) : téléchargement de l'APK puis ouverture de l'installateur Android
export const ApkInstaller = registerPlugin('ApkInstaller');

export const cmp = (a, b) => {
  const x = String(a).replace(/^v/, '').split('.').map(Number);
  const y = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

export const apkUrl = (tag) => (tag
  ? `https://github.com/${GH_REPO}/releases/download/${tag}/Orly.apk`
  : `https://github.com/${GH_REPO}/releases/latest/download/Orly.apk`);

export async function checkUpdate(force = false) {
  if (!GH_REPO || !isNative) return null;
  try {
    const last = Number(localStorage.getItem('fp:updcheck') || 0);
    if (!force && Date.now() - last < 3 * 3600e3) {
      const cached = localStorage.getItem('fp:updver') || '';
      return cached && cmp(cached, APP_VERSION) > 0 ? cached : null;
    }
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const j = await r.json();
    localStorage.setItem('fp:updcheck', String(Date.now()));
    const v = cmp(j.tag_name, APP_VERSION) > 0 ? j.tag_name : null;
    localStorage.setItem('fp:updver', v || '');
    return v;
  } catch (e) {
    return null;
  }
}

// Télécharge la nouvelle version dans l'application et lance l'installation
export async function installUpdate(tag, onProgress) {
  if (!isNative) { window.open(apkUrl(tag), '_blank'); return 'browser'; }
  let can = true;
  try { can = (await ApkInstaller.canInstall()).value; } catch (e) { window.open(apkUrl(tag), '_blank'); return 'browser'; }
  if (!can) { await ApkInstaller.openInstallSettings(); return 'permission'; }
  const h = await ApkInstaller.addListener('progress', (p) => onProgress && onProgress(p.pct));
  try {
    await ApkInstaller.downloadAndInstall({ url: apkUrl(tag) });
    return 'ok';
  } finally {
    h.remove();
  }
}
