import { TestBed } from '@angular/core/testing';

import { Magasin } from './magasin';

describe('Magasin', () => {
  let service: Magasin;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Magasin);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
