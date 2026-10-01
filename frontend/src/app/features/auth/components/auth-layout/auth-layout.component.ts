import { ChangeDetectionStrategy, Component } from '@angular/core';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { BrandLogoComponent } from '../../../chat/components/brand-logo/brand-logo.component';

/**
 * The frame every signed-out screen sits in: the product mark, a single card,
 * and an honest note that accounts are not connected yet.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandLogoComponent, IconComponent],
  host: {
    class:
      'flex flex-1 flex-col items-center justify-center overflow-y-auto bg-background px-4 py-10',
  },
  template: `
    <div class="flex w-full max-w-md flex-col gap-8">
      <app-brand-logo tone="light" class="self-center" />

      <div class="rounded-lg border border-border bg-card p-6 shadow-card sm:p-8">
        <ng-content />
      </div>

      <p class="flex items-start gap-2 self-center text-center text-xs text-muted-foreground">
        <app-icon name="info" [size]="14" class="mt-0.5 shrink-0" />
        <span class="max-w-xs">
          Design preview. Accounts are not connected yet, so nothing you enter is sent anywhere.
        </span>
      </p>

      <!--
        Spelled as the designs spell it, on both signed-out screens. It is not
        decoration: it tells a reader that this is an internal system, and it
        contradicts the registration form sitting above it, which is the
        contradiction worth settling before the auth service is written.
      -->
      <p class="-mt-4 self-center text-center text-xs text-muted-foreground">
        Protected internal system - SSO enabled
      </p>
    </div>
  `,
})
export class AuthLayoutComponent {}
