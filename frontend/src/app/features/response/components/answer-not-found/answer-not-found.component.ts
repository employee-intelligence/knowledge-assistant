import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Message } from '../../../../core/models/message.model';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { HR_CONTACT_EMAIL } from '../../../../shared/utils/constants';

/**
 * Shown when the assistant is confident the corpus has no answer, so the user
 * knows the limit was a genuine gap rather than a failure.
 */
@Component({
  selector: 'app-answer-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'block' },
  template: `
    <div
      class="rounded-lg rounded-tl-sm border border-dashed border-border bg-muted/60
        px-5 py-4"
    >
      <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
        <app-icon name="search-x" [size]="16" class="shrink-0 text-muted-foreground" />
        Not found in company documents
      </div>
      <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{{ message().text }}</p>

      <div class="mt-2.5 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <app-icon name="info" [size]="14" class="shrink-0 text-warning" />
        <span class="text-xs text-foreground">
          Try rephrasing your question or contact HR at {{ hrContact }}.
        </span>
      </div>
    </div>
  `,
})
export class AnswerNotFoundComponent {
  /** The turn that found nothing. */
  readonly message = input.required<Message>();

  /** Contact offered as a next step. */
  protected readonly hrContact = HR_CONTACT_EMAIL;
}
