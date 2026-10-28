# Foyer+

Application Android de gestion des finances personnelles et du foyer (Orly & conjoint).

## Fonctionnalités
- Compte personnel (e-mail + mot de passe), code PIN à 4 chiffres et empreinte digitale
- Espace **privé** + espace **foyer** partagé avec le conjoint (code d'invitation)
- Dépenses, revenus, transferts, porte-monnaie (espèces, banque, Airtel/Moov Money, épargne)
- Budget mensuel par catégorie avec alertes de dépassement
- Épargne & objectifs, tontines, abonnements
- OrlyMarket : ventes, bénéfice, impayés, répartition du bénéfice (épargne / réinvestissement / perso / tontine)
- Locataires : loyers attendus, payés, en retard
- Patrimoine (valeur nette), dettes & créances
- Photos des reçus, export Excel complet, relevé mensuel PDF
- Rappels : saisie quotidienne, budget dépassé, loyers, dettes, abonnements, tontine
- Fonctionne hors ligne, synchronisation automatique entre les téléphones, mode sombre

## Installation (une seule fois)

### 1. Base de données Supabase (gratuite)
1. Créer un compte sur https://supabase.com puis un projet `foyer-plus` (région West EU).
2. **SQL Editor › New query** : coller tout le contenu de `supabase/schema.sql` puis **Run**.
3. **Authentication › URL Configuration** : *Site URL* = `https://<utilisateur>.github.io/foyer-plus/`.
4. **Project Settings › API** : noter l'URL du projet et la clé `anon public`.

### 2. GitHub (compilation automatique)
Dans le dépôt : **Settings › Secrets and variables › Actions**
- *Variables* : `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- *Secrets* (signature de l'APK) : `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
- **Settings › Pages** : Source = *GitHub Actions*

Chaque modification envoyée sur `main` construit l'APK et le publie dans **Releases**.

### 3. Installer sur le téléphone
Ouvrir `https://github.com/<utilisateur>/foyer-plus/releases/latest/download/Foyer-plus.apk`
sur le téléphone, autoriser « Installer des applications inconnues », puis installer.
Les mises à jour s'installent par-dessus, les données sont conservées.

## Sécurité
- Row Level Security Supabase : chacun ne voit que ses lignes privées et celles de son foyer
- Mot de passe géré par Supabase Auth, session chiffrée en HTTPS
- Code PIN haché (PBKDF2), verrouillage automatique, déconnexion après 5 erreurs
- Sauvegarde Android désactivée pour l'application (pas de copie des données hors du téléphone)
- Photos des reçus dans un stockage privé (liens temporaires)

## Développement
```
npm install
npm run dev        # sans variables Supabase : mode test local
```
