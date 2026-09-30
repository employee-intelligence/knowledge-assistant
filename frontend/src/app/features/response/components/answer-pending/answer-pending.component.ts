import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The placeholder shown while an answer is still being retrieved.
 *
 * A skeleton rather than a spinner, and deliberately not the assistant avatar.
 * A first answer can take most of a minute on the free backend tier, and a
 * spinning avatar beside a caption reads as "something small is happening" for
 * that whole minute. Skeleton bars shaped like the answer card that is about to
 * arrive instead show what is coming and hold their layout, so nothing jumps
 * when the real card replaces them.
 */
@Component({
  selector: 'app-answer-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="animate-pulse rounded-lg rounded-tl-sm border border-border bg-card px-5 py-4
        shadow-card motion-reduce:animate-none"
      aria-hidden="true"
    >
      <div class="h-3.5 w-2/5 rounded bg-muted"></div>
      <div class="mt-2.5 h-3 w-full rounded bg-muted"></div>
      <div class="mt-2 h-3 w-11/12 rounded bg-muted"></div>
      <div class="mt-2 h-3 w-3/5 rounded bg-muted"></div>

      <div class="mt-3.5 flex flex-col gap-2">
        <div class="flex items-center gap-1.5 rounded-md bg-secondary-soft px-2 py-2">
          <div class="size-3 shrink-0 rounded bg-secondary/40"></div>
          <div class="h-2.5 w-2/5 rounded bg-secondary/30"></div>
        </div>
        <div class="flex items-center gap-1.5 rounded-md bg-secondary-soft px-2 py-2">
          <div class="size-3 shrink-0 rounded bg-secondary/40"></div>
          <div class="h-2.5 w-1/3 rounded bg-secondary/30"></div>
        </div>
      </div>
    </div>

    <span class="sr-only">Searching the company documents.</span>
  `,
})
export class AnswerPendingComponent {}
