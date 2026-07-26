// Clé API MapTiler (gratuite) pour le fond de carte vectoriel de l'onglet Carte.
// Contrairement aux credentials des scripts Node (scripts/*.mjs), cette clé est
// destinée à être visible côté client — c'est le modèle de sécurité de MapTiler :
// on la restreint par domaine autorisé (dashboard MapTiler > la clé > "Allowed
// origins/domains"), pas en la gardant secrète.
export const environment = {
  maptilerApiKey: '7YdE9Q6gkkL2xYRMRXEm',
};
