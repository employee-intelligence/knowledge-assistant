import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ChatService } from '../../../../core/services/chat.service';
import { ConversationService } from '../../../../core/services/conversation.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { ConversationItemComponent } from '../../../conversations/components/conversation-item/conversation-item.component';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';

/**
 * The shell's navigation: brand, new conversation, conversation search and recent
 * conversations.
 *
 * One row per conversation, never one per question. That is the distinction the
 * whole list turns on: asking a follow-up extends the conversation it belongs to
 * and leaves this list alone, so the number of rows is the number of threads the
 * user has started rather than the number of questions they have asked.
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
    ConversationItemComponent,
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
          aria-label="Search conversations"
          (click)="layout.openSidebar()"
        >
          <app-icon name="search" [size]="18" />
        </button>

        <div class="mt-2 flex flex-col items-center gap-2">
          @for (conversation of conversations.conversations(); track conversation.id) {
            <app-conversation-item
              appearance="rail"
              [conversation]="conversation"
              [isSelected]="conversation.id === conversations.activeId()"
              (selected)="openConversation($event)"
            />
          }
        </div>

        <a
          app-button
          variant="ghost"
          tone="dark"
          size="icon"
          class="mt-auto"
          routerLink="/conversations"
          aria-label="View all conversations"
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
            [value]="conversations.searchTerm()"
            (valueChange)="conversations.setSearchTerm($event)"
            placeholder="Search conversations"
            ariaLabel="Search conversations"
          />
        </div>
      </div>

      <nav
        class="scrollbar-thin mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2"
        aria-label="Your conversations"
      >
        <div class="flex flex-col gap-1 pb-2">
          @for (group of conversations.groups(); track group.bucket) {
            <div class="px-3 pt-3 pb-1 text-xs font-medium text-sidebar-muted first:pt-0">
              {{ group.bucket }}
            </div>
            @for (conversation of group.conversations; track conversation.id) {
              <app-conversation-item
                appearance="sidebar"
                [conversation]="conversation"
                [isSelected]="conversation.id === conversations.activeId()"
                (selected)="openConversation($event)"
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
          routerLink="/conversations"
          (click)="layout.closeAfterNavigation()"
        >
          <app-icon name="clock" [size]="15" />
          <span>View all conversations</span>
        </a>
      </div>
    }
  `,
})
export class ChatSidebarComponent {
  /** Layout state: breakpoint bucket, collapse preference and drawer. */
  protected readonly layout = inject(LayoutService);

  /** The conversation list and search term, shared with the conversations view. */
  protected readonly conversations = inject(ConversationService);

  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);

  /** Explains an empty list, distinguishing "none yet" from "no matches". */
  protected readonly emptyMessage = computed(() =>
    this.conversations.hasNoResults()
      ? 'No conversations match your search.'
      : 'No conversations yet. Ask one to get started.',
  );

  /** Starts a new conversation and returns to the dashboard. */
  protected onNewConversation(): void {
    this.chat.startNewConversation();
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/']);
  }

  /** Opens the conversation a row stands for. */
  protected openConversation(conversationId: string): void {
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/response', conversationId]);
  }
}
