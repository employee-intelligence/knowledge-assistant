import { Injectable, signal } from '@angular/core';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  readonly all = this.toasts.asReadonly();

  private static generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  show(message: string, type: ToastType = 'info', duration = 5000): void {
    const id = ToastService.generateId();
    this.toasts.update((toasts) => [...toasts, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  error(message: string, duration = 5000): void {
    this.show(message, 'error', duration);
  }

  success(message: string, duration = 5000): void {
    this.show(message, 'success', duration);
  }

  info(message: string, duration = 5000): void {
    this.show(message, 'info', duration);
  }

  dismiss(id: string): void {
    this.toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  clear(): void {
    this.toasts.set([]);
  }
}