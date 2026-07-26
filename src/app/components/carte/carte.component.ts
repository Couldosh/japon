import {
  AfterViewInit, Component, ElementRef, OnDestroy, ViewChild,
  computed, effect, inject, input, output, signal
} from '@angular/core';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { locateOutline, heart, heartOutline } from 'ionicons/icons';
import * as L from 'leaflet';
import 'leaflet.markercluster';

import { LieuAffichable } from '../../models/lieu-affichable.model';
import { FavorisService } from '../../service/favoris/favoris.service';
import { environment } from '../../../environments/environment';

const CENTRE_PAR_DEFAUT: L.LatLngTuple = [35.6762, 139.6503]; // Tokyo
const ZOOM_PAR_DEFAUT = 13;
const ZOOM_RECENTRAGE = 16;

@Component({
  selector: 'app-carte',
  standalone: true,
  imports: [IonIcon, IonButton],
  templateUrl: './carte.component.html',
  styleUrl: './carte.component.scss'
})
export class CarteComponent implements AfterViewInit, OnDestroy {
  private readonly favorisService = inject(FavorisService);

  readonly lieux = input.required<LieuAffichable[]>();
  readonly position = input<{ latitude: number; longitude: number } | null>(null);
  /** True quand l'onglet Carte est effectivement affiché (le composant, lui, reste monté en permanence). */
  readonly actif = input<boolean>(true);
  readonly lieuClique = output<LieuAffichable>();

  /** Non-null si l'initialisation de la carte a échoué. */
  readonly erreur = signal<string | null>(null);

  /** N'affiche que les lieux favoris sur la carte quand actif. */
  readonly filtrerFavoris = signal(false);

  private readonly lieuxFiltres = computed(() =>
    this.filtrerFavoris() ? this.lieux().filter(l => this.favorisService.estFavori(l.id)) : this.lieux()
  );

  /** true si le filtre favoris est actif mais qu'aucun favori n'est à afficher (carte silencieusement vide sinon). */
  readonly aucunFavoriAffiche = computed(() => this.filtrerFavoris() && this.lieuxFiltres().length === 0);

  @ViewChild('carteEl') private readonly carteEl!: ElementRef<HTMLDivElement>;

  private carte?: L.Map;
  private groupeMarqueurs?: L.MarkerClusterGroup;
  private marqueurPosition?: L.Marker;

  // Évite de reconstruire tous les marqueurs (coûteux : clearLayers + reclustering)
  // quand seule la distance a changé suite à un tick de géolocalisation, alors
  // que l'ensemble des lieux affichés est identique.
  private signatureMarqueurs = '';

  // Centre/zoome la carte une seule fois au premier chargement (sur la position
  // si connue, sinon sur l'ensemble des marqueurs) pour éviter un cadrage fixe
  // sur Tokyo qui pourrait laisser tous les lieux hors champ.
  private vueInitialeAjustee = false;

  constructor() {
    addIcons({ locateOutline, heart, heartOutline });

    effect(() => this.mettreAJourMarqueursLieux(this.lieuxFiltres()));
    effect(() => this.mettreAJourMarqueurPosition(this.position()));

    // Le composant reste monté même masqué (voir home.component.html) ; Leaflet
    // calcule sa taille de tuiles au moment de la création et ne se corrige pas
    // tout seul quand le conteneur redevient visible. On force le recalcul à
    // chaque passage à l'état actif (le rAF laisse le temps au CSS de s'appliquer).
    effect(() => {
      if (this.actif()) {
        requestAnimationFrame(() => this.carte?.invalidateSize());
      }
    });
  }

  ngAfterViewInit(): void {
    this.initialiserCarte();
  }

  ngOnDestroy(): void {
    this.carte?.remove();
  }

  recentrer(): void {
    const position = this.position();
    if (position && this.carte) {
      this.carte.setView([position.latitude, position.longitude], ZOOM_RECENTRAGE);
    }
  }

  basculerFiltreFavoris(): void {
    this.filtrerFavoris.set(!this.filtrerFavoris());
  }

  /** Relance l'initialisation après un échec. Un rAF laisse le temps au `@else` du template de remonter #carteEl. */
  reessayer(): void {
    this.erreur.set(null);
    requestAnimationFrame(() => this.initialiserCarte());
  }

  private initialiserCarte(): void {
    try {
      this.carte = L.map(this.carteEl.nativeElement, {
        center: CENTRE_PAR_DEFAUT,
        zoom: ZOOM_PAR_DEFAUT,
      });

      // Tuiles raster MapTiler (rendu serveur du même style OpenMapTiles que la
      // version vectorielle) : les noms romanisés ("name:latin") sont calculés
      // par translittération et affichés même sans tag name:en explicite dans
      // OSM (cas fréquent au Japon hors lieux connus). Aucun besoin de WebGL,
      // contrairement à MapLibre GL qui posait problème sur cette machine.
      L.tileLayer(`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${environment.maptilerApiKey}`, {
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 20,
        detectRetina: true,
      }).addTo(this.carte);

      this.groupeMarqueurs = L.markerClusterGroup();
      this.carte.addLayer(this.groupeMarqueurs);

      this.mettreAJourMarqueursLieux(this.lieuxFiltres());
      this.mettreAJourMarqueurPosition(this.position());
      this.ajusterVueInitiale();
    } catch (e) {
      console.error('Erreur lors de l\'initialisation de la carte :', e);
      this.erreur.set("Impossible d'afficher la carte. Vérifie que la clé MapTiler est valide.");
      this.carte?.remove();
      this.carte = undefined;
      this.groupeMarqueurs = undefined;
      this.signatureMarqueurs = '';
      this.vueInitialeAjustee = false;
    }
  }

  /** Cadrage initial une seule fois : sur la position si connue, sinon sur l'ensemble des marqueurs. */
  private ajusterVueInitiale(): void {
    if (this.vueInitialeAjustee || !this.carte) {
      return;
    }

    const position = this.position();
    if (position) {
      this.carte.setView([position.latitude, position.longitude], ZOOM_RECENTRAGE);
      this.vueInitialeAjustee = true;
      return;
    }

    if (this.groupeMarqueurs && this.groupeMarqueurs.getLayers().length > 0) {
      this.carte.fitBounds(this.groupeMarqueurs.getBounds(), { padding: [40, 40], maxZoom: 16 });
      this.vueInitialeAjustee = true;
    }
  }

  private mettreAJourMarqueursLieux(lieux: LieuAffichable[]): void {
    if (!this.groupeMarqueurs) {
      return;
    }

    const signature = lieux.map(l => `${l.id}:${this.favorisService.estFavori(l.id) ? 1 : 0}`).join(',');
    if (signature === this.signatureMarqueurs) {
      return;
    }
    this.signatureMarqueurs = signature;

    this.groupeMarqueurs.clearLayers();

    for (const lieu of lieux) {
      if (lieu.latitude == null || lieu.longitude == null) {
        continue;
      }

      const favori = this.favorisService.estFavori(lieu.id);
      const icone = L.divIcon({
        html: `<div class="marqueur-emoji${favori ? ' marqueur-favori' : ''}">${lieu.icone}</div>`,
        className: 'marqueur-conteneur',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marqueur = L.marker([lieu.latitude, lieu.longitude], { icon: icone });
      marqueur.on('click', () => this.lieuClique.emit(lieu));
      this.groupeMarqueurs.addLayer(marqueur);
    }

    this.ajusterVueInitiale();
  }

  private mettreAJourMarqueurPosition(position: { latitude: number; longitude: number } | null): void {
    if (!this.carte) {
      return;
    }

    if (this.marqueurPosition) {
      this.marqueurPosition.remove();
      this.marqueurPosition = undefined;
    }

    if (!position) {
      return;
    }

    const icone = L.divIcon({
      html: '<div class="marqueur-position"></div>',
      className: 'marqueur-conteneur',
      iconSize: [18, 18],
    });

    this.marqueurPosition = L.marker([position.latitude, position.longitude], { icon: icone, zIndexOffset: 1000 });
    this.marqueurPosition.addTo(this.carte);

    this.ajusterVueInitiale();
  }
}
