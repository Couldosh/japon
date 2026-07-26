import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonIcon, IonBadge, IonRefresher, IonRefresherContent, IonSkeletonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline, pricetagOutline, walkOutline,
  alertCircleOutline, cloudOfflineOutline, calendarOutline
} from 'ionicons/icons';
import { PlanningService } from '../../service/planning/planning.service';
import { PlanningActivite } from '../../models/planning-activite.model';
import { dateISOAujourdhui, formaterDateGroupe, statutReservation, StatutReservation } from '../../utils/planning';

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

  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly activites = signal<PlanningActivite[]>([]);
  readonly depuisCache = signal(false);
  readonly derniereMiseAJour = signal<number | null>(null);

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
    addIcons({ locationOutline, pricetagOutline, walkOutline, alertCircleOutline, cloudOfflineOutline, calendarOutline });
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

  formaterMiseAJour(timestamp: number | null): string {
    if (!timestamp) {
      return '';
    }
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }
}
