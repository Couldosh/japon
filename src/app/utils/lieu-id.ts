/**
 * Génère un id stable pour un lieu (restaurant/activité/magasin), à partir de
 * son nom et de son quartier plutôt que de sa position dans le Sheet.
 *
 * Piège corrigé : `RestaurantService`/`ActiviteService`/`MagasinService`
 * généraient auparavant `id: type + '_' + index` (position dans le tableau
 * après filtrage). Le Sheet étant édité collaborativement, l'insertion ou la
 * suppression d'une ligne par n'importe quel membre du groupe décale tous les
 * index suivants — et donc, au chargement suivant, tous les favoris/notes
 * localStorage de tout le monde, sans erreur ni avertissement : ils se
 * retrouvent silencieusement attachés au mauvais lieu.
 *
 * Pas garanti unique à 100% (deux lieux de même nom dans le même quartier
 * collisionneraient), mais bien plus stable en pratique qu'un index de ligne.
 */
export function genererIdLieu(type: string, nom: string | null | undefined, quartier: string | null | undefined): string {
  return `${type}_${normaliserPourId(nom)}_${normaliserPourId(quartier)}`;
}

function normaliserPourId(texte: string | null | undefined): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
