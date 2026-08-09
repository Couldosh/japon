import { Component, ElementRef, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  IonIcon, IonBadge, IonButton, IonChip, IonRefresher, IonRefresherContent, IonSkeletonText,
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline, pricetagOutline, walkOutline,
  alertCircleOutline, cloudOfflineOutline, calendarOutline, chevronForwardOutline,
  bedOutline, closeOutline
} from 'ionicons/icons';
import { PlanningService } from '../../service/planning/planning.service';
import { MeteoService } from '../../service/meteo/meteo.service';
import { PlanningActivite } from '../../models/planning-activite.model';
import { HebergementModel } from '../../models/hebergement.model';
import { MeteoJour } from '../../models/meteo.model';
import { LieuAffichable } from '../../models/lieu-affichable.model';
import { dateISOAujourdhui, formaterDateCourte, formaterDateGroupe, statutReservation, StatutReservation } from '../../utils/planning';
import { emojiMeteo } from '../../utils/emoji-meteo';
import { IaService } from '../../service/ia/ia.service';

/** Normalise un nom pour un matching insensible à la casse/aux accents (ex: "Ichiran" ~ "ichirân"). */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface GroupeJour {
  date: string;
  titre: string;
  estAujourdhui: boolean;
  activites: PlanningActivite[];
  arriveesHebergement: HebergementModel[];
  departsHebergement: HebergementModel[];
  /** Ville de la dernière activité du jour (meilleure approximation d'où on
   * passe la soirée/nuit, y compris un jour de trajet) — sert à la météo. */
  ville: string;
}

@Component({
  selector: 'app-planning',
  standalone: true,
  imports: [
    IonIcon, IonBadge, IonButton, IonChip, IonRefresher, IonRefresherContent, IonSkeletonText,
    IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent
  ],
  templateUrl: './planning.component.html',
  styleUrl: './planning.component.scss'
})
export class PlanningComponent implements OnInit {
  private readonly planningService = inject(PlanningService);
  private readonly meteoService = inject(MeteoService);
  private readonly iaService = inject(IaService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** Tous les lieux connus (non filtrés), pour retrouver la fiche détail d'une activité du planning. */
  readonly lieux = input<LieuAffichable[]>([]);
  /** Chargés par HomeComponent (même pipeline SheetsApi que Restaurants/Activités/Magasins/Plats),
   * pour bénéficier du même rafraîchissement forcé quel que soit l'onglet actif. */
  readonly hebergements = input<HebergementModel[]>([]);
  readonly lieuClique = output<LieuAffichable>();

  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly activites = signal<PlanningActivite[]>([]);
  readonly hebergementSelectionne = signal<HebergementModel | null>(null);
  readonly depuisCache = signal(false);
  readonly derniereMiseAJour = signal<number | null>(null);
  readonly filtreVille = signal<string | null>(null);

  /** Villes distinctes du planning, dans leur ordre d'apparition chronologique (pas alphabétique). */
  readonly villesDisponibles = computed(() => {
    const villes: string[] = [];
    for (const activite of this.activites()) {
      const ville = activite.ville?.trim();
      if (ville && !villes.includes(ville)) {
        villes.push(ville);
      }
    }
    return villes;
  });

  readonly activitesFiltrees = computed(() => {
    const ville = this.filtreVille();
    return ville ? this.activites().filter(a => a.ville === ville) : this.activites();
  });

  /** Nombre d'activités par ville, affiché sur chaque chip pour choisir en connaissance de cause. */
  readonly comptesVilles = computed(() => {
    const comptes = new Map<string, number>();
    for (const activite of this.activites()) {
      const ville = activite.ville?.trim();
      if (ville) {
        comptes.set(ville, (comptes.get(ville) ?? 0) + 1);
      }
    }
    return comptes;
  });

  // Index nom normalisé -> lieu, reconstruit seulement quand la liste de lieux change.
  private readonly lieuxParNom = computed(() => {
    const map = new Map<string, LieuAffichable>();
    for (const lieu of this.lieux()) {
      map.set(normaliser(lieu.nom), lieu);
    }
    return map;
  });

  // Le service renvoie déjà les activités triées par date puis heure : l'ordre
  // d'insertion dans la Map suit donc déjà l'ordre chronologique des jours.
  readonly groupesJour = computed((): GroupeJour[] => {
    const aujourdhui = dateISOAujourdhui();
    const groupes = new Map<string, PlanningActivite[]>();
    for (const activite of this.activitesFiltrees()) {
      if (!groupes.has(activite.date)) {
        groupes.set(activite.date, []);
      }
      groupes.get(activite.date)!.push(activite);
    }

    // Bandeau dédié plutôt qu'une activité comme une autre : un hébergement
    // n'est rattaché à un jour que s'il existe déjà comme groupe (jour avec au
    // moins une activité/un trajet dans le Planning). Cas limite accepté : un
    // hébergement dont la date d'arrivée ou de départ ne correspond à aucun
    // jour du Planning n'aurait nulle part où s'afficher.
    const hebergements = this.hebergements();
    return [...groupes.entries()].map(([date, activites]) => {
      const villesJour = activites.map(a => a.ville?.trim()).filter((v): v is string => !!v);
      return {
        date,
        titre: formaterDateGroupe(date),
        estAujourdhui: date === aujourdhui,
        activites,
        arriveesHebergement: hebergements.filter(h => h.dateArrivee === date),
        departsHebergement: hebergements.filter(h => h.dateDepart === date),
        ville: villesJour.length > 0 ? villesJour[villesJour.length - 1] : ''
      };
    });
  });

  /** Prévisions météo connues, indexées par "ville|dateISO" (voir MeteoService : best-effort,
   * une entrée absente signifie simplement "pas de prévision affichable", jamais une erreur). */
  readonly meteoParVilleEtDate = signal<Map<string, MeteoJour>>(new Map());
  private readonly villesMeteoChargees = new Set<string>();
  readonly emojiMeteo = emojiMeteo;

  /** Résumé quotidien généré par le backend IA (ClaudeApiTkt), indexé par date ISO du groupe.
   * Best-effort côté "aujourd'hui" (déclenchement automatique, même philosophie que la météo :
   * jamais d'erreur affichée) ; erreur affichée uniquement pour une génération manuelle
   * (genererResumeManuel), où l'utilisateur attend un retour explicite après son clic. */
  readonly resumeParJour = signal<Map<string, string>>(new Map());
  readonly resumeEnCoursParJour = signal<Set<string>>(new Set());
  readonly resumeErreurParJour = signal<Map<string, string>>(new Map());
  /** Dates déjà demandées dans cette session (auto ou manuel), pour ne jamais rappeler deux fois
   * le même jour — le cache serveur (12h) limite déjà le coût, ceci évite un appel réseau inutile. */
  private readonly resumeDemandes = new Set<string>();

  // Ne déclenche le scroll auto qu'une seule fois par ouverture de l'onglet (le
  // composant est détruit/recréé à chaque changement de vue, donc ce flag ne
  // survit pas entre deux visites, ce qui est le comportement voulu).
  private dejaScrolleAujourdhui = false;

  constructor() {
    addIcons({
      locationOutline, pricetagOutline, walkOutline, alertCircleOutline,
      cloudOfflineOutline, calendarOutline, chevronForwardOutline,
      bedOutline, closeOutline
    });

    effect(() => {
      if (this.chargement() || this.activites().length === 0 || this.dejaScrolleAujourdhui) {
        return;
      }
      this.dejaScrolleAujourdhui = true;
      setTimeout(() => {
        document.querySelector('.planning-jour-groupe-aujourdhui')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // `inline: 'start'` aligne la pastille du jour courant au bord gauche de la
        // mini-nav plutôt que de simplement la rendre visible, pour ne pas laisser
        // l'utilisateur scroller manuellement parmi les jours déjà passés.
        document.querySelector('.planning-nav-jour-actif')?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      }, 50);
    });

    // Charge la météo une seule fois par ville rencontrée (pas par jour) : le
    // service met déjà en cache par ville, mais on évite ici de resouscrire à
    // chaque recalcul de groupesJour() (ex: changement de filtre ville).
    effect(() => {
      for (const groupe of this.groupesJour()) {
        if (!groupe.ville || this.villesMeteoChargees.has(groupe.ville)) {
          continue;
        }
        this.villesMeteoChargees.add(groupe.ville);
        const ville = groupe.ville;
        this.meteoService.getPrevisions(ville).subscribe(previsions => {
          if (previsions.size === 0) {
            return;
          }
          const fusion = new Map(this.meteoParVilleEtDate());
          for (const [date, meteo] of previsions) {
            fusion.set(`${ville}|${date}`, meteo);
          }
          this.meteoParVilleEtDate.set(fusion);
        });
      }
    });

    // Génère automatiquement le résumé IA du jour "aujourd'hui" uniquement (pas les autres
    // jours du voyage, qui restent à la demande via genererResumeManuel) — voir le commentaire
    // sur resumeParJour pour le compromis coût/utilité derrière ce choix.
    effect(() => {
      const groupeAujourdhui = this.groupesJour().find(g => g.estAujourdhui);
      if (!groupeAujourdhui || this.resumeDemandes.has(groupeAujourdhui.date)) {
        return;
      }
      this.resumeDemandes.add(groupeAujourdhui.date);
      this.genererResumeJour(groupeAujourdhui, false);
    });
  }

  /** Prévision météo du jour affiché dans l'en-tête de groupe, null si non disponible
   * (jour hors fenêtre de prévision, ville non géolocalisable, etc. — voir MeteoService). */
  meteoJour(groupe: GroupeJour): MeteoJour | null {
    return groupe.ville ? this.meteoParVilleEtDate().get(`${groupe.ville}|${groupe.date}`) ?? null : null;
  }

  /** Déclenchement manuel (bouton "Générer un résumé IA") pour un jour autre qu'aujourd'hui —
   * ignoré si déjà demandé dans cette session. */
  genererResumeManuel(groupe: GroupeJour): void {
    if (this.resumeDemandes.has(groupe.date)) {
      return;
    }
    this.resumeDemandes.add(groupe.date);
    this.genererResumeJour(groupe, true);
  }

  private genererResumeJour(groupe: GroupeJour, afficherErreur: boolean): void {
    const enCours = new Set(this.resumeEnCoursParJour());
    enCours.add(groupe.date);
    this.resumeEnCoursParJour.set(enCours);

    const meteo = this.meteoJour(groupe);
    const meteoTexte = meteo ? `${this.emojiMeteo(meteo.code)} ${meteo.tempMin}°-${meteo.tempMax}°` : null;

    this.iaService.genererResumeQuotidien({
      jour: groupe.titre,
      ville: groupe.ville,
      activites: groupe.activites.map(a => `${a.heureDebut} ${a.activite}`),
      meteo: meteoTexte,
      hebergement: this.hebergementTexte(groupe),
    }).subscribe({
      next: reponse => {
        this.retirerResumeEnCours(groupe.date);
        const map = new Map(this.resumeParJour());
        map.set(groupe.date, reponse.resume);
        this.resumeParJour.set(map);
      },
      error: (err: Error) => {
        this.retirerResumeEnCours(groupe.date);
        if (afficherErreur) {
          const erreurs = new Map(this.resumeErreurParJour());
          erreurs.set(groupe.date, err.message);
          this.resumeErreurParJour.set(erreurs);
        }
      }
    });
  }

  private retirerResumeEnCours(date: string): void {
    const enCours = new Set(this.resumeEnCoursParJour());
    enCours.delete(date);
    this.resumeEnCoursParJour.set(enCours);
  }

  private hebergementTexte(groupe: GroupeJour): string | null {
    const parts: string[] = [
      ...groupe.arriveesHebergement.map(h => `Arrivée ${h.nom} (check-in ${h.heureCheckIn})`),
      ...groupe.departsHebergement.map(h => `Départ ${h.nom} (check-out ${h.heureCheckOut})`),
    ];
    return parts.length > 0 ? parts.join('; ') : null;
  }

  ngOnInit(): void {
    this.charger();
  }

  rafraichir(event?: CustomEvent): void {
    this.charger(() => (event?.target as HTMLIonRefresherElement | undefined)?.complete());
  }

  charger(onDone?: () => void): void {
    this.planningService.getPlanning().subscribe({
      next: resultat => {
        this.activites.set(resultat.activites);
        this.depuisCache.set(resultat.depuisCache);
        this.derniereMiseAJour.set(resultat.derniereMiseAJour);
        this.erreur.set(resultat.erreur);
        this.chargement.set(false);
      },
      complete: () => onDone?.()
    });
  }

  ouvrirHebergement(hebergement: HebergementModel): void {
    this.hebergementSelectionne.set(hebergement);
  }

  fermerHebergement(): void {
    this.hebergementSelectionne.set(null);
  }

  statut(reservation?: string): StatutReservation | null {
    return statutReservation(reservation);
  }

  couleurStatut(statut: StatutReservation): string {
    switch (statut) {
      case 'a-reserver': return 'warning';
      case 'reserve': return 'success';
      default: return 'medium';
    }
  }

  /**
   * Retrouve le lieu (restaurant/activité/magasin) correspondant à une activité
   * du planning, par correspondance de nom (exacte, puis par inclusion pour
   * couvrir des libellés du type "Déjeuner - Ichiran Shibuya"). Null si aucune
   * fiche ne correspond (activité purement logistique, trajet, etc.).
   */
  lieuPourActivite(activite: PlanningActivite): LieuAffichable | null {
    const cible = normaliser(activite.activite);
    if (!cible) {
      return null;
    }

    const correspondanceDirecte = this.lieuxParNom().get(cible);
    if (correspondanceDirecte) {
      return correspondanceDirecte;
    }

    for (const [nom, lieu] of this.lieuxParNom()) {
      if (cible.includes(nom) || nom.includes(cible)) {
        return lieu;
      }
    }

    return null;
  }

  choisirVille(ville: string | null): void {
    this.filtreVille.set(ville);
    // Remonte en haut de la liste : sans ça, changer de filtre laisse le scroll
    // à sa position précédente, potentiellement au milieu d'une liste filtrée
    // devenue plus courte (ou vide), ce qui est déroutant.
    const contenu = this.elementRef.nativeElement.closest('ion-content') as
      (HTMLElement & { scrollToTop?: (duration?: number) => Promise<void> }) | null;
    contenu?.scrollToTop?.(300);
  }

  formaterJourCourt(dateISO: string): string {
    return formaterDateCourte(dateISO);
  }

  /** Fait défiler la liste jusqu'au groupe du jour choisi (mini-nav de jours). */
  allerAuJour(date: string): void {
    document.querySelector(`[data-jour-date="${date}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Un des groupes de jour affichés correspond-il à aujourd'hui ? (le voyage peut être fini/pas commencé). */
  aUnJourAujourdhui(): boolean {
    return this.groupesJour().some(g => g.estAujourdhui);
  }

  /** Bouton flottant "Aujourd'hui" (home.component) : re-scroll au jour courant après que
   * l'auto-scroll d'ouverture (voir constructor()) ait défilé une fois pour de bon. */
  allerAujourdhui(): void {
    this.allerAuJour(dateISOAujourdhui());
  }

  /** Message de l'état vide : distingue une vraie erreur réseau d'un simple filtre ville sans résultat. */
  messageVide(): string {
    if (this.erreur()) {
      return this.erreur()!;
    }
    const ville = this.filtreVille();
    return ville ? `Aucune activité prévue à ${ville}.` : 'Aucune activité au programme.';
  }

  ouvrirLieu(lieu: LieuAffichable | null): void {
    if (lieu) {
      this.lieuClique.emit(lieu);
    }
  }

  formaterDateDetail(dateISO: string): string {
    return formaterDateGroupe(dateISO);
  }

  formaterMiseAJour(timestamp: number | null): string {
    if (!timestamp) {
      return '';
    }
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }
}
