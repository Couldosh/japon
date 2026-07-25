import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { combineLatest } from 'rxjs';
import {
  IonHeader, IonToolbar, IonSearchbar, IonChip, IonIcon,
  IonList, IonItem, IonLabel, IonBadge, IonTabBar, IonTabButton,
  IonContent, IonSkeletonText
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline, searchOutline, walkOutline, restaurantOutline,
  businessOutline, fastFoodOutline, homeOutline, listOutline,
  mapOutline, heartOutline
} from 'ionicons/icons';

import { RestaurantService } from '../service/restaurant/restaurant.service';
import { ActiviteService } from '../service/activite/activite.service';
import { PlatService } from '../service/plat/plat.service';
import { GeolocationService } from '../service/geolocation/GeolocationService';
import { LieuAffichable, TypeLieu } from '../models/lieu-affichable.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonSearchbar, IonChip, IonIcon,
    IonList, IonItem, IonLabel, IonBadge, IonTabBar, IonTabButton,
    IonContent, IonSkeletonText
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {

  private readonly restaurantService = inject(RestaurantService);
  private readonly activiteService = inject(ActiviteService);
  private readonly platService = inject(PlatService);
  private readonly geoloc = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);

  // Etat
  readonly chargement = signal(true);
  readonly filtreActif = signal<TypeLieu | 'tout'>('tout');
  readonly recherche = signal('');
  readonly lieux = signal<LieuAffichable[]>([]);

  // Position et libellé de zone courante, dérivés du service de géoloc
  readonly position = this.geoloc.position;

  // Liste filtrée + triée par distance, recalculée automatiquement
  readonly lieuxAffiches = computed(() => {
    const filtre = this.filtreActif();
    const terme = this.recherche().toLowerCase().trim();
    const pos = this.position();

    let resultat = this.lieux();

    if (filtre !== 'tout') {
      resultat = resultat.filter(l => l.type === filtre);
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

  readonly quartierCourant = computed(() => {
    const pos = this.position();
    if (!pos) {
      return 'Localisation en cours...';
    }

    const lieuxTries = this.lieuxAffiches();
    if (lieuxTries.length === 0) {
      return 'Position inconnue';
    }

    // lieuxAffiches() est déjà trié par distance quand la position est dispo
    return `${lieuxTries[0].quartier.Nom}`;
  });

  constructor() {
    addIcons({
      locationOutline, searchOutline, walkOutline, restaurantOutline,
      businessOutline, fastFoodOutline, homeOutline, listOutline,
      mapOutline, heartOutline
    });
  }

  ngOnInit(): void {
    this.geoloc.demarrerSuivi();
    this.chargerDonnees();
  }

  private chargerDonnees(): void {
    this.chargement.set(true);

    // Adapter les noms de méthodes/champs à vos services et models réels
    combineLatest([
      this.restaurantService.getRestaurants(),
      this.activiteService.getActivites(),
      this.platService.getPlats()
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([restaurants, activites, plats]) => {
          const lieuxRestaurants: LieuAffichable[] = restaurants.map(r => ({
            id: r.id,
            type: 'restaurant',
            nom: r.Nom,
            quartier: r.Quartier,
            latitude: r.latitude,
            longitude: r.longitude,
            prixIndicatif: r.Prix,
            estOuvert: true, //r.estOuvertMaintenant?.(),
            icone: 'restaurant-outline'
          }));

          const lieuxActivites: LieuAffichable[] = activites.map(a => ({
            id: a.id,
            type: 'activite',
            nom: a.Nom,
            quartier: a.Quartier,
            latitude: a.latitude,
            longitude: a.longitude,
            prixIndicatif: a.Prix,
            icone: 'business-outline'
          }));

          this.lieux.set([...lieuxRestaurants, ...lieuxActivites]);
          this.chargement.set(false);
        },
        error: () => {
          this.chargement.set(false);
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
  }

  onRecherche(valeur: string): void {
    this.recherche.set(valeur ?? '');
  }
}
