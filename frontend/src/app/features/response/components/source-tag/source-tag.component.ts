import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { SourceReference } from '../../../../core/models/message.model';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

/**
 * The citation chip under an answer: which document, which section and which
 * page the answer came from, with a control to open it. Deliberately a single
 * compact line so a long list of sources does not outweigh the answer.
 */
@Component({
  selector: 'app-source-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, IconComponent],
  host: { class: 'block max-w-full' },
  template: `
    <div class="flex w-full max-w-full items-center gap-1.5 rounded-md bg-secondary-soft px-2 py-1">
      <app-icon name="file-text" [size]="12" class="text-primary" />

      <span class="min-w-0 flex-1 truncate text-xs text-foreground" [title]="label()">
        {{ label() }}
      </span>

      <button
        app-button
        type="button"
        variant="subtle"
        size="xs"
        class="shrink-0"
        (click)="viewed.emit(source())"
      >
        View
      </button>
    </div>
  `,
})
export class SourceTagComponent {
  /** The citation to display. */
  readonly source = input.required<SourceReference>();

  /** Emits the citation when the user opens the source document. */
  readonly viewed = output<SourceReference>();

  /** `Staff Handbook · Section 4.2 · Page 12` */
  protected readonly label = computed(() => {
    const source = this.source();

    return `${source.document} · ${source.section} · Page ${source.page}`;
  });
}
