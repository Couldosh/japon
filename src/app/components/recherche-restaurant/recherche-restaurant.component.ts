import { Component, DestroyRef, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonItem, IonInput, IonToggle, IonSpinner, IonModal, IonChip, IonSearchbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, alertCircleOutline, funnelOutline, chevronDownOutline, chevronForwardOutline, checkmarkOutline, searchOutline } from 'ionicons/icons';
import { IaService } from '../../service/ia/ia.service';
import { RestaurantService } from '../../service/restaurant/restaurant.service';
import { RestaurantModel } from '../../models/restaurant.model';
import { QuartierService } from '../../service/quartier/quartier.service';
import { QuartierModel } from '../../models/quartier.model';
import { RestaurantCandidat, SuggestionRestaurant } from '../../models/ia.model';
import { GeolocationService } from '../../service/geolocation/GeolocationService';

/** Rayon dans lequel un restaurant est considéré "près de moi" (mètres). Si aucun restaurant
 * connu n'est dans ce rayon, on retombe sur les N plus proches plutôt que de renvoyer une
 * liste vide à l'IA (mieux vaut un restaurant un peu plus loin qu'aucun candidat du tout). */
const RAYON_PROCHE_METRES = 2000;
const NB_PLUS_PROCHES_REPLI = 15;

/** Normalise un nom pour un matching insensible à la casse/aux accents — même principe que
 * ajout-lieu.component.ts/planning.component.ts (dupliquée, pas partagée à ce jour). */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface VilleQuartiers {
  ville: string;
  quartiers: string[];
}

/**
 * Recherche IA d'un restaurant à partir d'un plat, d'un quartier et d'une gamme de prix — voir
 * IaService.rechercherRestaurant() / backend ClaudeApiTkt (endpoint /ai/recherche-restaurant).
 * Deux modes selon la coche "Recherche externe" : par défaut, l'IA ne choisit que parmi les
 * restaurants déjà connus du Sheet (déjà chargés ici via RestaurantService, aucune écriture) ;
 * activée, elle peut aussi proposer des restaurants réels absents du Sheet, marqués comme
 * suggestion non vérifiée dans le résultat (SuggestionRestaurant.connu === false).
 */
@Component({
  selector: 'app-recherche-restaurant',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonItem, IonInput, IonToggle, IonSpinner, IonModal, IonChip, IonSearchbar
  ],
  templateUrl: './recherche-restaurant.component.html',
  styleUrl: './recherche-restaurant.component.scss'
})
export class RechercheRestaurantComponent implements OnInit {
  private readonly iaService = inject(IaService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly quartierService = inject(QuartierService);
  protected readonly geoloc = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ferme = output<void>();
  readonly restaurantChoisi = output<RestaurantModel>();

  readonly plat = signal('');
  readonly quartier = signal<string | null>(null);
  readonly gammePrix = signal('');
  readonly rechercheExterne = signal(false);
  /** Recherche parmi les restaurants connus les plus proches de la position actuelle plutôt
   * que par quartier — alternative au picker de quartier (les deux sont mutuellement exclusifs,
   * voir basculerProchDeMoi()/choisirQuartier()). N'affecte que la liste envoyée à l'IA pour les
   * restaurants déjà connus du Sheet : une suggestion "externe" reste au mieux au niveau de la
   * ville, l'IA n'ayant pas de notion réelle de distance/coordonnées. */
  readonly prochDeMoi = signal(false);
  readonly pickerQuartierOuvert = signal(false);

  readonly enCours = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly resultats = signal<SuggestionRestaurant[]>([]);
  /** Distingue "pas encore cherché" de "cherché, aucun résultat" pour l'état vide. */
  readonly rechercheEffectuee = signal(false);

  private readonly quartiers = signal<QuartierModel[]>([]);
  private readonly restaurantsBruts = signal<RestaurantModel[]>([]);

  /** Même construction que AjoutLieuComponent.quartiersParVille — liste exhaustive des quartiers
   * connus (feuille de référence "Quartiers"), pas seulement ceux déjà présents dans les lieux. */
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

  /** Villes du voyage en cours (déduites des quartiers connus), envoyées en contexte pour la
   * recherche externe — voir RechercheLieuService côté backend pour le même principe : donner
   * la ville plutôt que la liste exacte des quartiers déjà catalogués évite que l'IA se limite
   * à tort aux quelques quartiers déjà présents dans le Sheet quand elle cherche un restaurant
   * hors du Sheet. */
  readonly villesConnues = computed(() => this.quartiersParVille().map(g => g.ville));

  readonly formValide = computed(() => this.plat().trim().length > 0);

  // Recherche texte dans le picker de quartier (non persistée, réinitialisée à chaque
  // ouverture — voir ouvrirPickerQuartier()) — même pattern que HomeComponent.rechercheQuartier.
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

  constructor() {
    addIcons({ closeOutline, alertCircleOutline, funnelOutline, chevronDownOutline, chevronForwardOutline, checkmarkOutline, searchOutline });
  }

  ngOnInit(): void {
    this.quartierService.getQuartiers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(quartiers => this.quartiers.set(quartiers));

    this.restaurantService.getRestaurants()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(restaurants => this.restaurantsBruts.set(restaurants));
  }

  ouvrirPickerQuartier(): void {
    this.rechercheQuartier.set('');
    this.pickerQuartierOuvert.set(true);
  }

  choisirQuartier(nom: string | null): void {
    this.quartier.set(nom);
    if (nom) {
      this.prochDeMoi.set(false);
    }
    this.pickerQuartierOuvert.set(false);
  }

  /** Bascule le mode "près de moi" — mutuellement exclusif avec le filtre par quartier
   * (l'activer efface le quartier choisi, choisir un quartier le désactive). */
  basculerProchDeMoi(actif: boolean): void {
    this.prochDeMoi.set(actif);
    if (actif) {
      this.quartier.set(null);
    }
  }

  rechercher(): void {
    if (!this.formValide() || this.enCours()) {
      return;
    }

    let restaurants = this.restaurantsBruts();
    let quartierPourPrompt = this.quartier();

    if (this.prochDeMoi()) {
      const position = this.geoloc.position();
      if (!position) {
        this.erreur.set("Position actuelle introuvable — active la géolocalisation puis réessaie.");
        return;
      }

      const avecDistance = restaurants
        .filter(r => r.latitude != null && r.longitude != null)
        .map(r => ({ restaurant: r, distance: GeolocationService.distanceMetres(position, { latitude: r.latitude!, longitude: r.longitude! }) }))
        .sort((a, b) => a.distance - b.distance);

      const proches = avecDistance.filter(x => x.distance <= RAYON_PROCHE_METRES);
      restaurants = (proches.length > 0 ? proches : avecDistance.slice(0, NB_PLUS_PROCHES_REPLI)).map(x => x.restaurant);
      // Déjà filtrés par proximité (potentiellement à cheval sur plusieurs quartiers) : pas de
      // restriction de quartier supplémentaire à passer au prompt.
      quartierPourPrompt = null;
    } else if (quartierPourPrompt) {
      restaurants = restaurants.filter(r => normaliser(r.Quartier?.Nom ?? '') === normaliser(quartierPourPrompt!));
    }

    this.enCours.set(true);
    this.erreur.set(null);
    this.resultats.set([]);

    const restaurantsConnus: RestaurantCandidat[] = restaurants.map(r => ({
      nom: r.Nom,
      quartier: r.Quartier?.Nom ?? '',
      prix: r.Prix ?? '',
      plats: r.Plats.map(p => p.Nom),
    }));

    this.iaService.rechercherRestaurant({
      plat: this.plat().trim(),
      quartier: quartierPourPrompt,
      gammePrix: this.gammePrix().trim() || null,
      rechercheExterne: this.rechercheExterne(),
      restaurantsConnus,
      villesConnues: this.villesConnues(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: reponse => {
          this.enCours.set(false);
          this.rechercheEffectuee.set(true);
          this.resultats.set(reponse.resultats);
        },
        error: (err: Error) => {
          this.enCours.set(false);
          this.erreur.set(err.message);
        }
      });
  }

  /** Un résultat "connu" (présent dans le Sheet) retrouve sa fiche complète pour ouvrir la
   * popup détail habituelle ; une suggestion externe (connu=false) n'a pas de fiche à ouvrir. */
  choisirResultat(suggestion: SuggestionRestaurant): void {
    if (!suggestion.connu) {
      return;
    }
    const match = this.restaurantsBruts().find(r =>
      normaliser(r.Nom) === normaliser(suggestion.nom) &&
      normaliser(r.Quartier?.Nom ?? '') === normaliser(suggestion.quartier)
    );
    if (match) {
      this.restaurantChoisi.emit(match);
    }
  }

  /** Distance formatée jusqu'à un résultat connu, si la position et les coordonnées du
   * restaurant sont disponibles — affichée sur les cartes de résultat pour confirmer visuellement
   * la proximité en mode "près de moi" (mais calculée systématiquement dès que possible, pas
   * seulement dans ce mode). Une suggestion externe (connu=false) n'a pas de fiche à géolocaliser. */
  distanceSuggestion(suggestion: SuggestionRestaurant): string | null {
    const position = this.geoloc.position();
    if (!position || !suggestion.connu) {
      return null;
    }
    const match = this.restaurantsBruts().find(r =>
      normaliser(r.Nom) === normaliser(suggestion.nom) &&
      normaliser(r.Quartier?.Nom ?? '') === normaliser(suggestion.quartier)
    );
    if (!match || match.latitude == null || match.longitude == null) {
      return null;
    }
    return GeolocationService.formaterDistance(GeolocationService.distanceMetres(position, { latitude: match.latitude, longitude: match.longitude }));
  }
}
