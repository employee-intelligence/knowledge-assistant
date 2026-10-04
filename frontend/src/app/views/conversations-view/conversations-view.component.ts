import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { SessionService } from '../../core/services/session.service';
import { LayoutService } from '../../core/services/layout.service';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { ConversationListComponent } from '../../features/conversations/components/conversation-list/conversation-list.component';
import { InputComponent } from '../../shared/components/input/input.component';

/**
 * Every session this browser has, searchable and grouped by date. Opening a
 * row routes to its chat view.
 *
 * This backend has no "list sessions" endpoint, so this list is the sessions
 * this browser started, remembered locally: everything started here, not just
 * the current visit's.
 */
@Component({
  selector: 'app-conversations-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConversationListComponent, InputComponent, ViewHeaderComponent],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <app-view-header title="Sessions" />

    <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-3xl">
        <div class="mb-4 max-w-md">
          <app-input
            [value]="conversations.searchTerm()"
            (valueChange)="conversations.setSearchTerm($event)"
            placeholder="Search sessions"
            ariaLabel="Search sessions"
          />
        </div>

        <app-conversation-list
          [groups]="conversations.groups()"
          [selectedId]="conversations.activeId()"
          [emptyMessage]="emptyMessage()"
          (selected)="openSession($event)"
        />
      </div>
    </div>
  `,
})
export class ConversationsViewComponent {
  /** The session list, search term and grouping. */
  protected readonly conversations = inject(SessionService);

  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);

  /** Explains an empty list, distinguishing "none yet" from "no matches". */
  protected readonly emptyMessage = computed(() => {
    if (this.conversations.hasNoResults()) {
      return 'No sessions match your search.';
    }

    return this.conversations.isLoading()
      ? 'Loading your sessions...'
      : 'You have not started any sessions yet.';
  });

  /** Opens a session, showing its whole thread. */
  protected openSession(sessionId: string): void {
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/chat', sessionId]);
  }
}
