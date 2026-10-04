import { Component, inject, signal, computed } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import { ApiError } from '../../../../core/services/api.service';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register-view',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-background px-4">
      <div class="w-full max-w-md">
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4 rounded-lg border border-input bg-card p-6 shadow-xl">
          <div class="text-center mb-6">
            <h1 class="text-2xl font-bold text-foreground">Create an account</h1>
            <p class="mt-1 text-sm text-muted-foreground">Enter your details to get started</p>
          </div>

          <div>
            <label for="name" class="block text-sm font-medium text-foreground mb-1">Full name</label>
            <input
              id="name"
              type="text"
              formControlName="name"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="John Doe"
              autocomplete="name"
            />
            @if (nameError()) {
              <p class="mt-1 text-sm text-destructive">{{ nameError() }}</p>
            }
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
              autocomplete="new-password"
            />
            @if (passwordError()) {
              <p class="mt-1 text-sm text-destructive">{{ passwordError() }}</p>
            }
          </div>

          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-foreground mb-1">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              formControlName="confirmPassword"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              placeholder="••••••••"
              autocomplete="new-password"
            />
            @if (confirmPasswordError()) {
              <p class="mt-1 text-sm text-destructive">{{ confirmPasswordError() }}</p>
            }
          </div>

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
                Creating account...
              </span>
            } @else {
              Create account
            }
          </button>
        </form>

        @if (notice()) {
          <p
            class="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <svg class="mt-0.5 shrink-0 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{{ notice() }}</span>
          </p>
        }

        <p class="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?
          <a routerLink="/login" class="text-primary hover:underline ml-1">Sign in</a>
        </p>
      </div>
    </div>
  `,
})
export class RegisterViewComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: passwordsMatchValidator });

  protected readonly isSubmitting = signal(false);
  protected readonly notice = signal('');
  private readonly submitted = signal(false);

  protected readonly nameError = computed(() => {
    if (!this.submitted()) return '';
    const control = this.form.controls.name;
    return control.hasError('required') ? 'Enter your name' : '';
  });

  protected readonly emailError = computed(() => {
    if (!this.submitted()) return '';
    const control = this.form.controls.email;
    if (control.hasError('required')) return 'Enter your email';
    if (control.hasError('email')) return 'That does not look like an email address';
    return '';
  });

  protected readonly passwordError = computed(() => {
    if (!this.submitted()) return '';
    const control = this.form.controls.password;
    if (control.hasError('required')) return 'Enter your password';
    if (control.hasError('minlength')) return 'Password must be at least 8 characters';
    return '';
  });

  protected readonly confirmPasswordError = computed(() => {
    if (!this.submitted()) return '';
    const control = this.form.controls.confirmPassword;
    if (control.hasError('required')) return 'Please confirm your password';
    if (this.form.hasError('passwordMismatch')) return 'Passwords do not match';
    return '';
  });

  protected onSubmit(): void {
    this.submitted.set(true);
    this.notice.set('');

    if (this.nameError() || this.emailError() || this.passwordError() || this.confirmPasswordError() || this.form.invalid) {
      return;
    }

    this.isSubmitting.set(true);

    const { name, email, password } = this.form.getRawValue();

    this.auth.register(name, email, password).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.router.navigateByUrl(this.auth.landingPath());
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.notice.set(this.readRegisterFailure(error));
      },
    });
  }

  private readRegisterFailure(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }
    const status = (error as { status?: number } | null)?.status;
    if (status === 0) {
      return 'Could not reach the server. Please check your connection and try again.';
    }
    return 'Registration failed. Please try again.';
  }
}