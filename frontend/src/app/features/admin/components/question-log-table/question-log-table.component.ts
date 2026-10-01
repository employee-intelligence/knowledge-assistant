import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import {
  QUESTION_OUTCOME_LABELS,
  type QuestionLog,
  type QuestionOutcome,
} from '../../../../core/models/question-log.model';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent, type BadgeTone } from '../../../../shared/components/badge/badge.component';
import { formatRelativeTime } from '../../../../shared/utils/relative-time.util';

/** Colour per outcome, so a log can be skimmed for the ones that went wrong. */
const OUTCOME_TONES: Record<QuestionOutcome, BadgeTone> = {
  answered: 'info',
  'not-found': 'warning',
  failed: 'danger',
};

/**
 * Every question asked against the knowledge base, newest first, with how it was
 * resolved and which documents were used.
 */
@Component({
  selector: 'app-question-log-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, BadgeComponent],
  host: { class: 'block' },
  template: `
    <div class="overflow-hidden rounded-lg border border-border bg-card">
      @for (log of logs(); track log.id) {
        <div
          class="flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
          [class]="log.outcome === 'failed' ? 'bg-danger/5' : ''"
        >
          <app-avatar
            [initials]="log.askedByInitials"
            tone="muted"
            [size]="36"
            [label]="log.askedBy"
          />

          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <p class="text-sm text-foreground">{{ log.question }}</p>
            <p class="text-xs text-muted-foreground">
              {{ log.askedBy }} · {{ relativeTime(log.createdAt) }} ·
              {{ sources(log.sourceCount) }} · {{ duration(log.durationMs) }}
            </p>
          </div>

          <app-badge [tone]="tones[log.outcome]" class="shrink-0">
            {{ labels[log.outcome] }}
          </app-badge>
        </div>
      }
    </div>
  `,
})
export class QuestionLogTableComponent {
  /** The questions to list, in the order the view filtered them. */
  readonly logs = input.required<QuestionLog[]>();

  /** Labels for each outcome. */
  protected readonly labels = QUESTION_OUTCOME_LABELS;

  /** Colours for each outcome. */
  protected readonly tones = OUTCOME_TONES;

  /** When a question was asked, as a reader would say it. */
  protected relativeTime(isoDate: string): string {
    return formatRelativeTime(isoDate);
  }

  /** How many documents backed an answer. */
  protected sources(count: number): string {
    return count === 1 ? '1 source' : `${count} sources`;
  }

  /** How long the answer took, in seconds. */
  protected duration(milliseconds: number): string {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  }
}
