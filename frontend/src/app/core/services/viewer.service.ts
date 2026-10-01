import { Injectable, computed, signal } from '@angular/core';

import { toInitials } from '../../shared/utils/initials.util';
import { MOCK_VIEWER, type Role, type Viewer } from '../models/viewer.model';

/**
 * Holds the person the app is rendered for. There is no authentication yet, so
 * the viewer starts as a fixed mock and the role can be previewed from the
 * sidebar to review both the employee and administrator experiences.
 */
@Injectable({ providedIn: 'root' })
export class ViewerService {
  private readonly viewerState = signal<Viewer>(MOCK_VIEWER);

  readonly viewer = this.viewerState.asReadonly();
  readonly role = computed(() => this.viewerState().role);
  readonly isAdministrator = computed(() => this.role() === 'administrator');
  readonly initials = computed(() => toInitials(this.viewerState().name));

  /** Swaps the active role so a reviewer can preview the other experience. */
  setPreviewRole(role: Role): void {
    this.viewerState.update((viewer) => ({ ...viewer, role }));
  }
}
