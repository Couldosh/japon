// Service Worker limité au cache des tuiles Geoapify de l'onglet Carte — pas une PWA
// complète (pas de manifest, pas d'installation, pas de mise en cache de l'app shell).
// Geoapify sert ses tuiles avec `Cache-Control: private, max-age=0, no-cache` : le
// cache HTTP du navigateur revalide donc systématiquement au moindre pan/zoom qui
// repasse sur une tuile déjà vue, ce qui consomme du quota pour rien. Ce Service
// Worker sert en "cache-first" depuis un Cache Storage géré par nous (ignore
// volontairement l'en-tête Cache-Control d'origine) : une tuile déjà vue sur cet
// appareil n'est plus jamais redemandée à Geoapify.
const CACHE_TUILES = 'geoapify-tiles-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evenement) => {
  const url = evenement.request.url;
  if (!url.startsWith('https://maps.geoapify.com/v1/tile/')) {
    return;
  }

  evenement.respondWith(
    caches.open(CACHE_TUILES).then(async (cache) => {
      const reponseEnCache = await cache.match(evenement.request);
      if (reponseEnCache) {
        return reponseEnCache;
      }
      const reponseReseau = await fetch(evenement.request);
      // Leaflet charge les tuiles via de simples <img> sans attribut crossorigin : la
      // requête part en mode no-cors, donc la réponse est "opaque" (statut 0, .ok
      // toujours false) même quand la tuile est bien reçue et affichée — on ne peut pas
      // distinguer un succès d'une erreur dans ce mode, donc on met en cache dès que
      // fetch() n'a pas levé d'exception, plutôt que de filtrer sur .ok comme pour une
      // réponse lisible normale.
      //
      // Attendre l'écriture en cache avant de renvoyer la réponse : sans ce await, le SW
      // peut être arrêté par le navigateur avant que l'écriture (fire-and-forget) ne
      // s'exécute, laissant le cache silencieusement vide malgré des tuiles bien reçues.
      await cache.put(evenement.request, reponseReseau.clone());
      return reponseReseau;
    })
  );
});
