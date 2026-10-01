import { TestBed } from '@angular/core/testing';

import { MOCK_VIEWER } from '../models/viewer.model';
import { ViewerService } from './viewer.service';

describe('ViewerService', () => {
  let viewer: ViewerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    viewer = TestBed.inject(ViewerService);
  });

  it('starts as an employee with no administrator access', () => {
    expect(viewer.role()).toBe('employee');
    expect(viewer.isAdministrator()).toBe(false);
  });

  it('names the viewer and derives their initials', () => {
    expect(viewer.viewer().name).toBe(MOCK_VIEWER.name);
    // "Ama Konadu" has no stop words in it, so both words contribute a letter.
    expect(viewer.initials()).toBe('AK');
  });

  it('swaps the role for preview without touching the rest of the viewer', () => {
    viewer.setPreviewRole('administrator');

    expect(viewer.isAdministrator()).toBe(true);
    // The preview switch is a design affordance. If it edited the person, the two
    // experiences could not be compared on the same account.
    expect(viewer.viewer().name).toBe(MOCK_VIEWER.name);
    expect(viewer.viewer().email).toBe(MOCK_VIEWER.email);
  });

  it('can be previewed back down to an employee', () => {
    viewer.setPreviewRole('administrator');
    viewer.setPreviewRole('employee');

    expect(viewer.isAdministrator()).toBe(false);
  });
});
