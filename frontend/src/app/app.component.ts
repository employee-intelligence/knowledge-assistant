import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ChatSidebarComponent } from './features/chat/components/chat-sidebar/chat-sidebar.component';
import { LayoutService } from './core/services/layout.service';

/** Elements that can hold focus, used by the drawer's focus trap. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The application shell: the sidebar, the dismissible backdrop, and the routed
 * view. It owns no domain state; the sidebar's presentation is decided by
 * `LayoutService`.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatSidebarComponent, RouterOutlet],
  host: {
    '(keydown.tab)': 'onTab($event)',
  },
  template: `
    <a
      href="#app-main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]
        focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm
        focus:text-primary-foreground"
    >
      Skip to content
    </a>

    <div class="flex h-dvh overflow-hidden bg-background">
      @if (layout.isBackdropVisible()) {
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default bg-foreground/40 backdrop-blur-[1px]"
          aria-label="Close sidebar"
          (click)="layout.closeSidebar()"
        ></button>
      }

      <aside
        id="app-sidebar"
        class="fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col shadow-raised
          transition-[width,transform] duration-300 ease-out-soft
          motion-reduce:transition-none lg:shadow-none"
        [class.w-sidebar]="!layout.isRail()"
        [class.w-rail]="layout.isRail()"
        [class.-translate-x-full]="layout.mode() === 'hidden'"
        [inert]="layout.mode() === 'hidden'"
      >
        <app-chat-sidebar #sidebar />
      </aside>

      <main
        id="app-main"
        class="flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-300
          ease-out-soft motion-reduce:transition-none lg:pl-rail"
        [class.lg:pl-sidebar]="layout.isSidebarInFlow()"
        [class.lg:pl-rail]="!layout.isSidebarInFlow()"
      >
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent {
  /** Responsive shell state: breakpoints, collapse preference and drawer. */
  protected readonly layout = inject(LayoutService);

  private readonly sidebar = viewChild<ElementRef<HTMLElement>>('sidebar');

  /** True while the sidebar covers the content and should trap focus. */
  private readonly isDrawerModal = computed(() => this.layout.isBackdropVisible());

  /**
   * Keeps Tab inside the sidebar while it is a modal drawer, so keyboard users
   * cannot wander into the content hidden behind the backdrop.
   */
  protected onTab(event: Event): void {
    if (!this.isDrawerModal() || !(event instanceof KeyboardEvent) || event.key !== 'Tab') {
      return;
    }

    const focusable = this.focusableElements();

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Focusable controls inside the sidebar, in tab order. */
  private focusableElements(): HTMLElement[] {
    const host = this.sidebar()?.nativeElement;

    return host ? Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
  }
}
