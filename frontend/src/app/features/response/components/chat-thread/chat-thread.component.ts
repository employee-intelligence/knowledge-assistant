import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Message, SourceReference } from '../../../../core/models/message.model';
import { AnswerCardComponent } from '../answer-card/answer-card.component';
import { AnswerNotFoundComponent } from '../answer-not-found/answer-not-found.component';
import { AnswerPendingComponent } from '../answer-pending/answer-pending.component';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';

/**
 * The conversation itself: user bubbles on the right, assistant turns on the
 * left with the right card per state (answer, no match, still searching). It
 * also keeps the newest turn in view as the thread grows.
 */
@Component({
  selector: 'app-chat-thread',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnswerCardComponent,
    AnswerNotFoundComponent,
    AnswerPendingComponent,
    MessageBubbleComponent,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div
      #scroller
      class="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      <div class="mx-auto flex w-full max-w-thread flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        @for (message of messages(); track message.id) {
          @if (message.role === 'user') {
            <app-message-bubble [message]="message" />
          } @else {
            <div class="min-w-0 flex-1">
              @switch (message.status) {
                @case ('pending') {
                  <app-answer-pending />
                }
                @case ('not-found') {
                  <app-answer-not-found [message]="message" />
                }
                @default {
                  <app-answer-card [message]="message" (viewed)="viewed.emit($event)" />
                }
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ChatThreadComponent {
  /** Turns to render, oldest first. */
  readonly messages = input.required<Message[]>();

  /** Emits when a citation is opened. */
  readonly viewed = output<SourceReference>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** Number of turns, so the scroll effect only reruns when the thread grows. */
  private readonly turnCount = computed(() => this.messages().length);

  constructor() {
    // Keep the newest turn visible as the conversation grows. Runs after render
    // so the new content is already laid out.
    afterRenderEffect(() => {
      this.turnCount();
      const element = this.scroller()?.nativeElement;

      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
