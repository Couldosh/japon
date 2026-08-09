// Voir environment.ts pour le détail de chaque clé — seule différence en prod : iaApiUrl est une
// URL relative (même origine) vers public/api/ai.php, un petit relais PHP déployé avec le build
// Angular (voir angular.json > assets, qui copie tout public/ tel quel) qui appelle
// ia.faburisu.com côté serveur avec un Service Token Cloudflare Access — pas de config Nginx/Plesk
// à toucher, pas de cookie cross-site côté navigateur.
export const environment = {
  maptilerApiKey: '7YdE9Q6gkkL2xYRMRXEm',
  googleClientId: '269278292482-8kiuosoicm657f8m0d06vcn7cv883qqd.apps.googleusercontent.com',
  spreadsheetId: '1ZD1owGxkH-cLFIG3Sq7hrlWOgB2E1C2Qe4ChokZmkIc',
  placesApiKey: 'AIzaSyCwGuNICti1j2buomQq2EGY8U4L_3dPIS0',
  iaApiUrl: '/api/ai.php',
};
