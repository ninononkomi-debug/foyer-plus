import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { checkUpdate, installUpdate } from '../lib/update.js';
import { useToast } from './ui.jsx';

export default function UpdateBanner({ force }) {
  const toast = useToast();
  const [v, setV] = useState(null);
  const [pct, setPct] = useState(null);
  const [step, setStep] = useState('');
  useEffect(() => { checkUpdate(force).then(setV); }, [force]);
  if (!v) return null;
  const go = async () => {
    setPct(0); setStep('');
    try {
      const r = await installUpdate(v, setPct);
      if (r === 'permission') { setStep('perm'); setPct(null); }
      if (r === 'ok') setStep('install');
    } catch (e) {
      setPct(null);
      toast('Téléchargement interrompu. Vérifiez internet et réessayez.', 'err');
    }
  };
  return (
    <div className="update-banner">
      <Download size={22} />
      <div className="grow">
        <b>Nouvelle version {v.replace(/^v/, '')}</b>
        <small>{step === 'perm' ? 'Autorisez « Orly » à installer des applications, revenez puis appuyez à nouveau.' : step === 'install' ? 'Appuyez sur « Mettre à jour » dans la fenêtre Android.' : pct !== null ? `Téléchargement… ${pct} %` : 'Vos données sont conservées.'}</small>
        {pct !== null && step === '' && <div className="dl-bar"><div style={{ width: `${pct}%` }} /></div>}
      </div>
      {(pct === null || step) && <button className="btn sm" onClick={go}>{step === 'perm' ? 'Réessayer' : 'Installer'}</button>}
    </div>
  );
}
