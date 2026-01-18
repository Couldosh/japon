import { Component, computed, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { StyleClassModule } from 'primeng/styleclass';
import { AppConfig } from './app.config';
import { LayoutService } from '../service/layout.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, ButtonModule, StyleClassModule],
  template: `
    <div class="topbar-container">
      <div class="topbar-brand">
        <span class="topbar-brand-text">

          <span class="topbar-title">🇯🇵 LE JAPON</span>
        </span>
      </div>
      <div class="topbar-actions">
        <p-button
          type="button"
          class="topbar-theme-button"
          (click)="toggleDarkMode()"
          text
          rounded
        >
          <i
            class="pi"
            [ngClass]="{
              'pi-moon': isDarkMode(),
              'pi-sun': !isDarkMode()
            }"
          ></i>
        </p-button>
      </div>
    </div>
  `,
  host: {
    class: 'topbar',
  },
})
export class AppTopbar {
  layoutService: LayoutService = inject(LayoutService);

  isDarkMode = computed(() => this.layoutService.appState().darkMode);

  toggleDarkMode() {
    this.layoutService.appState.update((state) => ({
      ...state,
      darkMode: !state.darkMode,
    }));
  }
}
