import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ViewerService } from '../../../../core/services/viewer.service';
import type { Role } from '../../../../core/models/viewer.model';
import { ROLE_LABELS } from '../../../../core/models/viewer.model';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/** The roles a reviewer can flip between. */
const ROLES: Role[] = ['employee', 'administrator'];

/**
 * A two-way switch for the viewer role. Authentication is not built yet, so this
 * is how both signed-in experiences are reviewed: it changes nothing else.
 */
@Component({
  selector: 'app-role-preview-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'flex flex-col gap-1.5 px-2' },
  template: `
    <span class="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">
      Preview role
    </span>

    <div class="flex gap-0.5 rounded-md bg-white/10 p-0.5">
      @for (option of roles; track option) {
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1
            text-xs font-medium transition-colors"
          [class]="optionClasses(option)"
          [attr.aria-pressed]="viewer.role() === option"
          (click)="viewer.setPreviewRole(option)"
        >
          <app-icon [name]="option === 'employee' ? 'user' : 'shield'" [size]="13" />
          {{ labels[option] }}
        </button>
      }
    </div>
  `,
})
export class RolePreviewToggleComponent {
  /** Viewer whose role is being previewed. */
  protected readonly viewer = inject(ViewerService);

  /** The roles offered by the switch. */
  protected readonly roles = ROLES;

  /** Human-readable role names. */
  protected readonly labels = ROLE_LABELS;

  /** Inactive options stay quiet; the active one is lifted off the dark rail. */
  protected optionClasses(option: Role): string {
    return option === this.viewer.role()
      ? 'bg-white text-primary'
      : 'text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground';
  }
}
