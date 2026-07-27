# Contexte projet — Japon (guide de voyage)

App Ionic/Angular servant de guide de voyage collectif pour un séjour au Japon (restaurants, activités, magasins, planning d'itinéraire), données sourcées depuis un Google Sheet partagé par le groupe. Voir `README.md` pour l'installation et l'usage des scripts de maintenance du Sheet.

Tout le code (identifiants, commentaires, textes UI) est en **français** — continuer dans cette langue.

## Contexte détaillé

@docs/fonctionnalites.md
@docs/architecture-et-pieges.md

## Rappels rapides avant de coder

- Angular 21 standalone + signals + zoneless, pas de `NgModule`, pas de Router (navigation d'onglets = un simple signal `vue` dans `HomeComponent`).
- `filtreActif` défaut à `'tout'` (pas `'restaurant'`) — ne pas revenir en arrière, voir pièges connus.
- `RestaurantService`/`ActiviteService` calculent `latitude`/`longitude` explicitement (le constructeur du modèle ne s'exécute jamais, ils construisent des objets littéraux) — tout nouveau champ calculé dans ces constructeurs doit être dupliqué dans le service.
- `CarteComponent` reste **toujours monté** (masqué en CSS, jamais détruit via `@if`) — ne pas réintroduire un `@if` dessus, ça recasse le rendu WebGL/Leaflet.
- Planning a son propre cache/service, séparé de `SheetsApi` — toute action "rafraîchir" doit déléguer au bon pipeline selon l'onglet actif.
- Après toute modification TypeScript/HTML : `npx tsc --noEmit -p tsconfig.app.json` puis `npx ng build --configuration development` (seul warning attendu : `NG8113 HomeComponent not used within AppComponent`).
