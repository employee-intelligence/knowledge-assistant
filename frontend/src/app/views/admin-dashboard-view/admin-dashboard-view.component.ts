import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import {
  MOCK_ADMIN_ACTIVITY,
  MOCK_ADMIN_STATS,
  MOCK_DOCUMENTS,
  MOCK_QUESTION_LOGS,
} from '../../core/data/mock-admin.data';
import {
  QUESTION_OUTCOME_LABELS,
  type QuestionOutcome,
} from '../../core/models/question-log.model';
import { ViewerService } from '../../core/services/viewer.service';
import { AdminAccessRequiredComponent } from '../../features/admin/components/admin-access-required/admin-access-required.component';
import { StatCardComponent } from '../../features/admin/components/stat-card/stat-card.component';
import { ViewHeaderComponent } from '../../features/chat/components/view-header/view-header.component';
import { BadgeComponent, type BadgeTone } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { formatRelativeTime } from '../../shared/utils/relative-time.util';

/** Colour per outcome, so a question that went wrong is visible in the list. */
const OUTCOME_TONES: Record<QuestionOutcome, BadgeTone> = {
  answered: 'info',
  'not-found': 'warning',
  failed: 'danger',
};

/**
 * The three administration screens, as a tab bar.
 *
 * A tab bar rather than a row of link cards: both were navigation to the same two
 * places, and having two systems for one job means the reader has to work out
 * which is the real one. The tabs carry the position, so the current screen is
 * visible at all times.
 */
const TABS: { label: string; path: string }[] = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Documents', path: '/admin/documents' },
  { label: 'Question logs', path: '/admin/questions' },
];

/** The administrator's landing screen: the shape of the knowledge base at a glance. */
@Component({
  selector: 'app-admin-dashboard-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminAccessRequiredComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    RouterLink,
    RouterLinkActive,
    StatCardComponent,
    ViewHeaderComponent,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <app-view-header title="Admin Dashboard" />

    @if (viewer.isAdministrator()) {
      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div class="mx-auto w-full max-w-5xl">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <p class="text-sm text-muted-foreground">
              Monitor your knowledge base and employee questions.
            </p>

            <!--
              Goes to the documents screen rather than opening a dialog here: the
              upload panel lives there, and a second one would be the same control
              in two places with the two copies drifting apart.
            -->
            <a app-button routerLink="/admin/documents" class="shrink-0">
              <app-icon name="upload" [size]="16" />
              <span>Upload document</span>
            </a>
          </div>

          <nav class="mt-5 flex gap-1 border-b border-border" aria-label="Administration sections">
            @for (tab of tabs; track tab.path) {
              <a
                [routerLink]="tab.path"
                routerLinkActive="border-primary text-foreground"
                [routerLinkActiveOptions]="{ exact: true }"
                class="-mb-px cursor-pointer border-b-2 border-transparent px-3 py-2
                  text-sm font-medium text-muted-foreground transition-colors
                  hover:border-border hover:text-foreground"
              >
                {{ tab.label }}
              </a>
            }
          </nav>

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

          <div class="mt-8 grid gap-4 lg:grid-cols-2">
            <section class="rounded-lg border border-border bg-card p-4">
              <h2 class="font-headings text-sm font-semibold text-foreground">Recent questions</h2>

              <ul class="mt-3 flex flex-col">
                @for (log of recentLogs(); track log.id) {
                  <li class="flex items-start gap-2 border-b border-border py-2.5 last:border-b-0">
                    <app-badge [tone]="outcomeTones[log.outcome]" class="shrink-0">
                      {{ outcomeLabels[log.outcome] }}
                    </app-badge>
                    <p class="min-w-0 flex-1 text-sm text-foreground">{{ log.question }}</p>
                  </li>
                }
              </ul>

              <a
                routerLink="/admin/questions"
                class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary
                  hover:underline"
              >
                View all logs
                <app-icon name="arrow-up-right" [size]="13" />
              </a>
            </section>

            <section class="rounded-lg border border-border bg-card p-4">
              <h2 class="font-headings text-sm font-semibold text-foreground">Indexing status</h2>

              <div class="mt-3 flex flex-col gap-2.5">
                <p class="flex items-center gap-2 text-sm text-foreground">
                  <app-icon name="check-circle-2" [size]="15" class="shrink-0 text-primary" />
                  {{ indexedCount() }} documents indexed
                </p>

                @if (processingCount() > 0) {
                  <p class="flex items-center gap-2 text-sm text-foreground">
                    <app-icon
                      name="loader-2"
                      [size]="15"
                      class="shrink-0 animate-spin text-warning"
                    />
                    {{ processingCount() }} still indexing
                  </p>
                }

                @if (failedCount() > 0) {
                  <p class="flex items-center gap-2 text-sm text-foreground">
                    <app-icon name="alert-triangle" [size]="15" class="shrink-0 text-danger" />
                    {{ failedCount() }} need attention
                  </p>
                }
              </div>

              <!--
                The figure is derived from the documents listed above, not asserted,
                so an administrator can check it against the rows.
              -->
              <div class="mt-4 border-t border-border pt-3">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-xs text-muted-foreground">Knowledge base health</span>
                  <span class="text-sm font-semibold tabular-nums text-foreground">
                    {{ health() }}%
                  </span>
                </div>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary" [style.width.%]="health()"></div>
                </div>
              </div>

              <a
                routerLink="/admin/documents"
                class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary
                  hover:underline"
              >
                Manage documents
                <app-icon name="arrow-up-right" [size]="13" />
              </a>
            </section>
          </div>

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

  /** The administration screens, as tabs. */
  protected readonly tabs = TABS;

  /** Recent events. */
  protected readonly activity = MOCK_ADMIN_ACTIVITY;

  /** Colours for each question outcome, matching the log list. */
  protected readonly outcomeTones = OUTCOME_TONES;

  /** Labels for each question outcome. */
  protected readonly outcomeLabels = QUESTION_OUTCOME_LABELS;

  /** The newest questions, which is what an administrator opens this screen for. */
  protected readonly recentLogs = computed(() => MOCK_QUESTION_LOGS.slice(0, 4));

  /** Documents that are ready to answer from. */
  protected readonly indexedCount = computed(
    () => MOCK_DOCUMENTS.filter((document) => document.status === 'indexed').length,
  );

  /** Documents still being embedded. */
  protected readonly processingCount = computed(
    () => MOCK_DOCUMENTS.filter((document) => document.status === 'processing').length,
  );

  /** Documents whose ingest failed, which is what needs a person. */
  protected readonly failedCount = computed(
    () => MOCK_DOCUMENTS.filter((document) => document.status === 'failed').length,
  );

  /**
   * The share of settled documents ready to answer from, as a whole percentage.
   *
   * Counted rather than asserted, so the figure can be traced back to the rows
   * above it. Documents still indexing are left out of the denominator entirely:
   * a gap that is expected to close on its own is not a problem, and charging an
   * administrator for it would train them to ignore the number. One that failed is
   * counted, because nothing else will close it.
   *
   * With nothing settled yet there is no share to report, and 0 is the safer
   * direction to be wrong in: the line above says what is still indexing.
   */
  protected readonly health = computed(() => {
    const settled = this.indexedCount() + this.failedCount();

    return settled === 0 ? 0 : Math.round((this.indexedCount() / settled) * 100);
  });

  /** When an event happened, as a reader would say it. */
  protected relativeTime(isoDate: string): string {
    return formatRelativeTime(isoDate);
  }
}
