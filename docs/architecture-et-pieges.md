# Architecture et pièges connus

Choses non évidentes en lisant juste le code — à vérifier avant de "corriger" quelque chose qui est en fait volontaire, et à ne pas re-casser.

## Modèle de données

- **`LieuAffichable`** (`models/lieu-affichable.model.ts`) unifie restaurant/activité/magasin pour l'affichage (Liste/Carte/Favoris). Construit dans `HomeComponent.chargerDonnees()` à partir des modèles bruts — les modèles bruts (`RestaurantModel`, `ActiviteModel`, `MagasinModel`) sont conservés à part (`restaurantsBruts` etc.) pour alimenter la popup de détail, qui a besoin de champs absents de `LieuAffichable` (Description, Avis, Plats...).
- **`QuartierModel.Ville`** est résolu via `resoudreQuartier()` (`utils/quartier.ts`), qui cherche dans la feuille de référence "Quartiers" (gid `1855356526`). Ne jamais recaster un `Quartier` brut du CSV directement en `QuartierModel` : le champ `Ville` ne serait pas peuplé.
- **Piège corrigé — coordonnées manquantes** : `RestaurantService`/`ActiviteService` construisent leurs objets par spread + cast TypeScript (`{...row, ...} as RestaurantModel`), **sans jamais appeler `new RestaurantModel(...)`**. Or c'est le *constructeur* de `RestaurantModel`/`ActiviteModel` qui calcule `latitude`/`longitude` à partir du lien Google Maps (`GeolocationService.extraireCoordonnees`). Résultat : ces deux services doivent recalculer les coordonnées **explicitement** dans le `.map()`, exactement comme le fait déjà `MagasinService`. Si un nouveau champ calculé est ajouté au constructeur d'un de ces modèles, il faut penser à faire pareil ici — le constructeur ne s'exécute jamais en pratique pour ces trois services.
- **`GeolocationService.extraireCoordonnees`** (et sa copie Node dans `scripts/lib/google-sheets.mjs`, à garder synchronisée) teste 3 formats de lien Google Maps, dans cet ordre précis :
  1. `!3d<lat>!4d<lng>` — position précise du lieu, prioritaire.
  2. `?q=<lat>,<lng>` — format qu'on écrit nous-mêmes depuis les scripts de maintenance.
  3. `@<lat>,<lng>` — centre de la vue au moment du partage, peut être décalé, donc vérifié en dernier.
- **`filtreActif`** (`HomeComponent`) défaut à `'tout'`, pas à `'restaurant'`. Ce filtre est partagé entre Liste et Carte (la Carte reçoit `lieuxAffiches()`, déjà filtré) : un défaut restrictif masquait silencieusement activités et magasins sur la carte tant qu'on n'avait pas cliqué un autre chip.
- **`Trajet`** est une valeur spéciale de `ActiviteModel.Nom` : une activité "technique" représentant un trajet entre deux villes, sans intérêt à afficher comme un lieu. Exclue explicitement à la construction de `lieuxActivites` dans `HomeComponent.chargerDonnees()` — donc absente de la Liste, de la Carte, et du matching Planning→lieu (qui se base sur `lieux()`).

## Planning : ville inférée, pas toujours lue directement

Dans le Sheet, la colonne "Ville" de l'onglet Planning n'est renseignée que sur certaines lignes (convention de cellules fusionnées côté Sheet ; l'export CSV laisse les autres lignes vides). Un simple "report de la dernière valeur non vide" est **incorrect** : certains séjours (ex: Kyoto, ou un deuxième passage à Tokyo) n'ont jamais de valeur explicite dans la colonne Ville sur toute leur durée, ce qui aurait attribué à tort ces activités à la ville précédente.

`PlanningService.parserCsv()` s'appuie donc sur la colonne "Trajet", qui contient systématiquement un texte du type "Trajet vers `<Ville>`" / "Vol vers `<Ville>`" à chaque changement de ville — y compris quand la colonne Ville elle-même est vide. La ligne de trajet appartient encore à l'ancienne ville ; c'est la ligne *suivante* qui bascule. Voir le commentaire en tête de `parserCsv()` pour le détail de l'algorithme.

Si le format du Sheet change (plus de "vers X" dans Trajet, ou une autre convention), cette inférence casse silencieusement — pas d'erreur, juste une mauvaise ville affichée.

## Deux pipelines de données indépendants

- `SheetsApi` (cache 5 min par gid, localStorage) alimente Restaurants/Activités/Magasins/Quartiers/Plats — chargés ensemble via `combineLatest` dans `HomeComponent.chargerDonnees()`.
- `PlanningService` a son **propre** cache localStorage (`planning_cache`, stale-while-revalidate) et sa propre logique de chargement, complètement indépendante de `SheetsApi`.
- Conséquence : le bouton de rafraîchissement de l'en-tête (`HomeComponent.rafraichir()`) doit savoir déléguer au bon pipeline selon l'onglet actif. Il utilise une `@ViewChild(PlanningComponent)` pour appeler `planningComponent.charger()` quand `vue() === 'planning'`, sinon il rafraîchit lui-même restaurants/activités/magasins/plats.

## Carte : composant permanent, jamais détruit

`CarteComponent` reste monté en permanence dans `home.component.html` (masqué via `[class.masquee]` → `visibility:hidden`), **jamais** via `@if`. Historique : le détruire/recréer à chaque changement d'onglet épuisait les contextes WebGL du navigateur ("WebGL context was lost"), reproductible sur plusieurs navigateurs sur la machine de dev. Après ça, la tuile vectorielle (MapLibre GL) a aussi été abandonnée au profit de tuiles **raster** MapTiler — plus de dépendance WebGL du tout, seule la persistance du composant était nécessaire mais les deux mesures ont été prises ensemble.

Implication pratique : les effects de `CarteComponent` (mise à jour des marqueurs, de la position) tournent en continu même quand l'onglet Carte n'est pas affiché. L'input `actif` sert uniquement à déclencher `invalidateSize()` (recalcul de la taille des tuiles Leaflet) au moment où le conteneur redevient visible.

**Piège corrigé — Leaflet + leaflet.markercluster en scripts globaux, pas en modules ES.** `leaflet.markercluster` est un plugin qui mute un `L` global déjà existant (`L.MarkerClusterGroup = ...`) plutôt que d'exporter proprement ses propres bindings. `import * as L from 'leaflet'; import 'leaflet.markercluster';` fonctionnait en dev (`ng serve`) mais plantait en build de production avec `TypeError: L.markerClusterGroup is not a function` — le bundling ESM/CJS de production ne garantit pas que ce plugin s'exécute au bon moment pour retrouver le `L` importé par le composant. Fix : les deux libs sont chargées en scripts globaux classiques (`angular.json` > `build` > `options` > `scripts`, dans cet ordre : `leaflet.js` puis `leaflet.markercluster.js`), qui s'exécutent avant le bundle Angular et posent un vrai `window.L` sans ambiguïté de bundler. Côté `carte.component.ts`, plus aucun import runtime de `leaflet`/`leaflet.markercluster` : uniquement `import type * as LeafletType from 'leaflet'` (typage, zéro JS émis) + `/// <reference types="leaflet.markercluster" />` (augmentation de types) + `const L: typeof LeafletType = (globalThis as ...).L;` (lit la vraie valeur sur le global posé par les scripts). Un fichier TS étant un module, il ne peut pas référencer un "UMD global" par son nom nu (`export as namespace L` de `@types/leaflet`) sans ce détour — d'où cette construction en apparence indirecte.

## Scripts de maintenance (`scripts/*.mjs`)

Indépendants de l'app, authentification OAuth "Desktop app" (pas de compte de service — bloqué par `iam.disableServiceAccountKeyCreation` sur un compte Google managé par une organisation ; utiliser un compte personnel si besoin). Détails d'usage complets dans `README.md`.

- Les 3 scripts qui appellent Places API partagent un cache disque (`scripts/lib/cache.mjs`, fichiers sous `scripts/.cache/`, gitignorés) par `(feuille, nom, quartier)`, pour économiser les appels API et garantir que ce qui est écrit avec `--appliquer` correspond exactement à ce qui a été vu à l'aperçu.
- Le lien Google Maps écrit par les scripts est toujours au format `?q=<lat>,<lng>` (jamais le `googleMapsUri` brut de Google, souvent un lien par `cid` sans coordonnées lisibles) — pour rester compatible avec `extraireCoordonnees` côté app.

## Conventions de code

- Tout le code (variables, commentaires, messages UI) est en **français**.
- Angular 21 standalone + signals + zoneless : pas de `NgModule`, pas de `Zone.js`, nouvelle syntaxe de contrôle de flux (`@if`/`@for`/`@let`).
- Pas de routing Angular : la navigation entre onglets est un simple signal (`vue`), pas d'URL dédiée par onglet.
