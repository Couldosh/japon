import { Injectable } from '@angular/core';
import { Papa } from 'ngx-papaparse';
import { Observable, concat, of, EMPTY, catchError, map } from 'rxjs';
import { SheetsApi } from '../google/sheets-api.service';
import { PlanningActivite } from '../../models/planning-activite.model';
import { parserDateISO, parserHeure } from '../../utils/planning';

const GID_PLANNING = '1009205135';

const CLE_CACHE = 'planning_cache';

interface PlanningCache {
  activites: PlanningActivite[];
  timestamp: number;
}

export interface PlanningResultat {
  activites: PlanningActivite[];
  /** true si ce résultat vient du cache local (pas forcément à jour). */
  depuisCache: boolean;
  /** Horodatage (ms) de la dernière donnée connue, cache ou réseau. */
  derniereMiseAJour: number | null;
  /** Message d'erreur à afficher discrètement, sans effacer les données déjà montrées. */
  erreur: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class PlanningService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  /**
   * Stratégie stale-while-revalidate : émet immédiatement le cache local s'il
   * existe, puis toujours une tentative réseau (qui met à jour le cache en cas
   * de succès). En cas d'échec réseau, ne touche pas au cache existant et
   * signale l'erreur sans vider les données déjà affichées.
   */
  getPlanning(): Observable<PlanningResultat> {
    const cache = this.lireCache();

    const depuisCache$: Observable<PlanningResultat> = cache
      ? of({
          activites: cache.activites,
          depuisCache: true,
          derniereMiseAJour: cache.timestamp,
          erreur: null
        })
      : EMPTY;

    const depuisReseau$: Observable<PlanningResultat> = this.sheetsApi.getCsv(GID_PLANNING, true).pipe(
      map(csv => {
        const activites = this.parserCsv(csv);
        this.ecrireCache(activites);
        return {
          activites,
          depuisCache: false,
          derniereMiseAJour: Date.now(),
          erreur: null
        } as PlanningResultat;
      }),
      catchError(() =>
        of(
          cache
            ? {
                activites: cache.activites,
                depuisCache: true,
                derniereMiseAJour: cache.timestamp,
                erreur: 'Impossible de récupérer les dernières données. Affichage des données enregistrées.'
              }
            : {
                activites: [],
                depuisCache: false,
                derniereMiseAJour: null,
                erreur: 'Aucune donnée disponible, connectez-vous à internet.'
              }
        )
      )
    );

    return concat(depuisCache$, depuisReseau$);
  }

  private parserCsv(csv: string): PlanningActivite[] {
    const resultat = this.papa.parse(csv, {
      header: true,
      skipEmptyLines: 'greedy'
    });

    // Certaines lignes du Sheet ont une colonne Ville vide (ex: séjour à Kyoto,
    // puis retour à Tokyo) sans que la ville précédente ("Osaka") soit encore
    // correcte pour autant : un simple report de la dernière valeur non-vide
    // attribuerait ces activités à la mauvaise ville. Le champ Trajet indique
    // systématiquement la destination ("Trajet vers Kyoto", "Vol vers Fukuoka"...)
    // dès la ligne qui précède le changement : on s'en sert pour détecter la
    // vraie ville courante même quand la colonne Ville elle-même est vide.
    let villeCourante = '';

    return (resultat.data as any[])
      .map((row): PlanningActivite | null => {
        const date = parserDateISO(row['Date']);
        const activite = row['Activite']?.trim();

        const villeBrute = row['Ville']?.trim();
        if (villeBrute) {
          villeCourante = villeBrute;
        }

        const ville = villeCourante;

        // Mis à jour après avoir affecté `ville` à la ligne courante : la ligne
        // de trajet elle-même appartient encore à l'ancienne ville, seules les
        // lignes suivantes basculent vers la destination.
        const destination = row['Trajet']?.match(/vers\s+(.+)/i)?.[1]?.trim();
        if (destination) {
          villeCourante = destination;
        }

        if (!date || !activite) {
          return null;
        }

        return {
          date,
          heureDebut: parserHeure(row['Heure début']),
          heureFin: parserHeure(row['Heure fin']),
          ville,
          activite,
          prix: row['Prix']?.toString().trim() || undefined,
          trajet: row['Trajet']?.trim() || undefined,
          commentaires: row['Commentaires']?.trim() || undefined,
          reservation: row['Reservation']?.trim() || undefined
        };
      })
      .filter((a): a is PlanningActivite => a !== null)
      // Trie simultanément par jour puis par heure de début (chaînes de longueur fixe).
      .sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));
  }

  private lireCache(): PlanningCache | null {
    try {
      const brut = localStorage.getItem(CLE_CACHE);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  }

  private ecrireCache(activites: PlanningActivite[]): void {
    try {
      const entry: PlanningCache = { activites, timestamp: Date.now() };
      localStorage.setItem(CLE_CACHE, JSON.stringify(entry));
    } catch {
      // localStorage indisponible ou quota dépassé : le cache est best-effort, on ignore.
    }
  }
}
