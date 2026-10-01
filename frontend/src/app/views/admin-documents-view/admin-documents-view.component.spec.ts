import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewerService } from '../../core/services/viewer.service';
import { AdminDocumentsViewComponent } from './admin-documents-view.component';

describe('AdminDocumentsViewComponent', () => {
  let fixture: ComponentFixture<AdminDocumentsViewComponent>;
  let viewer: ViewerService;

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** Rows currently listed. */
  const rows = (): number => element().querySelectorAll('app-document-table > div > div').length;

  /** The inventory alone, so a message about a deleted document is not a row. */
  const tableText = (): string =>
    element().querySelector('app-document-table')?.textContent ?? '';

  /** The delete control on a row. */
  const deleteControl = (): HTMLButtonElement =>
    element().querySelector<HTMLButtonElement>('button[aria-label^="Delete"]') as HTMLButtonElement;

  /** The confirming button in the dialog. */
  const confirmControl = (): HTMLButtonElement =>
    Array.from(
      element().querySelectorAll<HTMLButtonElement>('app-confirm-dialog dialog button'),
    ).find((button) => button.textContent?.trim() === 'Delete') as HTMLButtonElement;

  const typeSearch = (term: string): void => {
    const field = element().querySelector('app-input input') as HTMLInputElement;
    field.value = term;
    field.dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDocumentsViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDocumentsViewComponent);
    viewer = TestBed.inject(ViewerService);
  });

  it('closes the area to an employee', async () => {
    viewer.setPreviewRole('employee');
    await render();

    // The route is reachable by typing it, so the screen has to explain itself
    // rather than rely on the link in the sidebar being absent.
    expect(element().querySelector('app-admin-access-required')).toBeTruthy();
    expect(element().textContent).toContain('Administrators only');
    expect(element().querySelector('app-document-table')).toBeFalsy();
  });

  it('lists the inventory for an administrator', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    expect(element().querySelector('app-admin-access-required')).toBeFalsy();
    expect(element().textContent).toContain('Employee Handbook 2026');
    expect(element().textContent).toContain('7 documents, 1 still indexing');
  });

  it('shows a running ingest as running rather than as a settled state', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    // A file still being embedded is not "Indexed" and not a failure, and the
    // spinner is what tells an administrator to come back later.
    expect(tableText()).toContain('Processing');
    expect(element().querySelector('.animate-spin')).toBeTruthy();
  });

  it('offers a retry only on the row that failed', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    const retry = element().querySelectorAll<HTMLButtonElement>(
      'app-document-table button:not([aria-label^="Delete"])',
    );

    expect(retry.length).toBe(1);
  });

  it('filters the inventory as the search term changes', async () => {
    viewer.setPreviewRole('administrator');
    await render();
    const before = rows();

    typeSearch('remote');
    await render();

    expect(rows()).toBeLessThan(before);
    expect(element().textContent).toContain('Remote Work Policy');
  });

  it('falls back to an empty state when nothing matches', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    typeSearch('zzzz');
    await render();

    expect(element().textContent).toContain('No documents match your search');
    expect(element().querySelector('app-empty-state')).toBeTruthy();
  });

  it('only removes a document once the dialog is confirmed', async () => {
    viewer.setPreviewRole('administrator');
    await render();
    const before = rows();

    deleteControl().click();
    await render();

    // The dialog is the whole point: a delete that lands on the first click is one
    // stray click from losing a policy.
    expect(rows()).toBe(before);
    expect(element().querySelector('app-confirm-dialog')?.textContent).toContain(
      'Employee Handbook 2026',
    );

    confirmControl().click();
    await render();

    expect(rows()).toBe(before - 1);
    expect(tableText()).not.toContain('Employee Handbook 2026');
  });

  it('leaves the document in place when the dialog is dismissed', async () => {
    viewer.setPreviewRole('administrator');
    await render();
    const before = rows();

    deleteControl().click();
    await render();

    const cancel = Array.from(
      element().querySelectorAll<HTMLButtonElement>('app-confirm-dialog dialog button'),
    ).find((button) => button.textContent?.trim() === 'Cancel') as HTMLButtonElement;
    cancel.click();
    await render();

    expect(rows()).toBe(before);
  });

  it('says a delete only touched the preview list', async () => {
    viewer.setPreviewRole('administrator');
    await render();

    deleteControl().click();
    await render();
    confirmControl().click();
    await render();

    // Nothing was sent anywhere, so the message must not imply the knowledge base
    // has changed.
    expect(element().textContent).toContain('preview list only');
  });

  it('adds a placeholder row instead of pretending to upload', async () => {
    viewer.setPreviewRole('administrator');
    await render();
    const before = rows();

    const upload = Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Upload document',
    ) as HTMLButtonElement;
    upload.click();
    await render();

    expect(rows()).toBe(before + 1);
    expect(element().textContent).toContain('Upload is not connected to a server');
  });
});
