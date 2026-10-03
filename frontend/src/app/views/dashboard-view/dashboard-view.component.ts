import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ChatService } from '../../core/services/chat.service';
import { QuestionInputComponent } from '../../features/ask/components/question-input/question-input.component';
import { SuggestionListComponent } from '../../features/ask/components/suggestion-list/suggestion-list.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { STARTER_QUESTIONS } from '../../shared/utils/constants';

/**
 * The landing view: a centred prompt, the starter questions, and the composer.
 * A view only assembles components and connects them to services.
 */
@Component({
  selector: 'app-dashboard-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuestionInputComponent, SuggestionListComponent, ViewHeaderComponent],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <!-- The header carries only the sidebar toggle; the design's hero has no title. -->
    <app-view-header />

    <div class="scrollbar-thin flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
      <div class="flex w-full max-w-2xl flex-col items-center">
        <h2 class="font-headings text-2xl font-semibold text-foreground">How can I help?</h2>
        <p class="mt-2 max-w-[440px] text-center text-sm leading-relaxed text-muted-foreground">
          Ask me anything about company policies, onboarding, IT setup, or internal documentation.
        </p>

        <div class="mt-6 w-full max-w-[520px]">
          <app-suggestion-list [suggestions]="starterQuestions" (chosen)="onAsk($event)" />
        </div>

        <div class="mt-8 w-full max-w-[640px]">
          <app-question-input [isBusy]="chat.isLoading()" (ask)="onAsk($event)" />
        </div>
      </div>
    </div>
  `,
})
export class DashboardViewComponent {
  /** Current conversation state, including the loading flag for the composer. */
  protected readonly chat = inject(ChatService);

  /** Starter prompts, which are product copy rather than data from the backend. */
  protected readonly starterQuestions = STARTER_QUESTIONS;

  private readonly router = inject(Router);

  /**
   * Asks a question and routes to the response view.
   *
   * The route carries no id: `/response` follows the newest turn, so the question
   * just sent is the one that opens. That also means the view does not have to
   * wait for the request to start before it can navigate.
   */
  protected onAsk(question: string): void {
    this.chat.ask(question);

    void this.router.navigate(['/response']);
  }
}
