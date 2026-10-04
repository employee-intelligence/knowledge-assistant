import { Component, inject, signal, computed } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
import { ApiError } from '../../../../core/services/api.service';
import { ToastService } from '../../../../core/services/toast.service';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register-view',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-background px-4">
      <div class="w-full max-w-md">
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4 rounded-lg border border-input bg-card p-6 shadow-xl">
          <div class="text-center mb-6">
            <h1 class="text-2xl font-bold text-foreground">Create an account</h1>
            <p class="mt-1 text-sm text-muted-foreground">Enter your details to get started</p>
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

          <p class="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?
            <a routerLink="/login" class="text-primary hover:underline ml-1">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  `,
})
export class RegisterViewComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: passwordsMatchValidator });

  protected readonly isSubmitting = signal(false);
  private readonly submitted = signal(false);

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

    if (this.emailError() || this.passwordError() || this.confirmPasswordError() || this.form.invalid) {
      return;
    }

    this.isSubmitting.set(true);

    const { email, password } = this.form.getRawValue();

    this.auth.register(email, password).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success('Account created successfully');
        this.router.navigateByUrl(this.auth.landingPath());
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.toast.error(this.readRegisterFailure(error));
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