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
 * Key the remembered work email is kept under.
 *
 * "Remember me" cannot remember a session while there is no session to remember,
 * so it remembers the address and leaves the password alone. Storing a password
 * to avoid typing it again would be the wrong trade even when there is one.
 */
const REMEMBERED_EMAIL_KEY = 'knowledge-assistant.remembered-email';

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

        <div class="flex flex-wrap items-center justify-between gap-2">
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
            type="button"
            class="cursor-pointer text-xs font-medium text-primary hover:underline"
            (click)="onForgotPassword()"
          >
            Forgot password?
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

      <p class="mt-6 flex flex-col items-center gap-2 border-t border-border pt-4 text-center
        text-sm text-muted-foreground">
        <span>
          Don't have an account?
          <a routerLink="/register" class="font-medium text-primary hover:underline"
            >Create one</a
          >
        </span>

        <a routerLink="/accept-invite" class="text-xs text-muted-foreground hover:underline">
          Have an invitation? Set your password
        </a>
      </p>
    </app-auth-layout>
  `,
})
export class LoginViewComponent {
  /** Work email as typed. */
  protected readonly email = signal('');

  /** Password as typed. */
  protected readonly password = signal('');

  /** Whether the address should be remembered for next time. */
  protected readonly rememberMe = signal(false);

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

    // Fill the address if it was remembered last time. "Remember me" exists only
    // because it is on the design, and doing nothing with it would be a dead
    // control. Since there is no session, the thing that is safe to remember is
    // the email, and nothing else.
    try {
      const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (remembered && remembered.includes('@')) {
        this.email.set(remembered);
        this.rememberMe.set(true);
      }
    } catch {
      // Storage may be unavailable during rendering in some environments, in
      // which case the best course is to ignore the request to remember and leave
      // the form as it is.
    }
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

  /**
   * Records or forgets the address as the box is ticked.
   *
   * Applied on change rather than on submit so un-ticking takes effect at once:
   * the point of un-ticking the box is to stop being remembered, and holding the
   * address until the next sign-in attempt would keep it longer than asked.
   */
  protected onRememberMe(event: Event): void {
    this.rememberMe.set((event.target as HTMLInputElement).checked);

    try {
      if (this.rememberMe()) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, this.email().trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Nothing useful to say here. The sign-in attempt itself is what the user
      // came for, and failing to remember an address is not worth an error over
      // it.
    }
  }
}
