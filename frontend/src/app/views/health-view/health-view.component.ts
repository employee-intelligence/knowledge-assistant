import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ApiService, ApiError } from '../../core/services/api.service';
import { HealthDto } from '../../core/models/api.model';

@Component({
  selector: 'app-health-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-background px-4">
      <div class="w-full max-w-md text-center">
        <h1 class="text-3xl font-bold text-foreground mb-4">Health Check</h1>

        @if (isLoading()) {
          <div class="flex flex-col items-center gap-4">
            <svg class="animate-spin h-12 w-12 text-muted-foreground" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
            </svg>
            <p class="text-muted-foreground">Checking backend health...</p>
          </div>
        } @else if (error()) {
          <div class="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-destructive">
            <h2 class="font-medium mb-2">Health check failed</h2>
            <p class="text-sm">{{ error() }}</p>
          </div>
        } @else if (health()) {
          <div class="space-y-4">
            <div
              class="rounded-lg p-6"
              [class]="health()!.status === 'ok' ? 'bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'"
            >
              <div class="flex items-center justify-center gap-3 mb-4">
                <div
                  class="h-3 w-3 rounded-full"
                  [class]="health()!.status === 'ok' ? 'bg-green-500' : 'bg-yellow-500'"
                ></div>
                <span class="text-xl font-semibold text-foreground capitalize">
                  {{ health()!.status }}
                </span>
              </div>

              @if (health()!.message) {
                <p class="text-sm text-muted-foreground">{{ health()!.message }}</p>
              }
            </div>

            <div class="rounded-md bg-card border border-input p-4 text-left">
              <h3 class="font-medium text-foreground mb-2">Backend Info</h3>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Status</dt>
                  <dd class="font-medium capitalize">{{ health()!.status }}</dd>
                </div>
                @if (health()!.message) {
                  <div class="flex justify-between">
                    <dt class="text-muted-foreground">Message</dt>
                    <dd class="font-medium">{{ health()!.message }}</dd>
                  </div>
                }
              </dl>
            </div>
          </div>
        }

        <div class="mt-6">
          <button
            (click)="checkHealth()"
            [disabled]="isLoading()"
            class="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            @if (isLoading()) {
              <span class="flex items-center justify-center gap-2">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                  <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
                </svg>
                Checking...
              </span>
            } @else {
              Refresh
            }
          </button>
        </div>

        <p class="mt-6 text-sm text-muted-foreground">
          <a routerLink="/" class="text-primary hover:underline">← Back to dashboard</a>
        </p>
      </div>
    </div>
  `,
})
export class HealthViewComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly health = signal<HealthDto | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.checkHealth();
  }

  protected checkHealth(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api.getHealth().subscribe({
      next: (health) => {
        this.health.set(health);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        const apiError = err instanceof ApiError ? err : new ApiError('Health check failed', 0, true);
        this.error.set(apiError.message);
      },
    });
  }
}