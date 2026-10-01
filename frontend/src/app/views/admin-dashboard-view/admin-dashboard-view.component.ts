import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MOCK_ADMIN_ACTIVITY, MOCK_ADMIN_STATS } from '../../core/data/mock-admin.data';
import { ViewerService } from '../../core/services/viewer.service';
import { AdminAccessRequiredComponent } from '../../features/admin/components/admin-access-required/admin-access-required.component';
import { StatCardComponent } from '../../features/admin/components/stat-card/stat-card.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { IconComponent, type IconName } from '../../shared/components/icon/icon.component';
import { formatRelativeTime } from '../../shared/utils/relative-time.util';

/** The two areas an administrator can drill into from here. */
const SHORTCUTS: { label: string; description: string; path: string; icon: IconName }[] = [
  {
    label: 'Documents',
    description: 'Upload, re-index and remove the policies the assistant answers from.',
    path: '/admin/documents',
    icon: 'file-text',
  },
  {
    label: 'Question logs',
    description: 'Review what people asked and which questions went unanswered.',
    path: '/admin/questions',
    icon: 'message-square-text',
  },
];

/** The administrator's landing screen: the shape of the knowledge base at a glance. */
@Component({
  selector: 'app-admin-dashboard-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminAccessRequiredComponent,
    IconComponent,
    RouterLink,
    StatCardComponent,
    ViewHeaderComponent,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <app-view-header title="Administration" />

    @if (viewer.isAdministrator()) {
      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div class="mx-auto w-full max-w-5xl">
          <p class="text-sm text-muted-foreground">
            How the knowledge base is doing, and what needs attention.
          </p>

          <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            @for (stat of stats; track stat.label) {
              <app-stat-card
                [label]="stat.label"
                [value]="stat.value"
                [detail]="stat.detail"
                [icon]="stat.icon"
              />
            }
          </div>

          <section class="mt-8">
            <h2 class="font-headings text-sm font-semibold text-foreground">Manage</h2>

            <div class="mt-3 grid gap-4 sm:grid-cols-2">
              @for (shortcut of shortcuts; track shortcut.path) {
                <a
                  [routerLink]="shortcut.path"
                  class="flex items-start gap-3 rounded-lg border border-border bg-card p-4
                    shadow-subtle transition-colors hover:border-primary/30 hover:bg-secondary-soft/40"
                >
                  <span
                    class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted
                      text-muted-foreground"
                  >
                    <app-icon [name]="shortcut.icon" [size]="16" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-foreground">
                      {{ shortcut.label }}
                    </span>
                    <span class="mt-1 block text-xs text-muted-foreground">
                      {{ shortcut.description }}
                    </span>
                  </span>
                  <app-icon
                    name="arrow-up-right"
                    [size]="16"
                    class="mt-0.5 shrink-0 text-muted-foreground"
                  />
                </a>
              }
            </div>
          </section>

          <section class="mt-8 pb-4">
            <h2 class="font-headings text-sm font-semibold text-foreground">Recent activity</h2>

            <ul class="mt-3 overflow-hidden rounded-lg border border-border bg-card">
              @for (activity of activity; track activity.id) {
                <li
                  class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <app-icon name="clock" [size]="14" class="shrink-0 text-muted-foreground" />
                  <p class="min-w-0 flex-1 truncate text-sm text-foreground">
                    <span class="font-medium">{{ activity.actor }}</span>
                    {{ activity.summary }}
                  </p>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ relativeTime(activity.createdAt) }}
                  </span>
                </li>
              }
            </ul>
          </section>
        </div>
      </div>
    } @else {
      <app-admin-access-required />
    }
  `,
})
export class AdminDashboardViewComponent {
  /** The viewer, which decides whether this area is open at all. */
  protected readonly viewer = inject(ViewerService);

  /** Headline numbers. */
  protected readonly stats = MOCK_ADMIN_STATS;

  /** Areas to drill into. */
  protected readonly shortcuts = SHORTCUTS;

  /** Recent events. */
  protected readonly activity = MOCK_ADMIN_ACTIVITY;

  /** When an event happened, as a reader would say it. */
  protected relativeTime(isoDate: string): string {
    return formatRelativeTime(isoDate);
  }
}
