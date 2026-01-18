import { TestBed } from '@angular/core/testing';

import { Quartier } from './quartier';

describe('Quartier', () => {
  let service: Quartier;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Quartier);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
