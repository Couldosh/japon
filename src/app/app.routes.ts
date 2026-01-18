import { Routes } from '@angular/router';
import {PlatComponent} from './components/plat/plat.component';
import {ActiviteComponent} from './components/activite.component/activite.component';
import {RestaurantComponent} from './components/restaurant.component/restaurant.component';

export const routes: Routes = [
  { path: 'plats', component: PlatComponent },
  { path: 'activites', component: ActiviteComponent },
  { path: 'restaurants', component: RestaurantComponent },
  { path: '', redirectTo: 'plats', pathMatch: 'full' }
];
