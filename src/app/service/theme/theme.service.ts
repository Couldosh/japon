import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const CLE_STOCKAGE = 'theme';
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
  }

  basculer(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private lireThemeInitial(): Theme {
    const stocke = localStorage.getItem(CLE_STOCKAGE);
    if (stocke === 'light' || stocke === 'dark') {
      return stocke;
    }
    return this.prefersDark?.matches ? 'dark' : 'light';
  }

  private appliquer(theme: Theme): void {
    document.documentElement.classList.toggle(CLASSE_SOMBRE, theme === 'dark');
    localStorage.setItem(CLE_STOCKAGE, theme);
  }
}
