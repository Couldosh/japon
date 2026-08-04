# Japon — guide de voyage !

Application Ionic/Angular servant de guide de voyage pour un séjour au Japon : restaurants, activités et magasins sourcés depuis un Google Sheet partagé, avec carte, favoris et planning de l'itinéraire.

## Fonctionnalités

- **Liste** — restaurants / activités / magasins, recherche, filtre par type et par quartier (regroupé par ville), tri par distance (ou alphabétique sans géolocalisation), horaires d'ouverture en temps réel (avec alerte "ferme bientôt" / "réouvre à...").
- **Carte** — Leaflet + tuiles raster MapTiler, position en direct, filtre "favoris uniquement", recentrage automatique.
- **Favoris** — mise en favori d'un lieu depuis sa fiche détail, badge de comptage sur l'onglet.
- **Planning** — itinéraire jour par jour depuis un onglet dédié du Sheet, jour courant mis en évidence et auto-scrollé, filtre par ville, lien direct vers la fiche d'un lieu quand l'activité y correspond.
- **Notes personnelles** — note libre par lieu, stockée localement sur l'appareil (pas de compte, pas de synchronisation).
- Thème clair/sombre, cache local des données (rafraîchissement manuel), mode hors-ligne dégradé (dernières données connues affichées si le réseau est indisponible).

## Stack technique

- Angular 21 (standalone components, signals, zoneless change detection)
- Ionic Framework (composants UI, gestion des vues/modales)
- Leaflet + leaflet.markercluster (carte), tuiles MapTiler
- ngx-papaparse (parsing CSV du Google Sheet)
- RxJS

## Démarrage rapide

```bash
npm install
npm start          # alias de `ng serve` — http://localhost:4200
```

```bash
npm run build       # build de production dans dist/
npm run watch        # build de développement, incrémental
npm test              # tests unitaires (Karma/Jasmine)
```

## Configuration

`src/environments/environment.ts` contient la clé API MapTiler utilisée par l'onglet Carte. Cette clé est volontairement visible côté client : MapTiler restreint l'usage par domaine autorisé (dashboard MapTiler → la clé → *Allowed origins/domains*), pas par confidentialité de la clé elle-même.

### Écriture dans le Sheet depuis l'app ("Ajouter un lieu")

Le bouton "+" de l'en-tête permet d'ajouter un restaurant/activité/magasin/plat directement depuis l'app, en écrivant dans le vrai Google Sheet via l'API Sheets v4 (authentification OAuth2 côté navigateur avec le compte Google de l'utilisateur). Prérequis, dans le même projet Google Cloud que les scripts de maintenance (`Google Sheets API` déjà activée) :

1. **Un ID client OAuth type "Application Web"** (pas "Application de bureau", utilisée pour les scripts) : *Identifiants* → *Créer des identifiants* → *ID client OAuth* → *Application Web*. Renseigner les origines JavaScript autorisées (`http://localhost:4200` en dev, le domaine de prod en prod).
2. **Écran de consentement OAuth en mode Test**, avec les comptes Google des contributeurs ajoutés comme "utilisateurs test" — le scope `spreadsheets` est sensible et nécessiterait sinon une vérification Google, inutile pour un groupe fermé.
3. Renseigner `googleClientId` (l'ID client ci-dessus) et `spreadsheetId` (l'identifiant du Sheet dans son URL d'édition — le même que `SPREADSHEET_ID` dans le `.env` des scripts, **différent** de l'ID de publication CSV utilisé par `SheetsApi.baseUrl`) dans `src/environments/environment.ts`.
4. Chaque contributeur doit avoir un accès **Éditeur** sur le Sheet avec son compte Google : c'est cet accès, et non la connexion à l'app, qui autorise réellement l'écriture (voir `docs/architecture-et-pieges.md`).

Le bouton "Rechercher sur Google Places" du formulaire (préremplissage Lien/Localisation) nécessite en plus une **clé API Places** dédiée : *Identifiants* → *Créer des identifiants* → *Clé API*, restreinte à *Places API (New)* et à vos origines HTTP (referrers) autorisées — **ne pas réutiliser** `PLACES_API_KEY` du `.env` des scripts, qui n'est pas restreinte par origine. Renseigner `placesApiKey` dans `src/environments/environment.ts`.

## Source de données

Toutes les données (hors favoris/notes, stockés localement) viennent d'un unique Google Sheet, exposé en lecture via "Publier sur le web" (export CSV), un onglet par type de contenu :

| Contenu    | Service Angular          | gid (onglet)  |
|------------|---------------------------|---------------|
| Activités  | `ActiviteService`          | `0`           |
| Restaurants| `RestaurantService`         | `892590698`   |
| Magasins   | `MagasinService`             | `346756517`   |
| Quartiers (référence Ville) | `QuartierService`  | `1855356526`  |
| Plats (référence, colonne "Plats" des restaurants) | `PlatService` | `2053739160` |
| Planning   | `PlanningService`             | `1009205135`  |
| Hébergements | `HebergementService`        | `786595870`   |

Le cache navigateur (`SheetsApi`) garde chaque onglet 5 minutes ; le bouton de rafraîchissement de l'en-tête force une relecture immédiate (délègue au chargement propre de l'onglet actif : Planning a son propre cache, indépendant des trois autres feuilles).

## Scripts de maintenance du Sheet

Les scripts sous `scripts/` sont indépendants de l'application : on les exécute ponctuellement en local pour compléter le Google Sheet (horaires, localisation...) via l'API Google Sheets et l'API Places (New). Ils ne tournent jamais depuis le navigateur.

### Prérequis (une fois)

1. **Un projet Google Cloud** avec l'API **Google Sheets API** et l'API **Places API (New)** activées.
   > Si votre compte Google est géré par une organisation, ses règles bloquent parfois la création de clés de compte de service (`iam.disableServiceAccountKeyCreation`) et/ou l'écran de consentement OAuth externe. Le plus simple est alors de créer ce projet Google Cloud sous un compte Google personnel, non managé.
2. **Des identifiants OAuth "Desktop app"** : Google Cloud Console → *API et services* → *Identifiants* → *Créer des identifiants* → *ID client OAuth* → type *Application de bureau*. Téléchargez le JSON et enregistrez-le à la racine du projet sous le nom `credentials.json`.
3. **Une clé API Places** : *Identifiants* → *Créer des identifiants* → *Clé API*, puis restreignez-la à l'API *Places API (New)*.
4. **Un fichier `.env`** à la racine (non commité) :
   ```
   SPREADSHEET_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   PLACES_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   `SPREADSHEET_ID` est l'identifiant du Sheet dans son URL d'édition (`.../spreadsheets/d/<SPREADSHEET_ID>/edit`) — **ce n'est pas** l'identifiant de publication utilisé par l'app (`SheetsApi.baseUrl`), qui est un identifiant distinct propre au lien "Publier sur le web".

Au premier lancement d'un script, une fenêtre de navigateur s'ouvre pour se connecter avec le compte Google ayant accès au Sheet ; le jeton obtenu est mis en cache dans `token.json` (non commité) pour les lancements suivants.

### Cache local des recherches Places

Les quatre scripts qui appellent l'API Places mémorisent chaque résultat de recherche dans `scripts/.cache/` (non commité), par établissement (feuille + nom + quartier) :

- évite de repayer un appel API pour un établissement déjà cherché lors d'une exécution précédente ;
- pour les scripts avec un mode aperçu, garantit que ce qui est écrit avec `--appliquer` est exactement ce qui a été vu à l'aperçu (pas de nouvel appel entre-temps qui pourrait renvoyer un résultat différent) ;
- une interruption/erreur en cours de route ne fait pas perdre les recherches déjà faites (le cache est sauvegardé même en cas d'échec) ;
- passer `--rafraichir` sur n'importe lequel des quatre scripts ignore le cache et relance une recherche fraîche.

### Liste des scripts

#### `fetch-horaires.mjs` — récupère les horaires d'ouverture

Cherche chaque établissement sur Places (par nom + quartier + position approximative extraite du lien "Localisation") et écrit ses horaires dans une colonne "Horaires", au format JSON compact lu par `src/app/utils/horaires.ts`. Écrit directement dans le Sheet (pas de mode aperçu séparé) — mais ignore par défaut les lignes déjà renseignées.

```bash
node --env-file=.env scripts/fetch-horaires.mjs                  # ignore les lignes déjà renseignées
node --env-file=.env scripts/fetch-horaires.mjs --force          # réécrit aussi les lignes déjà renseignées
node --env-file=.env scripts/fetch-horaires.mjs --rafraichir     # ignore le cache de recherche
node --env-file=.env scripts/fetch-horaires.mjs --force --rafraichir

# équivalent via l'alias npm (le -- est nécessaire pour transmettre les options) :
npm run horaires
npm run horaires -- --force
```

#### `dupliquer-quartiers.mjs` — éclate les lieux multi-quartiers

Pour les lignes des feuilles Restaurants/Magasins dont la colonne "Quartier" contient plusieurs valeurs séparées par des virgules, duplique la ligne en une par quartier et tente de retrouver, pour chacune, un lien Google Maps propre à cette antenne (même format `query_place_id` que `fetch-localisation.mjs`, voir ci-dessus). **Réécrit toute la feuille** en cas d'application : faites une copie du Sheet ou vérifiez son historique des versions avant d'appliquer.

```bash
node --env-file=.env scripts/dupliquer-quartiers.mjs                # aperçu, aucune écriture
node --env-file=.env scripts/dupliquer-quartiers.mjs --appliquer    # écrit dans le Sheet
node --env-file=.env scripts/dupliquer-quartiers.mjs --rafraichir   # ignore le cache de recherche

npm run dupliquer-quartiers
npm run dupliquer-quartiers -- --appliquer
```

#### `fetch-localisation.mjs` — retrouve les lieux sans localisation

Pour les lignes des feuilles Restaurants/Activités/Magasins/Hébergement dont la colonne "Localisation" est vide, cherche l'établissement sur Places (par nom + quartier, ou nom + adresse pour l'onglet Hébergement qui n'a pas de colonne Quartier) et écrit un lien Google Maps (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>&query_place_id=<id>`) reconnu par `GeolocationService.extraireCoordonnees` côté app — `query_place_id` fait que Google Maps affiche la fiche complète du lieu au clic (nom, avis, horaires, photos...) plutôt qu'un simple pin.

```bash
node --env-file=.env scripts/fetch-localisation.mjs                 # aperçu, aucune écriture
node --env-file=.env scripts/fetch-localisation.mjs --appliquer     # écrit dans le Sheet
node --env-file=.env scripts/fetch-localisation.mjs --rafraichir    # ignore le cache de recherche
node --env-file=.env scripts/fetch-localisation.mjs --reformater    # retraite aussi l'ancien format "?q=lat,lng" (pin seul)

npm run localisation
npm run localisation -- --appliquer
npm run localisation -- --reformater
```

#### `fetch-menu.mjs` — retrouve les liens de menu des restaurants

Pour les lignes de la feuille Restaurants dont la colonne "Menu" est vide, cherche l'établissement sur Places (par nom + quartier + position approximative extraite du lien "Localisation") et écrit le site web renseigné sur sa fiche Google Maps. Pour beaucoup de petits restaurants sans site officiel, ce champ pointe en réalité vers leur page Tabelog — ce qui correspond exactement au lien de menu recherché.

```bash
node --env-file=.env scripts/fetch-menu.mjs                 # aperçu, aucune écriture
node --env-file=.env scripts/fetch-menu.mjs --appliquer     # écrit dans le Sheet
node --env-file=.env scripts/fetch-menu.mjs --rafraichir    # ignore le cache de recherche

npm run menu
npm run menu -- --appliquer
```

> Les scripts avec un mode aperçu (`dupliquer-quartiers`, `fetch-localisation`, `fetch-menu`) ne modifient jamais le Sheet sans `--appliquer` : relisez toujours l'aperçu (les enseignes à succursales multiples — Daiso, Uniqlo, Starbucks... — peuvent être ambiguës même avec le quartier en indice) avant d'appliquer.

## Structure du projet

```
src/app/
  components/     Composants (home, carte, planning) + templates/styles
  service/        Accès données (Sheets, restaurants/activités/magasins/planning),
                   favoris, notes, thème, géolocalisation
  models/         Modèles de données (lieu affichable, quartier, ville, avis...)
  utils/          Fonctions pures (horaires, emoji par mot-clé, planning)
scripts/          Scripts de maintenance du Sheet (voir ci-dessus)
  lib/            Utilitaires partagés entre scripts (auth, cache, Sheets)
```
