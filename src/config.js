// Renseigné automatiquement lors de la compilation (variables GitHub)
// ou à la main pour un test local.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://etqgbktepxukztmgvqit.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_E2PatkYCR1I7DLczOA5gww_G8Cq9EFD';
export const LOCAL_MODE = import.meta.env.VITE_LOCAL === '1' || !SUPABASE_URL || !SUPABASE_ANON_KEY;
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0';
export const GH_REPO = import.meta.env.VITE_GH_REPO || 'ninononkomi-debug/foyer-plus';
