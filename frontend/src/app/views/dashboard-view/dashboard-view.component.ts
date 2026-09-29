import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ChatService } from '../../core/services/chat.service';
import { SuggestionListComponent } from '../../features/ask/components/suggestion-list/suggestion-list.component';
import { QuestionInputComponent } from '../../features/ask/components/question-input/question-input.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';

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
          <app-suggestion-list [suggestions]="chat.suggestions()" (chosen)="onAsk($event)" />
        </div>

        <div class="mt-8 w-full max-w-[640px]">
          <app-question-input [isBusy]="chat.isLoading()" (ask)="onAsk($event)" />
        </div>
      </div>
    </div>
  `,
})
export class DashboardViewComponent {
  /** Current conversation state, including loading and the starter prompts. */
  protected readonly chat = inject(ChatService);

  private readonly router = inject(Router);

  /**
   * Asks a question, then routes to the response view. The service opens the
   * conversation first so the thread is ready when the view mounts.
   */
  protected onAsk(question: string): void {
    this.chat.ask(question);

    const id = this.chat.question()?.id;

    if (id) {
      void this.router.navigate(['/response', id]);
    }
  }
}
