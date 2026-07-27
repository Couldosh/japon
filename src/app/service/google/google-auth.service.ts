import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const CONSENTEMENT_KEY = 'google_auth_deja_consenti';

/**
 * Authentification Google côté client (Google Identity Services) pour la
 * fonctionnalité "Ajouter un lieu" — voir docs/architecture-et-pieges.md.
 *
 * Contrairement au flow OAuth "Desktop app" des scripts de maintenance
 * (scripts/lib/google-sheets.mjs), GIS ne fournit pas de refresh token
 * côté navigateur : le token obtenu ici vit uniquement en mémoire (jamais
 * persisté) et expire au bout d'environ 1h. Pour éviter de redemander un
 * clic explicite à chaque rechargement de page/expiration, on mémorise dans
 * localStorage (CONSENTEMENT_KEY, un simple booléen — jamais le token) le
 * fait que l'utilisateur a déjà accordé le scope une fois sur cet appareil,
 * et on tente ensuite un requestAccessToken({prompt: ''}) sans écran de
 * consentement forcé (tenterReconnexionSilencieuse()).
 *
 * Écrire réellement dans le Sheet ne dépend pas que de cette connexion : le
 * compte Google utilisé doit aussi avoir un accès Éditeur sur le Sheet
 * lui-même (l'API Sheets applique ses permissions natives).
 */
@Injectable({
  providedIn: 'root',
})
export class GoogleAuthService {
  private readonly _token = signal<string | null>(null);
  private readonly _erreur = signal<string | null>(null);
  private readonly _reconnexionSilencieuseEnCours = signal(false);
  readonly token = this._token.asReadonly();
  readonly erreur = this._erreur.asReadonly();
  readonly estConnecte = computed(() => !!this._token());
  readonly reconnexionSilencieuseEnCours = this._reconnexionSilencieuseEnCours.asReadonly();

  private tokenClient: GoogleTokenClient | null = null;
  /** Lu par le callback du tokenClient au moment où il se déclenche (le tokenClient
   * n'est créé qu'une fois : son callback doit refléter le mode de la dernière
   * requête, pas celui figé à la création). */
  private silencieux = false;

  /** Ouvre la fenêtre de consentement Google (popup visible). */
  connecter(): void {
    this.demanderToken(false);
  }

  /**
   * Tente d'obtenir un nouveau token sans écran de consentement forcé, en
   * s'appuyant sur le consentement déjà accordé lors d'une connexion
   * précédente sur cet appareil.
   *
   * IMPORTANT : `requestAccessToken()` ouvre un popup vers accounts.google.com
   * en interne (GIS n'a pas de mode "iframe silencieuse" comme l'ancienne
   * gapi auth2) — un popup ouvert hors d'un vrai geste utilisateur (clic) est
   * bloqué par la plupart des navigateurs. Cette méthode doit donc être
   * appelée de façon synchrone depuis un handler `(click)`, jamais depuis
   * `ngOnInit()` d'un composant qui vient de se monter (c'était le bug
   * précédent : appelée après coup, hors du geste, le popup silencieux ne
   * s'ouvrait jamais et échouait sans bruit). Voir `HomeComponent.ouvrirModaleAjout()`.
   */
  tenterReconnexionSilencieuse(): void {
    if (this.estConnecte() || !this.dejaConsenti() || !window.google?.accounts?.oauth2) {
      return;
    }
    this._reconnexionSilencieuseEnCours.set(true);
    this.demanderToken(true);
  }

  deconnecter(): void {
    this._token.set(null);
  }

  private dejaConsenti(): boolean {
    try {
      return localStorage.getItem(CONSENTEMENT_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private memoriserConsentement(): void {
    try {
      localStorage.setItem(CONSENTEMENT_KEY, 'true');
    } catch {
      // localStorage indisponible : tant pis, il faudra recliquer "Se connecter" la prochaine fois.
    }
  }

  private demanderToken(silencieux: boolean): void {
    this._erreur.set(null);
    this.silencieux = silencieux;

    if (!window.google?.accounts?.oauth2) {
      this._reconnexionSilencieuseEnCours.set(false);
      if (!silencieux) {
        this._erreur.set("Le SDK Google n'a pas pu être chargé. Vérifie ta connexion et réessaie.");
      }
      return;
    }

    if (!this.tokenClient) {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: environment.googleClientId,
        scope: SCOPE,
        callback: (reponse) => {
          this._reconnexionSilencieuseEnCours.set(false);
          if (reponse.error) {
            if (this.silencieux) {
              // Jamais montré à l'utilisateur (tentative en arrière-plan), mais utile en
              // debug : popup bloqué par le navigateur, session Google expirée, etc.
              console.warn('[GoogleAuthService] Reconnexion silencieuse refusée :', reponse.error);
            } else {
              this._erreur.set('Connexion Google refusée ou annulée.');
            }
            return;
          }
          this._token.set(reponse.access_token);
          this.memoriserConsentement();
        },
      });
    }

    this.tokenClient.requestAccessToken(silencieux ? { prompt: '' } : undefined);
  }
}
