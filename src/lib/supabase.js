import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LOCAL_MODE } from '../config.js';

export const supabase = LOCAL_MODE
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'foyerplus-auth' },
    });

export function frError(e) {
  const m = (e && (e.message || e.error_description || String(e))) || 'Erreur inconnue';
  const map = [
    [/Invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
    [/Email not confirmed/i, "Votre e-mail n'est pas encore confirmé. Ouvrez le lien reçu par e-mail."],
    [/User already registered/i, 'Un compte existe déjà avec cet e-mail.'],
    [/Password should be at least/i, 'Le mot de passe doit contenir au moins 8 caractères.'],
    [/rate limit/i, 'Trop de tentatives. Patientez quelques minutes.'],
    [/Failed to fetch|NetworkError|network/i, 'Pas de connexion internet.'],
    [/Code invalide/i, "Code d'invitation invalide."],
    [/Foyer complet/i, 'Ce foyer est complet.'],
    [/weak|pwned/i, 'Mot de passe trop faible, choisissez-en un plus long.'],
  ];
  for (const [r, t] of map) if (r.test(m)) return t;
  return m;
}
