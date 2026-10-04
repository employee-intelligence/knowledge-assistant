import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../core/services/auth.service';
import { SessionService } from '../../core/services/session.service';
import { Session } from '../../core/models/session.model';

@Component({
  selector: 'app-sessions-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex h-dvh flex-col bg-background">
      <header class="border-b bg-card px-4 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              (click)="router.navigate(['/'])"
              class="p-2 rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Go back"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 class="text-xl font-semibold text-foreground">Sessions</h1>
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
        <div class="max-w-3xl mx-auto w-full">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-medium text-foreground">Your chat sessions</h2>
            <button
              (click)="createSession()"
              [disabled]="sessions.isLoading()"
              class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            >
              @if (sessions.isLoading()) {
                <span class="flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                    <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
                  </svg>
                  Creating...
                </span>
              } @else {
                New session
              }
            </button>
          </div>

          @if (sessions.error()) {
            <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
              {{ sessions.error() }}
            </div>
          }

          @if (sessions.isLoading()) {
            <div class="flex items-center justify-center py-12">
              <svg class="animate-spin h-8 w-8 text-muted-foreground" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
              </svg>
            </div>
          } @else if (sessions.sessions().length === 0) {
            <div class="text-center py-12">
              <svg class="mx-auto h-12 w-12 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 class="mt-4 text-lg font-medium text-foreground">No sessions yet</h3>
              <p class="mt-2 text-muted-foreground">Start a new chat session to begin</p>
              <button
                (click)="createSession()"
                class="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                New session
              </button>
            </div>
          } @else {
            <div class="space-y-3">
              @for (session of sessions.sessions(); track session.id) {
                <button
                  (click)="router.navigate(['/chat', session.id])"
                  class="w-full text-left rounded-md border border-input bg-card p-4 hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium text-foreground truncate">
                        {{ session.title || 'New session' }}
                      </p>
                      <p class="text-sm text-muted-foreground">
                        Updated {{ formatDate(session.updatedAt) }}
                      </p>
                    </div>
                    <svg class="h-5 w-5 text-muted-foreground shrink-0 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              }
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class SessionsViewComponent {
  protected readonly auth = inject(AuthService);
  protected readonly sessions = inject(SessionService);
  private readonly router = inject(Router);

  protected createSession(): void {
    this.sessions.create().subscribe({
      next: (session) => {
        this.router.navigate(['/chat', session.id]);
      },
    });
  }

  protected onSignOut(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
    });
  }

  protected formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}