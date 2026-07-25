import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { combineLatest } from 'rxjs';
import {
  IonHeader, IonToolbar, IonSearchbar, IonChip, IonIcon, IonButton, IonButtons,
  IonList, IonItem, IonLabel, IonBadge, IonTabBar, IonTabButton,
  IonContent, IonSkeletonText, IonRefresher, IonRefresherContent,
  IonModal, IonTitle, IonSelect, IonSelectOption
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline, walkOutline, restaurantOutline,
  businessOutline, fastFoodOutline, homeOutline,
  mapOutline, heartOutline, heart, refreshOutline, storefrontOutline,
  sunnyOutline, moonOutline, closeOutline, locationOutline,
  openOutline, starOutline, star, starHalf, pricetagOutline, playOutline,
  timeOutline
} from 'ionicons/icons';

import { RestaurantService } from '../service/restaurant/restaurant.service';
import { ActiviteService } from '../service/activite/activite.service';
import { MagasinService } from '../service/magasin/magasin.service';
import { PlatService } from '../service/plat/plat.service';
import { GeolocationService } from '../service/geolocation/GeolocationService';
import { ThemeService } from '../service/theme/theme.service';
import { FavorisService } from '../service/favoris/favoris.service';
import { LieuAffichable, TypeLieu } from '../models/lieu-affichable.model';
import { RestaurantModel } from '../models/restaurant.model';
import { ActiviteModel } from '../models/activite.model';
import { MagasinModel } from '../models/magasin.model';
import { Plat, PlatCategory } from './plat/plat.component';
import { emojiRestaurant, emojiActivite, emojiMagasin } from '../utils/emoji-lieu';
import { estOuvertMaintenant, horairesAujourdhui, horairesSemaine } from '../utils/horaires';
import { CarteComponent } from './carte/carte.component';

type Vue = 'accueil' | 'carte' | 'favoris';

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
    IonList, IonItem, IonLabel, IonBadge, IonTabBar, IonTabButton,
    IonContent, IonSkeletonText, IonRefresher, IonRefresherContent,
    IonModal, IonTitle, IonSelect, IonSelectOption,
    CarteComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {

  private readonly restaurantService = inject(RestaurantService);
  private readonly activiteService = inject(ActiviteService);
  private readonly magasinService = inject(MagasinService);
  private readonly platService = inject(PlatService);
  private readonly geoloc = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly themeService = inject(ThemeService);
  protected readonly favorisService = inject(FavorisService);

  // Etat
  readonly chargement = signal(true);
  readonly filtreActif = signal<TypeLieu | 'tout'>('restaurant');
  readonly recherche = signal('');

  // Filtre quartier, applicable à toutes les vues (Tout/Restaurants/Activités/Magasins)
  readonly filtreQuartier = signal<string | null>(null);

  // Sous-filtres, spécifiques au type de lieu actif
  readonly filtrePlat = signal<string | null>(null);
  readonly filtreCategoriePlat = signal<PlatCategory | 'tout'>('tout');
  readonly filtreTypeMagasin = signal<string | null>(null);
  readonly lieux = signal<LieuAffichable[]>([]);
  readonly vue = signal<Vue>('accueil');
  readonly detailSelectionne = signal<DetailLieu | null>(null);
  readonly platSelectionne = signal<Plat | null>(null);

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
  readonly quartiersDisponibles = computed(() =>
    [...new Set(this.lieux().map(l => l.quartier.Nom).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );
  readonly typesMagasins = computed(() =>
    [...new Set(this.magasinsBruts().map(m => m.Type).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );

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
        l.quartier.Nom.toLowerCase().includes(terme)
      );
    }

    if (pos) {
      resultat = resultat.map(l => ({
        ...l,
        distanceMetres: this.distanceVersLieu(l, pos)
      })).sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity));
    }

    return resultat;
  });

  constructor() {
    addIcons({
      searchOutline, walkOutline, restaurantOutline,
      businessOutline, fastFoodOutline, homeOutline,
      mapOutline, heartOutline, heart, refreshOutline, storefrontOutline,
      sunnyOutline, moonOutline, closeOutline, locationOutline,
      openOutline, starOutline, star, starHalf, pricetagOutline, playOutline,
      timeOutline
    });
  }

  ngOnInit(): void {
    this.geoloc.demarrerSuivi();
    this.chargerDonnees();
  }

  /** Force le rechargement des données depuis Google Sheets en ignorant le cache. */
  rafraichir(event?: CustomEvent): void {
    this.chargerDonnees(true, () => (event?.target as HTMLIonRefresherElement | undefined)?.complete());
  }

  private chargerDonnees(forceRefresh = false, onDone?: () => void): void {
    this.chargement.set(true);

    // Adapter les noms de méthodes/champs à vos services et models réels
    combineLatest([
      this.restaurantService.getRestaurants(forceRefresh),
      this.activiteService.getActivites(forceRefresh),
      this.magasinService.getMagasins(forceRefresh),
      this.platService.getPlats(forceRefresh)
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([restaurants, activites, magasins, plats]) => {
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
            icone: emojiRestaurant(r),
            platsNoms: r.Plats.map(p => p.Nom)
          }));

          const lieuxActivites: LieuAffichable[] = activites.map(a => ({
            id: a.id,
            type: 'activite',
            nom: a.Nom,
            quartier: a.Quartier,
            latitude: a.latitude,
            longitude: a.longitude,
            prixIndicatif: a.Prix,
            estOuvert: estOuvertMaintenant(a.Horaires) ?? undefined,
            horaireTexte: horairesAujourdhui(a.Horaires) ?? undefined,
            icone: emojiActivite(a)
          }));

          const lieuxMagasins: LieuAffichable[] = magasins.map(m => ({
            id: m.id,
            type: 'magasin',
            nom: m.Nom,
            quartier: m.Quartier[0] ?? { Nom: '' },
            latitude: m.latitude,
            longitude: m.longitude,
            estOuvert: estOuvertMaintenant(m.Horaires) ?? undefined,
            horaireTexte: horairesAujourdhui(m.Horaires) ?? undefined,
            icone: emojiMagasin(m),
            typeMagasin: m.Type
          }));

          this.restaurantsBruts.set(restaurants);
          this.activitesBrutes.set(activites);
          this.magasinsBruts.set(magasins);
          this.platsBruts.set(plats);

          this.lieux.set([...lieuxRestaurants, ...lieuxActivites, ...lieuxMagasins]);
          this.chargement.set(false);
          onDone?.();
        },
        error: () => {
          this.chargement.set(false);
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

  changerVue(vue: Vue): void {
    this.vue.set(vue);
  }

  onRecherche(valeur: string): void {
    this.recherche.set(valeur ?? '');
  }

  ouvrirDetails(lieu: LieuAffichable): void {
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
    this.detailSelectionne.set(null);
  }

  nomsQuartiers(quartiers: { Nom: string }[]): string {
    return quartiers.map(q => q.Nom).join(', ');
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
