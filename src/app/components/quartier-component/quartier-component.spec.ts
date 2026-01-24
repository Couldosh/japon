import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuartierComponent } from './quartier-component';

describe('QuartierComponent', () => {
  let component: QuartierComponent;
  let fixture: ComponentFixture<QuartierComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuartierComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuartierComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
