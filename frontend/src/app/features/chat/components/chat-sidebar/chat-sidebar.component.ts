import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ChatService } from '../../../../core/services/chat.service';
import { HistoryService } from '../../../../core/services/history.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { HistoryItemComponent } from '../../../history/components/history-item/history-item.component';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';

/**
 * The shell's navigation: brand, new conversation, history search and recent
 * conversations.
 *
 * This component renders content only. Every decision about *how* the sidebar
 * is presented lives in `LayoutService`, so this sidebar, the header toggle
 * and the content offset can never disagree about what is on screen.
 */
@Component({
  selector: 'app-chat-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandLogoComponent,
    ButtonComponent,
    HistoryItemComponent,
    IconComponent,
    InputComponent,
    RouterLink,
  ],
  host: { class: 'flex h-full flex-col overflow-hidden bg-sidebar' },
  template: `
    @if (layout.isRail()) {
      <!-- Collapsed rail: the mark is the only identity left, so it stays. -->
      <div class="flex h-full flex-col items-center gap-4 py-5">
        <app-brand-logo [showWordmark]="false" />

        <button
          app-button
          type="button"
          size="rail"
          aria-label="New Conversation"
          (click)="onNewConversation()"
        >
          <app-icon name="plus" [size]="18" />
        </button>

        <button
          app-button
          type="button"
          variant="ghost"
          tone="dark"
          size="rail"
          aria-label="Search questions"
          (click)="layout.openSidebar()"
        >
          <app-icon name="search" [size]="18" />
        </button>

        <div class="mt-2 flex flex-col items-center gap-2">
          @for (entry of history.filteredEntries(); track entry.question.id) {
            <app-history-item
              appearance="rail"
              [entry]="entry"
              [isSelected]="entry.question.id === activeTurnId()"
              (selected)="openTurn($event)"
            />
          }
        </div>

        <a
          app-button
          variant="ghost"
          tone="dark"
          size="icon"
          class="mt-auto"
          routerLink="/history"
          aria-label="View question history"
          (click)="layout.closeAfterNavigation()"
        >
          <app-icon name="clock" [size]="18" />
        </a>
      </div>
    } @else {
      <!-- The expanded column carries no mark: the view header names the
           product instead, so the two never compete for the same corner. -->
      <div class="px-4 pt-5">
        <button app-button type="button" size="lg" [fullWidth]="true" (click)="onNewConversation()">
          <app-icon name="plus" [size]="16" />
          <span>New Conversation</span>
        </button>

        <div class="mt-3">
          <app-input
            [value]="history.searchTerm()"
            (valueChange)="history.setSearchTerm($event)"
            placeholder="Search questions"
            ariaLabel="Search questions"
          />
        </div>
      </div>

      <nav
        class="scrollbar-thin mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2"
        aria-label="Questions in this session"
      >
        <div class="flex flex-col gap-1 pb-2">
          @for (group of history.groups(); track group.bucket) {
            <div class="px-3 pt-3 pb-1 text-xs font-medium text-sidebar-muted first:pt-0">
              {{ group.bucket }}
            </div>
            @for (entry of group.entries; track entry.question.id) {
              <app-history-item
                appearance="sidebar"
                [entry]="entry"
                [isSelected]="entry.question.id === activeTurnId()"
                (selected)="openTurn($event)"
              />
            }
          } @empty {
            <p class="px-3 py-2 text-xs leading-relaxed text-sidebar-muted">
              {{ emptyMessage() }}
            </p>
          }
        </div>
      </nav>

      <div class="border-t border-white/10 p-3">
        <a
          app-button
          variant="ghost"
          tone="dark"
          size="sm"
          [fullWidth]="true"
          [alignStart]="true"
          routerLink="/history"
          (click)="layout.closeAfterNavigation()"
        >
          <app-icon name="clock" [size]="15" />
          <span>View all questions</span>
        </a>
      </div>
    }
  `,
})
export class ChatSidebarComponent {
  /** Layout state: breakpoint bucket, collapse preference and drawer. */
  protected readonly layout = inject(LayoutService);

  /** History list and search term, shared with the history view. */
  protected readonly history = inject(HistoryService);

  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);

  /** Id of the open turn, used to mark the active row. */
  protected readonly activeTurnId = computed(() => this.chat.activeTurnId());

  /** Explains an empty list, distinguishing "no history" from "no matches". */
  protected readonly emptyMessage = computed(() =>
    this.history.hasNoResults()
      ? 'No questions match your search.'
      : 'No questions yet. Ask one to get started.',
  );

  /** Starts a fresh conversation and returns to the dashboard. */
  protected onNewConversation(): void {
    this.chat.startNewConversation();
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/']);
  }

  /** Opens the turn a history row stands for. */
  protected openTurn(turnId: string): void {
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/response', turnId]);
  }
}
