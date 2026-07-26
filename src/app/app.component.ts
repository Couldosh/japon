import {Component, inject} from '@angular/core';
import {HomeComponent} from './components/home.component';
import {IonApp, IonRouterOutlet} from '@ionic/angular/standalone';
import {ThemeService} from './service/theme/theme.service';

@Component({
  selector: 'app-root',
  imports: [HomeComponent, IonApp, IonRouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  // Injecté ici pour appliquer le thème (localStorage / préférence système) dès le démarrage.
  private readonly themeService = inject(ThemeService);
}
