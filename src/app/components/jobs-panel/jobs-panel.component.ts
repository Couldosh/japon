import { Component, DestroyRef, ElementRef, OnInit, effect, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonItem, IonToggle, IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, playOutline, stopOutline, alertCircleOutline, warningOutline } from 'ionicons/icons';
import { JobsService } from '../../service/jobs/jobs.service';
import { JobOptions, JobStatut, JobType } from '../../models/jobs.model';

const INTERVALLE_POLLING_MS = 1500;

interface CarteJob {
  type: JobType;
  titre: string;
  description: string;
  /** false pour "horaires" : le script d'origine écrit toujours directement, pas de mode aperçu. */
  supporteApplique: boolean;
  avertissement?: string;
}

/**
 * Menu caché "jobs" — lance côté serveur (ClaudeApiTkt, voir JobsService) les mêmes scripts de
 * maintenance du Sheet que scripts/*.mjs (horaires/menu/localisation/dupliquer-quartiers). Un
 * seul job actif pour tout le groupe à la fois : ce composant interroge /jobs/etat dès son
 * montage (pas seulement après un lancement local) pour refléter un job démarré par quelqu'un
 * d'autre. Polling par relance de setTimeout (pas d'intervalle RxJS) : le prochain sondage n'est
 * programmé qu'une fois la réponse précédente reçue, pour ne jamais empiler des requêtes si le
 * réseau est lent.
 */
@Component({
  selector: 'app-jobs-panel',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonItem, IonToggle, IonSpinner],
  templateUrl: './jobs-panel.component.html',
  styleUrl: './jobs-panel.component.scss'
})
export class JobsPanelComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ferme = output<void>();

  readonly cartes: CarteJob[] = [
    {
      type: 'horaires',
      titre: 'Horaires',
      description: 'Cherche les horaires d\'ouverture (Places API) et les écrit directement dans la colonne "Horaires" (pas de mode aperçu).',
      supporteApplique: false,
    },
    {
      type: 'menu',
      titre: 'Menu',
      description: 'Cherche un lien de menu (site web, souvent Tabelog) pour les restaurants sans colonne "Menu".',
      supporteApplique: true,
    },
    {
      type: 'localisation',
      titre: 'Localisation',
      description: 'Cherche la localisation Google Maps des lieux (restaurants/activités/magasins/hébergement) sans colonne "Localisation".',
      supporteApplique: true,
    },
    {
      type: 'dupliquer-quartiers',
      titre: 'Dupliquer quartiers',
      description: 'Éclate les lignes restaurants/magasins à plusieurs quartiers en une ligne par quartier.',
      supporteApplique: true,
      avertissement: 'Réécrit toute la feuille en une fois — opération difficile à annuler.',
    },
  ];

  // Flags par job, mêmes noms que les scripts CLI d'origine (--force/--rafraichir/--reformater) ;
  // "appliquer" = case "Écrire dans le Sheet" (décochée par défaut = aperçu, sauf horaires qui
  // n'a pas de mode aperçu côté script d'origine).
  readonly horaires = { force: signal(false), rafraichir: signal(false) };
  readonly menu = { rafraichir: signal(false), appliquer: signal(false) };
  readonly localisation = { rafraichir: signal(false), reformater: signal(false), appliquer: signal(false) };
  readonly quartiers = { rafraichir: signal(false), appliquer: signal(false) };

  /** Type du job actuellement EN_COURS (peut avoir été lancé par un autre membre du groupe). */
  readonly jobEnCours = signal<JobType | null>(null);
  readonly statut = signal<JobStatut>('INACTIF');
  readonly logs = signal<string[]>([]);
  readonly erreur = signal<string | null>(null);

  private curseur = 0;

  private readonly zoneLogs = viewChild<ElementRef<HTMLElement>>('zoneLogs');

  constructor() {
    addIcons({ closeOutline, playOutline, stopOutline, alertCircleOutline, warningOutline });

    // Auto-scroll en bas de la zone de logs à chaque nouvelle ligne — queueMicrotask pour
    // laisser le @for du template rendre les nouvelles lignes avant de mesurer scrollHeight.
    effect(() => {
      this.logs();
      const element = this.zoneLogs()?.nativeElement;
      if (element) {
        queueMicrotask(() => (element.scrollTop = element.scrollHeight));
      }
    });
  }

  ngOnInit(): void {
    this.pollerUneFois();
  }

  lancer(type: JobType): void {
    if (this.jobEnCours()) {
      return;
    }
    this.erreur.set(null);
    this.logs.set([]);
    this.curseur = 0;

    this.jobsService.lancer(type, this.optionsPour(type))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.pollerUneFois(),
        error: (err: Error) => this.erreur.set(err.message),
      });
  }

  annulerJob(): void {
    this.jobsService.annuler().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private optionsPour(type: JobType): JobOptions {
    switch (type) {
      case 'horaires':
        return { appliquer: false, force: this.horaires.force(), rafraichir: this.horaires.rafraichir(), reformater: false };
      case 'menu':
        return { appliquer: this.menu.appliquer(), force: false, rafraichir: this.menu.rafraichir(), reformater: false };
      case 'localisation':
        return {
          appliquer: this.localisation.appliquer(),
          force: false,
          rafraichir: this.localisation.rafraichir(),
          reformater: this.localisation.reformater(),
        };
      case 'dupliquer-quartiers':
        return { appliquer: this.quartiers.appliquer(), force: false, rafraichir: this.quartiers.rafraichir(), reformater: false };
    }
  }

  private pollerUneFois(): void {
    this.jobsService.etat(this.curseur)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: reponse => {
          this.curseur = reponse.total;
          if (reponse.logs.length > 0) {
            this.logs.update(lignes => [...lignes, ...reponse.logs]);
          }
          this.statut.set(reponse.statut);
          this.jobEnCours.set(reponse.statut === 'EN_COURS' ? reponse.type : null);

          if (reponse.statut === 'EN_COURS') {
            setTimeout(() => this.pollerUneFois(), INTERVALLE_POLLING_MS);
          }
        },
        error: () => {
          // Le polling s'arrête ici (pas de nouveau setTimeout) : message discret, les logs déjà
          // reçus restent affichés. Rouvrir le panneau relance un sondage frais.
          this.erreur.set('Perte de connexion au suivi du job (les logs déjà reçus restent affichés).');
        },
      });
  }
}
