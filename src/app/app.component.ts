import {Component} from '@angular/core';
import {AppTopbar} from './components/app.topbar';
import {AppFooter} from "./components/app.footer";
import {MenuItem} from 'primeng/api';
import {RouterOutlet} from '@angular/router';
import {Menubar} from 'primeng/menubar';
import {FontAwesomeModule} from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'app-root',
  imports: [AppTopbar, AppFooter, RouterOutlet, Menubar, FontAwesomeModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  items: MenuItem[] = [
    {
      label: 'Restaurants',
      icon: 'fa-solid fa-utensils',
      routerLink: '/restaurants'
    },
    {
      label: 'Activités',
      icon: 'fa-solid fa-palette',
      routerLink: '/activites'
    },
    {
      label: 'Magasins',
      icon: 'fa-solid fa-store',
      routerLink: '/magasins'
    },
    {
      label: 'Plats',
      icon: 'fa-solid fa-pizza-slice',
      routerLink: '/plats'
    }
  ];
}
