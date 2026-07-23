import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {Menubar} from 'primeng/menubar';
import {FontAwesomeModule} from '@fortawesome/angular-fontawesome';
import {HomeComponent} from './components/home.component';

@Component({
  selector: 'app-root',
  imports: [HomeComponent, RouterOutlet, Menubar, FontAwesomeModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
}
