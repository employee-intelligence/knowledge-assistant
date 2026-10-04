import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
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
            @if (form.get('name')?.invalid && form.get('name')?.touched) {
              <p class="mt-1 text-sm text-destructive">Name is required</p>
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
            @if (form.get('email')?.invalid && form.get('email')?.touched) {
              <p class="mt-1 text-sm text-destructive">Please enter a valid email address</p>
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
            @if (form.get('password')?.invalid && form.get('password')?.touched) {
              <p class="mt-1 text-sm text-destructive">Password must be at least 8 characters</p>
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
            @if (form.get('confirmPassword')?.invalid && form.get('confirmPassword')?.touched) {
              <p class="mt-1 text-sm text-destructive">Please confirm your password</p>
            }
            @if (form.hasError('passwordMismatch') && form.get('confirmPassword')?.touched) {
              <p class="mt-1 text-sm text-destructive">Passwords do not match</p>
            }
          </div>

          @if (error()) {
            <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {{ error() }}
            </div>
          }

          <button
            type="submit"
            [disabled]="form.invalid || isLoading()"
            class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isLoading()) {
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

  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  }, { validators: passwordsMatchValidator });

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const { name, email, password } = this.form.getRawValue();

    this.auth.register(name, email, password).subscribe({
      next: (user) => {
        this.isLoading.set(false);
        this.router.navigateByUrl(this.auth.landingPath());
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        const apiError = err instanceof ApiError ? err : new ApiError('Registration failed', 0, true);
        this.error.set(apiError.message);
      },
    });
  }
}