import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ChatService } from '../../core/services/chat.service';
import { HistoryService } from '../../core/services/history.service';
import { LayoutService } from '../../core/services/layout.service';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { HistoryListComponent } from '../../features/history/components/history-list/history-list.component';
import { InputComponent } from '../../shared/components/input/input.component';

/**
 * Every question the user has asked, searchable and grouped by date. Opening an
 * entry routes to its response view.
 */
@Component({
  selector: 'app-history-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HistoryListComponent, InputComponent, ViewHeaderComponent],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <app-view-header title="Question history" />

    <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-3xl">
        <div class="mb-4 max-w-md">
          <app-input
            [value]="history.searchTerm()"
            (valueChange)="history.setSearchTerm($event)"
            placeholder="Search questions"
            ariaLabel="Search questions"
          />
        </div>

        <app-history-list
          [groups]="history.groups()"
          [selectedId]="activeSessionId()"
          [emptyMessage]="emptyMessage()"
          (selected)="openSession($event)"
        />
      </div>
    </div>
  `,
})
export class HistoryViewComponent {
  /** History entries, search term and grouping. */
  protected readonly history = inject(HistoryService);

  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);

  /** Id of the open conversation, so its row can be highlighted. */
  protected readonly activeSessionId = computed(() => this.chat.question()?.id ?? null);

  /** Explains an empty list, distinguishing "no history" from "no matches". */
  protected readonly emptyMessage = computed(() =>
    this.history.hasNoResults()
      ? 'No questions match your search.'
      : 'You have not asked any questions yet.',
  );

  /** Opens a past conversation. */
  protected openSession(questionId: string): void {
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/response', questionId]);
  }
}
