// Clé API MapTiler (gratuite) pour le fond de carte vectoriel de l'onglet Carte.
// Contrairement aux credentials des scripts Node (scripts/*.mjs), cette clé est
// destinée à être visible côté client — c'est le modèle de sécurité de MapTiler :
// on la restreint par domaine autorisé (dashboard MapTiler > la clé > "Allowed
// origins/domains"), pas en la gardant secrète.
//
// googleClientId / spreadsheetId : mêmes principes pour la fonctionnalité
// "Ajouter un lieu" (écriture dans le Sheet). googleClientId est un ID client
// OAuth type "Application Web" (PAS "Desktop app", incompatible navigateur),
// restreint aux origines JS autorisées dans Google Cloud Console. spreadsheetId
// est l'identifiant du Sheet dans son URL d'édition (voir README.md), différent
// de l'ID de publication CSV utilisé par SheetsApi.baseUrl. Ni l'un ni l'autre
// n'est un secret : la vraie protection vient des permissions d'édition du Sheet
// lui-même (voir docs/architecture-et-pieges.md). À remplacer par les valeurs
// réelles une fois le client OAuth créé (voir README.md > Configuration).
//
// placesApiKey : pour le bouton "Rechercher sur Google Places" du formulaire
// d'ajout. NE PAS réutiliser le PLACES_API_KEY des scripts Node (.env, non
// restreint par origine) : il faut une clé dédiée, restreinte dans Google
// Cloud Console à "Places API (New)" uniquement + à vos origines HTTP
// (referrers) autorisées, sans quoi n'importe qui pourrait lire cette clé
// dans le bundle JS et l'utiliser ailleurs à vos frais.
export const environment = {
  maptilerApiKey: '7YdE9Q6gkkL2xYRMRXEm',
  googleClientId: '269278292482-8kiuosoicm657f8m0d06vcn7cv883qqd.apps.googleusercontent.com',
  spreadsheetId: '1ZD1owGxkH-cLFIG3Sq7hrlWOgB2E1C2Qe4ChokZmkIc',
  placesApiKey: 'AIzaSyCwGuNICti1j2buomQq2EGY8U4L_3dPIS0',
};
