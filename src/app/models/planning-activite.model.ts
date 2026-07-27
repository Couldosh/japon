// Modèle "vue" pour l'onglet Planning, construit à partir de la feuille
// Google Sheet "Planning v2". Les champs optionnels reflètent des colonnes
// qui peuvent être vides dans le Sheet.
export interface PlanningActivite {
  /** Format ISO "yyyy-MM-dd", triable directement en chaîne. */
  date: string;
  /** Format "HH:mm", triable directement en chaîne. */
  heureDebut: string;
  heureFin: string;
  ville: string;
  activite: string;
  prix?: string;
  trajet?: string;
  commentaires?: string;
  reservation?: string;
}
