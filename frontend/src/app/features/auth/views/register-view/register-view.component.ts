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
 * Account creation, for somebody who has no account yet.
 *
 * The design draws this as a self-service form next to a footer that reads "SSO
 * enabled", which is a contradiction worth naming rather than quietly picking a
 * side on: if the workspace really does enforce single sign-on, this form is not
 * how anyone joins. It is built as drawn and collects nothing, because an account
 * created by a form that keeps no result is not an account.
 */
@Component({
  selector: 'app-register-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthLayoutComponent, ButtonComponent, FormFieldComponent, IconComponent, RouterLink],
  template: `
    <app-auth-layout>
      <h1 class="font-headings text-xl font-semibold text-foreground">Create your account</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Join your company workspace to ask questions with cited answers.
      </p>

      <form class="mt-6 flex flex-col gap-4" (submit)="onSubmit($event)">
        <app-form-field
          label="Full name"
          icon="user"
          autocomplete="name"
          placeholder="Sarah Mensah"
          [required]="true"
          [value]="name()"
          [error]="nameError()"
          (valueChange)="name.set($event)"
        />

        <app-form-field
          label="Work email"
          type="email"
          icon="mail"
          autocomplete="email"
          placeholder="name@company.com"
          [required]="true"
          [value]="email()"
          [error]="emailError()"
          (valueChange)="email.set($event)"
        />

        <app-form-field
          label="Password"
          type="password"
          icon="lock"
          autocomplete="new-password"
          placeholder="At least 8 characters"
          [required]="true"
          [value]="password()"
          [error]="passwordError()"
          (valueChange)="password.set($event)"
        />

        <app-form-field
          label="Confirm"
          type="password"
          icon="lock"
          autocomplete="new-password"
          placeholder="Repeat your password"
          [required]="true"
          [value]="confirmation()"
          [error]="confirmationError()"
          (valueChange)="confirmation.set($event)"
        />

        <button app-button type="submit" size="lg" [fullWidth]="true" [disabled]="isSubmitting()">
          @if (isSubmitting()) {
            <app-icon name="loader-2" [size]="16" class="animate-spin" />
            <span>Creating account…</span>
          } @else {
            <span>Create account</span>
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
        Already have an account?
        <a routerLink="/login" class="font-medium text-primary hover:underline">Log in</a>
      </p>
    </app-auth-layout>
  `,
})
export class RegisterViewComponent {
  /** Full name as typed. */
  protected readonly name = signal('');

  /** Work email as typed. */
  protected readonly email = signal('');

  /** Password as typed. */
  protected readonly password = signal('');

  /** Confirmation as typed. */
  protected readonly confirmation = signal('');

  /** Whether the form has been sent, which is when fields start complaining. */
  private readonly submitted = signal(false);

  /** Whether the request is in flight. */
  protected readonly isSubmitting = signal(false);

  /** Explanatory message shown after an attempt. */
  protected readonly notice = signal('');

  private readonly destroyRef = inject(DestroyRef);

  /** Pending request timer, cleared if the view goes away first. */
  private pending: ReturnType<typeof setTimeout> | undefined;

  /** Name error, once the form has been sent. */
  protected readonly nameError = computed(() =>
    this.submitted() && this.name().trim() === '' ? 'Enter your name' : '',
  );

  /**
   * Email error, once the form has been sent.
   *
   * Only a missing `@` is rejected. A stricter pattern would refuse the addresses
   * that are real, and a form that blocks a valid address is worse than one that
   * accepts something it should have caught.
   */
  protected readonly emailError = computed(() => {
    if (!this.submitted()) {
      return '';
    }

    const value = this.email().trim();
    if (value === '') {
      return 'Enter your work email';
    }

    return value.includes('@') ? '' : 'That does not look like an email address';
  });

  /** Password error, once the form has been sent. */
  protected readonly passwordError = computed(() => {
    if (!this.submitted()) {
      return '';
    }

    if (this.password() === '') {
      return 'Choose a password';
    }

    return this.password().length < 8 ? 'Use at least 8 characters' : '';
  });

  /**
   * Confirmation error.
   *
   * Compared after length, so an empty confirmation says it is missing rather than
   * that it does not match: a mismatch implies there was something to match.
   */
  protected readonly confirmationError = computed(() => {
    if (!this.submitted()) {
      return '';
    }

    if (this.confirmation() === '') {
      return 'Repeat your password';
    }

    return this.confirmation() === this.password() ? '' : 'Those passwords do not match';
  });

  /** Whether anything is wrong, which is what stops the request. */
  private readonly hasError = computed(
    () =>
      this.nameError() !== '' ||
      this.emailError() !== '' ||
      this.passwordError() !== '' ||
      this.confirmationError() !== '',
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.pending));
  }

  /**
   * Pretends to create the account for a moment so the pending state can be
   * reviewed, then reports that nothing was created.
   */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    this.notice.set('');

    if (this.hasError()) {
      return;
    }

    this.isSubmitting.set(true);
    this.pending = setTimeout(() => {
      this.isSubmitting.set(false);
      this.notice.set('Accounts are not connected yet, so no account was created.');
    }, 600);
  }
}
