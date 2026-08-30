import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

// Service Worker de cache des tuiles carte uniquement (voir public/sw-tiles.js) —
// pas une PWA complète, juste un cache-first pour éviter de re-demander à Geoapify
// des tuiles déjà vues sur cet appareil (leur Cache-Control interdit sinon tout
// cache HTTP navigateur). Enregistrement best-effort : silencieux si non supporté
// (contexte non sécurisé, navigateur ancien) ou en échec.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-tiles.js').catch((err) => console.warn('Service Worker tuiles non enregistré :', err));
}
