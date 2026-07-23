import { Routes } from '@angular/router';
import {PlatComponent} from './components/plat/plat.component';
import {ActiviteComponent} from './components/activite.component/activite.component';
import {RestaurantComponent} from './components/restaurant.component/restaurant.component';
import {QuartierComponent} from './components/quartier-component/quartier-component';
import {HomeComponent} from './components/home.component';

export const routes: Routes = [
  { path: 'plats', component: PlatComponent },
  { path: 'home', component: HomeComponent },
  { path: 'quartiers', component: QuartierComponent },
  { path: 'activites', component: ActiviteComponent },
  { path: 'restaurants', component: RestaurantComponent },
  { path: '', redirectTo: 'home', pathMatch: 'full' }
];
