import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { IonIcon, IonBadge, IonRefresher, IonRefresherContent, IonSkeletonText } from '@ionic/angular/standalone';
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
  imports: [IonIcon, IonBadge, IonRefresher, IonRefresherContent, IonSkeletonText],
  templateUrl: './planning.component.html',
  styleUrl: './planning.component.scss'
})
export class PlanningComponent implements OnInit {
  private readonly planningService = inject(PlanningService);

  /** Tous les lieux connus (non filtrés), pour retrouver la fiche détail d'une activité du planning. */
  readonly lieux = input<LieuAffichable[]>([]);
  readonly lieuClique = output<LieuAffichable>();

  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly activites = signal<PlanningActivite[]>([]);
  readonly depuisCache = signal(false);
  readonly derniereMiseAJour = signal<number | null>(null);

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
    for (const activite of this.activites()) {
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

  constructor() {
    addIcons({
      locationOutline, pricetagOutline, walkOutline, alertCircleOutline,
      cloudOfflineOutline, calendarOutline, chevronForwardOutline
    });
  }

  ngOnInit(): void {
    this.charger();
  }

  rafraichir(event?: CustomEvent): void {
    this.charger(() => (event?.target as HTMLIonRefresherElement | undefined)?.complete());
  }

  private charger(onDone?: () => void): void {
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
