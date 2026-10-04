import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Message, AnswerStatus } from '../../../../core/models/session.model';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex gap-3" [class.flex-row-reverse]="message().role === 'user'">
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        [class.bg-primary]="message().role === 'assistant'"
        [class.text-primary-foreground]="message().role === 'assistant'"
        [class.bg-accent]="message().role === 'user'"
        [class.text-accent-foreground]="message().role === 'user'"
      >
        @if (message().role === 'assistant') {
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        } @else {
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
      </div>

      <div class="flex-1 min-w-0" [class.text-right]="message().role === 'user'">
        <div
          class="inline-block max-w-[80%] rounded-2xl px-4 py-2"
          [class.bg-primary]="message().role === 'assistant'"
          [class.text-primary-foreground]="message().role === 'assistant'"
          [class.bg-accent]="message().role === 'user'"
          [class.text-accent-foreground]="message().role === 'user'"
        >
          <p class="whitespace-pre-wrap text-sm">{{ message().text }}</p>
        </div>

        <div class="flex items-center gap-2 mt-1 text-xs text-muted-foreground" [class.justify-end]="message().role === 'user'">
          <span>{{ formatTime(message().createdAt) }}</span>
          @if (message().role === 'assistant') {
            <span [class]="statusClass(message().status)">{{ statusLabel(message().status) }}</span>
          }
        </div>
      </div>
    </div>
  `,
})
export class MessageBubbleComponent {
  readonly message = input.required<Message>();

  protected formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  protected statusLabel(status: AnswerStatus): string {
    switch (status) {
      case 'pending':
        return 'Sending...';
      case 'answered':
        return 'Answered';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  }

  protected statusClass(status: AnswerStatus): string {
    const base = 'px-1.5 py-0.5 rounded-full text-xs';
    switch (status) {
      case 'pending':
        return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
      case 'answered':
        return `${base} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
      case 'failed':
        return `${base} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
      default:
        return base;
    }
  }
}