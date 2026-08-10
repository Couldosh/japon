import { Component, DestroyRef, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonItem, IonInput, IonToggle, IonSpinner, IonModal, IonChip
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, alertCircleOutline, funnelOutline, chevronDownOutline, checkmarkOutline, searchOutline } from 'ionicons/icons';
import { IaService } from '../../service/ia/ia.service';
import { RestaurantService } from '../../service/restaurant/restaurant.service';
import { RestaurantModel } from '../../models/restaurant.model';
import { QuartierService } from '../../service/quartier/quartier.service';
import { QuartierModel } from '../../models/quartier.model';
import { RestaurantCandidat, SuggestionRestaurant } from '../../models/ia.model';

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
    IonItem, IonInput, IonToggle, IonSpinner, IonModal, IonChip
  ],
  templateUrl: './recherche-restaurant.component.html',
  styleUrl: './recherche-restaurant.component.scss'
})
export class RechercheRestaurantComponent implements OnInit {
  private readonly iaService = inject(IaService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly quartierService = inject(QuartierService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ferme = output<void>();
  readonly restaurantChoisi = output<RestaurantModel>();

  readonly plat = signal('');
  readonly quartier = signal<string | null>(null);
  readonly gammePrix = signal('');
  readonly rechercheExterne = signal(false);
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

  constructor() {
    addIcons({ closeOutline, alertCircleOutline, funnelOutline, chevronDownOutline, checkmarkOutline, searchOutline });
  }

  ngOnInit(): void {
    this.quartierService.getQuartiers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(quartiers => this.quartiers.set(quartiers));

    this.restaurantService.getRestaurants()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(restaurants => this.restaurantsBruts.set(restaurants));
  }

  choisirQuartier(nom: string | null): void {
    this.quartier.set(nom);
    this.pickerQuartierOuvert.set(false);
  }

  rechercher(): void {
    if (!this.formValide() || this.enCours()) {
      return;
    }

    this.enCours.set(true);
    this.erreur.set(null);
    this.resultats.set([]);

    const quartierFiltre = this.quartier();
    const restaurants = quartierFiltre
      ? this.restaurantsBruts().filter(r => normaliser(r.Quartier?.Nom ?? '') === normaliser(quartierFiltre))
      : this.restaurantsBruts();

    const restaurantsConnus: RestaurantCandidat[] = restaurants.map(r => ({
      nom: r.Nom,
      quartier: r.Quartier?.Nom ?? '',
      prix: r.Prix ?? '',
      plats: r.Plats.map(p => p.Nom),
    }));

    this.iaService.rechercherRestaurant({
      plat: this.plat().trim(),
      quartier: quartierFiltre,
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
}
