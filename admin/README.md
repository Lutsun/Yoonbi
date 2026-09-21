# Yonnbi — Console d'administration

Application web (React + Vite + TypeScript) pour gérer le contenu de Yonnbi : opérateurs, lignes, tracés et arrêts. C'est un projet séparé de l'app mobile, mais elle utilise la **même base Supabase**.

## Comment ça marche

La console utilise la clé publique Supabase (`anon`) — la même que l'app mobile — jamais une clé privilégiée, qui serait visible dans le code du navigateur. Les droits d'écriture viennent uniquement des règles de sécurité définies dans [`../supabase/admin.sql`](../supabase/admin.sql) : seul un compte listé dans la table `admins` peut créer, modifier ou supprimer des données. Tout le monde d'autre — y compris un visiteur qui ouvrirait les outils de développement du navigateur — reste en lecture seule, comme dans l'app mobile.

## Mise en route

```bash
npm install
cp .env.example .env
# renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (Project Settings > API dans Supabase)
npm run dev
```

### Donner accès à un administrateur

1. Dans le dashboard Supabase, exécuter `supabase/admin.sql` dans l'éditeur SQL (une fois, après `schema.sql`).
2. **Authentication › Users › Add user** : créer un compte avec e-mail + mot de passe, en cochant *Auto Confirm User*.
3. Toujours dans l'éditeur SQL :
   ```sql
   insert into admins (user_id)
   select id from auth.users where email = 'prenom@exemple.com';
   ```

La personne peut ensuite se connecter sur la console avec cet e-mail et ce mot de passe.

## Fonctionnalités

- **Tableau de bord** — effectifs du réseau, répartition des lignes par opérateur, lignes les plus mises en favori, et alertes de qualité (arrêts orphelins, lignes à moins de 2 arrêts — les deux rendent le calcul d'itinéraire de l'app inopérant).
- **Opérateurs** — créer, modifier, supprimer (BRT, Dakar Dem Dikk, Tata AFTU…).
- **Lignes** — créer, modifier, supprimer ; éditer le tracé (ordre des arrêts) avec un sélecteur cherchable et un réordonnancement par boutons.
- **Arrêts** — carte interactive (clic pour ajouter au bon endroit), liste avec recherche, modification, suppression.

## Structure

```
src/
  lib/          client Supabase, types, accès aux données (api.ts)
  auth/         connexion + vérification du statut administrateur
  pages/        un fichier par écran
  components/   Modal, correctif d'icônes Leaflet
```

## Build

```bash
npm run build   # sortie dans dist/
npm run preview # servir le build localement
```
