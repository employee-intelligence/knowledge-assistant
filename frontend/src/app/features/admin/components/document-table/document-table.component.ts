import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  DOCUMENT_STATUS_LABELS,
  type PolicyDocument,
} from '../../../../core/models/document.model';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { formatRelativeTime } from '../../../../shared/utils/relative-time.util';

/**
 * The document inventory, one row per file.
 *
 * A file that is still being indexed shows a spinner rather than a badge, so a
 * running ingest reads as running; one that failed keeps its failure visible and
 * offers a retry, because that is the row an administrator is looking for.
 */
@Component({
  selector: 'app-document-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ButtonComponent, IconComponent],
  host: { class: 'block' },
  template: `
    <div class="overflow-hidden rounded-lg border border-border bg-card">
      @for (document of documents(); track document.id) {
        <div class="flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
          <span
            class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted
              text-muted-foreground"
          >
            <app-icon name="file-text" [size]="16" />
          </span>

          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium text-foreground">{{ document.title }}</span>

              @switch (document.status) {
                @case ('processing') {
                  <span class="flex shrink-0 items-center gap-1.5 text-xs font-medium text-warning">
                    <app-icon name="loader-2" [size]="12" class="animate-spin" />
                    {{ statusLabels.processing }}
                  </span>
                }
                @case ('failed') {
                  <app-badge tone="danger">{{ statusLabels.failed }}</app-badge>
                }
                @default {
                  <app-badge tone="info">{{ statusLabels.indexed }}</app-badge>
                }
              }
            </div>

            <p class="text-xs text-muted-foreground">
              {{ document.category }} · {{ document.sizeLabel }} ·
              {{ document.sectionCount }}
              {{ document.sectionCount === 1 ? 'section' : 'sections' }} · updated
              {{ relativeTime(document.updatedAt) }} by {{ document.updatedBy }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            @if (document.status === 'failed') {
              <button
                app-button
                type="button"
                variant="ghost"
                size="sm"
                (click)="retryRequested.emit(document)"
              >
                <app-icon name="refresh-cw" [size]="14" />
                <span>Retry</span>
              </button>
            }

            <button
              app-button
              type="button"
              variant="ghost"
              tone="light"
              size="icon-sm"
              class="text-muted-foreground hover:text-danger"
              [attr.aria-label]="'Delete ' + document.title"
              (click)="deleteRequested.emit(document)"
            >
              <app-icon name="trash-2" [size]="15" />
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DocumentTableComponent {
  /** The documents to list, in the order the view filtered them. */
  readonly documents = input.required<PolicyDocument[]>();

  /** Emits the document an administrator asked to delete. */
  readonly deleteRequested = output<PolicyDocument>();

  /** Emits the document whose ingest should be run again. */
  readonly retryRequested = output<PolicyDocument>();

  /** Labels for each ingestion state. */
  protected readonly statusLabels = DOCUMENT_STATUS_LABELS;

  /** When a document was last touched, as a reader would say it. */
  protected relativeTime(isoDate: string): string {
    return formatRelativeTime(isoDate);
  }
}
