import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { map, startWith } from 'rxjs';

import { ChatSidebarComponent } from './features/chat/components/chat-sidebar/chat-sidebar.component';
import { LayoutService } from './core/services/layout.service';

/** Elements that can hold focus, used by the drawer's focus trap. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Routes that own the whole screen. Signing in has nothing to do with a
 * conversation list, so the sidebar and the offset it causes are dropped there
 * rather than covered up.
 */
const PLAIN_ROUTES = ['/login', '/register', '/accept-invite'];

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
      <!--
        The backdrop is always present and faded rather than added and removed:
        mounting it on open would make the dimming land in a single frame and
        the whole drawer would read as a jump.
      -->
      <button
        type="button"
        class="fixed inset-0 z-40 cursor-default bg-foreground/40 backdrop-blur-[1px]
          transition-opacity duration-shell ease-out-soft motion-reduce:transition-none"
        [class.opacity-0]="!layout.isBackdropVisible()"
        [class.pointer-events-none]="!layout.isBackdropVisible()"
        [class.hidden]="isPlain()"
        [inert]="!layout.isBackdropVisible()"
        aria-label="Close sidebar"
        (click)="layout.closeSidebar()"
      ></button>

      <aside
        #sidebar
        id="app-sidebar"
        class="fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-hidden shadow-raised
          transition-[width,translate] duration-shell ease-out-soft
          motion-reduce:transition-none lg:translate-x-0 lg:shadow-none"
        [class.w-sidebar]="!layout.isRail()"
        [class.w-rail]="layout.isRail()"
        [class.-translate-x-full]="layout.mode() === 'hidden'"
        [class.hidden]="isPlain()"
        [inert]="layout.mode() === 'hidden'"
      >
        <app-chat-sidebar />
      </aside>

      <main
        id="app-main"
        class="flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-shell
          ease-out-soft motion-reduce:transition-none"
        [class.lg:pl-sidebar]="!layout.isRail() && !isPlain()"
        [class.lg:pl-rail]="layout.isRail() && !isPlain()"
        [class.lg:pl-0]="isPlain()"
      >
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent {
  /** Responsive shell state: breakpoints, collapse preference and drawer. */
  protected readonly layout = inject(LayoutService);

  private readonly router = inject(Router);

  /**
   * Whether the routed view stands on its own. Tracked from the router rather
   * than from route data so a plain screen can be reached directly, and a deep
   * link renders correctly on the first paint.
   */
  protected readonly isPlain = toSignal(
    this.router.events.pipe(
      map(() => PLAIN_ROUTES.includes(this.router.url)),
      startWith(PLAIN_ROUTES.includes(this.router.url)),
    ),
    { initialValue: false },
  );

  /**
   * The drawer element.
   *
   * The ref is on the `<aside>` rather than on `<app-chat-sidebar>`: a ref on a
   * component resolves to that component's instance, not to an `ElementRef`, so
   * `.nativeElement` would be undefined and the `querySelectorAll` below it would
   * match nothing. That is how a focus trap can read as correct and trap nothing
   * at all, so the ref is kept on the element it describes.
   */
  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');

  /** True while the sidebar covers the content and should trap focus. */
  private readonly isDrawerModal = computed(
    () => !this.isPlain() && this.layout.isBackdropVisible(),
  );

  /** Where focus came from when the drawer opened, to give it back on close. */
  private focusBeforeDrawer: HTMLElement | null = null;

  /** The drawer's last modal state, so only the transition is acted on. */
  private wasDrawerModal = false;

  constructor() {
    // A modal drawer has to take focus, or the trap below never engages: it only
    // rewrites Tab at the drawer's first and last control, which focus never
    // reaches if it is still out in the content behind the backdrop. Closing it
    // without handing focus back strands the user at the top of the document.
    //
    // `afterRenderEffect` rather than `effect`, because the drawer is `inert`
    // while it is closed and only reachable once the binding that removes that
    // has been applied, which happens during render.
    afterRenderEffect(() => {
      const modal = this.isDrawerModal();

      // Only the transition matters. Re-focusing on every render would drag focus
      // back to the first control while someone was part way down it, and the
      // close case has to fire even though focus is still sitting inside the
      // drawer that just became inert.
      if (modal === this.wasDrawerModal) {
        return;
      }

      this.wasDrawerModal = modal;

      if (modal) {
        this.focusBeforeDrawer =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.focusableElements()[0]?.focus();

        return;
      }

      const target = this.focusBeforeDrawer;
      this.focusBeforeDrawer = null;

      // The control that opened the drawer may have been navigated away from, in
      // which case there is nowhere to go back to and focus is left alone.
      if (target?.isConnected) {
        target.focus();
      }
    });
  }

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
    return Array.from(
      this.sidebar().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
  }
}
