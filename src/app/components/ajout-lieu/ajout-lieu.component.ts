import { Component, DestroyRef, Input, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, firstValueFrom, from, of, Subscription, switchMap, tap, toArray } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonChip, IonItem, IonInput, IonTextarea, IonModal, IonSpinner, IonToggle, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, funnelOutline, chevronDownOutline, alertCircleOutline, sparklesOutline } from 'ionicons/icons';
import { GoogleAuthService } from '../../service/google/google-auth.service';
import { SheetsWriteService } from '../../service/google/sheets-write.service';
import { QuartierService } from '../../service/quartier/quartier.service';
import { QuartierModel } from '../../models/quartier.model';
import { VilleService } from '../../service/ville/ville.service';
import { VilleModel } from '../../models/ville.model';
import { PlatService } from '../../service/plat/plat.service';
import { Plat, PlatCategory } from '../../models/plat.model';
import { PlacesSearchService, ResultatPlaces } from '../../service/google/places-search.service';
import { SuggestionLieu } from '../../models/ia.model';
import { RestaurantService } from '../../service/restaurant/restaurant.service';
import { RestaurantModel } from '../../models/restaurant.model';
import { MagasinService } from '../../service/magasin/magasin.service';
import { MagasinModel } from '../../models/magasin.model';
import { ActiviteService } from '../../service/activite/activite.service';
import { ActiviteModel } from '../../models/activite.model';
import { IaService } from '../../service/ia/ia.service';

type TypeAjout = 'restaurant' | 'activite' | 'magasin' | 'plat' | 'quartier';

/** Lieu ou plat à préremplir en mode édition (voir preremplirPourModification()) — "quartier"
 * n'est volontairement pas modifiable via ce formulaire (hors périmètre demandé). */
export interface EditionInitiale {
  type: TypeAjout;
  data: RestaurantModel | ActiviteModel | MagasinModel | Plat;
}

/** Normalise un nom pour un matching insensible à la casse/aux accents (ex: "Ramen" ~ "râmen"). */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface VilleQuartiers {
  ville: string;
  quartiers: string[];
}

/** gid de l'onglet Sheet correspondant à chaque type, voir README.md. "quartier" pointe vers
 * l'onglet de référence "Quartiers" (même gid que QuartierService). */
const GID_PAR_TYPE: Record<TypeAjout, string> = {
  restaurant: '892590698',
  activite: '0',
  magasin: '346756517',
  plat: '2053739160',
  quartier: '1855356526',
};

/** gid de l'onglet de référence "Villes" (même gid que VilleService), pour y ajouter une ville
 * saisie manuellement lors de la création d'un quartier — voir soumettreQuartier(). */
const GID_VILLES = '357846773';

/** "Plat" et "Quartier" ne sont pas des lieux (pas de Quartier/Localisation) : traités à part dans le formulaire. */
const TYPES_LIEU: TypeAjout[] = ['restaurant', 'activite', 'magasin'];

/** Types pour lesquels la case "Franchise" est proposée : restaurants, activités et magasins
 * ont de vraies chaînes/enseignes multi-quartiers (konbini, fast-foods, salles d'arcade...). */
const TYPES_FRANCHISABLES: TypeAjout[] = ['restaurant', 'activite', 'magasin'];

/**
 * Formulaire d'ajout d'un lieu (restaurant/activité/magasin), qui écrit
 * directement dans le Google Sheet via SheetsWriteService — voir
 * docs/architecture-et-pieges.md pour le détail du canal d'écriture.
 */
@Component({
  selector: 'app-ajout-lieu',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonChip, IonItem, IonInput, IonTextarea, IonModal, IonSpinner, IonToggle
  ],
  templateUrl: './ajout-lieu.component.html',
  styleUrl: './ajout-lieu.component.scss'
})
export class AjoutLieuComponent implements OnInit {
  protected readonly googleAuth = inject(GoogleAuthService);
  private readonly sheetsWrite = inject(SheetsWriteService);
  private readonly quartierService = inject(QuartierService);
  private readonly villeService = inject(VilleService);
  private readonly platService = inject(PlatService);
  private readonly placesSearch = inject(PlacesSearchService);
  private readonly iaService = inject(IaService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly magasinService = inject(MagasinService);
  private readonly activiteService = inject(ActiviteService);
  private readonly alertController = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);

  /** Souscription de la recherche franchise en cours, pour permettre son annulation
   * (annulerFranchise()) — les quartiers déjà écrits avant l'annulation restent acquis. */
  private franchiseSubscription: Subscription | null = null;

  /** Renseigné par HomeComponent pour ouvrir le formulaire en mode édition plutôt que création
   * (voir modifierLieu()/modifierPlat() côté HomeComponent) — lu dans ngOnInit(), le composant
   * étant recréé à chaque ouverture de la modale (contenu paresseux de ion-modal). */
  @Input() editionInitiale: EditionInitiale | null = null;

  readonly ferme = output<void>();
  readonly ajoute = output<string>();
  readonly modifie = output<void>();

  /** Vrai si le formulaire modifie un lieu/plat existant plutôt que d'en créer un — type figé,
   * case "Franchise" masquée, et soumettre() modifie la ligne du Sheet au lieu d'en ajouter une. */
  readonly modeEdition = signal(false);
  /** Nom (+ Quartier pour un lieu) au moment de l'ouverture du formulaire — sert à relocaliser
   * la ligne à modifier même si l'utilisateur change ces champs en cours d'édition. */
  private readonly cleOriginale = signal<{ nom: string; quartier?: string } | null>(null);
  /** Libellé du type figé affiché en mode édition, à la place du sélecteur de type. */
  readonly libelleTypeEdition = computed(() => {
    switch (this.type()) {
      case 'restaurant': return 'restaurant';
      case 'activite': return 'activité';
      case 'magasin': return 'magasin';
      default: return 'plat';
    }
  });

  readonly type = signal<TypeAjout>('restaurant');
  readonly nom = signal('');
  readonly quartier = signal<string | null>(null);
  /** Restaurant "franchise" : pas de quartier unique à choisir, une instance est
   * recherchée via Google Places dans chaque quartier connu du Sheet à la soumission. */
  readonly estFranchise = signal(false);
  readonly progressionFranchise = signal<{ traites: number; trouves: number; total: number } | null>(null);
  readonly liens = signal('');
  readonly localisation = signal('');
  readonly description = signal('');
  readonly prix = signal('');
  readonly platsSelectionnes = signal<string[]>([]);
  readonly video = signal('');
  readonly menu = signal('');
  readonly temps = signal('');
  readonly typeMagasin = signal('');
  readonly commentaires = signal('');
  readonly categoriePlat = signal<PlatCategory>(PlatCategory.Plat);
  readonly wiki = signal('');

  readonly PlatCategory = PlatCategory;
  readonly estUnLieu = computed(() => TYPES_LIEU.includes(this.type()));

  readonly pickerQuartierOuvert = signal(false);

  /** Champs du type "Quartier" : ville choisie parmi les villes connues, ou saisie manuellement. */
  readonly villeQuartier = signal<string | null>(null);
  readonly nouvelleVilleQuartier = signal('');

  readonly enCours = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly rechercheEnCours = signal(false);
  readonly rechercheMessage = signal<string | null>(null);
  /** Photo de l'établissement trouvé par la dernière recherche Google Places (voir
   * rechercherPlaces()), pour aider à confirmer que c'est la bonne enseigne avant d'ajouter —
   * particulièrement utile pour les chaînes ambiguës (Daiso, Uniqlo...) avant de basculer en
   * mode Franchise. null si aucune recherche n'a encore été faite ou si Places n'a pas de photo. */
  readonly photoApercu = signal<string | null>(null);
  /** Champs ('liens'/'localisation') dont la valeur actuelle vient de la dernière recherche
   * Google Places, pour afficher un badge "auto" — effacé dès que l'utilisateur retouche le champ. */
  readonly champsAutoRemplis = signal<Set<'liens' | 'localisation'>>(new Set());
  /** Résumé Google Places de la dernière recherche (rechercherPlaces()), conservé pour les
   * boutons IA (génération de description, extraction de plats) qui peuvent être utilisés
   * après coup, indépendamment de preselectionnerPlats() qui ne fait que le consommer. */
  readonly resumeGooglePlaces = signal<string | null>(null);

  /** Suggestions de l'IA (backend /ai/recherche-lieu) à partir du seul Nom saisi, avant même
   * d'avoir choisi un quartier — voir rechercherSuggestionsIa(). Sélectionner une suggestion
   * (choisirSuggestionIa()) préremplit le quartier puis enchaîne automatiquement sur
   * rechercherPlaces(), le "combo IA puis Google Places" : l'IA dégrossit l'identification
   * (nom exact, quartier, ville) à partir d'un nom parfois partiel, Places confirme ensuite
   * l'adresse exacte et le lien Google Maps. */
  readonly suggestionsIaEnCours = signal(false);
  readonly suggestionsIaErreur = signal<string | null>(null);
  readonly suggestionsIa = signal<SuggestionLieu[]>([]);
  /** Distingue "pas encore cherché" de "cherché, aucune suggestion" pour l'affichage. */
  readonly suggestionsIaEffectuee = signal(false);

  readonly descriptionIaEnCours = signal(false);
  readonly descriptionIaErreur = signal<string | null>(null);
  readonly platsIaEnCours = signal(false);
  readonly platsIaErreur = signal<string | null>(null);
  /** Plats renvoyés par l'extraction IA mais absents de platsDisponibles() : affichés en
   * texte, pas en chip (la liste de chips reste fermée au référentiel "Plats" du Sheet). */
  readonly platsSuggeresInconnus = signal<string[]>([]);
  readonly platInfoIaEnCours = signal(false);
  readonly platInfoIaErreur = signal<string | null>(null);

  /** Pilote le bouton unique "Remplir automatiquement" (remplirAutomatiquement()), qui
   * remplace les anciens boutons séparés Identifier IA / Google Places / Description IA /
   * Plats IA : vrai tant que l'une de leurs étapes est en cours. */
  readonly remplissageAutoEnCours = computed(() =>
    this.suggestionsIaEnCours() || this.rechercheEnCours() || this.descriptionIaEnCours() || this.platsIaEnCours()
  );

  private readonly quartiers = signal<QuartierModel[]>([]);
  private readonly villes = signal<VilleModel[]>([]);
  private readonly platsBruts = signal<Plat[]>([]);
  private readonly restaurantsBruts = signal<RestaurantModel[]>([]);
  private readonly magasinsBruts = signal<MagasinModel[]>([]);
  private readonly activitesBruts = signal<ActiviteModel[]>([]);

  /** Noms de plats connus (feuille "Plats"), pour le sélecteur du formulaire Restaurant. */
  readonly platsDisponibles = computed(() =>
    [...new Set(this.platsBruts().map(p => p.Nom).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );

  private readonly platsParNom = computed(() => new Map(this.platsBruts().map(p => [p.Nom, p.Categorie])));

  /** Liste exhaustive des quartiers connus (contrairement au picker de filtre de la Liste,
   * qui ne connaît que les quartiers déjà présents dans les lieux chargés). */
  readonly quartiersParVille = computed((): VilleQuartiers[] => {
    const parVille = new Map<string, Set<string>>();

    for (const q of this.quartiers()) {
      const nom = q.Nom?.trim();
      if (!nom) continue;
      const ville = q.Ville?.Nom?.trim() || 'Ville inconnue';
      if (!parVille.has(ville)) {
        parVille.set(ville, new Set());
      }
      parVille.get(ville)!.add(nom);
    }

    return [...parVille.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ville, quartiers]) => ({ ville, quartiers: [...quartiers].sort((a, b) => a.localeCompare(b)) }));
  });

  /** Liste à plat de tous les quartiers connus (toutes villes confondues), pour la
   * recherche Google Places quartier par quartier d'un restaurant "franchise". */
  readonly quartiersConnus = computed(() => this.quartiersParVille().flatMap(g => g.quartiers));

  /** Par type franchisable (restaurant/activité/magasin), nom de lieu normalisé -> Set des
   * quartiers (normalisés) où il existe déjà dans le Sheet, pour ne pas rechercher/ajouter en
   * double une instance de franchise déjà présente (et pour avertir d'un doublon sur un ajout
   * normal, voir confirmerDoublonSiNecessaire()). */
  private readonly quartiersParNomParType = computed(() => {
    const parType = new Map<TypeAjout, Map<string, Set<string>>>();

    const indexerLieu = (type: TypeAjout, nom: string | null | undefined, quartierDuLieu: string | null | undefined) => {
      const nomNormalise = normaliser(nom ?? '');
      const quartierNormalise = normaliser(quartierDuLieu ?? '');
      if (!nomNormalise || !quartierNormalise) return;
      if (!parType.has(type)) {
        parType.set(type, new Map());
      }
      const parNom = parType.get(type)!;
      if (!parNom.has(nomNormalise)) {
        parNom.set(nomNormalise, new Set());
      }
      parNom.get(nomNormalise)!.add(quartierNormalise);
    };

    for (const r of this.restaurantsBruts()) {
      indexerLieu('restaurant', r.Nom, r.Quartier?.Nom);
    }
    for (const m of this.magasinsBruts()) {
      indexerLieu('magasin', m.Nom, m.Quartier?.Nom);
    }
    for (const a of this.activitesBruts()) {
      indexerLieu('activite', a.Nom, a.Quartier?.Nom);
    }

    return parType;
  });

  /** Quartiers connus (quartiersConnus()) où un lieu du type et du nom actuellement saisis
   * existe déjà — affiché comme indice, et exclus de la recherche par soumettreFranchise(). */
  readonly quartiersDejaCouverts = computed(() => {
    const nomNormalise = normaliser(this.nom().trim());
    if (!nomNormalise) return [];
    const existants = this.quartiersParNomParType().get(this.type())?.get(nomNormalise);
    if (!existants?.size) return [];
    return this.quartiersConnus().filter(q => existants.has(normaliser(q)));
  });

  /** Villes déjà connues dans la feuille de référence "Villes" (VilleService), pour choisir
   * plutôt que ressaisir une ville existante — et détecter si une saisie manuelle correspond
   * à une nouvelle ville à ajouter au Sheet (voir soumettreQuartier()). Réutilisée aussi comme
   * contexte pour /ai/recherche-lieu (rechercherSuggestionsIa()) : envoyer les villes du voyage
   * plutôt que les seuls quartiers déjà catalogués laisse l'IA citer n'importe quel quartier
   * réel de ces villes, au lieu de se limiter aux quelques quartiers déjà présents dans le
   * Sheet. */
  readonly villesConnues = computed(() =>
    [...new Set(this.villes().map(v => v.Nom?.trim()).filter((n): n is string => !!n))]
      .sort((a, b) => a.localeCompare(b))
  );

  /** Ville qui sera écrite pour le type "Quartier" : la nouvelle ville tapée à la main
   * a priorité sur une ville existante sélectionnée (les deux champs se désélectionnent
   * mutuellement au clic/à la saisie, voir choisirVilleQuartier()/majNouvelleVilleQuartier()). */
  private readonly villeAAppliquer = computed(() =>
    this.nouvelleVilleQuartier().trim() || this.villeQuartier()
  );

  readonly estTypeFranchisable = computed(() => TYPES_FRANCHISABLES.includes(this.type()));
  readonly estLieuFranchise = computed(() => this.estTypeFranchisable() && this.estFranchise());

  readonly formValide = computed(() => {
    if (!this.nom().trim()) return false;
    if (this.type() === 'quartier') return !!this.villeAAppliquer();
    if (this.estLieuFranchise()) return true;
    return this.estUnLieu() ? !!this.quartier() : true;
  });

  /** Explique pourquoi le formulaire n'est pas valide, affiché sous le bouton "Ajouter au Sheet". */
  readonly raisonInvalide = computed(() => {
    if (!this.nom().trim()) {
      if (this.type() === 'plat') return 'Le nom du plat est requis.';
      if (this.type() === 'quartier') return 'Le nom du quartier est requis.';
      return 'Le nom est requis.';
    }
    if (this.type() === 'quartier' && !this.villeAAppliquer()) {
      return 'Choisis ou saisis une ville.';
    }
    if (this.estUnLieu() && !this.quartier() && !this.estLieuFranchise()) {
      return 'Choisis un quartier.';
    }
    return null;
  });

  /** Vrai si l'utilisateur a commencé à saisir quelque chose — sert à confirmer avant
   * d'abandonner la saisie (fermeture accidentelle de la modale). */
  readonly formulaireRempli = computed(() =>
    [
      this.nom(), this.liens(), this.localisation(), this.description(), this.prix(),
      this.video(), this.menu(), this.temps(), this.typeMagasin(), this.commentaires(), this.wiki(),
      this.nouvelleVilleQuartier()
    ].some(valeur => valeur.trim().length > 0)
    || this.quartier() !== null
    || this.villeQuartier() !== null
    || this.platsSelectionnes().length > 0
    || this.estFranchise()
  );

  constructor() {
    addIcons({ closeOutline, checkmarkOutline, funnelOutline, chevronDownOutline, alertCircleOutline, sparklesOutline });
  }

  ngOnInit(): void {
    // La reconnexion silencieuse est déclenchée par HomeComponent.ouvrirModaleAjout(),
    // depuis le clic sur le bouton "+" — pas ici : au moment où ce composant se
    // monte, on est déjà hors du geste utilisateur synchrone, et le popup GIS
    // (même en mode silencieux) est alors bloqué par le navigateur.
    this.rafraichirListesReference(false);

    if (this.editionInitiale) {
      this.preremplirPourModification(this.editionInitiale);
    }
  }

  /** Préremplit le formulaire à partir d'un lieu/plat existant (voir EditionInitiale). Pour un
   * restaurant, `platsSelectionnes` reprend directement les noms de `Plats` sans les filtrer sur
   * `platsDisponibles()` (encore vide à cet instant, chargé de façon asynchrone par
   * rafraichirListesReference()) — les chips se cocheront correctement une fois ce chargement
   * terminé, `estPlatSelectionne()` ne faisant qu'un test d'appartenance. */
  private preremplirPourModification(edition: EditionInitiale): void {
    const { type, data } = edition;
    this.modeEdition.set(true);
    this.type.set(type);
    this.nom.set(data.Nom?.trim() ?? '');
    this.commentaires.set(data.Commentaires?.trim() ?? '');

    if (type === 'plat') {
      const plat = data as Plat;
      this.categoriePlat.set(plat.Categorie);
      this.description.set(plat.Description?.trim() ?? '');
      this.wiki.set(plat.Wiki?.trim() ?? '');
      this.cleOriginale.set({ nom: plat.Nom });
      return;
    }

    const lieu = data as RestaurantModel | ActiviteModel | MagasinModel;
    const quartierNom = lieu.Quartier?.Nom ?? null;
    this.quartier.set(quartierNom);
    this.liens.set(lieu.Liens?.trim() ?? '');
    this.localisation.set(lieu.Localisation?.trim() ?? '');
    this.cleOriginale.set({ nom: lieu.Nom, quartier: quartierNom ?? undefined });

    if (type === 'restaurant') {
      const restaurant = data as RestaurantModel;
      this.description.set(restaurant.Description?.trim() ?? '');
      this.prix.set(restaurant.Prix?.trim() ?? '');
      this.video.set(restaurant.Video?.trim() ?? '');
      this.menu.set(restaurant.Menu?.trim() ?? '');
      this.platsSelectionnes.set((restaurant.Plats ?? []).map(p => p.Nom));
    } else if (type === 'activite') {
      const activite = data as ActiviteModel;
      this.description.set(activite.Description?.trim() ?? '');
      this.prix.set(activite.Prix?.trim() ?? '');
      this.temps.set(activite.Temps?.trim() ?? '');
    } else {
      const magasin = data as MagasinModel;
      this.description.set(magasin.Description?.trim() ?? '');
      this.typeMagasin.set(magasin.Type?.trim() ?? '');
    }
  }

  /**
   * Recharge les listes de référence utilisées par le formulaire (quartiers pour
   * le picker, villes pour le type "Quartier", plats pour le multi-select du
   * Restaurant). Appelé au montage, puis après chaque ajout réussi avec
   * forceRefresh=true : SheetsWriteService a déjà vidé le cache SheetsApi du gid
   * concerné, mais les signals locaux de ce composant (indépendants de ceux de
   * HomeComponent) ne se rafraîchissent pas tout seuls — sans ce rappel, un plat
   * tout juste créé n'apparaîtrait pas dans le multi-select tant que la modale
   * n'est pas fermée puis rouverte.
   */
  private rafraichirListesReference(forceRefresh: boolean): void {
    this.quartierService.getQuartiers(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(quartiers => this.quartiers.set(quartiers));

    this.villeService.getVilles(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(villes => this.villes.set(villes));

    this.platService.getPlats(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(plats => this.platsBruts.set(plats));

    this.restaurantService.getRestaurants(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(restaurants => this.restaurantsBruts.set(restaurants));

    this.magasinService.getMagasins(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(magasins => this.magasinsBruts.set(magasins));

    this.activiteService.getActivites(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(activites => this.activitesBruts.set(activites));
  }

  changerType(type: TypeAjout): void {
    this.type.set(type);
    this.rechercheMessage.set(null);
    this.photoApercu.set(null);
    this.resumeGooglePlaces.set(null);
    this.platsSuggeresInconnus.set([]);
    this.suggestionsIa.set([]);
    this.suggestionsIaEffectuee.set(false);
    this.suggestionsIaErreur.set(null);
    if (!TYPES_FRANCHISABLES.includes(type)) {
      this.estFranchise.set(false);
    }
  }

  /** Bascule la case "Franchise" — en l'activant, efface les suggestions IA et le résultat
   * Google Places d'une éventuelle recherche précédente (par quartier, donc pas forcément
   * représentatif de l'enseigne dans son ensemble) pour ne pas laisser un résidu confus à
   * l'écran ni fausser la génération IA (rechercherResumeFranchise() refera une recherche
   * générique, sans quartier, la prochaine fois que le bouton IA sera utilisé). */
  basculerFranchise(active: boolean): void {
    this.estFranchise.set(active);
    if (active) {
      this.suggestionsIa.set([]);
      this.suggestionsIaEffectuee.set(false);
      this.suggestionsIaErreur.set(null);
      this.rechercheMessage.set(null);
      this.photoApercu.set(null);
      this.resumeGooglePlaces.set(null);
    }
  }

  choisirQuartier(nom: string): void {
    this.quartier.set(nom);
    this.pickerQuartierOuvert.set(false);
  }

  choisirVilleQuartier(ville: string): void {
    this.villeQuartier.set(ville);
    this.nouvelleVilleQuartier.set('');
  }

  majNouvelleVilleQuartier(valeur: string): void {
    this.nouvelleVilleQuartier.set(valeur);
    if (valeur.trim()) {
      this.villeQuartier.set(null);
    }
  }

  majLiens(valeur: string): void {
    this.liens.set(valeur);
    this.retirerBadgeAuto('liens');
  }

  majLocalisation(valeur: string): void {
    this.localisation.set(valeur);
    this.retirerBadgeAuto('localisation');
  }

  private retirerBadgeAuto(champ: 'liens' | 'localisation'): void {
    if (!this.champsAutoRemplis().has(champ)) return;
    const restants = new Set(this.champsAutoRemplis());
    restants.delete(champ);
    this.champsAutoRemplis.set(restants);
  }

  estPlatSelectionne(nom: string): boolean {
    return this.platsSelectionnes().includes(nom);
  }

  basculerPlat(nom: string): void {
    const actuel = this.platsSelectionnes();
    this.platsSelectionnes.set(actuel.includes(nom) ? actuel.filter(p => p !== nom) : [...actuel, nom]);
  }

  /** Couleur Ionic (success/danger/medium) d'un plat, même code que le badge du détail resto (PlatService.getSeverity). */
  couleurPlat(nom: string): string {
    const categorie = this.platsParNom().get(nom);
    return categorie ? this.platService.getSeverity(categorie) : 'medium';
  }

  /** Fond plein (couleur de catégorie) pour une chip plat sélectionnée. */
  fondPlatSelectionne(nom: string): string {
    return `var(--ion-color-${this.couleurPlat(nom)})`;
  }

  /** Texte clair (nuance "contrast" de la couleur de catégorie) pour une chip plat sélectionnée. */
  textePlatSelectionne(nom: string): string {
    return `var(--ion-color-${this.couleurPlat(nom)}-contrast)`;
  }

  /**
   * Demande confirmation avant d'abandonner une saisie non vide. Appelé par
   * HomeComponent (via ViewChild) comme callback [canDismiss] de la modale
   * englobante, pour bloquer une fermeture accidentelle (swipe, tap sur le
   * fond) tant que l'utilisateur n'a pas explicitement confirmé.
   */
  async confirmerAbandon(): Promise<boolean> {
    if (!this.formulaireRempli()) {
      return true;
    }

    const alert = await this.alertController.create({
      header: 'Abandonner cette saisie ?',
      message: 'Les informations déjà saisies pour ce lieu seront perdues.',
      buttons: [
        { text: 'Continuer la saisie', role: 'cancel' },
        { text: 'Abandonner', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  /**
   * Bouton unique "Remplir automatiquement" (remplace les 4 boutons précédents Identifier IA /
   * Google Places / Description IA / Plats IA) : décide lui-même quels services appeler selon
   * ce qui est déjà renseigné dans le formulaire plutôt que de laisser l'utilisateur choisir le
   * bon bouton dans le bon ordre.
   * - Franchise (pas de quartier unique à choisir, voir completerAutomatiquementFranchise()) →
   *   description + plats seulement, à partir du seul Nom.
   * - Pas encore de quartier connu → identification IA à partir du seul Nom
   *   (rechercherSuggestionsIa()) ; choisir une suggestion (choisirSuggestionIa()) enchaîne
   *   ensuite automatiquement sur completerAutomatiquement(). En parallèle, pour un Restaurant
   *   sans plat encore sélectionné, lance aussi l'extraction IA des plats (extrairePlatsIa()) à
   *   partir du seul Nom (sans résumé Google, donc reposant uniquement sur la connaissance de
   *   l'IA de l'enseigne — best-effort, comme le reste de l'identification à ce stade) : pas
   *   besoin d'attendre la recherche Places pour deviner par exemple qu'un "Sushiro" sert des
   *   sushis.
   * - Quartier déjà connu (saisi manuellement, ou déjà présent en mode édition) → enchaîne
   *   directement sur completerAutomatiquement(), qui retente l'extraction des plats avec le
   *   résumé Google Places cette fois si elle n'a pas déjà abouti ci-dessus.
   */
  async remplirAutomatiquement(): Promise<void> {
    if (!this.nom().trim() || this.remplissageAutoEnCours()) {
      return;
    }

    if (this.estLieuFranchise()) {
      await this.completerAutomatiquementFranchise();
      return;
    }

    if (!this.quartier()) {
      const taches = [this.rechercherSuggestionsIa()];
      if (this.type() === 'restaurant' && this.platsSelectionnes().length === 0) {
        taches.push(this.extrairePlatsIa());
      }
      await Promise.all(taches);
      return;
    }

    await this.completerAutomatiquement();
  }

  /** Une fois Nom + Quartier connus, enchaîne tout ce qui manque encore dans le formulaire —
   * chaque étape est sautée si l'info est déjà présente, pour ne relancer que ce qui manque
   * réellement plutôt que d'écraser des champs déjà remplis (rechercherPlaces()/
   * genererDescriptionIa() redemandent de toute façon confirmation avant d'écraser une valeur
   * existante, mais autant éviter l'appel réseau et le popup si le champ est déjà vide) :
   * Google Places (Lien/Localisation), puis description IA, puis — pour un restaurant —
   * extraction des plats IA. */
  private async completerAutomatiquement(): Promise<void> {
    if (!this.liens().trim() && !this.localisation().trim()) {
      await this.rechercherPlaces();
    }
    if (!this.description().trim()) {
      await this.genererDescriptionIa();
    }
    if (this.type() === 'restaurant' && this.platsSelectionnes().length === 0) {
      await this.extrairePlatsIa();
    }
  }

  /** Franchise (pas de quartier unique choisi par l'utilisateur, voir soumettreFranchise()) :
   * ni l'identification IA par Nom seul (rechercherSuggestionsIa(), qui vise à faire choisir
   * *un* quartier) ni la recherche Google Places par quartier (rechercherPlaces()) n'ont de
   * sens ici — soumettreFranchise() fait déjà sa propre recherche Places quartier par quartier
   * à la soumission. À la place, rechercherResumeFranchise() va chercher un résumé éditorial
   * générique de l'enseigne (recherche Places sur le Nom seul, sans quartier) : sans lui, l'IA
   * ne dispose que de Nom + Type pour rédiger la description, ce qui donne des textes vagues
   * ("vous allez passer un bon moment...") au lieu d'une vraie description de ce qu'est
   * l'enseigne — un résumé Google, même générique, lui donne de quoi être concrète. Description
   * et, pour un restaurant, plats sont ensuite générés une fois par l'IA à partir de ce résumé,
   * puis dupliqués sur chaque ligne créée (voir construireValeursFranchise()). */
  private async completerAutomatiquementFranchise(): Promise<void> {
    if (!this.resumeGooglePlaces()) {
      await this.rechercherResumeFranchise();
    }

    const taches: Promise<void>[] = [];
    if (!this.description().trim()) {
      taches.push(this.genererDescriptionIa());
    }
    if (this.type() === 'restaurant' && this.platsSelectionnes().length === 0) {
      taches.push(this.extrairePlatsIa());
    }
    await Promise.all(taches);
  }

  /** Franchise : recherche Google Places générique sur le seul Nom (pas de quartier, donc pas
   * de biais de localisation — contrairement à rechercherPlaces()) pour obtenir un résumé
   * éditorial et une photo de l'enseigne, qui servent uniquement à enrichir la génération IA
   * (description, plats) et à confirmer visuellement la bonne enseigne avant de lancer la
   * recherche par quartier de soumettreFranchise() (potentiellement coûteuse). Ne touche pas à
   * Lien/Localisation — sans sens pour une franchise avant cette recherche par quartier, qui
   * fournira le lien/la localisation propres à chaque instance. Best-effort : une erreur ou
   * l'absence de résultat n'empêche pas la suite de completerAutomatiquementFranchise(), qui se
   * rabat alors sur Nom/Type seuls pour la génération IA. */
  private async rechercherResumeFranchise(): Promise<void> {
    const nom = this.nom().trim();
    if (!nom || this.rechercheEnCours()) {
      return;
    }

    this.rechercheEnCours.set(true);
    this.rechercheMessage.set(null);
    this.photoApercu.set(null);

    try {
      const resultat = await firstValueFrom(
        this.placesSearch.rechercher(nom, null).pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.rechercheEnCours.set(false);

      if (!resultat) {
        this.rechercheMessage.set('Aucun établissement trouvé sur Google Places pour ce nom.');
        return;
      }

      this.photoApercu.set(resultat.photoUrl);
      this.resumeGooglePlaces.set(resultat.resume);
      this.rechercheMessage.set(
        `Trouvé : ${resultat.nom}${resultat.adresse ? ' — ' + resultat.adresse : ''}. Vérifie que c'est la bonne enseigne avant de lancer la recherche par quartier.`
      );
    } catch (err) {
      this.rechercheEnCours.set(false);
      this.rechercheMessage.set((err as Error).message);
    }
  }

  /**
   * Recherche IA (backend /ai/recherche-lieu) de ce qui pourrait correspondre au seul Nom
   * saisi — pas besoin d'avoir déjà choisi un quartier, contrairement à rechercherPlaces().
   * Renvoie jusqu'à 5 candidats plausibles (nom, quartier, ville, raison), à confirmer par
   * l'utilisateur via choisirSuggestionIa() avant d'enchaîner sur Google Places.
   */
  async rechercherSuggestionsIa(): Promise<void> {
    const nom = this.nom().trim();
    if (!nom || this.suggestionsIaEnCours()) {
      return;
    }

    this.suggestionsIaEnCours.set(true);
    this.suggestionsIaErreur.set(null);
    this.suggestionsIa.set([]);
    this.suggestionsIaEffectuee.set(false);

    try {
      const reponse = await firstValueFrom(
        this.iaService.rechercherLieu({
          nom,
          type: this.libelleTypeEdition(),
          villesConnues: this.villesConnues(),
        }).pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.suggestionsIaEnCours.set(false);
      this.suggestionsIaEffectuee.set(true);
      this.suggestionsIa.set(reponse.resultats);
    } catch (err) {
      this.suggestionsIaEnCours.set(false);
      this.suggestionsIaErreur.set((err as Error).message);
    }
  }

  /** Sélectionne une suggestion IA : reprend son nom exact et son quartier (matché sur la
   * liste connue de QuartierService si possible, sinon la valeur suggérée telle quelle — un
   * quartier hors référentiel reste utilisable comme texte de recherche Places), referme la
   * liste de suggestions, puis enchaîne automatiquement sur completerAutomatiquement() (Places,
   * puis description et plats si toujours vides) — même suite que déclenchée par le bouton
   * unique remplirAutomatiquement() une fois un quartier connu. */
  choisirSuggestionIa(suggestion: SuggestionLieu): void {
    this.nom.set(suggestion.nom);
    const quartierConnu = this.quartiersConnus().find(q => normaliser(q) === normaliser(suggestion.quartier));
    this.quartier.set(quartierConnu ?? suggestion.quartier);
    this.suggestionsIa.set([]);
    this.suggestionsIaEffectuee.set(false);
    void this.completerAutomatiquement();
  }

  /**
   * Recherche l'établissement sur Google Places (New) à partir du Nom + Quartier
   * saisis, et préremplit Lien/Localisation (et, pour un restaurant, tente de
   * repérer des plats déjà connus dans le résumé Google — Places ne fournit pas
   * de vraie liste de plats, donc ce préremplissage reste approximatif et à
   * vérifier). Si Lien et/ou Localisation contiennent déjà une valeur, demande
   * confirmation avant de l'écraser (confirmerEcrasement) plutôt que de le
   * faire silencieusement.
   */
  async rechercherPlaces(): Promise<void> {
    const nom = this.nom().trim();
    if (!nom || !this.quartier() || this.rechercheEnCours()) {
      return;
    }

    this.rechercheEnCours.set(true);
    this.rechercheMessage.set(null);
    this.photoApercu.set(null);
    this.resumeGooglePlaces.set(null);
    this.platsSuggeresInconnus.set([]);

    try {
      const resultat = await firstValueFrom(
        this.placesSearch.rechercher(nom, this.quartier()).pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.rechercheEnCours.set(false);

      if (!resultat) {
        this.rechercheMessage.set('Aucun établissement trouvé sur Google Places pour ce nom.');
        return;
      }

      this.photoApercu.set(resultat.photoUrl);
      this.resumeGooglePlaces.set(resultat.resume);

      const ecraseraitLiens = !!resultat.siteWeb && this.liens().trim().length > 0;
      const ecraseraitLocalisation = this.localisation().trim().length > 0;

      if ((ecraseraitLiens || ecraseraitLocalisation) && !(await this.confirmerEcrasement())) {
        if (this.type() === 'restaurant' && resultat.resume) {
          this.preselectionnerPlats(resultat.resume);
        }
        this.rechercheMessage.set(
          `Trouvé : ${resultat.nom}${resultat.adresse ? ' — ' + resultat.adresse : ''}. Lien/Localisation existants conservés.`
        );
        return;
      }

      this.localisation.set(resultat.lienLocalisation);
      const champsRemplis = new Set<'liens' | 'localisation'>(['localisation']);
      if (resultat.siteWeb) {
        this.liens.set(resultat.siteWeb);
        champsRemplis.add('liens');
      }
      this.champsAutoRemplis.set(champsRemplis);

      if (this.type() === 'restaurant' && resultat.resume) {
        this.preselectionnerPlats(resultat.resume);
      }

      this.rechercheMessage.set(
        `Trouvé : ${resultat.nom}${resultat.adresse ? ' — ' + resultat.adresse : ''}. Vérifie que c'est la bonne enseigne avant d'ajouter.`
      );
    } catch (err) {
      this.rechercheEnCours.set(false);
      this.rechercheMessage.set((err as Error).message);
    }
  }

  /** Confirmation avant de remplacer des champs déjà renseignés manuellement — message
   * paramétrable, réutilisé pour Lien/Localisation (Places) et Description/Wiki (IA Plat). */
  private async confirmerEcrasement(
    message = 'Le lien et/ou la localisation contiennent déjà une valeur. Le résultat trouvé sur Google Places va la remplacer.'
  ): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Remplacer les champs déjà remplis ?',
      message,
      buttons: [
        { text: 'Garder mes valeurs', role: 'cancel' },
        { text: 'Remplacer', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  /** Best-effort : ajoute à la sélection les plats déjà connus (feuille "Plats")
   * dont le nom apparaît dans le résumé Google Places de l'établissement. */
  private preselectionnerPlats(resume: string): void {
    const resumeNormalise = normaliser(resume);
    const trouves = this.platsDisponibles().filter(nomPlat => resumeNormalise.includes(normaliser(nomPlat)));
    if (trouves.length === 0) {
      return;
    }
    this.platsSelectionnes.set([...new Set([...this.platsSelectionnes(), ...trouves])]);
  }

  /** Génère une description via le backend IA (ClaudeApiTkt) à partir de Nom/Type/Quartier et
   * du résumé Google Places de la dernière recherche. Quartier peut être absent (mode
   * Franchise, voir completerAutomatiquementFranchise()) : le backend accepte `quartier: null`
   * et se rabat sur Nom/Type seuls. Demande confirmation avant d'écraser une description déjà
   * saisie, comme pour Lien/Localisation (confirmerEcrasement). */
  async genererDescriptionIa(): Promise<void> {
    const nom = this.nom().trim();
    if (!nom || this.descriptionIaEnCours()) {
      return;
    }

    if (this.description().trim().length > 0 && !(await this.confirmerEcrasement())) {
      return;
    }

    this.descriptionIaEnCours.set(true);
    this.descriptionIaErreur.set(null);

    try {
      const reponse = await firstValueFrom(
        this.iaService.genererDescription({
          nom,
          type: this.type(),
          quartier: this.quartier(),
          resumeGoogle: this.resumeGooglePlaces(),
        }).pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.descriptionIaEnCours.set(false);
      this.description.set(reponse.description);
    } catch (err) {
      this.descriptionIaEnCours.set(false);
      this.descriptionIaErreur.set((err as Error).message);
    }
  }

  /** Extrait les plats via le backend IA à partir du résumé Google Places, en complément de
   * preselectionnerPlats() (heuristique locale gratuite, toujours appliquée en premier après une
   * recherche Places). Les plats trouvés qui matchent un plat connu (normaliser(), même logique
   * que preselectionnerPlats) sont ajoutés à la sélection ; les autres sont affichés à part,
   * sans créer de chip libre. */
  async extrairePlatsIa(): Promise<void> {
    const nom = this.nom().trim();
    if (!nom || this.platsIaEnCours()) {
      return;
    }

    this.platsIaEnCours.set(true);
    this.platsIaErreur.set(null);
    this.platsSuggeresInconnus.set([]);

    try {
      const reponse = await firstValueFrom(
        this.iaService.extrairePlats({
          nomRestaurant: nom,
          resumeGoogle: this.resumeGooglePlaces(),
          platsConnus: this.platsDisponibles(),
        }).pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.platsIaEnCours.set(false);
      const connus = this.platsDisponibles();
      const trouves: string[] = [];
      const inconnus: string[] = [];
      for (const suggestion of reponse.plats) {
        const match = connus.find(candidat => normaliser(candidat) === normaliser(suggestion.nom));
        if (match) {
          trouves.push(match);
        } else {
          inconnus.push(suggestion.nom);
        }
      }
      if (trouves.length > 0) {
        this.platsSelectionnes.set([...new Set([...this.platsSelectionnes(), ...trouves])]);
      }
      this.platsSuggeresInconnus.set(inconnus);
    } catch (err) {
      this.platsIaEnCours.set(false);
      this.platsIaErreur.set((err as Error).message);
    }
  }

  /** Génère description + lien Wikipedia pour un plat (type "Plat") via le backend IA, à
   * partir du nom et de la catégorie. Demande confirmation avant d'écraser des valeurs déjà
   * saisies (même garde-fou que pour Lien/Localisation, voir confirmerEcrasement). Le lien
   * Wikipedia proposé reste une suggestion : le prompt système demande explicitement à l'IA de
   * le laisser vide plutôt que d'inventer un lien pour un plat trop obscur — à vérifier avant
   * publication comme n'importe quel champ auto-rempli par ailleurs dans ce formulaire. */
  async genererPlatInfoIa(): Promise<void> {
    const nom = this.nom().trim();
    if (!nom || this.platInfoIaEnCours()) {
      return;
    }

    const remplaceraitQuelqueChose = this.description().trim().length > 0 || this.wiki().trim().length > 0;
    if (remplaceraitQuelqueChose && !(await this.confirmerEcrasement(
      'La description et/ou le lien Wikipedia contiennent déjà une valeur. Le résultat de l\'IA va la remplacer.'
    ))) {
      return;
    }

    this.platInfoIaEnCours.set(true);
    this.platInfoIaErreur.set(null);

    this.iaService.genererPlatInfo({ nom, categorie: this.categoriePlat() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: reponse => {
          this.platInfoIaEnCours.set(false);
          this.description.set(reponse.description);
          if (reponse.wiki) {
            this.wiki.set(reponse.wiki);
          }
        },
        error: (err: Error) => {
          this.platInfoIaEnCours.set(false);
          this.platInfoIaErreur.set(err.message);
        }
      });
  }

  soumettre(): void {
    if (!this.formValide() || this.enCours()) {
      return;
    }

    if (this.modeEdition()) {
      this.modifierLieuExistant();
      return;
    }

    if (this.type() === 'quartier') {
      this.soumettreQuartier();
      return;
    }

    if (this.estLieuFranchise()) {
      this.soumettreFranchise();
      return;
    }

    this.soumettreLieuNormal(this.type());
  }

  /** Modifie la ligne du Sheet correspondant à `cleOriginale()` (capturée à l'ouverture du
   * formulaire, voir preremplirPourModification()) avec les valeurs actuelles du formulaire —
   * même construction de valeurs que la création (construireValeurs), mais via
   * SheetsWriteService.modifierLigne() qui ne touche que les colonnes concernées (Horaires,
   * votes, Avis restent intacts). Contrairement à l'ajout, ferme la modale en cas de succès :
   * une modification est une action ponctuelle, pas une saisie répétée. */
  private modifierLieuExistant(): void {
    const cle = this.cleOriginale();
    if (!cle) {
      return;
    }

    this.enCours.set(true);
    this.erreur.set(null);

    this.sheetsWrite.modifierLigne(GID_PAR_TYPE[this.type()], cle, this.construireValeurs(this.type()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enCours.set(false);
          this.modifie.emit();
          this.ferme.emit();
        },
        error: (err: Error) => {
          this.enCours.set(false);
          this.erreur.set(err.message);
        }
      });
  }

  /**
   * Cas restaurant/activité/magasin "normal" (pas franchise) : avant d'écrire, avertit si un
   * lieu de même nom existe déjà dans le quartier choisi (via l'index construit pour la
   * déduplication franchise, quartiersParNomParType). But : éviter un doublon accidentel dans
   * le Sheet partagé (ex: un membre du groupe ignore qu'un autre a déjà ajouté ce lieu à ce
   * quartier). Sans doublon détecté, écrit directement sans alerte.
   */
  private async soumettreLieuNormal(type: TypeAjout): Promise<void> {
    if (!(await this.confirmerDoublonSiNecessaire(type))) {
      return;
    }
    this.ecrire(type);
  }

  private async confirmerDoublonSiNecessaire(type: TypeAjout): Promise<boolean> {
    const nomNormalise = normaliser(this.nom().trim());
    const quartierNormalise = normaliser(this.quartier() ?? '');
    if (!nomNormalise || !quartierNormalise) {
      return true;
    }

    const existeDeja = this.quartiersParNomParType().get(type)?.get(nomNormalise)?.has(quartierNormalise);
    if (!existeDeja) {
      return true;
    }

    const libelleType = type === 'restaurant' ? 'restaurant' : type === 'activite' ? 'activité' : 'magasin';
    const alert = await this.alertController.create({
      header: 'Déjà présent ?',
      message: `Un ${libelleType} nommé "${this.nom().trim()}" existe déjà à ${this.quartier()} dans le Sheet. Ajouter quand même ?`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Ajouter quand même', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /**
   * Cas "franchise" (restaurant, activité ou magasin) : pas de quartier unique saisi par
   * l'utilisateur — on recherche une instance via Google Places ("Nom quartier") dans
   * chacun des quartiers connus du Sheet (quartiersConnus()) qui n'ont pas déjà cette
   * enseigne (quartiersDejaCouverts()), séquentiellement (concatMap) pour rester dans
   * un rythme raisonnable côté API Places/Sheets et pouvoir afficher une progression.
   * Une ligne n'est ajoutée que pour les quartiers où Places trouve un résultat ; une
   * erreur (réseau, quota) sur un quartier donné est traitée comme un "non trouvé"
   * pour ce quartier plutôt que d'interrompre toute la recherche. Demande confirmation
   * avant de lancer (le nombre de requêtes Places peut être élevé), et peut être
   * interrompue en cours de route via annulerFranchise() — les quartiers déjà écrits
   * avant l'annulation restent acquis, seuls les quartiers restants ne sont pas traités.
   */
  private async soumettreFranchise(): Promise<void> {
    const type = this.type();
    const nom = this.nom().trim();
    const dejaCouverts = this.quartiersDejaCouverts();
    const dejaCouvertsSet = new Set(dejaCouverts);
    const quartiers = this.quartiersConnus().filter(q => !dejaCouvertsSet.has(q));

    if (quartiers.length === 0) {
      this.erreur.set(
        dejaCouverts.length > 0
          ? `"${nom}" est déjà présent dans les ${dejaCouverts.length} quartier${dejaCouverts.length > 1 ? 's' : ''} connu${dejaCouverts.length > 1 ? 's' : ''} du Sheet — rien à ajouter.`
          : 'Aucun quartier connu dans le Sheet pour rechercher cette franchise.'
      );
      return;
    }

    if (!(await this.confirmerRechercheFranchise(nom, quartiers.length))) {
      return;
    }

    this.enCours.set(true);
    this.erreur.set(null);
    this.progressionFranchise.set({ traites: 0, trouves: 0, total: quartiers.length });

    // Erreurs d'écriture Sheets (distinctes d'un "non trouvé" sur Places) — journalisées ici
    // plutôt que silencieusement fondues dans le même booléen que "aucun résultat Places",
    // pour pouvoir diagnostiquer un échec d'écriture (ex: 403/429) au lieu de laisser croire
    // à une absence de résultat Places.
    const erreursEcriture: string[] = [];

    this.franchiseSubscription = from(quartiers)
      .pipe(
        concatMap(quartierCourant =>
          this.placesSearch.rechercher(nom, quartierCourant).pipe(
            catchError(() => of(null)),
            switchMap(resultat =>
              resultat
                ? this.sheetsWrite
                    .ajouterLigne(GID_PAR_TYPE[type], this.construireValeursFranchise(type, quartierCourant, resultat))
                    .pipe(
                      switchMap(() => of(true)),
                      catchError((err: Error) => {
                        const message = `${quartierCourant} : ${err.message}`;
                        erreursEcriture.push(message);
                        console.error(`[soumettreFranchise] Échec d'écriture pour "${nom}" — ${message}`);
                        return of(false);
                      })
                    )
                : of(false)
            ),
            tap(ajoute => {
              const etat = this.progressionFranchise();
              if (etat) {
                this.progressionFranchise.set({
                  traites: etat.traites + 1,
                  trouves: etat.trouves + (ajoute ? 1 : 0),
                  total: etat.total,
                });
              }
            })
          )
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(resultats => {
        const trouves = resultats.filter(Boolean).length;
        const suffixeDejaCouverts = dejaCouverts.length > 0
          ? ` (${dejaCouverts.length} déjà couvert${dejaCouverts.length > 1 ? 's' : ''}, ignoré${dejaCouverts.length > 1 ? 's' : ''})`
          : '';
        const suffixeErreurs = erreursEcriture.length > 0
          ? ` — ${erreursEcriture.length} échec${erreursEcriture.length > 1 ? 's' : ''} d'écriture (voir console)`
          : '';
        this.franchiseSubscription = null;
        this.enCours.set(false);
        this.progressionFranchise.set(null);
        this.reinitialiser();
        this.rafraichirListesReference(true);
        this.rechercheMessage.set(
          trouves > 0
            ? `Franchise "${nom}" ajoutée dans ${trouves} nouveau${trouves > 1 ? 'x' : ''} quartier${trouves > 1 ? 's' : ''} sur ${quartiers.length} recherché${quartiers.length > 1 ? 's' : ''}${suffixeDejaCouverts}${suffixeErreurs}.`
            : `Aucune nouvelle instance de "${nom}" trouvée sur Google Places parmi les ${quartiers.length} quartier${quartiers.length > 1 ? 's' : ''} restant${quartiers.length > 1 ? 's' : ''}${suffixeDejaCouverts}${suffixeErreurs}.`
        );
        this.ajoute.emit(type);
      });
  }

  /** Confirmation avant de lancer potentiellement de nombreuses requêtes Google Places
   * (facturées au-delà d'un certain quota) et l'écriture des lignes correspondantes. */
  private async confirmerRechercheFranchise(nom: string, total: number): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Lancer la recherche ?',
      message:
        `${total} recherche${total > 1 ? 's' : ''} Google Places va${total > 1 ? 'nt' : ''} être ` +
        `lancée${total > 1 ? 's' : ''} pour "${nom}" (une par quartier), et une ligne sera ajoutée au ` +
        `Sheet pour chaque quartier où une instance est trouvée.`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Lancer', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /** Interrompt une recherche franchise en cours (bouton "Annuler" affiché pendant la
   * progression) : les quartiers déjà traités (et écrits dans le Sheet) restent acquis,
   * seuls les quartiers restants ne sont pas recherchés/ajoutés. */
  annulerFranchise(): void {
    if (!this.franchiseSubscription) return;

    const etat = this.progressionFranchise();
    this.franchiseSubscription.unsubscribe();
    this.franchiseSubscription = null;
    this.enCours.set(false);
    this.progressionFranchise.set(null);
    this.rafraichirListesReference(true);
    if (etat) {
      this.rechercheMessage.set(
        `Recherche annulée après ${etat.traites}/${etat.total} quartier${etat.total > 1 ? 's' : ''} ` +
        `(${etat.trouves} ajouté${etat.trouves > 1 ? 's' : ''}).`
      );
    }
  }

  /** Valeurs d'une ligne (restaurant, activité ou magasin) pour un quartier de franchise
   * donné : Localisation vient toujours du résultat Places (spécifique à ce quartier) ;
   * Liens ne reprend le site web Places que s'il existe, plutôt que dupliquer un lien saisi
   * manuellement sur chaque ligne. */
  private construireValeursFranchise(type: TypeAjout, quartierCourant: string, resultat: ResultatPlaces): Record<string, string> {
    const commun: Record<string, string> = {
      Nom: this.nom().trim(),
      Quartier: quartierCourant,
      Liens: resultat.siteWeb ?? '',
      Localisation: resultat.lienLocalisation,
      Commentaires: this.commentaires().trim(),
    };

    if (type === 'restaurant') {
      return {
        ...commun,
        Description: this.description().trim(),
        Prix: this.prix().trim(),
        Plats: this.platsSelectionnes().join(', '),
        Video: this.video().trim(),
        Menu: this.menu().trim(),
      };
    }

    if (type === 'activite') {
      return {
        ...commun,
        Description: this.description().trim(),
        Prix: this.prix().trim(),
        Temps: this.temps().trim(),
      };
    }

    return {
      ...commun,
      Description: this.description().trim(),
      Type: this.typeMagasin().trim(),
    };
  }

  /**
   * Cas "Quartier" : si la ville saisie manuellement ne correspond à aucune ville déjà
   * connue (comparaison insensible casse/accents via normaliser()), demande confirmation
   * avant de la créer dans le Sheet — une faute de frappe sur une ville existante créerait
   * sinon un doublon silencieux, pénible à nettoyer sur un Sheet partagé. Annuler laisse le
   * formulaire intact pour corriger la saisie.
   */
  private async soumettreQuartier(): Promise<void> {
    const nouvelleVille = this.nouvelleVilleQuartier().trim();
    const villeACreer = !!nouvelleVille && !this.villesConnues().some(v => normaliser(v) === normaliser(nouvelleVille));

    if (villeACreer && !(await this.confirmerNouvelleVille(nouvelleVille))) {
      return;
    }

    this.ecrire('quartier', villeACreer ? nouvelleVille : null);
  }

  private async confirmerNouvelleVille(nom: string): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Nouvelle ville ?',
      message: `"${nom}" n'existe pas encore dans la liste des villes — elle sera ajoutée au Sheet.`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Créer la ville', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /** Écrit la ligne du type courant, en écrivant d'abord `nouvelleVille` dans la feuille
   * "Villes" si fourni (cas "Quartier" avec une ville inédite déjà confirmée). */
  private ecrire(type: TypeAjout, nouvelleVille: string | null = null): void {
    this.enCours.set(true);
    this.erreur.set(null);

    const ecritureQuartier$ = this.sheetsWrite.ajouterLigne(GID_PAR_TYPE[type], this.construireValeurs(type));
    const ecriture$ = nouvelleVille
      ? this.sheetsWrite.ajouterLigne(GID_VILLES, { Nom: nouvelleVille }).pipe(switchMap(() => ecritureQuartier$))
      : ecritureQuartier$;

    ecriture$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enCours.set(false);
          this.reinitialiser();
          this.rafraichirListesReference(true);
          this.ajoute.emit(type);
        },
        error: (err: Error) => {
          this.enCours.set(false);
          this.erreur.set(err.message);
        }
      });
  }

  private construireValeurs(type: TypeAjout): Record<string, string> {
    if (type === 'plat') {
      return {
        Nom: this.nom().trim(),
        Categorie: this.categoriePlat(),
        Description: this.description().trim(),
        Commentaires: this.commentaires().trim(),
        Wiki: this.wiki().trim(),
      };
    }

    if (type === 'quartier') {
      return {
        Nom: this.nom().trim(),
        Ville: this.villeAAppliquer() ?? '',
        Mood: '',
      };
    }

    const commun: Record<string, string> = {
      Nom: this.nom().trim(),
      Quartier: this.quartier() ?? '',
      Liens: this.liens().trim(),
      Localisation: this.localisation().trim(),
      Commentaires: this.commentaires().trim(),
    };

    if (type === 'restaurant') {
      return {
        ...commun,
        Description: this.description().trim(),
        Prix: this.prix().trim(),
        Plats: this.platsSelectionnes().join(', '),
        Video: this.video().trim(),
        Menu: this.menu().trim(),
      };
    }

    if (type === 'activite') {
      return {
        ...commun,
        Description: this.description().trim(),
        Prix: this.prix().trim(),
        Temps: this.temps().trim(),
      };
    }

    return {
      ...commun,
      Description: this.description().trim(),
      Type: this.typeMagasin().trim(),
    };
  }

  private reinitialiser(): void {
    this.nom.set('');
    this.quartier.set(null);
    this.estFranchise.set(false);
    this.liens.set('');
    this.localisation.set('');
    this.description.set('');
    this.prix.set('');
    this.platsSelectionnes.set([]);
    this.video.set('');
    this.menu.set('');
    this.temps.set('');
    this.typeMagasin.set('');
    this.commentaires.set('');
    this.categoriePlat.set(PlatCategory.Plat);
    this.wiki.set('');
    this.villeQuartier.set(null);
    this.nouvelleVilleQuartier.set('');
    this.rechercheMessage.set(null);
    this.photoApercu.set(null);
    this.champsAutoRemplis.set(new Set());
    this.resumeGooglePlaces.set(null);
    this.suggestionsIa.set([]);
    this.suggestionsIaEffectuee.set(false);
    this.suggestionsIaErreur.set(null);
    this.descriptionIaErreur.set(null);
    this.platsIaErreur.set(null);
    this.platsSuggeresInconnus.set([]);
    this.platInfoIaErreur.set(null);
  }
}
