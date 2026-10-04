import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Toast, ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      @for (toast of toastService.all(); track toast.id) {
        <div
          class="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-xl w-full max-w-sm animate-slide-in"
          [class]="toastClass(toast.type)"
          role="alert"
        >
          <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" [class]="iconClass(toast.type)">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" [attr.d]="iconPath(toast.type)" />
          </svg>
          <span class="flex-1">{{ toast.message }}</span>
          <button
            (click)="toastService.dismiss(toast.id)"
            class="rounded hover:bg-accent p-1 text-muted-foreground"
            aria-label="Dismiss"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
    .animate-slide-in { animation: slide-in 0.3s ease-out; }
  `],
})
export class ToastComponent implements OnInit {
  private readonly _toastService = inject(ToastService);
  protected readonly toastService = this._toastService;

  ngOnInit(): void {
    // Component initializes
  }

  protected toastClass(type: Toast['type']): string {
    switch (type) {
      case 'error':
        return 'border-destructive/50 text-destructive';
      case 'success':
        return 'border-green-500/50 text-green-700 dark:text-green-300';
      case 'info':
      default:
        return 'border-primary/50 text-primary';
    }
  }

  protected iconClass(type: Toast['type']): string {
    switch (type) {
      case 'error':
        return 'text-destructive';
      case 'success':
        return 'text-green-500';
      case 'info':
      default:
        return 'text-primary';
    }
  }

  protected iconPath(type: Toast['type']): string {
    switch (type) {
      case 'error':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'success':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'info':
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }
}