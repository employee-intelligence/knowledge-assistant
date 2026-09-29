import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { HistoryEntry, type AnswerStatus } from '../../../../core/models/question.model';
import { IconComponent, type IconName } from '../../../../shared/components/icon/icon.component';
import { toInitials } from '../../../../shared/utils/initials.util';

/** Which surface the row is rendered on. */
export type HistoryItemAppearance = 'sidebar' | 'panel' | 'rail';

/** Label, icon and colour for each answer status. */
const STATUS_META: Record<AnswerStatus, { label: string; icon: IconName; classes: string }> = {
  answered: { label: 'Answered', icon: 'check-circle-2', classes: 'bg-success-bg text-success' },
  'not-found': { label: 'No match', icon: 'search-x', classes: 'bg-warning-bg text-warning' },
  pending: { label: 'Answering', icon: 'loader-2', classes: 'bg-muted text-muted-foreground' },
  failed: { label: 'Failed', icon: 'info', classes: 'bg-danger-bg text-danger' },
};

/**
 * One past question, rendered in whichever of the three forms the current
 * layout calls for: a compact row on the sidebar, an initials chip on the
 * collapsed rail, or a full card with an answer preview in the history view.
 */
@Component({
  selector: 'app-history-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'block' },
  template: `
    @switch (appearance()) {
      @case ('rail') {
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-md border text-sm
            font-semibold transition-colors"
          [class]="railClasses()"
          [attr.aria-current]="isSelected() ? 'page' : null"
          [attr.title]="entry().question.title"
          (click)="selected.emit(entry().question.id)"
        >
          {{ initials() }}
        </button>
      }
      @case ('panel') {
        <button
          type="button"
          class="flex w-full items-start gap-3 rounded-lg border p-4 text-left shadow-subtle
            transition-colors"
          [class]="panelClasses()"
          [attr.aria-current]="isSelected() ? 'page' : null"
          (click)="selected.emit(entry().question.id)"
        >
          <span class="min-w-0 flex-1 text-left">
            <span class="block text-sm font-medium text-foreground">
              {{ entry().question.title }}
            </span>
            <span class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-medium"
                [class]="status().classes"
              >
                <app-icon [name]="status().icon" [size]="11" />
                {{ status().label }}
              </span>
            </span>
            <span class="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
              {{ entry().answerPreview || 'No answer yet.' }}
            </span>
          </span>
          <app-icon
            name="arrow-up-right"
            [size]="16"
            class="mt-0.5 shrink-0 text-muted-foreground"
          />
        </button>
      }
      @default {
        <button
          type="button"
          class="flex w-full items-center rounded-md border px-3 py-2.5 text-left
            transition-colors"
          [class]="sidebarClasses()"
          [attr.aria-current]="isSelected() ? 'page' : null"
          (click)="selected.emit(entry().question.id)"
        >
          <span class="min-w-0 flex-1 text-left">
            <span class="block truncate text-sm font-medium" [class]="titleClasses()">
              {{ entry().question.title }}
            </span>
          </span>
        </button>
      }
    }
  `,
})
export class HistoryItemComponent {
  /** The question this row represents. */
  readonly entry = input.required<HistoryEntry>();

  /** Surface the row is rendered on. */
  readonly appearance = input<HistoryItemAppearance>('sidebar');

  /** Highlights the row as the currently open conversation. */
  readonly isSelected = input(false);

  /** Emits the question id when the row is activated. */
  readonly selected = output<string>();

  /** Initials for the collapsed rail. */
  protected readonly initials = computed(() => toInitials(this.entry().question.topic));

  /** Label, icon and colour for the current answer status. */
  protected readonly status = computed(() => STATUS_META[this.entry().question.answerStatus]);

  /** Resolved classes for the collapsed-rail chip. */
  protected readonly railClasses = computed(() =>
    this.isSelected()
      ? 'border-secondary bg-white/15 text-sidebar-foreground'
      : 'border-transparent bg-white/5 text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground',
  );

  /** Resolved classes for the sidebar row. */
  protected readonly sidebarClasses = computed(() =>
    this.isSelected()
      ? 'border-secondary/60 bg-white/10'
      : 'border-transparent hover:bg-white/10 focus-visible:bg-white/10',
  );

  /** Resolved classes for the history-view card. */
  protected readonly panelClasses = computed(() =>
    this.isSelected()
      ? 'border-secondary bg-secondary-soft'
      : 'border-border bg-card hover:border-primary/30 hover:bg-secondary-soft/50',
  );

  /** Resolved classes for the title, which dims when unselected on the sidebar. */
  protected readonly titleClasses = computed(() =>
    this.isSelected() ? 'text-sidebar-foreground' : 'text-sidebar-foreground/85',
  );
}
