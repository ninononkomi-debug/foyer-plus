export const DEFAULT_CATEGORIES = [
  { nom: 'Alimentation', type: 'depense', icone: '🛒', couleur: '#7C3AED' },
  { nom: 'Transport', type: 'depense', icone: '🚕', couleur: '#EC4899' },
  { nom: 'Logement', type: 'depense', icone: '🏠', couleur: '#F59E0B' },
  { nom: 'Électricité & eau', type: 'depense', icone: '💡', couleur: '#0EA5E9' },
  { nom: 'Santé', type: 'depense', icone: '💊', couleur: '#10B981' },
  { nom: 'Enfants & scolarité', type: 'depense', icone: '🎒', couleur: '#8B5CF6' },
  { nom: 'Habillement', type: 'depense', icone: '👗', couleur: '#DB2777' },
  { nom: 'Communication', type: 'depense', icone: '📱', couleur: '#6366F1' },
  { nom: 'Loisirs & sorties', type: 'depense', icone: '🎉', couleur: '#F97316' },
  { nom: 'Famille & dons', type: 'depense', icone: '🤝', couleur: '#14B8A6' },
  { nom: 'Entretien maison', type: 'depense', icone: '🧹', couleur: '#84CC16' },
  { nom: 'Beauté & soins', type: 'depense', icone: '💅', couleur: '#F472B6' },
  { nom: 'Tontine', type: 'depense', icone: '🫙', couleur: '#A855F7' },
  { nom: 'Remboursement dette', type: 'depense', icone: '💳', couleur: '#EF4444' },
  { nom: 'Abonnements', type: 'depense', icone: '🔁', couleur: '#64748B' },
  { nom: 'Autres dépenses', type: 'depense', icone: '📦', couleur: '#94A3B8' },
  { nom: 'Salaire', type: 'revenu', icone: '💼', couleur: '#10B981' },
  { nom: 'OrlyMarket', type: 'revenu', icone: '🛍️', couleur: '#EC4899' },
  { nom: 'Loyers', type: 'revenu', icone: '🔑', couleur: '#F59E0B' },
  { nom: 'Prime & bonus', type: 'revenu', icone: '🎁', couleur: '#7C3AED' },
  { nom: 'Tontine reçue', type: 'revenu', icone: '🫙', couleur: '#A855F7' },
  { nom: 'Remboursement reçu', type: 'revenu', icone: '↩️', couleur: '#0EA5E9' },
  { nom: 'Autres revenus', type: 'revenu', icone: '💰', couleur: '#94A3B8' },
];

export const DEFAULT_WALLETS = [
  { nom: 'Espèces', type: 'especes', solde_initial: 0 },
  { nom: 'Compte bancaire', type: 'banque', solde_initial: 0 },
  { nom: 'Airtel Money', type: 'mobile', solde_initial: 0 },
  { nom: 'Moov Money', type: 'mobile', solde_initial: 0 },
  { nom: 'Épargne', type: 'epargne', solde_initial: 0 },
];

export const WALLET_TYPES = [
  ['especes', 'Espèces', '💵'],
  ['banque', 'Banque', '🏦'],
  ['mobile', 'Mobile Money', '📲'],
  ['epargne', 'Épargne', '🐷'],
  ['autre', 'Autre', '👛'],
];

export const FREQUENCES = [
  ['hebdomadaire', 'Chaque semaine'],
  ['quinzaine', 'Toutes les 2 semaines'],
  ['mensuel', 'Chaque mois'],
  ['trimestriel', 'Chaque trimestre'],
  ['annuel', 'Chaque année'],
];
