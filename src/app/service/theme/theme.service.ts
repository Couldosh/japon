import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const CLE_STOCKAGE = 'theme';
const CLE_CHOIX_MANUEL = 'theme_choisi_manuellement';
const CLASSE_SOMBRE = 'ion-palette-dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefersDark = typeof matchMedia !== 'undefined'
    ? matchMedia('(prefers-color-scheme: dark)')
    : null;

  readonly theme = signal<Theme>(this.lireThemeInitial());

  constructor() {
    // Applique immédiatement le thème initial (avant le premier cycle de détection de
    // changements) afin d'éviter un flash de thème incorrect au démarrage.
    this.appliquer(this.theme());
    effect(() => this.appliquer(this.theme()));

    // Suit les changements de thème système en direct pendant la session (ex: mode sombre
    // auto le soir), mais seulement tant que l'utilisateur n'a jamais basculé le thème
    // lui-même via le bouton — sinon son choix explicite serait silencieusement écrasé.
    this.prefersDark?.addEventListener('change', (e) => {
      if (!this.choisiManuellement()) {
        this.theme.set(e.matches ? 'dark' : 'light');
      }
    });
  }

  basculer(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
    this.marquerChoixManuel();
  }

  private choisiManuellement(): boolean {
    return localStorage.getItem(CLE_CHOIX_MANUEL) === 'true';
  }

  private marquerChoixManuel(): void {
    try {
      localStorage.setItem(CLE_CHOIX_MANUEL, 'true');
    } catch {
      // localStorage indisponible : le thème restera appliqué pour la session en cours,
      // mais pourra être réécrasé par un changement système à la prochaine visite.
    }
  }

  private lireThemeInitial(): Theme {
    const stocke = localStorage.getItem(CLE_STOCKAGE);
    if (this.choisiManuellement() && (stocke === 'light' || stocke === 'dark')) {
      return stocke;
    }
    return this.prefersDark?.matches ? 'dark' : 'light';
  }

  private appliquer(theme: Theme): void {
    document.documentElement.classList.toggle(CLASSE_SOMBRE, theme === 'dark');
    localStorage.setItem(CLE_STOCKAGE, theme);
  }
}
