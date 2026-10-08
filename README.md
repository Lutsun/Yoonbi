# Yoonbi

**Yoonbi** est une application mobile qui accompagne les usagers dans leurs déplacements quotidiens à Dakar, en leur proposant les meilleurs itinéraires à travers les transports publics sénégalais :

- 🚌 Tata AFTU
- 🚌 Dakar Dem Dikk
- 🚌 BRT

L'objectif : rendre le transport en commun sénégalais **simple à comprendre et à utiliser**, y compris pour les usagers peu à l'aise avec la technologie — pas de jargon, pas d'étapes inutiles, une interface directe.

## Fonctionnalités

- **Connexion par numéro de téléphone** — un code reçu par SMS, sans mot de passe ni e-mail à retenir. Vraie authentification Supabase Auth (pas de comptes faits main) : sessions sécurisées, rafraîchissement automatique, et permissions filtrées par utilisateur (Row Level Security via `auth.uid()`)
- **Écran d'accueil avec carte en direct** — la position de l'utilisateur, les arrêts de bus autour de lui et les lignes qui les desservent
- **Planificateur d'itinéraire (fonctionnalité principale)** — l'utilisateur indique un point de départ et une destination ; Yoonbi calcule le meilleur trajet à travers le réseau réel : lignes à emprunter, correspondances, arrêt où descendre, temps estimé et coût estimé (voir `services/routing.ts`). Une ligne dont l'horaire est confirmé n'est jamais proposée hors de ses heures de service (pas de B3 un dimanche), et l'app dit quand elle reprend (« Le B1 ne circule plus à cette heure — reprise demain à 6h ») ; une ligne à l'horaire estimé reste proposée avec une mise en garde, et une option sûre (autre ligne, ou à pied) passe devant si elle ne coûte pas plus de 10 minutes (voir `services/serviceHours.ts` et `services/journey.ts`)
- **Guidage pas à pas, comme un GPS** (voir `services/navigation.ts`) :
  - à pied, consignes tournant par tournant sur les vraies rues (« Tournez à gauche sur Route de Niayes · dans 40 m ») ;
  - à l'arrêt, la ligne et sa direction (« Prenez la B1 · direction Petersen ») ;
  - dans le bus, le décompte des arrêts (« Encore 9 arrêts · prochain : Scat Urbam ») et un rappel avant de descendre ;
  - sur la carte, le chemin déjà parcouru est grisé, le reste reste en couleur ;
  - à l'arrivée, « Vous êtes arrivé à destination » ; toute l'app vouvoie l'usager ;
  - recalcul automatique : chemin à pied refait en cas d'écart, trajet entier refait si le bus part ailleurs ou si l'arrêt de descente est manqué ; un simple détour du bus ne déclenche rien, le guidage reprend dès qu'il retrouve son trajet
- Base de données de lignes et d'arrêts réels de Dakar (BRT, Dakar Dem Dikk, Tata AFTU) — plusieurs dizaines de lignes et d'arrêts
- **Horaires et fréquence par ligne** — amplitude horaire et fréquence de passage sur la fiche de chaque ligne, avec la mention « estimation » quand l'exploitant ne publie pas d'horaire précis (voir `supabase/schema.sql`)
- **Lieux de Dakar sur la carte** — restaurants, hôtels, hôpitaux, pharmacies, mairies, marchés, universités, monuments et sites (Monument de la Renaissance, musées…), gares : plus de 1 500 lieux issus d'OpenStreetMap, affichés selon le zoom et cherchables hors ligne. Un appui sur un lieu puis « Y aller » ouvre l'itinéraire (voir `services/mapPlaces.ts`, généré par `scripts/build_places.py`)
- **Prix réels** — BRT au tarif zonal officiel (400 F dans une zone, 500 F au-delà) ; Dakar Dem Dikk et Tata AFTU estimés selon la distance dans leurs fourchettes publiées, affichés avec « ≈ » ; chaque correspondance ajoute son ticket (voir `services/fares.ts`)
- **Signalements** — depuis le profil (ou la fiche d'une ligne), l'usager signale un problème : arrêt incorrect, problème de ligne, perturbation, grève, retard… avec la ligne et l'arrêt concernés (facultatifs) et sa position. Il suit le statut dans « Mes signalements » ; l'administrateur les examine dans la console (En attente → En cours de vérification → Validé / Rejeté → Résolu). Un signalement validé devient une information fiable, stockée à part (`network_incidents`) pour servir plus tard aux perturbations et au calcul des itinéraires (voir `supabase/reports.sql`)
- **Cache hors-ligne du réseau et du dernier trajet** — le réseau (lignes et arrêts) reste utilisable sans connexion, et un guidage interrompu par une coupure réseau peut être repris au relancement de l'app (voir `services/offlineCache.ts`)

## Stack technique

| Brique | Choix | Rôle |
|---|---|---|
| App mobile | [Expo](https://expo.dev) (React Native) + TypeScript | iOS / Android à partir d'une seule base de code |
| Navigation | [Expo Router](https://docs.expo.dev/router/introduction/) | navigation par fichiers |
| Carte & position | `react-native-maps`, `expo-location` | carte en direct, position de l'utilisateur |
| Base de données | [Supabase](https://supabase.com) (PostgreSQL + [PostGIS](https://postgis.net)) | lignes, arrêts, itinéraires, utilisateurs ; PostGIS gère tout ce qui est géographique (distances, arrêt le plus proche, tracés de ligne) |
| Style | `NativeWind` / Tailwind + design system maison (`constants/theme.ts`) | interface cohérente, vert de la marque, formes arrondies |

## Structure du projet

```
app/                    Écrans (Expo Router)
  (auth)/                 connexion, code SMS, création de profil
  (tabs)/                  accueil (carte), routes, assistant, favoris, profil
  (modals)/                détail d'un arrêt/bus, planificateur d'itinéraire
components/auth/        Composants d'interface réutilisables
constants/theme.ts       Couleurs, typographies, espacements — le design system
services/                Accès aux données (auth, transport, client Supabase), planificateur d'itinéraire, guidage
scripts/
  build_line_shapes.py    Génère supabase/line_shapes.sql depuis OpenStreetMap (tracés réels des lignes)
  build_places.py         Génère data/places.json : les lieux affichés sur la carte (OpenStreetMap, ODbL)
data/places.json         Lieux de Dakar embarqués dans l'app (utilisables hors ligne)
store/                  État global (session utilisateur)
types/                  Types TypeScript partagés
utils/                  Fonctions utilitaires (validation de numéro, ...)
supabase/
  schema.sql              Schéma de la base (tables + fonctions PostGIS)
  seed.sql                 Données réelles de démarrage (lignes et arrêts de Dakar)
  migrate_to_auth.sql      Migration ponctuelle (ancienne table `users` faite main -> Supabase Auth)
  seed_osm.sql             Tracés relevés sur le terrain (OpenStreetMap, ODbL)
  admin.sql               Droits d'administration pour la console web (admin/)
  contributions.sql       Lignes proposées par les usagers, en attente de relecture admin
  fix_orphan_stops.sql    Correctif ponctuel : arrêts sans ligne laissés par d'anciens rejeux de seed.sql
  line_shapes.sql         Positions d'arrêts relevées + tracés réels des lignes (généré, OpenStreetMap, ODbL)
  line_hours.sql          Horaires des lignes, utilisés par le planificateur
  fix_plateau_stop_order.sql  Correctif : ordre des arrêts El Malick / Ville sur les lignes DDD 4, 7, 9 et 23
  reports.sql             Signalements des usagers et informations fiables qui en découlent
admin/                  Console web d'administration (React + Vite) — voir admin/README.md
```

## Base de données

Le schéma (`supabase/schema.sql`) est volontairement simple : sept tables (`operators`, `lines`, `stops`, `line_stops`, `profiles`, `user_trips`, `favorite_lines`) plus des fonctions PostGIS — dont `nearby_stops(lat, lng)` (arrêts les plus proches d'un point) et `get_route_graph()`, qui renvoie tout le réseau (lignes + arrêts dans l'ordre + tarifs) en un seul appel : c'est ce que le planificateur d'itinéraire utilise pour construire son graphe de trajet et calculer le meilleur chemin (algorithme de Dijkstra, `services/routing.ts`).

`profiles` ne stocke que les infos propres à Yoonbi (nom, ville) — les comptes eux-mêmes sont de vrais comptes **Supabase Auth** (téléphone + code SMS), pas une table maison. Chaque table sensible (`profiles`, `user_trips`, `favorite_lines`) est protégée par des policies Row Level Security basées sur `auth.uid()` : un utilisateur ne peut lire ou modifier que ses propres données.

### D'où viennent les données de transport

Le réseau chargé par l'application vient de deux fichiers, dont le niveau de fiabilité diffère — la distinction compte si ces données sont citées dans un mémoire.

| | `seed_osm.sql` | `seed.sql` |
|---|---|---|
| Couverture | 7 lignes (BRT B1, DDD 1, 4, 7, 9, 10, 23) | ~45 lignes, tout le reste du réseau |
| Coordonnées des arrêts | relevées sur le terrain | estimées au centre du quartier desservi |
| Ordre des arrêts | relevé | déduit du corridor géographique |
| Source | OpenStreetMap, via l'API Overpass | demdikk.sn, aftu-senegal.org, Moovit |

Dans les deux cas, les **opérateurs, numéros de ligne, terminus et tarifs sont sourcés**, et les noms d'arrêts sont de vrais lieux de Dakar. Ce qui reste approximatif dans `seed.sql`, ce sont les positions GPS et surtout l'ordre des arrêts intermédiaires : les sources publiques ne publient que les terminus et quelques points de passage. Les durées et les prix calculés sont donc des ordres de grandeur, pas des horaires.

`seed_osm.sql` fait autorité sur les lignes qu'il couvre et remplace leur tracé approximatif. Ses données sont sous licence **ODbL** : leur réutilisation impose de citer « © les contributeurs OpenStreetMap ».

`line_shapes.sql`, généré par `scripts/build_line_shapes.py`, ajoute le **chemin exact suivi par le bus** pour les lignes dont la relation OpenStreetMap colle à nos arrêts (BRT B1 et B3, DDD 4, 7, 9 et 10) : chaque tracé n'est retenu que si tous les arrêts de la ligne sont à moins de 250 m de lui, dans l'ordre. Pour les autres lignes, l'app suit les rues d'arrêt en arrêt. Le même fichier applique les positions relevées sur le terrain que `seed_osm.sql` n'avait pas pu poser sur des arrêts déjà existants.

Les durées de trajet reposent sur des vitesses sourcées : le BRT relie Guédiawaye à Petersen (18,3 km) en 45 min contre 90 min en bus classique (Bureau d'information gouvernementale, big.gouv.sn), soit ~24 km/h pour le BRT et ~12 km/h pour les autres bus ; l'attente moyenne au BRT découle de sa fréquence officielle (toutes les 6 min, sunubrt.sn).

Pour aller plus loin, la piste la plus solide serait un export GTFS du CETUD (l'autorité organisatrice des transports de Dakar), qui fournirait les tracés et les horaires officiels.

### Contributions des usagers

Couvrir tout le réseau sénégalais depuis des sources publiques est illusoire : beaucoup de lignes n'ont tout simplement pas de données accessibles. Yoonbi permet donc à un usager de signaler une ligne absente, depuis son profil (« Proposer une ligne ») : il marque chaque arrêt au moment où il s'y trouve — un nom à taper, la position captée par le GPS à cet instant, pas un tracé continu à enregistrer.

Ces contributions n'écrivent **jamais** directement dans `lines`/`stops`/`line_stops` : elles vivent dans `line_submissions` / `line_submission_stops` (voir `supabase/contributions.sql`), en attente. Un administrateur les relit dans la console web, choisit le véritable opérateur, corrige si besoin, puis valide — ce qui crée la vraie ligne — ou refuse, avec un motif visible par le contributeur. Rien n'est jamais fusionné automatiquement.

## Console d'administration

Le réseau (opérateurs, lignes, tracés, arrêts) peut aussi se gérer depuis une interface web, dans [`admin/`](admin/) — une application React séparée qui partage la même base Supabase que l'app mobile, en écriture cette fois. Voir [`admin/README.md`](admin/README.md) pour la mise en route et [`supabase/admin.sql`](supabase/admin.sql) pour donner accès à un compte administrateur.

## Démarrage

Prérequis : Node.js, un compte [Supabase](https://supabase.com), et pour tester sur simulateur/appareil : Xcode (iOS) et/ou Android Studio.

```bash
# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# puis renseigner EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY
# (Project Settings > API dans ton projet Supabase)
```

Configuration Supabase :

1. Si tu reviens d'une ancienne version du projet (table `users` faite main) : exécute d'abord `supabase/migrate_to_auth.sql` une seule fois. Sur un projet Supabase tout neuf, passe directement à l'étape 2.
2. Dans l'éditeur SQL, exécute dans l'ordre `supabase/schema.sql`, `supabase/seed.sql`, `supabase/seed_osm.sql`, `supabase/admin.sql`, `supabase/contributions.sql`, `supabase/line_shapes.sql`, `supabase/line_hours.sql`, `supabase/fix_plateau_stop_order.sql`, puis `supabase/reports.sql`.
3. Dans le dashboard Supabase : **Authentication > Providers > Phone**, active le provider "Phone". Sans fournisseur SMS payant configuré, ajoute des **Test Phone Numbers** (numéro + code fixe, ex. `+221700000001` / `123456`) pour te connecter et tester gratuitement — l'authentification reste 100 % réelle (vrais comptes, vrais tokens), seuls ces numéros peuvent recevoir un code. Pour envoyer de vrais SMS à de vrais numéros sénégalais, configure un fournisseur SMS (Twilio, Vonage...) dans le même écran.

Version web (navigateur) — la même app, publiée sur Vercel (https://yoonbi-app.vercel.app) :

```bash
npm run build:web            # exporte l'app dans dist-web/, prête pour Vercel
cd dist-web && npx vercel deploy --prod
```

Sur le web, la carte utilise Leaflet et les fonds OpenStreetMap (`components/map/AppMap.web.tsx`), les notifications système sont désactivées, et l'app s'affiche au format téléphone sur un écran d'ordinateur.

```bash
# Lancer le serveur de développement
npx expo start

# Ou builder directement sur simulateur
npx expo run:ios
npx expo run:android
```

## Licence

MIT

---

Projet réalisé dans le cadre d'un mémoire de fin d'études.
