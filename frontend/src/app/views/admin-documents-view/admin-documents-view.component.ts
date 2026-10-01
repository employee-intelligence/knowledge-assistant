import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { MOCK_DOCUMENTS } from '../../core/data/mock-admin.data';
import type { PolicyDocument } from '../../core/models/document.model';
import { ViewerService } from '../../core/services/viewer.service';
import { AdminAccessRequiredComponent } from '../../features/admin/components/admin-access-required/admin-access-required.component';
import { DocumentTableComponent } from '../../features/admin/components/document-table/document-table.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';

/**
 * The document inventory. Uploading and deleting are not connected to a server,
 * so both act on the placeholder list and say so, which is enough to review the
 * confirmation flow, the indexing state and the empty state.
 */
@Component({
  selector: 'app-admin-documents-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminAccessRequiredComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    DocumentTableComponent,
    EmptyStateComponent,
    IconComponent,
    InputComponent,
    ViewHeaderComponent,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <app-view-header title="Documents" />

    @if (viewer.isAdministrator()) {
      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div class="mx-auto w-full max-w-4xl">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="w-full sm:max-w-xs">
              <app-input
                [value]="search()"
                (valueChange)="search.set($event)"
                placeholder="Search documents"
                ariaLabel="Search documents"
              />
            </div>

            <button app-button type="button" (click)="addDocument()">
              <app-icon name="upload" [size]="16" />
              <span>Upload document</span>
            </button>
          </div>

          @if (notice()) {
            <p
              class="mt-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs
                text-muted-foreground"
            >
              <app-icon name="info" [size]="14" class="mt-0.5 shrink-0" />
              <span>{{ notice() }}</span>
            </p>
          }

          @if (visibleDocuments().length > 0) {
            <p class="mt-5 text-xs text-muted-foreground">{{ summary() }}</p>

            <div class="mt-2">
              <app-document-table
                [documents]="visibleDocuments()"
                (deleteRequested)="askToDelete($event)"
                (retryRequested)="retry($event)"
              />
            </div>
          } @else {
            <div class="mt-5 rounded-lg border border-border bg-card py-6">
              <app-empty-state
                icon="file-plus"
                [title]="emptyTitle()"
                [message]="emptyMessage()"
              >
                @if (search() === '') {
                  <button app-button type="button" (click)="addDocument()">
                    <app-icon name="upload" [size]="16" />
                    <span>Upload a document</span>
                  </button>
                } @else {
                  <button app-button type="button" variant="outline" (click)="search.set('')">
                    Clear search
                  </button>
                }
              </app-empty-state>
            </div>
          }
        </div>
      </div>

      <app-confirm-dialog
        [isOpen]="isDeleteOpen()"
        tone="danger"
        icon="trash-2"
        title="Delete this document?"
        [message]="deleteMessage()"
        confirmLabel="Delete"
        (confirmed)="deleteDocument()"
      />
    } @else {
      <app-admin-access-required />
    }
  `,
})
export class AdminDocumentsViewComponent {
  /** The viewer, which decides whether this area is open at all. */
  protected readonly viewer = inject(ViewerService);

  /** The placeholder inventory, copied so deletes only affect this screen. */
  private readonly documentsState = signal<PolicyDocument[]>([...MOCK_DOCUMENTS]);

  /** Current search term. */
  protected readonly search = signal('');

  /** Explanatory message shown after an action. */
  protected readonly notice = signal('');

  /** The document a delete is waiting on confirmation for. */
  private readonly deleteTarget = signal<PolicyDocument | null>(null);

  /** Whether the confirmation dialog is open. */
  protected readonly isDeleteOpen = computed(() => this.deleteTarget() !== null);

  /** The documents left after searching. */
  protected readonly visibleDocuments = computed(() => {
    const term = this.search().trim().toLowerCase();
    const documents = this.documentsState();

    if (term === '') {
      return documents;
    }

    return documents.filter((document) =>
      `${document.title} ${document.category}`.toLowerCase().includes(term),
    );
  });

  /** Heading of the empty state, which differs between "none" and "no match". */
  protected readonly emptyTitle = computed(() =>
    this.search().trim() === '' ? 'No documents yet' : 'No documents match your search',
  );

  /** Supporting line for the empty state. */
  protected readonly emptyMessage = computed(() =>
    this.search().trim() === ''
      ? 'Upload a policy document and the assistant will start answering from it.'
      : 'Try a different title or category.',
  );

  /** One line above the table, counting what is in the knowledge base. */
  protected readonly summary = computed(() => {
    const total = this.documentsState().length;
    const indexing = this.documentsState().filter(
      (document) => document.status === 'processing',
    ).length;

    return indexing === 0
      ? `${total} document${total === 1 ? '' : 's'}, all indexed`
      : `${total} documents, ${indexing} still indexing`;
  });

  /** What the confirmation dialog is about to do. */
  protected readonly deleteMessage = computed(() => {
    const target = this.deleteTarget();

    return target
      ? `${target.title} will be removed from the knowledge base. Answers that cited it lose that source.`
      : '';
  });

  /** Opens the confirmation dialog for a document. */
  protected askToDelete(document: PolicyDocument): void {
    this.notice.set('');
    this.deleteTarget.set(document);
  }

  /** Removes the confirmed document from the placeholder list. */
  protected deleteDocument(): void {
    const target = this.deleteTarget();
    this.deleteTarget.set(null);

    if (!target) {
      return;
    }

    this.documentsState.update((documents) =>
      documents.filter((document) => document.id !== target.id),
    );
    this.notice.set(`${target.title} was removed from the preview list only.`);
  }

  /** Marks a failed document as indexed again. */
  protected retry(document: PolicyDocument): void {
    this.documentsState.update((documents) =>
      documents.map((candidate) =>
        candidate.id === document.id ? { ...candidate, status: 'indexed' as const } : candidate,
      ),
    );
    this.notice.set(`${document.title} was re-indexed in the preview list only.`);
  }

  /** Adds a placeholder document, since there is no upload endpoint yet. */
  protected addDocument(): void {
    this.notice.set('');
    this.documentsState.update((documents) => [
      {
        id: `doc-placeholder-${documents.length + 1}`,
        title: 'New policy document.pdf',
        category: 'Uncategorised',
        status: 'indexed',
        sizeLabel: '0 KB',
        sectionCount: 0,
        updatedAt: new Date().toISOString(),
        updatedBy: this.viewer.viewer().name,
      },
      ...documents,
    ]);
    this.notice.set('Upload is not connected to a server, so a placeholder row was added.');
  }
}
