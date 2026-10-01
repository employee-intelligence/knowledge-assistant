import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';

/**
 * The signed-out landing screen. It collects an email and a password and then
 * says plainly that accounts are not connected, rather than pretending to sign
 * anybody in.
 */
@Component({
  selector: 'app-login-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AuthLayoutComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    RouterLink,
  ],
  template: `
    <app-auth-layout>
      <h1 class="font-headings text-xl font-semibold text-foreground">Sign in</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Use your Acme Technologies work email to reach the knowledge base.
      </p>

      <form class="mt-6 flex flex-col gap-4" (submit)="onSubmit($event)">
        <app-form-field
          label="Work email"
          type="email"
          icon="mail"
          autocomplete="email"
          placeholder="you@acmetech.example"
          [required]="true"
          [value]="email()"
          [error]="emailError()"
          (valueChange)="email.set($event)"
        />

        <app-form-field
          label="Password"
          type="password"
          icon="lock"
          autocomplete="current-password"
          placeholder="Enter your password"
          [required]="true"
          [value]="password()"
          [error]="passwordError()"
          (valueChange)="password.set($event)"
        />

        <div class="flex items-center justify-end">
          <button
            type="button"
            class="cursor-pointer text-xs font-medium text-primary hover:underline"
            (click)="onForgotPassword()"
          >
            Forgot your password?
          </button>
        </div>

        <button
          app-button
          type="submit"
          size="lg"
          [fullWidth]="true"
          [disabled]="isSubmitting()"
        >
          @if (isSubmitting()) {
            <app-icon name="loader-2" [size]="16" class="animate-spin" />
            <span>Signing in…</span>
          } @else {
            <span>Sign in</span>
          }
        </button>
      </form>

      @if (notice()) {
        <p
          class="mt-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs
            text-muted-foreground"
        >
          <app-icon name="info" [size]="14" class="mt-0.5 shrink-0" />
          <span>{{ notice() }}</span>
        </p>
      }

      <p class="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        Have an invitation?
        <a routerLink="/accept-invite" class="font-medium text-primary hover:underline"
          >Set your password</a
        >
      </p>
    </app-auth-layout>
  `,
})
export class LoginViewComponent {
  /** Work email as typed. */
  protected readonly email = signal('');

  /** Password as typed. */
  protected readonly password = signal('');

  /** Whether the form has been sent, which is when fields start complaining. */
  private readonly submitted = signal(false);

  /** Whether the sign-in request is in flight. */
  protected readonly isSubmitting = signal(false);

  /** Explanatory message shown after an attempt. */
  protected readonly notice = signal('');

  private readonly destroyRef = inject(DestroyRef);

  /** Pending sign-in timer, cleared if the view goes away first. */
  private pending: ReturnType<typeof setTimeout> | undefined;

  /** Email error, once the form has been sent. */
  protected readonly emailError = computed(() =>
    this.submitted() && this.email().trim() === '' ? 'Enter your work email' : '',
  );

  /** Password error, once the form has been sent. */
  protected readonly passwordError = computed(() =>
    this.submitted() && this.password() === '' ? 'Enter your password' : '',
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.pending));
  }

  /**
   * Pretends to sign in for a moment so the pending state can be reviewed, then
   * reports that the endpoint does not exist yet.
   */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    this.notice.set('');

    if (this.emailError() || this.passwordError()) {
      return;
    }

    this.isSubmitting.set(true);
    this.pending = setTimeout(() => {
      this.isSubmitting.set(false);
      this.notice.set('Sign-in is not connected yet, so nobody was signed in.');
    }, 600);
  }

  /** Reports that password recovery has not been built yet. */
  protected onForgotPassword(): void {
    this.notice.set('Password recovery is not connected yet.');
  }
}
