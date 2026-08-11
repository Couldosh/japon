import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      // AppComponent affiche <ion-router-outlet>, qui injecte ActivatedRoute — sans Router
      // fourni ici, l'injection échoue (NG0201) même si l'app n'utilise pas le Router pour la
      // navigation interne (voir HomeComponent, signal `vue`).
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
