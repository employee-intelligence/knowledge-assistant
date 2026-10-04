import { Component, inject, signal, computed } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import { ApiError } from '../../../../core/services/api.service';
import { ToastService } from '../../../../core/services/toast.service';

const REMEMBERED_EMAIL_KEY = 'knowledge-assistant.remembered-email';

@Component({
  selector: 'app-login-view',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-background px-4">
      <div class="w-full max-w-md">
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4 rounded-lg border border-input bg-card p-6 shadow-xl">
          <div class="text-center mb-6">
            <h1 class="text-2xl font-bold text-foreground">Sign in</h1>
            <p class="mt-1 text-sm text-muted-foreground">Enter your credentials to access your account</p>
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="you@company.com"
              autocomplete="email"
            />
            @if (emailError()) {
              <p class="mt-1 text-sm text-destructive">{{ emailError() }}</p>
            }
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-foreground mb-1">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="••••••••"
              autocomplete="current-password"
            />
            @if (passwordError()) {
              <p class="mt-1 text-sm text-destructive">{{ passwordError() }}</p>
            }
          </div>

          <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              class="size-3.5 cursor-pointer accent-primary"
              [checked]="rememberMe()"
              (change)="onRememberMe($event)"
            />
            <span>Remember me</span>
          </label>

          <button
            type="submit"
            [disabled]="isSubmitting()"
            class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isSubmitting()) {
              <span class="flex items-center justify-center gap-2">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                  <path class="opacity-75" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
                </svg>
                Signing in...
              </span>
            } @else {
              Sign in
            }
          </button>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?
            <a routerLink="/register" class="text-primary hover:underline ml-1">Register</a>
          </p>
        </form>
      </div>
    </div>
  `,
})
export class LoginViewComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly rememberMe = signal(false);
  private readonly submitted = signal(false);
  protected readonly isSubmitting = signal(false);

  protected readonly emailError = computed(() => {
    if (!this.submitted()) {
      return '';
    }
    const control = this.form.controls.email;
    if (control.hasError('required')) {
      return 'Enter your email';
    }
    if (control.hasError('email')) {
      return 'That does not look like an email address';
    }
    return '';
  });

  protected readonly passwordError = computed(() => {
    if (!this.submitted()) {
      return '';
    }
    return this.form.controls.password.hasError('required') ? 'Enter your password' : '';
  });

  constructor() {
    try {
      const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (remembered && remembered.includes('@')) {
        this.form.controls.email.setValue(remembered);
        this.rememberMe.set(true);
      }
    } catch {
      // Ignore storage errors
    }
  }

  protected onRememberMe(event: Event): void {
    this.rememberMe.set((event.target as HTMLInputElement).checked);
    try {
      if (this.rememberMe()) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, this.form.controls.email.value.trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Ignore
    }
  }

  protected onSubmit(): void {
    this.submitted.set(true);

    if (this.emailError() || this.passwordError() || this.form.invalid) {
      return;
    }

    this.isSubmitting.set(true);

    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success('Signed in successfully');
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? this.auth.landingPath();
        this.router.navigateByUrl(returnUrl);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.toast.error(this.readSignInFailure(error));
      },
    });
  }

  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    if (requested && requested.startsWith('/') && !requested.startsWith('//')) {
      return requested;
    }
    return this.auth.landingPath();
  }

  private readSignInFailure(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }
    const status = (error as { status?: number } | null)?.status;
    if (status === 0) {
      return 'Could not reach the server. Please check your connection and try again.';
    }
    return 'Sign in failed. Please try again.';
  }
}