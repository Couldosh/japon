import { TestBed } from '@angular/core/testing';

import { SheetsApi } from './sheets-api.service';

describe('Sheets', () => {
  let service: SheetsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SheetsApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
