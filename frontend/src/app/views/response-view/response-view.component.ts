import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';
import { QuestionInputComponent } from '../../features/ask/components/question-input/question-input.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { AnswerPendingComponent } from '../../features/response/components/answer-pending/answer-pending.component';
import { ChatThreadComponent } from '../../features/response/components/chat-thread/chat-thread.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';

/**
 * Shows one session: its whole thread and the composer for follow-up
 * questions. A view only assembles components and connects them to services.
 *
 * The route's `:sessionId` is the session's own id, and a session's id never
 * changes, so a link to one keeps working however long afterwards it is
 * followed. It is optional: `/chat` with no id follows the session that was
 * last active, which is where a question sent from the dashboard lands.
 */
@Component({
  selector: 'app-response-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnswerPendingComponent,
    ChatThreadComponent,
    QuestionInputComponent,
    SkeletonComponent,
    ViewHeaderComponent,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <!-- Fixed above the scrollable area: reading back through a long session
         moves the messages under it and never takes the title with them. -->
    <app-view-header [title]="chat.threadTitle()" />

    @if (chat.isResolving()) {
      <!-- A session is on its way, so the placeholder is shaped like one: the
           question that was asked above the answer card that is arriving. This is
           the same skeleton a pending answer uses, because a refresh and a slow
           answer are the same wait from the reader's side. Nothing here is a real
           message, so it is hidden from assistive tech and the live region says
           what is happening once. -->
      <div class="mx-auto w-full max-w-thread flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <!--
          Shaped from MessageBubbleComponent: the same rounded-br-sm corner, the same
          padding, and a bar the height of one line of body text. The old placeholder
          used the top-right corner and a muted fill, so the real bubble arrived with a
          different shape and a different colour and the page visibly corrected itself.
        -->
        <div class="flex justify-end" aria-hidden="true">
          <div class="max-w-[320px] rounded-lg rounded-br-sm bg-primary/15 px-4 py-3">
            <app-skeleton class="h-5 w-full rounded bg-primary/25" />
          </div>
        </div>

        <app-answer-pending />
      </div>

      <span class="sr-only" role="status">Loading this session.</span>
    } @else if (chat.isMissing()) {
      <!-- A link to a session that is gone: expired, or belonging to somebody
           else. Said plainly, rather than as an empty thread, which would read
           as a session that had lost its history. -->
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <h2 class="font-headings text-lg font-semibold text-foreground">Session not found</h2>
        <p class="max-w-sm text-sm leading-relaxed text-muted-foreground">
          This session is not in this browser's list. It may have expired.
        </p>
      </div>
    } @else if (chat.isEmpty()) {
      <!-- An empty session is one waiting for a question, which is a different
           thing from a session that could not be found. -->
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <h2 class="font-headings text-lg font-semibold text-foreground">No questions yet</h2>
        <p class="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Ask a question about company policy and the answer will appear here.
        </p>
      </div>
    } @else {
      <app-chat-thread
        [messages]="chat.messages()"
        [isBusy]="chat.isLoading()"
        [isPreparing]="chat.isPreparing()"
        (retry)="onRetry($event)"
      />
    }

    <!-- Fixed below the scrollable area: shrink-0 keeps the composer at its own
         height, so the thread scrolls behind it instead of pushing it away. -->
    <div class="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5 lg:px-8 lg:pb-6">
      <div class="mx-auto w-full max-w-thread">
        <app-question-input [isBusy]="chat.isLoading()" (ask)="onAsk($event)" />
      </div>
    </div>
  `,
})
export class ResponseViewComponent {
  /** The open session. */
  protected readonly chat = inject(ChatService);
  private readonly sessions = inject(SessionService);

  private readonly route = inject(ActivatedRoute);

  /**
   * The `:sessionId` segment, which decides which session is shown. Null on
   * `/chat`, where the last active session is followed instead.
   */
  private readonly sessionId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('sessionId'))),
    { initialValue: null },
  );

  /**
   * Route-driven state: whenever the id changes, that session is opened.
   * Navigating away and back, and picking another session from the sidebar,
   * both restore the right thread.
   *
   * The id is read tracked on purpose: it is the one input this effect exists to
   * react to, so a change to it is exactly when the thread should be re-opened.
   */
  private readonly openRoutedSession = effect(() => {
    const id = this.sessionId();

    if (id) {
      this.chat.openSession(id);
      return;
    }

    // No id: follow the session the dashboard's question went into, or the most
    // recently active one. Either is already open or one fetch away.
    if (!this.chat.thread()) {
      const newest = this.sessions.conversations()[0];
      if (newest) {
        this.chat.openSession(newest.id);
      }
    }
  });

  /** Asks a follow-up question inside the open session. */
  protected onAsk(question: string): void {
    this.chat.ask(question);
  }

  /** Asks a failed message's question again. */
  protected onRetry(messageId: string): void {
    this.chat.retry(messageId);
  }
}
