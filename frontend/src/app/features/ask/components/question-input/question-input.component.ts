import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import {
  GROUNDING_DISCLAIMER,
  MAX_QUESTION_LENGTH,
  QUESTION_PLACEHOLDER,
} from '../../../../shared/utils/constants';

/**
 * The composer. A reactive form owns the text so validation, the character
 * limit and keyboard submission live in one place and the control stays
 * accessible and testable.
 */
@Component({
  selector: 'app-question-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IconComponent, ReactiveFormsModule],
  host: { class: 'block' },
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <div
        class="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-raised
          transition-colors focus-within:border-primary/40 sm:items-center sm:gap-3 sm:px-4 sm:py-3"
      >
        <button
          app-button
          type="button"
          variant="ghost"
          size="icon"
          class="-ml-1 shrink-0"
          aria-label="Attach a document"
          disabled
        >
          <app-icon name="paperclip" [size]="18" />
        </button>

        <textarea
          formControlName="question"
          rows="1"
          [placeholder]="placeholder"
          [attr.maxlength]="maxLength"
          aria-label="Ask a question about company policies"
          class="block max-h-32 min-h-9 w-full resize-none bg-transparent py-2 text-sm
            text-foreground placeholder:text-muted-foreground focus:outline-none"
          (input)="autoGrow($event)"
          (keydown.enter)="onEnter($event)"
        ></textarea>

        <button
          app-button
          type="submit"
          size="icon"
          class="shrink-0"
          [disabled]="!canSubmit()"
          aria-label="Send question"
        >
          <app-icon name="send-horizontal" [size]="17" />
        </button>
      </div>

      <div class="mt-2 flex items-center justify-between gap-3">
        <p class="text-xs leading-relaxed text-muted-foreground">{{ disclaimer }}</p>
        @if (showCounter()) {
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {{ value().length }} / {{ maxLength }}
          </span>
        }
      </div>
    </form>
  `,
})
export class QuestionInputComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  /** Emits the trimmed question when the form is submitted. */
  readonly ask = output<string>();

  /** Shows the character counter while a long question is being typed. */
  readonly showCounter = input(false);

  /** Disables submission while a request is in flight. */
  readonly isBusy = input(false);

  /** Placeholder text, defined once as a product constant. */
  protected readonly placeholder = QUESTION_PLACEHOLDER;

  /** Disclaimer shown under the field. */
  protected readonly disclaimer = GROUNDING_DISCLAIMER;

  /** Maximum accepted question length. */
  protected readonly maxLength = MAX_QUESTION_LENGTH;

  /** The question form, reset after every submission. */
  protected readonly form = this.formBuilder.group({
    question: ['', [Validators.required, Validators.maxLength(MAX_QUESTION_LENGTH)]],
  });

  /** Current text as a signal, so validation state drives the template. */
  protected readonly value = toSignal(
    this.form.controls.question.valueChanges.pipe(startWith(this.form.controls.question.value)),
    { initialValue: '' },
  );

  /** True when there is something to send and no request is in flight. */
  protected readonly canSubmit = computed(
    () => this.value().trim().length > 0 && this.form.controls.question.valid && !this.isBusy(),
  );

  /** Submits the question and clears the field. */
  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const question = this.value().trim();

    this.form.reset();
    this.ask.emit(question);
  }

  /**
   * Enter sends, Shift+Enter inserts a newline, so multi-line questions stay
   * possible without giving up the one-key send.
   */
  protected onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.submit();
  }

  /** Grows the field with its content, up to the height set in the template. */
  protected autoGrow(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}
