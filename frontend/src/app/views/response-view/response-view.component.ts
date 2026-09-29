import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { ChatService } from '../../core/services/chat.service';
import { QuestionInputComponent } from '../../features/ask/components/question-input/question-input.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { ChatThreadComponent } from '../../features/response/components/chat-thread/chat-thread.component';
import { LoadingIndicatorComponent } from '../../shared/components/loading-indicator/loading-indicator.component';

/**
 * Shows one conversation: its answer, its citations, and the composer for
 * follow-up questions. A view only assembles components and connects them to
 * services.
 */
@Component({
  selector: 'app-response-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChatThreadComponent,
    LoadingIndicatorComponent,
    QuestionInputComponent,
    ViewHeaderComponent,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <app-view-header [title]="chat.threadTitle()" />

    @if (isEmpty()) {
      <div class="flex min-h-0 flex-1 items-center justify-center py-10">
        <app-loading-indicator [showDots]="false" />
      </div>
    } @else if (!chat.hasMessages()) {
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <h2 class="font-headings text-lg font-semibold text-foreground">Conversation not found</h2>
        <p class="max-w-sm text-sm leading-relaxed text-muted-foreground">
          This question is no longer in your history. Ask a new one from the dashboard.
        </p>
      </div>
    } @else {
      <app-chat-thread [messages]="chat.messages()" (viewed)="onSourceViewed()" />
    }

    <div class="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5 lg:px-8 lg:pb-6">
      <div class="mx-auto w-full max-w-thread">
        <app-question-input
          [isBusy]="chat.isLoading()"
          [showCounter]="true"
          (ask)="onAsk($event)"
        />
      </div>
    </div>
  `,
})
export class ResponseViewComponent {
  /** The open conversation. */
  protected readonly chat = inject(ChatService);

  private readonly route = inject(ActivatedRoute);

  /** The `:id` segment, which decides which conversation is shown. */
  private readonly sessionId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    {
      initialValue: null,
    },
  );

  /**
   * Route-driven state: whenever the id changes, that conversation is opened.
   * Navigating away and back therefore restores the right thread.
   */
  private readonly loadSession = effect(() => {
    const id = this.sessionId();

    if (id) {
      this.chat.openSession(id);
    }
  });

  /** True while the view is still waiting for a conversation to arrive. */
  protected isEmpty(): boolean {
    return this.chat.isOpeningSession() && !this.chat.hasMessages();
  }

  /** Asks a follow-up question inside the open conversation. */
  protected onAsk(question: string): void {
    this.chat.ask(question);
  }

  /**
   * Opens a cited document. Phase 1 ships no document viewer, so the click is
   * a no-op placeholder for the Phase 2 route.
   */
  protected onSourceViewed(): void {
    // Reserved for the document route added with the API integration.
  }
}
