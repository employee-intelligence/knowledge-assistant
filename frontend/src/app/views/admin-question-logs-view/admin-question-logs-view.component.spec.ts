import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MOCK_QUESTION_LOGS } from '../../core/data/mock-admin.data';
import { ViewerService } from '../../core/services/viewer.service';
import { AdminQuestionLogsViewComponent } from './admin-question-logs-view.component';

describe('AdminQuestionLogsViewComponent', () => {
  let fixture: ComponentFixture<AdminQuestionLogsViewComponent>;
  let viewer: ViewerService;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** The rows currently listed. */
  const rows = (): HTMLButtonElement[] =>
    Array.from(element().querySelectorAll<HTMLButtonElement>('app-question-log-table button'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminQuestionLogsViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminQuestionLogsViewComponent);
    viewer = TestBed.inject(ViewerService);
  });

  it('opens the log behind a row', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    rows()[0].click();
    await render();

    expect(element().querySelector('app-question-log-detail')?.textContent).toContain(
      MOCK_QUESTION_LOGS[0].question,
    );
  });

  it('keeps the open log readable when a filter hides it from the list', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    rows()[0].click();
    await render();

    // Narrowing to one outcome behind an open drawer would otherwise blank the
    // entry being read, which looks like the app losing it.
    (element().querySelector('app-input button') as HTMLButtonElement | null)?.click();
    const failing = Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Failed',
    ) as HTMLButtonElement;
    failing.click();
    await render();

    expect(rows().length).toBeLessThan(MOCK_QUESTION_LOGS.length);
    expect(element().querySelector('app-question-log-detail')?.textContent).toContain(
      MOCK_QUESTION_LOGS[0].question,
    );
  });

  it('closes the drawer on request', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    rows()[0].click();
    await render();

    (element().querySelector('button[aria-label="Close question log"]') as HTMLButtonElement).click();
    await render();

    expect(fixture.componentInstance['openLogId']()).toBeNull();
  });

  it('shows access required rather than the log to an employee', async () => {
    viewer.setPreviewRole('employee');
    await render();

    expect(element().querySelector('app-question-log-table')).toBeNull();
    expect(element().textContent).toContain('administrator');
  });
});
