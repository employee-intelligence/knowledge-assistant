import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { MOCK_DOCUMENTS, MOCK_QUESTION_LOGS } from '../../core/data/mock-admin.data';
import { QUESTION_OUTCOME_LABELS } from '../../core/models/question-log.model';
import { ViewerService } from '../../core/services/viewer.service';
import { AdminDashboardViewComponent } from './admin-dashboard-view.component';

describe('AdminDashboardViewComponent', () => {
  let fixture: ComponentFixture<AdminDashboardViewComponent>;
  let viewer: ViewerService;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => element().textContent ?? '';

  beforeEach(async () => {
    // Real routes, so the tab bar has something to mark as current. With an empty
    // router nothing matches and the active state can never be exercised.
    await TestBed.configureTestingModule({
      imports: [AdminDashboardViewComponent],
      providers: [
        provideRouter([
          { path: 'admin', component: AdminDashboardViewComponent },
          { path: 'admin/documents', component: AdminDashboardViewComponent },
          { path: 'admin/questions', component: AdminDashboardViewComponent },
        ]),
      ],
    }).compileComponents();

    viewer = TestBed.inject(ViewerService);
    viewer.setPreviewRole('administrator');

    fixture = TestBed.createComponent(AdminDashboardViewComponent);
    await TestBed.inject(Router).navigate(['/admin']);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('withholds the dashboard from somebody who is not an administrator', () => {
    viewer.setPreviewRole('employee');
    fixture.detectChanges();

    expect(element().querySelector('app-admin-access-required')).not.toBeNull();
    expect(element().querySelector('nav[aria-label="Administration sections"]')).toBeNull();
  });

  it('labels how each recent question ended, not just that it was asked', () => {
    const shown = MOCK_QUESTION_LOGS.slice(0, 4);
    const labels = Array.from(element().querySelectorAll('app-badge')).map((badge) =>
      badge.textContent?.trim(),
    );

    expect(labels).toHaveLength(shown.length);
    for (const log of shown) {
      expect(labels).toContain(QUESTION_OUTCOME_LABELS[log.outcome]);
    }
  });

  it('counts indexing and failure separately, since only one of them needs a person', () => {
    const processing = MOCK_DOCUMENTS.filter((d) => d.status === 'processing').length;
    const failed = MOCK_DOCUMENTS.filter((d) => d.status === 'failed').length;

    expect(text()).toContain(`${processing} still indexing`);
    expect(text()).toContain(`${failed} need attention`);
  });

  it('leaves documents that are still indexing out of the health figure', () => {
    const settled = MOCK_DOCUMENTS.filter(
      (d) => d.status === 'indexed' || d.status === 'failed',
    ).length;
    const indexed = MOCK_DOCUMENTS.filter((d) => d.status === 'indexed').length;
    const expected = Math.round((indexed / settled) * 100);

    // Charging an administrator for a gap that is expected to close on its own
    // would only teach them to ignore the number.
    expect(text()).toContain(`${expected}%`);
  });

  it('marks the current section, so the reader is not left guessing where they are', () => {
    const current = Array.from(element().querySelectorAll('nav a')).find((tab) =>
      tab.classList.contains('text-foreground'),
    );

    expect(current?.textContent?.trim()).toBe('Dashboard');
  });
});
