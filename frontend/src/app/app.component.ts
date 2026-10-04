import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <a
      href="#app-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]
        focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm
        focus:text-primary-foreground"
    >
      Skip to content
    </a>

    <main id="app-main" class="flex min-h-dvh flex-col bg-background">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
}