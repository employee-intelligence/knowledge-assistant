import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Surface the mark sits on, which decides its wordmark colours. */
export type BrandLogoTone = 'sidebar' | 'light';

/** Wordmark colours per surface. */
const WORDMARK_CLASSES: Record<BrandLogoTone, { name: string; qualifier: string }> = {
  sidebar: { name: 'text-sidebar-foreground', qualifier: 'text-sidebar-muted' },
  light: { name: 'text-foreground', qualifier: 'text-muted-foreground' },
};

/**
 * The product mark: an initials tile plus the two-line product name.
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
        <span class="truncate font-headings font-semibold text-sm" [class]="nameClasses()">
          {{ productName() }}
        </span>
        <span
          class="truncate font-headings text-sm font-light tracking-wide"
          [class]="qualifierClasses()"
        >
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

  /** Surface the mark sits on: the dark sidebar or a light page. */
  readonly tone = input<BrandLogoTone>('sidebar');

  /** Resolved utility classes for the mark tile. */
  protected sizeClasses(): string {
    return 'w-9 h-9 text-sm';
  }

  /** Colour of the first wordmark line. */
  protected readonly nameClasses = computed(() => WORDMARK_CLASSES[this.tone()].name);

  /** Colour of the second wordmark line. */
  protected readonly qualifierClasses = computed(
    () => WORDMARK_CLASSES[this.tone()].qualifier,
  );
}
