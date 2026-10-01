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

/** One rule a new password has to satisfy. */
interface PasswordRule {
  label: string;
  met: boolean;
}

/**
 * The screen an invited person lands on from their email link: it confirms who
 * the invitation is for and collects the password that will replace it.
 */
@Component({
  selector: 'app-accept-invite-view',
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
      <p
        class="mb-5 flex items-start gap-2 rounded-md bg-secondary-soft px-3 py-2 text-xs
          text-secondary"
      >
        <app-icon name="mail" [size]="14" class="mt-0.5 shrink-0" />
        <span>
          Invitation sent by Kwame Osei. Your account is created as soon as a password is set.
        </span>
      </p>

      <h1 class="font-headings text-xl font-semibold text-foreground">Set your password</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        You will sign in with this password from then on.
      </p>

      <form class="mt-6 flex flex-col gap-4" (submit)="onSubmit($event)">
        <app-form-field
          label="Full name"
          icon="user"
          autocomplete="name"
          placeholder="Ama Konadu"
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
          [required]="true"
          [value]="email()"
          [error]="emailError()"
          (valueChange)="email.set($event)"
        />

        <div>
          <app-form-field
            label="New password"
            type="password"
            icon="lock"
            autocomplete="new-password"
            placeholder="Choose a password"
            [required]="true"
            [value]="password()"
            [error]="passwordError()"
            (valueChange)="password.set($event)"
          />

          <ul class="mt-3 flex flex-col gap-1.5">
            @for (rule of rules(); track rule.label) {
              <li class="flex items-center gap-2 text-xs" [class]="ruleClasses(rule.met)">
                <app-icon [name]="rule.met ? 'check-circle-2' : 'clock'" [size]="14" />
                <span>{{ rule.label }}</span>
              </li>
            }
          </ul>
        </div>

        <app-form-field
          label="Confirm password"
          type="password"
          icon="lock"
          autocomplete="new-password"
          placeholder="Type it again"
          [required]="true"
          [value]="confirmation()"
          [error]="confirmationError()"
          (valueChange)="confirmation.set($event)"
        />

        <button
          app-button
          type="submit"
          size="lg"
          [fullWidth]="true"
          [disabled]="isSubmitting()"
        >
          @if (isSubmitting()) {
            <app-icon name="loader-2" [size]="16" class="animate-spin" />
            <span>Saving…</span>
          } @else {
            <span>Set password</span>
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
        Already have a password?
        <a routerLink="/login" class="font-medium text-primary hover:underline">Sign in</a>
      </p>
    </app-auth-layout>
  `,
})
export class AcceptInviteViewComponent {
  /** Full name as typed. */
  protected readonly name = signal('Ama Konadu');

  /** Work email the invitation was sent to. */
  protected readonly email = signal('ama.konadu@acmetech.example');

  /** Chosen password. */
  protected readonly password = signal('');

  /** Repeated password. */
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

  /** The rules the new password has to satisfy, and whether each is met. */
  protected readonly rules = computed<PasswordRule[]>(() => {
    const password = this.password();

    return [
      { label: 'At least 12 characters', met: password.length >= 12 },
      { label: 'At least one number', met: /[0-9]/.test(password) },
      { label: 'At least one symbol', met: /[^A-Za-z0-9]/.test(password) },
    ];
  });

  /** Whether every password rule is satisfied. */
  private readonly isPasswordValid = computed(() => this.rules().every((rule) => rule.met));

  /** Name error, once the form has been sent. */
  protected readonly nameError = computed(() =>
    this.submitted() && this.name().trim() === '' ? 'Enter your full name' : '',
  );

  /** Email error, once the form has been sent. */
  protected readonly emailError = computed(() =>
    this.submitted() && this.email().trim() === '' ? 'Enter your work email' : '',
  );

  /** Password error, once the form has been sent. */
  protected readonly passwordError = computed(() =>
    this.submitted() && !this.isPasswordValid()
      ? 'Choose a password that satisfies every rule below'
      : '',
  );

  /** Mismatch error, once the form has been sent. */
  protected readonly confirmationError = computed(() => {
    if (!this.submitted()) {
      return '';
    }
    if (this.confirmation() === '') {
      return 'Type your password again';
    }

    return this.confirmation() === this.password() ? '' : 'Passwords do not match';
  });

  /** Colour of a rule line: met rules pick up the brand, unmet ones stay muted. */
  protected ruleClasses(met: boolean): string {
    return met ? 'text-primary' : 'text-muted-foreground';
  }

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.pending));
  }

  /**
   * Pretends to save for a moment so the pending state can be reviewed, then
   * reports that the endpoint does not exist yet.
   */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    this.notice.set('');

    if (this.hasErrors()) {
      return;
    }

    this.isSubmitting.set(true);
    this.pending = setTimeout(() => {
      this.isSubmitting.set(false);
      this.notice.set('Invitations are not connected yet, so no account was created.');
    }, 600);
  }

  /** Whether any field is currently complaining. */
  private hasErrors(): boolean {
    return Boolean(
      this.nameError() || this.emailError() || this.passwordError() || this.confirmationError(),
    );
  }
}
