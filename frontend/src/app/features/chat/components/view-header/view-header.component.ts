import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { LayoutService } from '../../../../core/services/layout.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent, type IconName } from '../../../../shared/components/icon/icon.component';

/**
 * The header strip every view sits under: the sidebar toggle and the view
 * title, centred.
 *
 * It owns no state of its own; the toggle delegates to `LayoutService`.
 */
@Component({
  selector: 'app-view-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IconComponent],
  host: {
    class:
      'relative flex shrink-0 items-center justify-center gap-3 border-b border-border bg-card px-4 py-4 sm:px-6 lg:px-8',
  },
  template: `
    <button
      app-button
      type="button"
      variant="ghost"
      size="icon"
      class="absolute top-1/2 left-4 -translate-y-1/2 sm:left-6 lg:left-8"
      [attr.aria-label]="layout.toggleLabel()"
      [attr.aria-expanded]="layout.isSidebarVisible()"
      aria-controls="app-sidebar"
      (click)="layout.toggleSidebar()"
    >
      <app-icon [name]="toggleIcon()" [size]="18" />
    </button>

    @if (title()) {
      <h1
        class="min-w-0 truncate px-10 text-center font-headings text-base font-semibold text-foreground sm:text-lg"
      >
        {{ title() }}
      </h1>
    }
  `,
})
export class ViewHeaderComponent {
  /** Layout state, so the toggle always matches what is on screen. */
  protected readonly layout = inject(LayoutService);

  /** Primary heading of the view. */
  readonly title = input('');

  /**
   * Below `lg` the sidebar is a drawer, so the control is a hamburger; on wide
   * screens it toggles the column and reads as a panel.
   */
  protected readonly toggleIcon = computed<IconName>(() =>
    this.layout.isCompact() ? 'menu' : 'panel-left',
  );
}
