import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';
import { Message } from '../../core/models/session.model';
import { MessageBubbleComponent } from '../../features/response/components/message-bubble/message-bubble.component';

@Component({
  selector: 'app-chat-view',
  standalone: true,
  imports: [ReactiveFormsModule, MessageBubbleComponent],
  template: `
    <div class="flex h-dvh flex-col bg-background">
      <header class="border-b bg-card px-4 py-3">
        <div class="flex items-center justify-between gap-4">
          <button
            (click)="goBack()"
            class="p-2 rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Go back"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="flex-1 min-w-0">
            <h1 class="text-lg font-semibold text-foreground truncate">
              {{ sessionTitle() || 'New chat' }}
            </h1>
            <p class="text-xs text-muted-foreground">Session: {{ sessionId() }}</p>
          </div>
          <div class="flex items-center gap-2">
            @if (auth.isAdmin()) {
              <a routerLink="/admin" class="text-sm text-primary hover:underline">Admin</a>
            }
            <button
              (click)="onSignOut()"
              class="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto px-4 py-6">
        <div class="max-w-3xl mx-auto w-full space-y-6">
          @for (message of chat.messages(); track message.id) {
            <app-message-bubble [message]="message" />
          }

          @if (chat.isSending() && chat.messages().length > 0) {
            <div class="flex justify-start">
              <div class="flex items-center gap-2 text-muted-foreground">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                  <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
                </svg>
                <span class="text-sm">Assistant is typing...</span>
              </div>
            </div>
          }

          @if (chat.error()) {
            <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {{ chat.error() }}
            </div>
          }
        </div>
      </main>

      <footer class="border-t bg-card px-4 py-4">
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="max-w-3xl mx-auto">
          <div class="flex gap-2">
            <input
              id="message"
              type="text"
              formControlName="message"
              placeholder="Type your question..."
              class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              autocomplete="off"
              [disabled]="chat.isSending()"
            />
            <button
              type="submit"
              [disabled]="form.invalid || chat.isSending()"
              class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          @if (form.get('message')?.invalid && form.get('message')?.touched) {
            <p class="mt-1 text-sm text-destructive">Please enter a message</p>
          }
        </form>
      </footer>
    </div>
  `,
})
export class ChatViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly chat = inject(ChatService);
  private readonly sessions = inject(SessionService);

  protected readonly sessionId = signal<string>('');
  protected readonly sessionTitle = signal<string>('');

  protected readonly form = new FormGroup({
    message: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1)] }),
  });

  ngOnInit(): void {
    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (sessionId) {
      this.sessionId.set(sessionId);
      this.chat.openSession(sessionId).subscribe({
        next: (thread) => {
          if (thread) {
            this.sessionTitle.set(thread.title ?? 'New chat');
          }
        },
      });
    } else {
      // No session ID - start a new one
      this.startNewSession();
    }
  }

  private startNewSession(): void {
    this.sessions.create().subscribe({
      next: (session) => {
        this.sessionId.set(session.id);
        this.router.navigate(['/chat', session.id], { replaceUrl: true });
      },
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const message = this.form.getRawValue().message;
    this.form.reset();

    this.chat.sendMessage(message).subscribe();
  }

  protected goBack(): void {
    this.router.navigate(['/']);
  }

  protected onSignOut(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
    });
  }
}