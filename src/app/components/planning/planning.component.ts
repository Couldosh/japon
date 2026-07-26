import { Component, ElementRef, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { IonIcon, IonBadge, IonButton, IonChip, IonRefresher, IonRefresherContent, IonSkeletonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline, pricetagOutline, walkOutline,
  alertCircleOutline, cloudOfflineOutline, calendarOutline, chevronForwardOutline
} from 'ionicons/icons';
import { PlanningService } from '../../service/planning/planning.service';
import { PlanningActivite } from '../../models/planning-activite.model';
import { LieuAffichable } from '../../models/lieu-affichable.model';
import { dateISOAujourdhui, formaterDateGroupe, statutReservation, StatutReservation } from '../../utils/planning';

/** Normalise un nom pour un matching insensible à la casse/aux accents (ex: "Ichiran" ~ "ichirân"). */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface GroupeJour {
  date: string;
  titre: string;
  estAujourdhui: boolean;
  activites: PlanningActivite[];
}

@Component({
  selector: 'app-planning',
  standalone: true,
  imports: [IonIcon, IonBadge, IonButton, IonChip, IonRefresher, IonRefresherContent, IonSkeletonText],
  templateUrl: './planning.component.html',
  styleUrl: './planning.component.scss'
})
export class PlanningComponent implements OnInit {
  private readonly planningService = inject(PlanningService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** Tous les lieux connus (non filtrés), pour retrouver la fiche détail d'une activité du planning. */
  readonly lieux = input<LieuAffichable[]>([]);
  readonly lieuClique = output<LieuAffichable>();

  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly activites = signal<PlanningActivite[]>([]);
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
    return [...groupes.entries()].map(([date, activites]) => ({
      date,
      titre: formaterDateGroupe(date),
      estAujourdhui: date === aujourdhui,
      activites
    }));
  });

  // Ne déclenche le scroll auto qu'une seule fois par ouverture de l'onglet (le
  // composant est détruit/recréé à chaque changement de vue, donc ce flag ne
  // survit pas entre deux visites, ce qui est le comportement voulu).
  private dejaScrolleAujourdhui = false;

  constructor() {
    addIcons({
      locationOutline, pricetagOutline, walkOutline, alertCircleOutline,
      cloudOfflineOutline, calendarOutline, chevronForwardOutline
    });

    effect(() => {
      if (this.chargement() || this.activites().length === 0 || this.dejaScrolleAujourdhui) {
        return;
      }
      this.dejaScrolleAujourdhui = true;
      setTimeout(() => {
        document.querySelector('.planning-jour-groupe-aujourdhui')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    });
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

  formaterMiseAJour(timestamp: number | null): string {
    if (!timestamp) {
      return '';
    }
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }
}
