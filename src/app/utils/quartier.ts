import { QuartierModel } from '../models/quartier.model';

/**
 * Résout un nom de quartier (tel qu'il apparaît dans les feuilles
 * Restaurants/Activités/Magasins) vers le QuartierModel complet (avec sa
 * Ville) de la feuille de référence "Quartiers". Repli sur un quartier minimal
 * si le nom n'y est pas trouvé, pour ne jamais bloquer l'affichage.
 */
export function resoudreQuartier(quartiersReference: QuartierModel[], nom: string | null | undefined): QuartierModel {
  const nomNettoye = nom?.trim() ?? '';
  const nomNormalise = nomNettoye.toLowerCase();

  const trouve = quartiersReference.find(q => q.Nom?.trim().toLowerCase() === nomNormalise);
  if (trouve) {
    return trouve;
  }

  return { Nom: nomNettoye, Ville: { Nom: '' }, Mood: '' } as QuartierModel;
}
