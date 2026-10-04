import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ApiService, ApiError } from '../../core/services/api.service';
import { UserDto, Role, ROLE_LABELS } from '../../core/models/auth.model';

@Component({
  selector: 'app-admin-view',
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
            <h1 class="text-xl font-semibold text-foreground">Admin Dashboard</h1>
          </div>
          <button
            (click)="onSignOut()"
            class="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Sign out
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto px-4 py-6">
        <div class="max-w-4xl mx-auto w-full">
          <div class="mb-6">
            <h2 class="text-lg font-medium text-foreground">User Management</h2>
            <p class="text-sm text-muted-foreground">Manage user roles and access</p>
          </div>

          @if (error()) {
            <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
              {{ error() }}
            </div>
          }

          @if (isLoading()) {
            <div class="flex items-center justify-center py-12">
              <svg class="animate-spin h-8 w-8 text-muted-foreground" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
              </svg>
            </div>
          } @else {
            <div class="rounded-md border border-input bg-card overflow-hidden">
              <table class="w-full">
                <thead class="bg-muted">
                  <tr>
                    <th class="text-left p-3 font-medium text-foreground">Account</th>
                    <th class="text-left p-3 font-medium text-foreground">Role</th>
                    <th class="text-left p-3 font-medium text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (user of users(); track user.id) {
                    <tr class="border-t hover:bg-accent/50">
                      <td class="p-3">
                        <span class="font-medium">{{ user.email }}</span>
                        @if (!user.is_active) {
                          <span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">inactive</span>
                        }
                      </td>
                      <td class="p-3">
                        <span
                          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          [class]="roleClass(user.role)"
                        >
                          {{ roleLabels[user.role] }}
                        </span>
                      </td>
                      <td class="p-3">
                        <div class="flex items-center gap-2">
                          <select
                            [value]="user.role"
                            (change)="onRoleChange(user.id, $event)"
                            class="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="staff">Staff</option>
                            <option value="intern">Intern</option>
                            <option value="admin">Administrator</option>
                          </select>
                          @if (user.id !== auth.user()?.id) {
                            <button
                              (click)="onDeactivate(user.id)"
                              [disabled]="isDeactivating(user.id)"
                              class="rounded-md bg-destructive/10 text-destructive px-2 py-1 text-sm hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-destructive disabled:opacity-50"
                            >
                              @if (isDeactivating(user.id)) {
                                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                                  <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
                                </svg>
                              } @else {
                                Deactivate
                              }
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class AdminViewComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly users = signal<UserDto[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deactivatingIds = signal<Set<string>>(new Set());

  protected readonly roleLabels = ROLE_LABELS;

  ngOnInit(): void {
    this.loadUsers();
  }

  protected loadUsers(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        const apiError = err instanceof ApiError ? err : new ApiError('Failed to load users', 0, true);
        this.error.set(apiError.message);
      },
    });
  }

  protected onRoleChange(userId: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const role = select.value as Role;

    this.api.updateUserRole(userId, role).subscribe({
      next: (updated) => {
        this.users.update((users) =>
          users.map((u) => (u.id === userId ? updated : u)),
        );
      },
      error: (err: unknown) => {
        const apiError = err instanceof ApiError ? err : new ApiError('Failed to update role', 0, true);
        this.error.set(apiError.message);
        this.loadUsers(); // Reload to reset the select
      },
    });
  }

  protected onDeactivate(userId: string): void {
    if (!confirm('Are you sure you want to deactivate this user?')) {
      return;
    }

    this.deactivatingIds.update((ids) => new Set(ids).add(userId));

    this.api.deactivateUser(userId).subscribe({
      next: () => {
        this.users.update((users) => users.filter((u) => u.id !== userId));
        this.deactivatingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(userId);
          return next;
        });
      },
      error: (err: unknown) => {
        const apiError = err instanceof ApiError ? err : new ApiError('Failed to deactivate user', 0, true);
        this.error.set(apiError.message);
        this.deactivatingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(userId);
          return next;
        });
      },
    });
  }

  protected isDeactivating(userId: string): boolean {
    return this.deactivatingIds().has(userId);
  }

  protected roleClass(role: Role): string {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'intern':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'staff':
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
  }

  protected onSignOut(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
    });
  }
}