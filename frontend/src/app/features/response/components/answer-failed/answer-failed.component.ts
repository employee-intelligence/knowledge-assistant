import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Message } from '../../../../core/models/message.model';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/**
 * Shown when the request for a turn failed, rather than when the assistant
 * answered that it had nothing.
 *
 * The distinction is the whole point of the card. "Not found in company
 * documents" is a confident statement about the corpus and there is nothing to
 * retry; a failed request means the answer may well exist, so the card offers to
 * ask again instead of sending the user off to rephrase.
 */
@Component({
  selector: 'app-answer-failed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IconComponent],
  host: { class: 'block' },
  template: `
    <div
      class="rounded-lg rounded-tl-sm border border-danger/30 bg-danger-bg px-5 py-4"
      role="alert"
    >
      <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
        <app-icon name="info" [size]="16" class="shrink-0 text-danger" />
        The assistant could not answer
      </div>
      <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{{ message().text }}</p>

      <button
        app-button
        type="button"
        variant="outline"
        size="sm"
        class="mt-3"
        [disabled]="isBusy()"
        (click)="retry.emit(turnId())"
      >
        Try again
      </button>
    </div>
  `,
})
export class AnswerFailedComponent {
  /** The turn whose request failed. */
  readonly message = input.required<Message>();

  /** Disables the retry control while the same question is already in flight. */
  readonly isBusy = input(false);

  /**
   * Emits the turn to ask again. The id is the assistant half's, so the thread
   * does not have to know a turn is a pair.
   */
  readonly retry = output<string>();

  /** The turn this message belongs to, taken from the assistant message's id. */
  protected turnId(): string {
    return this.message().id.replace(/-assistant$/, '');
  }
}
