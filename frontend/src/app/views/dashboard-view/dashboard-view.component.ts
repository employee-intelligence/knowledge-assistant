import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="flex h-dvh flex-col bg-background">
      <header class="border-b bg-card px-4 py-3">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold text-foreground">Internal Knowledge Assistant</h1>
          <div class="flex items-center gap-4">
            <span class="text-sm text-muted-foreground">{{ auth.displayName() }}</span>
            <button
              (click)="onSignOut()"
              class="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 flex items-center justify-center px-4">
        <div class="w-full max-w-3xl text-center">
          <div class="mb-8">
            <svg class="mx-auto h-16 w-16 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 class="text-3xl font-bold text-foreground mb-4">Ask me anything</h2>
          <p class="text-lg text-muted-foreground mb-8">
            I can help you find answers from your company's knowledge base.
            Start a new chat session to begin.
          </p>

          <div class="space-y-4">
            <button
              (click)="startNewChat()"
              [disabled]="chat.isSending()"
              class="w-full rounded-md bg-primary px-6 py-3 text-lg font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            >
              @if (chat.isSending()) {
                <span class="flex items-center justify-center gap-2">
                  <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                    <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
                  </svg>
                  Starting...
                </span>
              } @else {
                Start a new chat
              }
            </button>

            <button
              (click)="router.navigate(['/sessions'])"
              class="w-full rounded-md border border-input bg-background px-6 py-3 text-lg font-medium text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              View all sessions
            </button>
          </div>

          @if (auth.isAdmin()) {
            <div class="mt-8 pt-8 border-t">
              <a
                routerLink="/admin"
                class="text-sm text-primary hover:underline"
              >
                Go to Admin Dashboard
              </a>
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class DashboardViewComponent {
  protected readonly auth = inject(AuthService);
  protected readonly chat = inject(ChatService);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);

  protected startNewChat(): void {
    this.sessions.create().subscribe({
      next: (session) => {
        this.router.navigate(['/chat', session.id]);
      },
      error: () => {
        // Session service handles errors
      },
    });
  }

  protected onSignOut(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
    });
  }
}