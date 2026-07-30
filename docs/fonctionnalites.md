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
- Bouton "Voir sur la carte" (icône + label) dans l'en-tête de section, visible seulement si un quartier est filtré : bascule sur la Carte et la recentre/zoome sur les lieux de ce quartier (`CarteComponent.recentrerSurMarqueurs()`). Même intitulé que le bouton équivalent de la popup détail (voir plus bas), qui centre lui sur un lieu précis (`CarteComponent.centrerSurPoint()`).
- États : squelettes de chargement, message d'erreur + bouton Réessayer, état vide.
- Section "Vus récemment" : en-tête repliable (repliée par défaut, signal `recentsOuvert` non persisté) qui révèle une rangée horizontale scrollable avec les derniers lieux dont la popup de détail a été ouverte (`VusRecemmentService`, localStorage, 100% local à l'appareil — même principe que `FavorisService`/`NotesService`). Visible avec n'importe quel filtre de type (Tout/Restaurants/Activités/Magasins), tant qu'aucune recherche/quartier/regroupement n'est actif pour ne pas se superposer à une liste déjà filtrée par l'utilisateur ; `lieuxRecents()` filtre elle-même les lieux par le type actif (sauf `'tout'`) pour rester cohérente avec la liste affichée en dessous. L'en-tête reste affiché même sans historique (état vide "Aucun lieu consulté récemment." une fois dépliée), plutôt que de disparaître entièrement — l'utilisateur sait ainsi que la fonctionnalité existe avant d'avoir consulté un premier lieu. Cliquer sur une vignette de cette section ouvre le détail sans rafraîchir sa date de dernière visite ni le faire remonter en tête (`ouvrirDetails(lieu, false)`), pour ne pas figer artificiellement l'ordre de l'historique.

### Popup de détail d'un lieu

Modale en bottom-sheet swipeable (`[breakpoints]="[0,1]"`), commune aux 3 types avec un template par type (`@if (detail.type === ...)`) :

- Badges : Ouvert/Fermé, "Ferme dans X min", "Réouvre à...", quartier (**cliquable** → ferme la popup, filtre la Liste sur ce quartier en mode Tout), prix, distance.
- Étoiles (moyenne `Avis`, 8 votants nommés dans le Sheet — pas de notation utilisateur, uniquement affichage).
- Horaires de la semaine, description, commentaires.
- Restaurant uniquement : liste de plats en chips colorées (vert = Plat, rouge = Snack), cliquables → popup détail du plat.
- Note personnelle : `ion-textarea` avec auto-save debounced (~600ms après la fin de la frappe, `HomeComponent.enregistrerNote()`/`flusherNote()`) + toast de confirmation. Un flush immédiat est forcé à la fermeture de la popup (bouton, swipe ou tap sur le fond) pour ne pas perdre une saisie récente si elle survient avant la fin du debounce.
- Bouton favori (cœur) avec toast de confirmation.
- Liens d'action : Voir sur la carte (interne à l'app, ferme la popup et centre `CarteComponent` sur ce lieu — visible si latitude/longitude connues), Maps (lien externe), Menu, Vidéo, Plus d'infos (selon ce qui est renseigné).
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
- **Météo du jour** (`MeteoService`) : badge emoji + min/max affiché dans l'en-tête de chaque groupe de jour, pour la ville de la **dernière** activité du jour (meilleure approximation d'où on passe la soirée, y compris un jour de trajet entre deux villes). Source : Open-Meteo (gratuit, sans clé API) — géocodage du nom de ville (`geocoding-api.open-meteo.com`) puis prévisions jusqu'à 16 jours (`api.open-meteo.com/v1/forecast`), résultat mis en cache 6h en localStorage par ville (clé `meteo_cache_<ville>`), indépendant du cache `SheetsApi`/`planning_cache`. Purement best-effort : ville non géolocalisable, jour hors de la fenêtre de prévision (~16 jours, donc rien pour un jour trop lointain) ou erreur réseau se traduisent silencieusement par l'absence du badge, jamais par une erreur affichée — la météo est cosmétique, pas une donnée du Sheet.
- **Hébergements** (`HebergementService`, onglet Sheet dédié "Hébergement") : bandeau dédié en tête de jour, distinct des activités, sur le jour d'arrivée ("🏨 Nom — check-in HH:mm") et sur le jour de départ ("check-out HH:mm"). Un hébergement n'apparaît que sur un jour qui existe déjà comme groupe dans le Planning (au moins une activité/un trajet ce jour-là) — limitation acceptée, pas de jour "vide" créé spécifiquement pour un hébergement. Contrairement au Planning lui-même (cache localStorage stale-while-revalidate), cet onglet passe par le pipeline standard `SheetsApi` (cache 5 min) et est chargé par `HomeComponent.chargerDonnees()` avec Restaurants/Activités/Magasins/Plats (passé en `@Input()` à `PlanningComponent`), pour profiter du même rafraîchissement forcé quel que soit l'onglet actif — en best-effort : une erreur sur cet onglet (`catchError` avant le `combineLatest`) n'empêche pas le chargement du reste des données. Cliquer sur le bandeau ouvre une popup de détail dédiée (adresse, dates+horaires de check-in/out, commentaires, lien Google Maps si renseigné) ; pas de lien vers la Carte ni d'ajout possible depuis "Ajouter un lieu" (hors périmètre v1).

## Ajouter un lieu (`components/ajout-lieu/`)

- Bouton "+" dans l'en-tête (visible sur toutes les vues) ouvre une modale bottom-sheet plein écran.
- Écrit **directement dans le Google Sheet** (pas de brouillon/validation intermédiaire) via l'API Sheets v4, authentifié avec le compte Google de l'utilisateur (OAuth2 côté navigateur, scope `spreadsheets`) — voir `docs/architecture-et-pieges.md` pour le détail du canal d'écriture et ses limites (token en mémoire, non persisté).
- Sélecteur de type (Restaurant / Activité / Magasin / **Plat** / **Quartier**), champs communs aux 3 lieux (Nom, Quartier, Lien, Localisation, Commentaires) + champs spécifiques par type (Description/Prix pour Restaurant et Activité, Vidéo/Menu pour Restaurant, Temps pour Activité, Type pour Magasin).
- **Plat** n'est pas un lieu : pas de Quartier/Localisation dans le formulaire, mais Catégorie (Plat/Snack, mêmes valeurs que `PlatCategory`) et Wiki/lien à la place. Écrit dans l'onglet de référence "Plats" (gid `2053739160`, `PlatService`), pas dans un onglet de lieu.
- **Quartier** non plus : ni Description/Prix/Commentaires ni les autres champs communs, juste Nom du quartier + Ville (chip parmi les villes déjà connues via `VilleService`, ou saisie manuellement pour une ville inédite). Écrit dans la feuille de référence "Quartiers" (gid `1855356526`, colonne `Mood` laissée vide). Si la ville tapée à la main ne correspond à aucune ville connue (comparaison insensible casse/accents), une confirmation est demandée ("Nouvelle ville ?", même schéma que `confirmerEcrasement()` pour Places) avant de l'ajouter à la feuille de référence "Villes" (gid `357846773`, `VilleService` — jusqu'ici injecté nulle part ailleurs dans l'app), pour éviter qu'une faute de frappe sur une ville existante crée un doublon silencieux dans le Sheet partagé ; annuler laisse le formulaire intact. Une fois confirmée (ou si la ville correspond à une ville existante), la ville est écrite en premier puis le quartier. Comme pour Plat, la modale reste ouverte après l'ajout et les listes de quartiers/villes sont rechargées aussitôt, donc un quartier (et sa ville, le cas échéant) tout juste créés apparaissent immédiatement dans le picker de quartier ci-dessous sans fermer/rouvrir la modale.
- Champ "Plats" du formulaire Restaurant : chips colorées (vert/rouge, même code que le badge du détail restaurant — `PlatService.getSeverity`), sélection/désélection au tap, alimentées par `PlatService.getPlats()`. Depuis que la modale reste ouverte après un ajout (voir ci-dessous), un plat tout juste créé via le type "Plat" apparaît directement dans cette liste sans avoir à fermer/rouvrir.
- Quartier (pour Restaurant/Activité/Magasin) choisi via un picker bottom-sheet groupé par ville, alimenté par la liste exhaustive de `QuartierService` (contrairement au picker de filtre de la Liste, qui ne connaît que les quartiers déjà présents dans les lieux chargés).
- Bouton "Rechercher sur Google Places" (Restaurant/Activité/Magasin, pas Plat) : recherche l'établissement via Places API (New) à partir de Nom + Quartier, préremplit Lien (site web) et Localisation (badge "auto" sur les champs concernés, retiré dès que l'utilisateur les retouche à la main). Si l'un de ces champs contient déjà une valeur, demande confirmation avant de l'écraser. Pour un Restaurant, tente aussi de présélectionner des plats déjà connus dont le nom apparaît dans le résumé Google de l'établissement — best-effort, Places ne fournissant pas de vraie liste de plats, à vérifier avant d'ajouter.
- Un compte Google connecté à l'app mais sans accès Éditeur sur le Sheet peut se connecter mais pas écrire (erreur 403 explicite).
- Après un ajout réussi, **la modale reste ouverte** (formulaire vidé, même type sélectionné) pour enchaîner plusieurs ajouts sans la rouvrir à chaque fois ; un toast confirme chaque ajout. Fermeture manuelle via le bouton "×".
- Fermeture accidentelle de la modale (swipe, tap sur le fond, bouton "×") bloquée par une confirmation tant que le formulaire contient une saisie non vide (`AjoutLieuComponent.confirmerAbandon()`, appelé par `HomeComponent` via `[canDismiss]` sur la `ion-modal`).
- Messages d'erreur et de résultat de recherche Places sont dismissables (bouton "×" dédié) plutôt que de rester affichés jusqu'au prochain essai ; un texte d'aide sous le bouton "Ajouter au Sheet" explique pourquoi il est désactivé quand le formulaire est invalide.
- Après ajout réussi : toast de confirmation, fermeture de la modale, rechargement des données pour que le nouveau lieu/plat apparaisse immédiatement.
- Limitation connue (v1) : un magasin ne peut avoir qu'un seul quartier depuis ce formulaire, même si la colonne "Quartier" des magasins supporte plusieurs valeurs dans le Sheet — éditable ensuite directement dans le Sheet si besoin.

## Notes et Favoris (services)

- `FavorisService` (`Set<string>`) et `NotesService` (`Map<string,string>`), tous deux localStorage, **100% locaux à l'appareil** — pas de compte, pas de synchronisation entre les membres du groupe. Indexés par l'id de lieu généré par `genererIdLieu()` (`utils/lieu-id.ts`, nom + quartier normalisés) — voir `docs/architecture-et-pieges.md` pour le piège corrigé (ancien id basé sur la position dans le Sheet, instable dès qu'une ligne est ajoutée/supprimée par un autre membre du groupe).

## UX transverse

- Toasts de confirmation (favori ajouté/retiré, note enregistrée/supprimée) — reflètent l'échec réel si la sauvegarde localStorage échoue (quota dépassé, navigation privée), pas juste une confirmation optimiste.
- Thème clair/sombre (bouton dans l'en-tête) : suit la préférence système en direct pendant la session tant que l'utilisateur n'a jamais basculé le thème manuellement (`ThemeService`) ; dès qu'il le fait une fois, son choix explicite est mémorisé et n'est plus jamais écrasé par un changement système.
- Zones de tap ≥ 44px sur les filtres et boutons de section.
- Pull-to-refresh sur Liste/Favoris et sur Planning (pas sur Carte).

## Idées proposées mais non retenues (ne pas re-proposer sans qu'on les redemande)

PWA/mode hors-ligne installable, tri/filtre par note (Avis), conversion de devise ¥→€, recherche texte dans le Planning, croisement géoloc × Planning ("près de vous"), attribution des favoris/notes par personne (nécessiterait un backend pour une vraie synchro de groupe).
