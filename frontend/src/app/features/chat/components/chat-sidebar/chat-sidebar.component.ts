import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ROLE_LABELS } from '../../../../core/models/viewer.model';
import { ChatService } from '../../../../core/services/chat.service';
import { ConversationService } from '../../../../core/services/conversation.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { ViewerService } from '../../../../core/services/viewer.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { RolePreviewToggleComponent } from '../../../admin/components/role-preview-toggle/role-preview-toggle.component';
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
    AvatarComponent,
    BrandLogoComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    ConversationItemComponent,
    IconComponent,
    InputComponent,
    RolePreviewToggleComponent,
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

        @if (viewer.isAdministrator()) {
          <a
            app-button
            variant="ghost"
            tone="dark"
            size="rail"
            [class.mt-auto]="true"
            routerLink="/admin"
            aria-label="Administration"
            (click)="layout.closeAfterNavigation()"
          >
            <app-icon name="layout-dashboard" [size]="18" />
          </a>
        }

        <a
          app-button
          variant="ghost"
          tone="dark"
          size="icon"
          [class.mt-auto]="!viewer.isAdministrator()"
          routerLink="/conversations"
          aria-label="View all conversations"
          (click)="layout.closeAfterNavigation()"
        >
          <app-icon name="clock" [size]="18" />
        </a>

        <!-- Identity only: there is nothing to sign out of on the rail, which
             carries no controls beyond the icons themselves. -->
        <app-avatar
          [initials]="viewer.initials()"
          tone="outline"
          [size]="32"
          [label]="viewer.viewer().name"
          class="mt-3"
        />
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
        @if (viewer.isAdministrator()) {
          <a
            app-button
            variant="ghost"
            tone="dark"
            size="sm"
            [fullWidth]="true"
            [alignStart]="true"
            routerLink="/admin"
            (click)="layout.closeAfterNavigation()"
          >
            <app-icon name="layout-dashboard" [size]="15" />
            <span>Administration</span>
          </a>
        }

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

        <div class="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
          <app-role-preview-toggle />

          <div class="flex items-center gap-2 px-2">
            <app-avatar
              [initials]="viewer.initials()"
              tone="outline"
              [size]="32"
              [label]="viewer.viewer().name"
            />

            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-sidebar-foreground">
                {{ viewer.viewer().name }}
              </p>
              <p class="truncate text-[11px] text-sidebar-muted">{{ roleLabel() }}</p>
            </div>

            <button
              app-button
              type="button"
              variant="ghost"
              tone="dark"
              size="icon-sm"
              class="shrink-0"
              aria-label="Sign out"
              (click)="isSignOutOpen.set(true)"
            >
              <app-icon name="log-out" [size]="15" />
            </button>
          </div>
        </div>
      </div>

      <app-confirm-dialog
        [isOpen]="isSignOutOpen()"
        icon="log-out"
        title="Sign out?"
        message="You will be asked to sign in again. Your conversations stay saved to this browser."
        confirmLabel="Sign out"
        (confirmed)="signOut()"
      />
    }
  `,
})
export class ChatSidebarComponent {
  /** Layout state: breakpoint bucket, collapse preference and drawer. */
  protected readonly layout = inject(LayoutService);

  /** The conversation list and search term, shared with the conversations view. */
  protected readonly conversations = inject(ConversationService);

  /** Who is signed in, which decides whether the admin link is there at all. */
  protected readonly viewer = inject(ViewerService);

  /** Whether the sign-out confirmation is open. */
  protected readonly isSignOutOpen = signal(false);

  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);

  /** The viewer's role, spelled out rather than abbreviated. */
  protected readonly roleLabel = computed(() => ROLE_LABELS[this.viewer.role()]);

  /** Explains an empty list, distinguishing "none yet" from "no matches". */
  protected readonly emptyMessage = computed(() =>
    this.conversations.hasNoResults()
      ? 'No conversations match your search.'
      : 'No conversations yet. Ask one to get started.',
  );

  /**
   * Returns to the sign-in screen.
   *
   * There is no session to end, so this is the honest amount of sign-out: the
   * viewer stays on the mock account and the app forgets nothing. What it does
   * prove is the flow, which is the part that needed designing.
   */
  protected signOut(): void {
    this.layout.closeAfterNavigation();
    void this.router.navigate(['/login']);
  }

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
