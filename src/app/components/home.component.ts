import { Component, computed, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { combineLatest, catchError, of } from 'rxjs';
import {
  IonHeader, IonToolbar, IonSearchbar, IonChip, IonIcon, IonButton, IonButtons,
  IonLabel, IonBadge, IonTabBar, IonTabButton, IonSegment, IonSegmentButton, IonToggle,
  IonContent, IonSkeletonText, IonRefresher, IonRefresherContent,
  IonModal, IonTitle, IonSelect, IonSelectOption, IonTextarea, IonToast,
  IonFab, IonFabButton
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline, walkOutline, restaurantOutline,
  businessOutline, fastFoodOutline, listOutline,
  mapOutline, heartOutline, heart, refreshOutline, storefrontOutline,
  sunnyOutline, moonOutline, closeOutline, locationOutline,
  openOutline, starOutline, star, starHalf, pricetagOutline, playOutline,
  timeOutline, funnelOutline, layersOutline, chevronDownOutline, checkmarkOutline,
  calendarOutline, alarmOutline, createOutline, addOutline, arrowUpOutline,
  shareOutline, downloadOutline, cloudUploadOutline, todayOutline
} from 'ionicons/icons';

import { RestaurantService } from '../service/restaurant/restaurant.service';
import { ActiviteService } from '../service/activite/activite.service';
import { MagasinService } from '../service/magasin/magasin.service';
import { PlatService } from '../service/plat/plat.service';
import { HebergementService } from '../service/hebergement/hebergement.service';
import { GeolocationService } from '../service/geolocation/GeolocationService';
import { ThemeService } from '../service/theme/theme.service';
import { FavorisService } from '../service/favoris/favoris.service';
import { NotesService } from '../service/notes/notes.service';
import { VusRecemmentService } from '../service/vus-recemment/vus-recemment.service';
import { NouveauteService } from '../service/nouveaute/nouveaute.service';
import { LieuAffichable, TypeLieu } from '../models/lieu-affichable.model';
import { RestaurantModel } from '../models/restaurant.model';
import { ActiviteModel } from '../models/activite.model';
import { MagasinModel } from '../models/magasin.model';
import { HebergementModel } from '../models/hebergement.model';
import { Plat, PlatCategory } from '../models/plat.model';
import { emojiRestaurant, emojiActivite, emojiMagasin } from '../utils/emoji-lieu';
import { estOuvertMaintenant, horairesAujourdhui, horairesSemaine, fermetureImminente, prochaineReouverture } from '../utils/horaires';
import { CarteComponent } from './carte/carte.component';
import { PlanningComponent } from './planning/planning.component';
import { AjoutLieuComponent } from './ajout-lieu/ajout-lieu.component';
import { GoogleAuthService } from '../service/google/google-auth.service';

type Vue = 'liste' | 'carte' | 'favoris' | 'planning';

/** Normalise un nom pour regrouper les instances d'une même franchise (ex: "7-Eleven" ~ "7-eleven"), insensible casse/accents. */
function normaliserNom(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface GroupeFranchise {
  franchise: true;
  cle: string;
  nom: string;
  lieux: LieuAffichable[];
}

interface GroupeQuartier {
  quartier: string;
  lieux: LieuAffichable[];
}

interface GroupeVille {
  ville: string;
  quartiers: GroupeQuartier[];
}

interface VilleQuartiers {
  ville: string;
  quartiers: string[];
}

type DetailLieu =
  | { type: 'restaurant'; data: RestaurantModel }
  | { type: 'activite'; data: ActiviteModel }
  | { type: 'magasin'; data: MagasinModel };

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonSearchbar, IonChip, IonIcon, IonButton, IonButtons,
    IonLabel, IonBadge, IonTabBar, IonTabButton, IonSegment, IonSegmentButton, IonToggle,
    IonContent, IonSkeletonText, IonRefresher, IonRefresherContent,
    IonModal, IonTitle, IonSelect, IonSelectOption, IonTextarea, IonToast,
    IonFab, IonFabButton,
    CarteComponent, PlanningComponent, AjoutLieuComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {

  private readonly restaurantService = inject(RestaurantService);
  private readonly activiteService = inject(ActiviteService);
  private readonly magasinService = inject(MagasinService);
  private readonly platService = inject(PlatService);
  private readonly hebergementService = inject(HebergementService);
  private readonly geoloc = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly themeService = inject(ThemeService);
  protected readonly favorisService = inject(FavorisService);
  protected readonly notesService = inject(NotesService);
  protected readonly vusRecemmentService = inject(VusRecemmentService);
  protected readonly nouveauteService = inject(NouveauteService);
  private readonly googleAuth = inject(GoogleAuthService);

  // Le Planning charge ses données via son propre service/cache (Sheet distinct) :
  // le bouton de rafraîchissement de l'en-tête doit donc lui déléguer l'action
  // quand cette vue est active, plutôt que de rafraîchir restaurants/activités/magasins.
  @ViewChild(PlanningComponent) private readonly planningComponent?: PlanningComponent;

  // La Carte reste montée en permanence (voir template), la référence est donc
  // toujours disponible dès le premier rendu, contrairement au Planning ci-dessus.
  @ViewChild(CarteComponent) private readonly carteComponent?: CarteComponent;

  // Uniquement disponible pendant que la modale d'ajout est ouverte (contenu
  // paresseux de ion-modal). Utilisé pour bloquer une fermeture accidentelle
  // (swipe, tap sur le fond) tant que le formulaire contient une saisie non vide.
  @ViewChild(AjoutLieuComponent) private readonly ajoutLieuComponent?: AjoutLieuComponent;

  // Référence directe (template reference variable) plutôt que @ViewChild(IonContent) :
  // ce dernier matcherait le premier ion-content du template, mais celui des modales
  // (détail, plat, picker quartier...) est stampé dynamiquement dans son propre
  // ng-template, donc pas de risque de collision en pratique. On reste explicite.
  @ViewChild('contenuPrincipal') private readonly contenuPrincipal?: IonContent;

  // Etat
  readonly chargement = signal(true);
  readonly erreurChargement = signal<string | null>(null);
  // 'tout' par défaut : ce filtre est partagé avec la Carte, qui doit montrer
  // tous les types de lieux dès l'ouverture plutôt que masquer silencieusement
  // activités/magasins tant qu'on n'a pas cliqué sur un autre chip.
  readonly filtreActif = signal<TypeLieu | 'tout'>('tout');
  // Filtre orthogonal aux chips de type ci-dessus (peut se combiner à n'importe
  // lequel) : ne garde que les lieux dont l'horaire calculé (estOuvert) est
  // actuellement vrai. Les lieux sans horaires connus (estOuvert undefined) sont
  // exclus, comme le badge Ouvert/Fermé de la carte de lieu qui les masque déjà.
  readonly filtreOuvertMaintenant = signal(false);
  // Heure projetée (HH:mm) : null = "maintenant" (comportement historique du chip
  // "Ouvert"). Renseignée, elle bascule le filtre sur "sera ouvert à cette heure
  // aujourd'hui" plutôt que l'instant présent — utile pour planifier à l'avance
  // (ex: "qu'est-ce qui sera ouvert quand j'arriverai à 19h ?").
  readonly filtreHeureProjetee = signal<string | null>(null);
  readonly recherche = signal('');

  // Filtre quartier, applicable à toutes les vues (Tout/Restaurants/Activités/Magasins)
  readonly filtreQuartier = signal<string | null>(null);
  readonly pickerQuartierOuvert = signal(false);
  readonly afficherModaleAjout = signal(false);

  // Callback [canDismiss] de la modale d'ajout : arrow function (pas une méthode
  // liée par le binding Angular) pour garder un `this` correct quand Ionic
  // l'appelle directement. Délègue à AjoutLieuComponent, seul à savoir si son
  // formulaire contient une saisie non vide à confirmer avant de perdre.
  protected readonly verifierFermetureAjout = async (): Promise<boolean> =>
    (await this.ajoutLieuComponent?.confirmerAbandon()) ?? true;

  // Sous-filtres, spécifiques au type de lieu actif
  readonly filtrePlat = signal<string | null>(null);
  readonly filtreCategoriePlat = signal<PlatCategory | 'tout'>('tout');
  // Exposé pour le template (comparaisons PlatCategory.Plat/.Snack sur le toggle catégorie).
  readonly PlatCategory = PlatCategory;
  readonly filtreTypeMagasin = signal<string | null>(null);
  readonly lieux = signal<LieuAffichable[]>([]);
  // Passé en @Input à app-planning : chargé ici pour bénéficier du même
  // rafraîchissement forcé que Restaurants/Activités/Magasins/Plats, quel que
  // soit l'onglet actif au moment où l'utilisateur déclenche un rafraîchissement.
  readonly hebergements = signal<HebergementModel[]>([]);
  readonly vue = signal<Vue>('liste');
  readonly affichageGroupe = signal(false);
  // Groupes de franchise (vue Liste à plat) actuellement dépliés, par clé
  // (voir lieuxAffichesGroupesFranchise) — repliés par défaut, plusieurs
  // groupes peuvent être dépliés en même temps indépendamment les uns des autres.
  readonly franchisesOuvertes = signal<Set<string>>(new Set());
  // Repliée par défaut : la section "Vus récemment" ne doit pas prendre de place
  // tant que l'utilisateur n'a pas explicitement choisi de la consulter.
  readonly recentsOuvert = signal(false);
  readonly detailSelectionne = signal<DetailLieu | null>(null);
  readonly platSelectionne = signal<Plat | null>(null);
  readonly toastMessage = signal<string | null>(null);
  // Bouton "retour en haut" (vue Liste uniquement) : apparaît passé un certain
  // défilement, seuil arbitraire au-delà duquel remonter au doigt devient pénible.
  private static readonly SEUIL_BOUTON_HAUT = 400;
  readonly afficherBoutonHaut = signal(false);
  // Id du lieu dont le cœur favori vient d'être basculé, le temps de l'animation "pop"
  // (voir basculerFavori()) — un seul à la fois suffit, deux favoris tapés à la volée
  // n'ont pas besoin d'animer indépendamment.
  readonly favoriAnime = signal<string | null>(null);
  private static readonly DUREE_ANIMATION_FAVORI = 300;

  // Debounce de la note perso (voir enregistrerNote()/flusherNote()).
  private noteEnAttente: { id: string; texte: string } | null = null;
  private noteDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Données brutes (issues des services) conservées pour alimenter la popup de détails,
  // qui a besoin de champs absents de la vue "LieuAffichable" (Description, Avis, Plats...).
  private readonly restaurantsBruts = signal<RestaurantModel[]>([]);
  private readonly activitesBrutes = signal<ActiviteModel[]>([]);
  private readonly magasinsBruts = signal<MagasinModel[]>([]);
  private readonly platsBruts = signal<Plat[]>([]);

  // Position et libellé de zone courante, dérivés du service de géoloc
  readonly position = this.geoloc.position;

  // Valeurs disponibles pour les sous-filtres, dérivées des données brutes
  readonly platsDisponibles = computed(() =>
    [...new Set(this.platsBruts().map(p => p.Nom).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );
  readonly quartiersParVille = computed((): VilleQuartiers[] => {
    const parVille = new Map<string, Set<string>>();

    for (const lieu of this.lieux()) {
      const quartier = lieu.quartier.Nom?.trim();
      if (!quartier) continue;

      const ville = lieu.quartier.Ville?.Nom?.trim() || 'Ville inconnue';
      if (!parVille.has(ville)) {
        parVille.set(ville, new Set());
      }
      parVille.get(ville)!.add(quartier);
    }

    return [...parVille.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ville, quartiers]) => ({
        ville,
        quartiers: [...quartiers].sort((a, b) => a.localeCompare(b))
      }));
  });
  readonly typesMagasins = computed(() =>
    [...new Set(this.magasinsBruts().map(m => m.Type).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );

  // Recherche texte dans le picker de quartier (non persistée, réinitialisée à chaque
  // ouverture — voir ouvrirPickerQuartier()). "Tous les quartiers" reste toujours visible :
  // c'est une action de reset, pas un résultat de recherche.
  readonly rechercheQuartier = signal('');
  readonly quartiersParVilleFiltres = computed((): VilleQuartiers[] => {
    const terme = this.rechercheQuartier().toLowerCase().trim();
    if (!terme) {
      return this.quartiersParVille();
    }
    return this.quartiersParVille()
      .map(groupe => ({ ville: groupe.ville, quartiers: groupe.quartiers.filter(q => q.toLowerCase().includes(terme)) }))
      .filter(groupe => groupe.quartiers.length > 0);
  });

  // Lieux dont la popup de détail a été ouverte récemment (voir VusRecemmentService),
  // dans l'ordre de consultation (le plus récent en premier).
  readonly lieuxRecents = computed((): LieuAffichable[] => {
    const parId = new Map(this.lieux().map(l => [l.id, l]));
    const filtre = this.filtreActif();
    return this.vusRecemmentService.idsRecents()
      .map(id => parId.get(id))
      .filter((l): l is LieuAffichable => !!l)
      .filter(l => filtre === 'tout' || l.type === filtre)
      .slice(0, 10);
  });

// Liste filtrée + triée par distance, recalculée automatiquement
  readonly lieuxAffiches = computed(() => {
    const filtre = this.filtreActif();
    const terme = this.recherche().toLowerCase().trim();
    const pos = this.position();

    let resultat = this.lieux();

    if (this.vue() === 'favoris') {
      resultat = resultat.filter(l => this.favorisService.estFavori(l.id));
    }

    if (filtre !== 'tout') {
      resultat = resultat.filter(l => l.type === filtre);
    }

    if (this.filtreOuvertMaintenant()) {
      const heure = this.filtreHeureProjetee();
      if (heure) {
        const momentProjete = this.construireMomentProjete(heure);
        resultat = resultat.filter(l => estOuvertMaintenant(l.horairesJson, momentProjete) === true);
      } else {
        resultat = resultat.filter(l => l.estOuvert === true);
      }
    }

    const quartierFiltre = this.filtreQuartier();
    if (quartierFiltre) {
      resultat = resultat.filter(l => l.quartier.Nom === quartierFiltre);
    }

    if (filtre === 'restaurant') {
      const platFiltre = this.filtrePlat();
      const categorieFiltre = this.filtreCategoriePlat();

      if (platFiltre) {
        resultat = resultat.filter(l =>
          l.platsNoms?.some(nom => nom.toLowerCase() === platFiltre.toLowerCase())
        );
      }
      if (categorieFiltre !== 'tout') {
        resultat = resultat.filter(l =>
          l.platsNoms?.some(nom => this.trouverPlat(nom)?.Categorie === categorieFiltre)
        );
      }
    }

    if (filtre === 'magasin') {
      const typeFiltre = this.filtreTypeMagasin();
      if (typeFiltre) {
        resultat = resultat.filter(l => l.typeMagasin === typeFiltre);
      }
    }

    if (terme) {
      resultat = resultat.filter(l =>
        l.nom.toLowerCase().includes(terme) ||
        l.quartier.Nom.toLowerCase().includes(terme) ||
        l.description?.toLowerCase().includes(terme) ||
        l.commentaires?.toLowerCase().includes(terme) ||
        l.platsNoms?.some(nom => nom.toLowerCase().includes(terme))
      );
    }

    if (pos) {
      return resultat
        .map(l => ({ ...l, distanceMetres: this.distanceVersLieu(l, pos) }))
        .sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity));
    }

    return [...resultat].sort((a, b) => a.nom.localeCompare(b.nom));
  });

  // Vue Liste à plat (non groupée par ville/quartier) : les instances d'une même
  // franchise (ex: un konbini présent dans plusieurs quartiers) sont regroupées
  // sous une seule entrée plutôt que dispersées dans la liste, sinon "7-Eleven"
  // apparaîtrait autant de fois qu'il y a de quartiers et noierait les lieux
  // uniques. Un groupe est positionné au rang de sa première occurrence dans
  // lieuxAffiches() (donc la plus proche si la position est connue, sinon la
  // première alphabétiquement), pour ne pas perturber le tri déjà appliqué.
  readonly lieuxAffichesGroupesFranchise = computed((): (LieuAffichable | GroupeFranchise)[] => {
    const lieux = this.lieuxAffiches();
    const parCle = new Map<string, LieuAffichable[]>();
    for (const lieu of lieux) {
      const cle = `${lieu.type}_${normaliserNom(lieu.nom)}`;
      if (!parCle.has(cle)) {
        parCle.set(cle, []);
      }
      parCle.get(cle)!.push(lieu);
    }

    const dejaTraites = new Set<string>();
    const resultat: (LieuAffichable | GroupeFranchise)[] = [];
    for (const lieu of lieux) {
      const cle = `${lieu.type}_${normaliserNom(lieu.nom)}`;
      if (dejaTraites.has(cle)) continue;
      dejaTraites.add(cle);
      const groupe = parCle.get(cle)!;
      resultat.push(groupe.length > 1 ? { franchise: true, cle, nom: lieu.nom, lieux: groupe } : lieu);
    }
    return resultat;
  });

  // Regroupement Ville -> Quartier de la liste affichée, pour la vue groupée.
  readonly groupesVille = computed((): GroupeVille[] => {
    const parVille = new Map<string, Map<string, LieuAffichable[]>>();

    for (const lieu of this.lieuxAffiches()) {
      const ville = lieu.quartier.Ville?.Nom?.trim() || 'Ville inconnue';
      const quartier = lieu.quartier.Nom?.trim() || 'Quartier inconnu';

      if (!parVille.has(ville)) {
        parVille.set(ville, new Map());
      }
      const parQuartier = parVille.get(ville)!;
      if (!parQuartier.has(quartier)) {
        parQuartier.set(quartier, []);
      }
      parQuartier.get(quartier)!.push(lieu);
    }

    return [...parVille.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ville, parQuartier]) => ({
        ville,
        quartiers: [...parQuartier.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([quartier, lieux]) => ({ quartier, lieux }))
      }));
  });

  constructor() {
    addIcons({
      searchOutline, walkOutline, restaurantOutline,
      businessOutline, fastFoodOutline, listOutline,
      mapOutline, heartOutline, heart, refreshOutline, storefrontOutline,
      sunnyOutline, moonOutline, closeOutline, locationOutline,
      openOutline, starOutline, star, starHalf, pricetagOutline, playOutline,
      timeOutline, funnelOutline, layersOutline, chevronDownOutline, checkmarkOutline,
      calendarOutline, alarmOutline, createOutline, addOutline, arrowUpOutline,
      shareOutline, downloadOutline, cloudUploadOutline, todayOutline
    });
  }

  ngOnInit(): void {
    this.geoloc.demarrerSuivi();
    this.chargerDonnees();
  }

  /** Force le rechargement des données depuis Google Sheets en ignorant le cache. */
  rafraichir(event?: CustomEvent): void {
    const termine = () => (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    if (this.vue() === 'planning') {
      this.planningComponent?.charger(termine);
      return;
    }
    this.chargerDonnees(true, termine);
  }

  /** Reflète le chargement de la vue active : Planning a son propre état, indépendant de celui-ci. */
  rafraichissementEnCours(): boolean {
    return this.vue() === 'planning' ? (this.planningComponent?.chargement() ?? false) : this.chargement();
  }

  /**
   * Ouvre la modale d'ajout et tente dans la foulée une reconnexion Google
   * silencieuse (GoogleAuthService.tenterReconnexionSilencieuse()). Doit
   * rester synchrone et appelée directement depuis ce (click) : le popup GIS,
   * même en mode silencieux, est bloqué par le navigateur s'il n'est pas
   * ouvert dans le prolongement immédiat d'un geste utilisateur.
   */
  ouvrirModaleAjout(): void {
    this.afficherModaleAjout.set(true);
    this.googleAuth.tenterReconnexionSilencieuse();
  }

  /**
   * Le lieu vient d'être écrit dans le Sheet : on recharge pour l'afficher, mais on
   * laisse la modale ouverte (AjoutLieuComponent vide déjà son formulaire) pour
   * permettre d'en saisir un autre à la suite sans la rouvrir à chaque fois.
   */
  onLieuAjoute(): void {
    this.toastMessage.set('Lieu ajouté au Sheet');
    this.chargerDonnees(true);
  }

  private chargerDonnees(forceRefresh = false, onDone?: () => void): void {
    this.chargement.set(true);
    this.erreurChargement.set(null);

    // Adapter les noms de méthodes/champs à vos services et models réels
    combineLatest([
      this.restaurantService.getRestaurants(forceRefresh),
      this.activiteService.getActivites(forceRefresh),
      this.magasinService.getMagasins(forceRefresh),
      this.platService.getPlats(forceRefresh),
      // Erreur interceptée ici plutôt que laissée remonter à combineLatest :
      // un onglet Hébergement cassé ou pas encore publié ne doit pas empêcher
      // le chargement de Restaurants/Activités/Magasins/Plats (best-effort).
      this.hebergementService.getHebergements(forceRefresh).pipe(catchError(() => of([] as HebergementModel[])))
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([restaurants, activites, magasins, plats, hebergements]) => {
          const lieuxRestaurants: LieuAffichable[] = restaurants.map(r => ({
            id: r.id,
            type: 'restaurant',
            nom: r.Nom,
            quartier: r.Quartier,
            latitude: r.latitude,
            longitude: r.longitude,
            prixIndicatif: r.Prix,
            estOuvert: estOuvertMaintenant(r.Horaires) ?? undefined,
            horaireTexte: horairesAujourdhui(r.Horaires) ?? undefined,
            horairesJson: r.Horaires ?? undefined,
            icone: emojiRestaurant(r),
            platsNoms: r.Plats.map(p => p.Nom),
            description: r.Description,
            commentaires: r.Commentaires
          }));

          // "Trajet" et "Free" sont des activités techniques (transit entre 2 villes,
          // temps libre) sans intérêt à afficher comme un vrai lieu : on les exclut ici
          // pour qu'elles disparaissent à la fois de la liste/carte et du lien Planning
          // -> fiche lieu (qui se base sur ces lieux). Elles restent visibles dans le
          // Planning lui-même, qui lit l'onglet Planning indépendamment de cette liste.
          const NOMS_ACTIVITES_TECHNIQUES = ['trajet', 'free'];
          const lieuxActivites: LieuAffichable[] = activites
            .filter(a => !NOMS_ACTIVITES_TECHNIQUES.includes(a.Nom?.trim().toLowerCase() ?? ''))
            .map(a => ({
              id: a.id,
              type: 'activite',
              nom: a.Nom,
              quartier: a.Quartier,
              latitude: a.latitude,
              longitude: a.longitude,
              prixIndicatif: a.Prix,
              estOuvert: estOuvertMaintenant(a.Horaires) ?? undefined,
              horaireTexte: horairesAujourdhui(a.Horaires) ?? undefined,
              horairesJson: a.Horaires ?? undefined,
              icone: emojiActivite(a),
              description: a.Description,
              commentaires: a.Commentaires
            }));

          const lieuxMagasins: LieuAffichable[] = magasins.map(m => ({
            id: m.id,
            type: 'magasin',
            nom: m.Nom,
            quartier: m.Quartier,
            latitude: m.latitude,
            longitude: m.longitude,
            estOuvert: estOuvertMaintenant(m.Horaires) ?? undefined,
            horaireTexte: horairesAujourdhui(m.Horaires) ?? undefined,
            horairesJson: m.Horaires ?? undefined,
            icone: emojiMagasin(m),
            typeMagasin: m.Type,
            commentaires: m.Commentaires
          }));

          this.restaurantsBruts.set(restaurants);
          this.activitesBrutes.set(activites);
          this.magasinsBruts.set(magasins);
          this.platsBruts.set(plats);
          this.hebergements.set(hebergements);

          const tousLesLieux = [...lieuxRestaurants, ...lieuxActivites, ...lieuxMagasins];
          this.lieux.set(tousLesLieux);
          this.nouveauteService.enregistrer(tousLesLieux.map(l => l.id));
          this.chargement.set(false);
          onDone?.();
        },
        error: () => {
          this.chargement.set(false);
          this.erreurChargement.set('Impossible de charger les données. Vérifie ta connexion et réessaie.');
          onDone?.();
        }
      });
  }

  private distanceVersLieu(lieu: LieuAffichable, pos: { latitude: number; longitude: number }): number | null {
    if (lieu.latitude == null || lieu.longitude == null) return null;
    return GeolocationService.distanceMetres(pos, { latitude: lieu.latitude, longitude: lieu.longitude });
  }

  formaterDistance(metres?: number): string {
    return metres != null ? GeolocationService.formaterDistance(metres) : '';
  }

  changerFiltre(filtre: TypeLieu | 'tout'): void {
    this.filtreActif.set(filtre);
    this.filtrePlat.set(null);
    this.filtreCategoriePlat.set('tout');
    this.filtreTypeMagasin.set(null);
  }

  basculerOuvertMaintenant(): void {
    const nouvelEtat = !this.filtreOuvertMaintenant();
    this.filtreOuvertMaintenant.set(nouvelEtat);
    if (!nouvelEtat) {
      // Repart de "maintenant" au prochain réactivation plutôt que de garder une
      // heure projetée fantôme qui ne serait plus visible nulle part une fois le chip désactivé.
      this.filtreHeureProjetee.set(null);
    }
  }

  onHeureProjeteeChange(event: Event): void {
    const valeur = (event.target as HTMLInputElement).value;
    this.filtreHeureProjetee.set(valeur || null);
  }

  /**
   * Au clic, force les minutes à "00" (seule l'heure ronde nous intéresse pour ce filtre)
   * et sélectionne le segment heures pour permettre de taper directement par-dessus sans
   * devoir naviguer jusque-là. `.select()` sur un `<input type="time">` sélectionne son
   * premier segment (heures) dans les navigateurs Chromium/Firefox testés — comportement
   * non standardisé mais c'est la seule API disponible pour cibler un segment précis.
   */
  onClicHeureProjetee(event: MouseEvent): void {
    const input = event.target as HTMLInputElement;
    const heureActuelle = (input.value || this.filtreHeureProjetee() || '').split(':')[0]
      || String(new Date().getHours()).padStart(2, '0');
    const valeurArrondie = `${heureActuelle}:00`;

    if (input.value !== valeurArrondie) {
      input.value = valeurArrondie;
      this.filtreHeureProjetee.set(valeurArrondie);
    }
    input.select();
  }

  /** Heure affichée sur le chip/les cartes si le filtre "Ouvert" est actif ET projeté sur une heure choisie (pas "maintenant"). */
  heureProjeteeActive(): string | null {
    return this.filtreOuvertMaintenant() ? this.filtreHeureProjetee() : null;
  }

  /** Date d'aujourd'hui à l'heure choisie (HH:mm) : `estOuvertMaintenant()` ne regarde que jour de semaine + heure/minute. */
  private construireMomentProjete(heure: string): Date {
    const [heures, minutes] = heure.split(':').map(Number);
    const moment = new Date();
    moment.setHours(heures, minutes, 0, 0);
    return moment;
  }

  changerVue(vue: Vue): void {
    this.vue.set(vue);
  }

  /**
   * Depuis la Liste filtrée sur un quartier, bascule sur la Carte en la recentrant
   * sur ces lieux. La Carte reste montée en permanence et reçoit déjà la liste
   * filtrée (`lieuxAffiches`), il ne manque que le recadrage de la vue : le rAF
   * laisse le temps à l'effet `actif` de la carte (invalidateSize) de s'exécuter
   * en premier, sans quoi fitBounds calculerait sur une taille de conteneur périmée.
   */
  voirQuartierSurCarte(): void {
    this.changerVue('carte');
    requestAnimationFrame(() => this.carteComponent?.recentrerSurMarqueurs());
  }

  /** Depuis la popup détail d'un lieu, ferme la popup et bascule sur la Carte centrée sur ce lieu précis. */
  voirLieuSurCarte(latitude: number | null, longitude: number | null): void {
    if (latitude == null || longitude == null) {
      return;
    }
    this.fermerDetails();
    this.changerVue('carte');
    requestAnimationFrame(() => this.carteComponent?.centrerSurPoint(latitude, longitude));
  }

  basculerGroupement(): void {
    this.affichageGroupe.set(!this.affichageGroupe());
  }

  /** Garde de type pour distinguer un groupe de franchise d'un lieu simple dans le template. */
  estGroupeFranchise(item: LieuAffichable | GroupeFranchise): item is GroupeFranchise {
    return 'franchise' in item;
  }

  /** track de @for sur lieuxAffichesGroupesFranchise() : id du lieu, ou clé du groupe pour une franchise. */
  trackerLieuOuFranchise(item: LieuAffichable | GroupeFranchise): string {
    return this.estGroupeFranchise(item) ? `franchise_${item.cle}` : item.id;
  }

  /** Déplie/replie la liste des quartiers d'un groupe de franchise (vue Liste à plat). */
  basculerFranchise(cle: string): void {
    const ouvertes = new Set(this.franchisesOuvertes());
    if (ouvertes.has(cle)) {
      ouvertes.delete(cle);
    } else {
      ouvertes.add(cle);
    }
    this.franchisesOuvertes.set(ouvertes);
  }

  basculerRecents(): void {
    this.recentsOuvert.set(!this.recentsOuvert());
  }

  onScrollContenu(event: CustomEvent): void {
    const scrollTop = (event.detail as { scrollTop: number }).scrollTop;
    this.afficherBoutonHaut.set(scrollTop > HomeComponent.SEUIL_BOUTON_HAUT);
  }

  // Ordre de navigation du swipe horizontal entre onglets (voir onTouchEndContenu()).
  private static readonly ORDRE_VUES: Vue[] = ['liste', 'carte', 'favoris', 'planning'];
  private static readonly SEUIL_SWIPE_X = 60;
  private static readonly SEUIL_SWIPE_Y = 40;
  private swipeDepart: { x: number; y: number } | null = null;

  /**
   * Point de départ du swipe, ignoré s'il démarre sur la Carte (le geste doit rester
   * réservé au pan Leaflet, pas au changement d'onglet) ou dans une rangée qui défile
   * elle-même horizontalement (chips de filtres, "Vus récemment", mini-nav Planning) —
   * sinon un simple scroll horizontal de ces rangées changerait l'onglet par erreur.
   */
  onTouchStartContenu(event: TouchEvent): void {
    if (this.vue() === 'carte') {
      this.swipeDepart = null;
      return;
    }
    const cible = event.target as HTMLElement;
    if (cible.closest('.filtres, .recents-scroll, .planning-nav-jours')) {
      this.swipeDepart = null;
      return;
    }
    const touche = event.touches[0];
    this.swipeDepart = { x: touche.clientX, y: touche.clientY };
  }

  /** Swipe horizontal net (delta X franc, delta Y faible pour ne pas interférer avec le scroll vertical) → change d'onglet. */
  onTouchEndContenu(event: TouchEvent): void {
    const depart = this.swipeDepart;
    this.swipeDepart = null;
    if (!depart) {
      return;
    }

    const touche = event.changedTouches[0];
    const deltaX = touche.clientX - depart.x;
    const deltaY = touche.clientY - depart.y;
    if (Math.abs(deltaX) < HomeComponent.SEUIL_SWIPE_X || Math.abs(deltaY) > HomeComponent.SEUIL_SWIPE_Y) {
      return;
    }

    const indexActuel = HomeComponent.ORDRE_VUES.indexOf(this.vue());
    const nouvelIndex = indexActuel + (deltaX < 0 ? 1 : -1);
    if (nouvelIndex >= 0 && nouvelIndex < HomeComponent.ORDRE_VUES.length) {
      this.changerVue(HomeComponent.ORDRE_VUES[nouvelIndex]);
    }
  }

  scrollEnHaut(): void {
    this.contenuPrincipal?.scrollToTop(300);
  }

  /**
   * La mini-nav de jours du Planning (avec le jour courant surligné) défile avec le
   * reste du contenu plutôt que de rester fixe : ce bouton flottant (même ion-content,
   * même seuil de défilement que "retour en haut") permet d'y revenir sans avoir à
   * remonter manuellement toute la liste.
   */
  boutonAujourdhuiVisible(): boolean {
    return this.vue() === 'planning' && this.afficherBoutonHaut() && (this.planningComponent?.aUnJourAujourdhui() ?? false);
  }

  allerAujourdhuiPlanning(): void {
    this.planningComponent?.allerAujourdhui();
  }

  ouvrirPickerQuartier(): void {
    this.rechercheQuartier.set('');
    this.pickerQuartierOuvert.set(true);
  }

  choisirQuartier(quartier: string | null): void {
    this.filtreQuartier.set(quartier);
    this.pickerQuartierOuvert.set(false);
  }

  onRecherche(valeur: string): void {
    this.recherche.set(valeur ?? '');
  }

  /**
   * `marquerCommeVu` vaut false quand on ouvre depuis la section "Vus récemment" elle-même :
   * consulter à nouveau un lieu déjà présent dans cet historique ne doit pas le faire remonter
   * en tête ni rafraîchir sa date de dernière visite.
   */
  ouvrirDetails(lieu: LieuAffichable, marquerCommeVu = true): void {
    if (marquerCommeVu) {
      this.vusRecemmentService.marquerVu(lieu.id);
    }
    switch (lieu.type) {
      case 'restaurant': {
        const data = this.restaurantsBruts().find(r => r.id === lieu.id);
        if (data) this.detailSelectionne.set({ type: 'restaurant', data });
        break;
      }
      case 'activite': {
        const data = this.activitesBrutes().find(a => a.id === lieu.id);
        if (data) this.detailSelectionne.set({ type: 'activite', data });
        break;
      }
      case 'magasin': {
        const data = this.magasinsBruts().find(m => m.id === lieu.id);
        if (data) this.detailSelectionne.set({ type: 'magasin', data });
        break;
      }
    }
  }

  fermerDetails(): void {
    this.flusherNote();
    this.detailSelectionne.set(null);
  }

  /** Bascule le favori et confirme l'action par un toast, l'icône seule n'étant pas toujours assez visible.
   * Le toast reflète le résultat réel de la sauvegarde (localStorage peut échouer silencieusement en
   * navigation privée ou quota dépassé) plutôt que de confirmer à tort une action non persistée. */
  basculerFavori(id: string): void {
    const etaitFavori = this.favorisService.estFavori(id);
    const succes = this.favorisService.basculer(id);
    this.toastMessage.set(
      succes ? (etaitFavori ? 'Retiré des favoris' : 'Ajouté aux favoris') : "Impossible d'enregistrer (stockage indisponible)"
    );
    if (succes) {
      this.vibrer();
      this.favoriAnime.set(id);
      setTimeout(() => {
        if (this.favoriAnime() === id) {
          this.favoriAnime.set(null);
        }
      }, HomeComponent.DUREE_ANIMATION_FAVORI);
    }
  }

  /** Vibration courte best-effort (API non supportée sur iOS Safari — no-op silencieux dans ce cas). */
  private vibrer(duree = 15): void {
    navigator.vibrate?.(duree);
  }

  /**
   * Enregistre la note perso avec un léger debounce pendant la frappe (au lieu du seul
   * (ionChange), déclenché sur perte de focus : fermer la popup par swipe/tap sur le fond sans
   * avoir quitté le champ pouvait perdre la saisie en cours). `fermerDetails()` force un flush
   * immédiat pour ne rien perdre si la modale se ferme avant la fin du debounce.
   */
  enregistrerNote(id: string, texte: string): void {
    this.noteEnAttente = { id, texte };
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
    }
    this.noteDebounceTimer = setTimeout(() => this.flusherNote(), 600);
  }

  private flusherNote(): void {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = null;
    }
    if (!this.noteEnAttente) {
      return;
    }
    const { id, texte } = this.noteEnAttente;
    this.noteEnAttente = null;
    const succes = this.notesService.definirNote(id, texte);
    this.toastMessage.set(
      succes ? (texte.trim() ? 'Note enregistrée' : 'Note supprimée') : "Impossible d'enregistrer la note (stockage indisponible)"
    );
    if (succes) {
      this.vibrer();
    }
  }

  /** Depuis le détail d'un lieu, retourne à la Liste filtrée sur ce quartier (tous types) pour explorer les alentours. */
  voirQuartier(nomQuartier: string): void {
    this.fermerDetails();
    this.changerFiltre('tout');
    this.choisirQuartier(nomQuartier);
    this.changerVue('liste');
  }

  /**
   * Web Share API (partage natif du système, ex: vers Messages/WhatsApp) si dispo, sinon repli
   * sur une copie presse-papiers du texte. Une annulation du partage par l'utilisateur (fermeture
   * de la feuille système, `AbortError`) n'est pas une erreur à signaler par toast.
   */
  async partagerLieu(detail: DetailLieu): Promise<void> {
    const texte = detail.data.Localisation ? `${detail.data.Nom} — ${detail.data.Localisation}` : detail.data.Nom;

    if (navigator.share) {
      try {
        await navigator.share({ title: detail.data.Nom, text: texte });
      } catch (erreur) {
        if ((erreur as DOMException)?.name !== 'AbortError') {
          this.toastMessage.set('Impossible de partager ce lieu');
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(texte);
      this.toastMessage.set('Lien copié dans le presse-papiers');
    } catch {
      this.toastMessage.set('Impossible de copier le lien');
    }
  }

  /**
   * Sauvegarde/transfert manuel des favoris+notes entre appareils : ces deux services sont
   * 100% locaux (localStorage, pas de compte, pas de synchro entre membres du groupe), donc
   * la seule façon de les déplacer d'un appareil à l'autre est un export/import explicite.
   */
  exporterDonnees(): void {
    const donnees = {
      version: 1,
      exporteLe: new Date().toISOString(),
      favoris: [...this.favorisService.favoris()],
      notes: Object.fromEntries(this.notesService.toutes())
    };
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `japon-favoris-notes-${new Date().toISOString().slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(url);
    this.toastMessage.set('Favoris et notes exportés');
  }

  declencherImport(inputFichier: HTMLInputElement): void {
    inputFichier.click();
  }

  /**
   * Import "best-effort", non destructif : `FavorisService.importer`/`NotesService.importer`
   * fusionnent avec les données déjà présentes sur l'appareil plutôt que de les remplacer
   * (voir leurs commentaires respectifs) — restaurer une sauvegarde ne peut donc jamais faire
   * perdre un favori/une note ajoutés depuis sur ce même appareil.
   */
  async onFichierImporte(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) {
      return;
    }

    try {
      const contenu = JSON.parse(await fichier.text());
      const favoris = Array.isArray(contenu?.favoris) ? contenu.favoris as string[] : [];
      const notes = contenu?.notes && typeof contenu.notes === 'object' ? contenu.notes as Record<string, string> : {};

      this.favorisService.importer(favoris);
      this.notesService.importer(notes);
      this.toastMessage.set(`Import réussi (${favoris.length} favori(s), ${Object.keys(notes).length} note(s))`);
    } catch {
      this.toastMessage.set('Fichier invalide, import impossible');
    }
  }

  emojiDetail(detail: DetailLieu): string {
    switch (detail.type) {
      case 'restaurant': return emojiRestaurant(detail.data);
      case 'activite': return emojiActivite(detail.data);
      case 'magasin': return emojiMagasin(detail.data);
    }
  }

  /** undefined = pas d'horaires renseignés (badge masqué), sinon ouvert/fermé à l'instant présent. */
  estOuvertDetail(horaires?: string): boolean | undefined {
    return estOuvertMaintenant(horaires) ?? undefined;
  }

  /** Minutes avant fermeture si le lieu ferme bientôt (30 min), sinon null. */
  fermetureImminenteDetail(horaires?: string): number | null {
    return fermetureImminente(horaires, 30);
  }

  /** Prochaine réouverture connue quand le lieu est actuellement fermé, sinon null. */
  prochaineReouvertureDetail(horaires?: string): string | null {
    return prochaineReouverture(horaires);
  }

  /** Horaires de la semaine (lundi -> dimanche) pour la popup de détails. */
  horairesSemaineDetail(horaires?: string) {
    return horairesSemaine(horaires);
  }

  /** Icônes (pleine/demie/vide) à afficher pour représenter une moyenne sur 5 sous forme d'étoiles. */
  etoiles(moyenne: number): ('star' | 'star-half' | 'star-outline')[] {
    const arrondi = Math.round(moyenne * 2) / 2;
    return Array.from({ length: 5 }, (_, i) => {
      const seuil = i + 1;
      if (arrondi >= seuil) return 'star';
      if (arrondi >= seuil - 0.5) return 'star-half';
      return 'star-outline';
    });
  }

  /** Distance vers un lieu de la popup de détails, à partir de ses coordonnées brutes. */
  distanceDetail(latitude: number | null, longitude: number | null): number | null {
    const pos = this.position();
    if (!pos || latitude == null || longitude == null) return null;
    return GeolocationService.distanceMetres(pos, { latitude, longitude });
  }

  /** Ouvre la popup de détails d'un plat à partir de son nom (liste "Plats" du restaurant). */
  ouvrirPlat(nomPlat: string): void {
    const data = this.trouverPlat(nomPlat);
    this.platSelectionne.set(data ?? { Nom: nomPlat } as Plat);
  }

  fermerPlat(): void {
    this.platSelectionne.set(null);
  }

  severitePlat(categorie: Plat['Categorie']) {
    return this.platService.getSeverity(categorie);
  }

  /** Couleur du chip d'un plat dans la liste du restaurant, selon sa catégorie (Plat = vert, Snack = rouge). */
  couleurPlat(nomPlat: string): string {
    const plat = this.trouverPlat(nomPlat);
    return plat ? this.severitePlat(plat.Categorie) : 'medium';
  }

  private trouverPlat(nomPlat: string): Plat | undefined {
    return this.platsBruts().find(p => p.Nom?.trim().toLowerCase() === nomPlat.trim().toLowerCase());
  }
}
