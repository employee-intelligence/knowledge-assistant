import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The product mark: an initials tile plus the two-line product name. Colours are
 * supplied by the parent so it works on the dark sidebar and on light surfaces.
 */
@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-3' },
  template: `
    <div
      class="flex shrink-0 items-center justify-center rounded-md bg-primary font-headings
        font-bold text-primary-foreground"
      [class]="sizeClasses()"
    >
      {{ mark() }}
    </div>
    @if (showWordmark()) {
      <div class="flex min-w-0 flex-col leading-none">
        <span class="truncate font-headings font-semibold text-sm text-sidebar-foreground">
          {{ productName() }}
        </span>
        <span class="truncate font-headings text-sm font-light tracking-wide text-sidebar-muted">
          {{ productQualifier() }}
        </span>
      </div>
    }
  `,
})
export class BrandLogoComponent {
  /** Initials shown in the mark tile. */
  readonly mark = input('IK');

  /** First line of the wordmark. */
  readonly productName = input('Internal Knowledge');

  /** Second line of the wordmark. */
  readonly productQualifier = input('Assistant');

  /** Hides the wordmark, leaving the mark tile alone (icon rail). */
  readonly showWordmark = input(true);

  /** Resolved utility classes for the mark tile. */
  protected sizeClasses(): string {
    return 'w-9 h-9 text-sm';
  }
}
