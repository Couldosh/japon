# Fonctionnalités de l'application

Détail par onglet de ce qui existe réellement dans le code (à tenir à jour à chaque fonctionnalité ajoutée/retirée). Vue d'ensemble courte dans `README.md` ; ce fichier est le niveau de détail utile pour reprendre le développement.

L'app a 4 onglets, pilotés par un signal `vue` dans `HomeComponent` (`'liste' | 'carte' | 'favoris' | 'planning'`) — **pas de routing Angular**, tout est dans un seul composant + enfants.

## Liste (`home.component.ts/html`)

- Recherche texte (debounce 250ms) sur nom, quartier, description, commentaires, noms de plats.
- Filtre par type : chips Tout / Restaurants / Activités / Magasins. **Défaut : `'tout'`** (ce filtre est partagé avec la Carte — un défaut sur un seul type masquerait silencieusement les autres sur la carte).
- Filtre par quartier : picker custom en bottom-sheet (pas un `ion-select`, pour avoir des en-têtes de ville en gras/majuscules), quartiers groupés par ville.
- Sous-filtres spécifiques au type actif : plat + catégorie (Plat/Snack) pour les restaurants, type de magasin pour les magasins.
- Bouton "regrouper" : bascule liste plate / groupée par Ville → Quartier.
- Tri : par distance si la position est connue, sinon alphabétique. Pas de sélecteur de tri manuel (retiré sur demande explicite : distance-ou-alphabétique suffit).
- Chaque carte de lieu affiche : emoji (heuristique par mot-clé, voir `utils/emoji-lieu.ts`), cœur si favori, icône crayon si une note perso existe, badge Ouvert/Fermé, badge "Ferme dans X min" si pertinent, distance, prix, horaires du jour.
- Bouton "voir sur la carte" (icône carte) dans l'en-tête de section, visible seulement si un quartier est filtré : bascule sur la Carte et la recentre/zoome sur les lieux de ce quartier (`CarteComponent.recentrerSurMarqueurs()`).
- États : squelettes de chargement, message d'erreur + bouton Réessayer, état vide.

### Popup de détail d'un lieu

Modale en bottom-sheet swipeable (`[breakpoints]="[0,1]"`), commune aux 3 types avec un template par type (`@if (detail.type === ...)`) :

- Badges : Ouvert/Fermé, "Ferme dans X min", "Réouvre à...", quartier (**cliquable** → ferme la popup, filtre la Liste sur ce quartier en mode Tout), prix, distance.
- Étoiles (moyenne `Avis`, 8 votants nommés dans le Sheet — pas de notation utilisateur, uniquement affichage).
- Horaires de la semaine, description, commentaires.
- Restaurant uniquement : liste de plats en chips colorées (vert = Plat, rouge = Snack), cliquables → popup détail du plat.
- Note personnelle : `ion-textarea` avec auto-save (`NotesService`, localStorage, device-only) + toast de confirmation.
- Bouton favori (cœur) avec toast de confirmation.
- Liens d'action : Maps, Menu, Vidéo, Plus d'infos (selon ce qui est renseigné).
- Magasin : un quartier peut avoir plusieurs valeurs (colonne "Quartier" à virgules) → un badge cliquable par quartier.

## Carte (`components/carte/`)

- Leaflet + `leaflet.markercluster`, tuiles **raster** MapTiler (`streets-v2`) — pas de WebGL/vecteur (voir pièges connus : ça plantait sur la machine de dev).
- **Composant monté en permanence**, masqué en CSS (`visibility:hidden`) plutôt que détruit via `@if` — recréer le contexte carte à chaque changement d'onglet causait des "WebGL context was lost".
- Marqueur emoji par lieu, marqueur de position dédié, bouton recentrage sur la position.
- Filtre "favoris uniquement" (bouton cœur haut-droit) ; overlay d'état vide si le filtre ne retourne aucun marqueur.
- Gestion d'erreur d'init (clé MapTiler invalide, etc.) avec bouton Réessayer.
- Optimisation : signature (id+favori) mémoïsée pour éviter de reconstruire tous les marqueurs à chaque tick de géolocalisation.

## Favoris

- Simple filtre de `lieux()` par `FavorisService.estFavori(id)`, mêmes cartes/popup que la Liste.
- Badge de comptage sur le bouton de la tab bar (masqué si 0).

## Planning (`components/planning/`)

- Source : onglet Sheet dédié (gid `1009205135`), service séparé avec son propre cache localStorage (`planning_cache`), stratégie stale-while-revalidate (affiche le cache immédiatement, revalide en réseau).
- Regroupement par jour ; jour courant mis en évidence (bordure + fond teinté + badge "Aujourd'hui") et **auto-scrollé** à l'ouverture de l'onglet (une fois par montage du composant).
- Filtre par ville : chips avec compteur d'activités par ville, apparaissent seulement si plusieurs villes existent dans le planning ; retour en haut de liste au changement de filtre.
- Lien vers la fiche lieu : chaque activité est comparée (nom normalisé, accents/casse ignorés) aux lieux connus (`lieuxParNom`) ; si ça matche, un chevron apparaît et le clic ouvre la popup détail habituelle.
- Détection de ville même quand la colonne "Ville" du Sheet est vide (cellules fusionnées côté Sheet) : voir `docs/architecture-et-pieges.md`.
- Bouton Réessayer sur erreur réseau (bandeau discret si des données en cache restent affichées, état vide dédié sinon).
- Le bouton de rafraîchissement de l'en-tête (commun à tous les onglets) délègue au chargement propre du Planning quand cet onglet est actif (`HomeComponent` a une `@ViewChild(PlanningComponent)`).

## Notes et Favoris (services)

- `FavorisService` (`Set<string>`) et `NotesService` (`Map<string,string>`), tous deux localStorage, **100% locaux à l'appareil** — pas de compte, pas de synchronisation entre les membres du groupe.

## UX transverse

- Toasts de confirmation (favori ajouté/retiré, note enregistrée/supprimée).
- Thème clair/sombre (bouton dans l'en-tête), lu une seule fois au chargement depuis la préférence système (pas de suivi live des changements système en cours d'usage — piste d'amélioration non implémentée).
- Zones de tap ≥ 44px sur les filtres et boutons de section.
- Pull-to-refresh sur Liste/Favoris et sur Planning (pas sur Carte).

## Idées proposées mais non retenues (ne pas re-proposer sans qu'on les redemande)

PWA/mode hors-ligne installable, tri/filtre par note (Avis), conversion de devise ¥→€, recherche texte dans le Planning, croisement géoloc × Planning ("près de vous"), attribution des favoris/notes par personne (nécessiterait un backend pour une vraie synchro de groupe).
