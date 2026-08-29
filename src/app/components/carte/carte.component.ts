/// <reference types="leaflet.markercluster" />
import {
  AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild,
  computed, effect, inject, input, output, signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { locateOutline, heart, heartOutline, timeOutline, ticketOutline } from 'ionicons/icons';
import type * as LeafletType from 'leaflet';

import { LieuAffichable } from '../../models/lieu-affichable.model';
import { EkiStampModel } from '../../models/eki-stamp.model';
import { FavorisService } from '../../service/favoris/favoris.service';
import { EkiStampService } from '../../service/eki-stamp/eki-stamp.service';
import { environment } from '../../../environments/environment';

// Leaflet + leaflet.markercluster sont chargés en scripts globaux classiques
// (angular.json > build > options > scripts), PAS importés en module ES.
// leaflet.markercluster est un plugin qui mute un `L` global existant
// (`L.MarkerClusterGroup = ...`) : ça fonctionnait en dev via `import * as L
// from 'leaflet'; import 'leaflet.markercluster';`, mais le bundling ESM de
// production ne garantit pas que ce plugin s'exécute au bon moment/dans le
// bon contexte pour retrouver ce `L` — erreur "L.markerClusterGroup is not a
// function" en prod uniquement, jamais en dev. Charger les deux en scripts
// globaux élimine toute ambiguïté : `L` devient un vrai window.L, dans
// l'ordre garanti par la liste `scripts`.
// `import type` ci-dessus ne sert qu'à typer ce global (LeafletType.X dans
// les positions de type ci-dessous), sans jamais l'importer au runtime — la
// constante `L` juste en dessous lit la vraie valeur sur `window.L`. Un
// module TS ne peut pas référencer un "UMD global" (`export as namespace L`
// de @types/leaflet) par son nom nu comme le ferait un script classique
// (erreur TS2686) : d'où ce détour explicite plutôt qu'un simple `L.xxx`.
// `/// <reference>` en haut de fichier charge l'augmentation de types du
// plugin (déclare `MarkerClusterGroup`/`markerClusterGroup` sur le module
// "leaflet", voir @types/leaflet.markercluster).
const L: typeof LeafletType = (globalThis as { L: typeof LeafletType }).L;

const CENTRE_PAR_DEFAUT: LeafletType.LatLngTuple = [35.6762, 139.6503]; // Tokyo
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
  private readonly ekiStampService = inject(EkiStampService);
  private readonly destroyRef = inject(DestroyRef);

  readonly lieux = input.required<LieuAffichable[]>();
  readonly position = input<{ latitude: number; longitude: number } | null>(null);
  /** True quand l'onglet Carte est effectivement affiché (le composant, lui, reste monté en
   * permanence). Déclenche l'initialisation de la carte (donc le premier chargement de tuiles
   * MapTiler) à son premier passage à true, voir carteInitialisee/essayerInitialiser() ;
   * ensuite, ne sert plus qu'à invalidateSize() à chaque réaffichage. */
  readonly actif = input<boolean>(true);
  readonly lieuClique = output<LieuAffichable>();

  /** Non-null si l'initialisation de la carte a échoué. */
  readonly erreur = signal<string | null>(null);

  /** N'affiche que les lieux favoris sur la carte quand actif. */
  readonly filtrerFavoris = signal(false);
  /** N'affiche que les lieux actuellement ouverts sur la carte quand actif. Filtre propre à la
   * Carte (comme filtrerFavoris ci-dessus), indépendant du chip "Ouvert" de la Liste/Favoris —
   * ce dernier n'est pas accessible ici puisque .section-entete n'existe pas sur cet onglet. */
  readonly filtrerOuverts = signal(false);

  private readonly lieuxFiltres = computed(() => {
    let resultat = this.lieux();
    if (this.filtrerFavoris()) {
      resultat = resultat.filter(l => this.favorisService.estFavori(l.id));
    }
    if (this.filtrerOuverts()) {
      resultat = resultat.filter(l => l.estOuvert === true);
    }
    return resultat;
  });

  /** true si au moins un filtre (favoris/ouverts) est actif mais qu'aucun lieu ne correspond
   * (carte silencieusement vide sinon). */
  readonly aucunLieuAffiche = computed(() =>
    (this.filtrerFavoris() || this.filtrerOuverts()) && this.lieuxFiltres().length === 0
  );

  /** Couche indépendante des lieux du Sheet (voir docs/architecture-et-pieges.md) : les
   * ~1600 "eki stamps" du carnet de gares/lieux touristiques, chargés depuis
   * public/eki-stamps.json à la demande (voir basculerEkiStamps()), pas au montage —
   * fichier de ~700 Ko qu'un utilisateur qui n'active jamais cette couche ne doit
   * jamais télécharger. */
  readonly afficherEkiStamps = signal(false);
  private ekiStampsChargement = false;
  // Conservés après le premier chargement pour pouvoir reconstruire le layer
  // group si la carte est réinitialisée (reessayer() après une erreur) sans
  // reproposer un appel HTTP.
  private ekiStampsCache: EkiStampModel[] = [];

  @ViewChild('carteEl') private readonly carteEl!: ElementRef<HTMLDivElement>;

  private carte?: LeafletType.Map;
  private groupeMarqueurs?: LeafletType.MarkerClusterGroup;
  private groupeEkiStamps?: LeafletType.MarkerClusterGroup;
  private marqueurPosition?: LeafletType.Marker;

  // Évite de reconstruire tous les marqueurs (coûteux : clearLayers + reclustering)
  // quand seule la distance a changé suite à un tick de géolocalisation, alors
  // que l'ensemble des lieux affichés est identique.
  private signatureMarqueurs = '';

  // Centre/zoome la carte une seule fois au premier chargement (sur la position
  // si connue, sinon sur l'ensemble des marqueurs) pour éviter un cadrage fixe
  // sur Tokyo qui pourrait laisser tous les lieux hors champ.
  private vueInitialeAjustee = false;

  /** True dès qu'une tentative d'initialisation (réussie ou en erreur) a eu lieu — l'init
   * elle-même (donc les requêtes de tuiles MapTiler) est différée au premier passage à
   * `actif`, pas déclenchée au montage du composant. Le composant reste monté en
   * permanence (voir docs/architecture-et-pieges.md), mais tant que l'onglet Carte n'a
   * jamais été ouvert, aucune tuile n'est chargée — évite de consommer le quota MapTiler
   * pour les utilisateurs qui ne visitent jamais cet onglet. */
  private carteInitialisee = false;

  constructor() {
    addIcons({ locateOutline, heart, heartOutline, timeOutline, ticketOutline });

    effect(() => this.mettreAJourMarqueursLieux(this.lieuxFiltres()));
    effect(() => this.mettreAJourMarqueurPosition(this.position()));

    // Premier passage à actif=true : initialise la carte (voir carteInitialisee ci-dessus).
    // Passages suivants : le composant reste monté même masqué (voir home.component.html) ;
    // Leaflet calcule sa taille de tuiles au moment de la création et ne se corrige pas tout
    // seul quand le conteneur redevient visible, d'où l'invalidateSize() à chaque réactivation
    // (le rAF laisse le temps au CSS de s'appliquer).
    effect(() => {
      if (!this.actif()) {
        return;
      }
      if (!this.carteInitialisee) {
        this.essayerInitialiser();
      } else {
        requestAnimationFrame(() => this.carte?.invalidateSize());
      }
    });
  }

  ngAfterViewInit(): void {
    // Cas où l'onglet Carte est déjà actif au montage (ex: état initial de l'app) : l'effect
    // ci-dessus a pu s'exécuter avant que #carteEl soit disponible, on retente ici où Angular
    // garantit que les ViewChild sont peuplés.
    this.essayerInitialiser();
  }

  private essayerInitialiser(): void {
    if (this.carteInitialisee || !this.actif() || !this.carteEl) {
      return;
    }
    this.carteInitialisee = true;
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

  /** Centre la carte sur un point précis (ex: depuis le bouton "Voir sur la carte" de la popup détail d'un lieu). */
  centrerSurPoint(latitude: number, longitude: number): void {
    this.carte?.setView([latitude, longitude], ZOOM_RECENTRAGE);
  }

  basculerFiltreFavoris(): void {
    this.filtrerFavoris.set(!this.filtrerFavoris());
  }

  basculerFiltreOuverts(): void {
    this.filtrerOuverts.set(!this.filtrerOuverts());
  }

  /**
   * Bascule la couche "Eki stamps". Charge public/eki-stamps.json au premier
   * affichage seulement (this.ekiStampsChargement), puis se contente d'attacher/
   * détacher le layer group déjà construit — pas de rechargement ni de
   * reconstruction des marqueurs aux bascules suivantes.
   */
  basculerEkiStamps(): void {
    this.afficherEkiStamps.set(!this.afficherEkiStamps());

    if (this.afficherEkiStamps() && !this.ekiStampsChargement) {
      this.ekiStampsChargement = true;
      this.ekiStampService.getEkiStamps()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(stamps => {
          this.ekiStampsCache = stamps;
          this.construireMarqueursEkiStamps(stamps);
          this.appliquerVisibiliteEkiStamps();
        });
      return;
    }

    this.appliquerVisibiliteEkiStamps();
  }

  private appliquerVisibiliteEkiStamps(): void {
    if (!this.carte || !this.groupeEkiStamps) {
      return;
    }
    const doitAfficher = this.afficherEkiStamps();
    const dejaAffiche = this.carte.hasLayer(this.groupeEkiStamps);
    if (doitAfficher && !dejaAffiche) {
      this.carte.addLayer(this.groupeEkiStamps);
    } else if (!doitAfficher && dejaAffiche) {
      this.carte.removeLayer(this.groupeEkiStamps);
    }
  }

  private construireMarqueursEkiStamps(stamps: EkiStampModel[]): void {
    if (!this.groupeEkiStamps) {
      return;
    }
    for (const stamp of stamps) {
      const icone = L.divIcon({
        html: '<div class="marqueur-eki-stamp"></div>',
        className: 'marqueur-conteneur',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marqueur = L.marker([stamp.latitude, stamp.longitude], { icon: icone });
      marqueur.bindPopup(this.popupEkiStamp(stamp));
      this.groupeEkiStamps.addLayer(marqueur);
    }
  }

  /** Popup Leaflet native (pas la popup détail de l'app, propre aux LieuAffichable) :
   * un eki stamp n'a pas les champs attendus par cette dernière (Description, Avis...). */
  private popupEkiStamp(stamp: EkiStampModel): string {
    const lignes = [`<strong>${stamp.nom}</strong>`, stamp.nomJaponais];
    if (stamp.nomAnglais) lignes.push(stamp.nomAnglais);
    lignes.push(stamp.categorie);
    if (stamp.dateFermeture) lignes.push(`Fermé : ${stamp.dateFermeture}`);
    if (stamp.sansPersonnelDepuis) lignes.push(`Sans personnel depuis ${stamp.sansPersonnelDepuis}`);
    lignes.push(stamp.tamponDisponible ? 'Tampon disponible' : 'Pas de tampon');
    lignes.push(`<a href="${stamp.url}" target="_blank" rel="noopener">Fiche funakiya.com</a>`);
    return `<div class="popup-eki-stamp">${lignes.map(l => `<div>${l}</div>`).join('')}</div>`;
  }

  /**
   * Recentre la carte sur les marqueurs actuellement affichés, indépendamment du
   * cadrage initial déjà effectué (contrairement à `ajusterVueInitiale`, qui ne
   * joue qu'une seule fois). Utilisé quand on arrive depuis un filtre quartier.
   */
  recentrerSurMarqueurs(): void {
    if (this.carte && this.groupeMarqueurs && this.groupeMarqueurs.getLayers().length > 0) {
      this.carte.fitBounds(this.groupeMarqueurs.getBounds(), { padding: [40, 40], maxZoom: 16 });
    }
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

      // Pas ajoutée au layer group tout de suite : n'est attachée à la carte
      // que si la couche est déjà demandée (voir basculerEkiStamps()). Si des
      // stamps sont déjà en cache (reessayer() après une erreur d'init
      // survenue après un premier chargement), reconstruit directement les
      // marqueurs sans refaire d'appel HTTP.
      this.groupeEkiStamps = L.markerClusterGroup();
      if (this.ekiStampsCache.length > 0) {
        this.construireMarqueursEkiStamps(this.ekiStampsCache);
      }
      if (this.afficherEkiStamps()) {
        this.carte.addLayer(this.groupeEkiStamps);
      }

      this.mettreAJourMarqueursLieux(this.lieuxFiltres());
      this.mettreAJourMarqueurPosition(this.position());
      this.ajusterVueInitiale();
    } catch (e) {
      console.error('Erreur lors de l\'initialisation de la carte :', e);
      this.erreur.set("Impossible d'afficher la carte. Vérifie que la clé MapTiler est valide.");
      this.carte?.remove();
      this.carte = undefined;
      this.groupeMarqueurs = undefined;
      this.groupeEkiStamps = undefined;
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
