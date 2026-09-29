import { ChangeDetectionStrategy, Component } from '@angular/core';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';

/**
 * The placeholder shown for an answer that is still being retrieved: a spinning
 * assistant avatar beside a card that says what is happening.
 */
@Component({
  selector: 'app-answer-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, LoadingIndicatorComponent],
  host: { class: 'flex gap-3' },
  template: `
    <div
      class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary
        text-primary-foreground"
    >
      <app-icon name="loader-2" [size]="16" class="animate-spin motion-reduce:animate-none" />
    </div>

    <div
      class="flex items-center gap-3 rounded-lg rounded-tl-sm border border-border bg-card
        px-5 py-4"
    >
      <app-loading-indicator />
    </div>
  `,
})
export class AnswerPendingComponent {}
