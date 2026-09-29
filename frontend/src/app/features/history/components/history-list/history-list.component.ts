import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { HistoryGroup } from '../../../../core/services/history.service';
import { HistoryItemComponent } from '../history-item/history-item.component';

/**
 * Past questions grouped under date headings. Purely presentational: the
 * filtering and grouping are done in `HistoryService`.
 */
@Component({
  selector: 'app-history-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HistoryItemComponent],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-6">
      @for (group of groups(); track group.bucket) {
        <section>
          <h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {{ group.bucket }}
          </h2>
          <ul class="flex flex-col gap-2">
            @for (entry of group.entries; track entry.question.id) {
              <li>
                <app-history-item
                  appearance="panel"
                  [entry]="entry"
                  [isSelected]="entry.question.id === selectedId()"
                  (selected)="selected.emit($event)"
                />
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p
          class="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center
          text-sm text-muted-foreground"
        >
          {{ emptyMessage() }}
        </p>
      }
    </div>
  `,
})
export class HistoryListComponent {
  /** Date-grouped entries to render. */
  readonly groups = input.required<HistoryGroup[]>();

  /** Highlights the currently open conversation. */
  readonly selectedId = input<string | null>(null);

  /** Message shown when there is nothing to list. */
  readonly emptyMessage = input('No questions match your search.');

  /** Emits the question id when an entry is activated. */
  readonly selected = output<string>();
}
