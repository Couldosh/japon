export type JobType = 'horaires' | 'menu' | 'localisation' | 'dupliquer-quartiers';

export type JobStatut = 'INACTIF' | 'EN_COURS' | 'TERMINE' | 'ERREUR' | 'ANNULE';

/** Mêmes flags que les scripts CLI d'origine (--force/--rafraichir/--appliquer/--reformater). */
export interface JobOptions {
  appliquer: boolean;
  force: boolean;
  rafraichir: boolean;
  reformater: boolean;
}

export interface JobLancementResponse {
  demarre: boolean;
}

export interface JobEtatResponse {
  type: JobType | null;
  statut: JobStatut;
  logs: string[];
  total: number;
}
