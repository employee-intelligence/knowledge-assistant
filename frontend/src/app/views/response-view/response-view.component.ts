import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { ChatService } from '../../core/services/chat.service';
import { QuestionInputComponent } from '../../features/ask/components/question-input/question-input.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { ChatThreadComponent } from '../../features/response/components/chat-thread/chat-thread.component';
import { LoadingIndicatorComponent } from '../../shared/components/loading-indicator/loading-indicator.component';

/**
 * Shows one conversation: the turn that was asked for, everything that led to
 * it, and the composer for follow-up questions. A view only assembles components
 * and connects them to services.
 *
 * The route's `:id` is the turn's position in the session. It is optional, and
 * `/response` with no id follows the newest turn, which is where a question sent
 * from the dashboard lands. Positions are stable because the backend's history
 * for a session only grows at the end.
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

    @if (chat.isResolving()) {
      <div class="flex min-h-0 flex-1 items-center justify-center py-10">
        <app-loading-indicator [showDots]="false" />
      </div>
    } @else if (!chat.hasMessages()) {
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <h2 class="font-headings text-lg font-semibold text-foreground">Question not found</h2>
        <p class="max-w-sm text-sm leading-relaxed text-muted-foreground">
          This question is not in the current session. Sessions expire, and a new one starts empty.
        </p>
      </div>
    } @else {
      <app-chat-thread
        [messages]="chat.messages()"
        [isBusy]="chat.isLoading()"
        (retry)="onRetry($event)"
      />
    }

    <div class="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5 lg:px-8 lg:pb-6">
      <div class="mx-auto w-full max-w-thread">
        <app-question-input [isBusy]="chat.isLoading()" (ask)="onAsk($event)" />
      </div>
    </div>
  `,
})
export class ResponseViewComponent {
  /** The open conversation. */
  protected readonly chat = inject(ChatService);

  private readonly route = inject(ActivatedRoute);

  /**
   * The `:id` segment, which decides which turn is shown. Null on `/response`,
   * where the newest turn is followed instead.
   */
  private readonly turnId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: null,
  });

  /**
   * Route-driven state: whenever the id changes, that turn becomes the open one.
   * Navigating away and back therefore restores the right conversation.
   *
   * `untracked` because the id is the only input. Reading the open turn here too
   * would make the effect re-run on every answer arriving, which is `openTurn`'s
   * job to ignore anyway.
   */
  private readonly openRoutedTurn = effect(() => {
    this.chat.openTurn(untracked(this.turnId));
  });

  /** Asks a follow-up question inside the open conversation. */
  protected onAsk(question: string): void {
    this.chat.ask(question);
  }

  /** Asks a failed turn's question again. */
  protected onRetry(turnId: string): void {
    this.chat.retry(turnId);
  }
}
