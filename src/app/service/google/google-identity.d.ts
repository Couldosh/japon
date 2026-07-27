// Déclaration minimale de l'API Google Identity Services (script chargé en
// externe dans src/index.html, voir GoogleAuthService) — le SDK officiel n'a
// pas de package @types, on ne déclare que ce dont l'app se sert.
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken(overridableParams?: { prompt?: string }): void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
      };
    };
  };
}
