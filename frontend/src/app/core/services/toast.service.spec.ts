import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toast = TestBed.inject(ToastService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error toast with red styling', () => {
    toast.error('Invalid email or password');

    const all = toast.all();
    expect(all).toHaveLength(1);
    expect(all[0].message).toBe('Invalid email or password');
    expect(all[0].type).toBe('error');
  });

  it('dismisses a toast after its duration', () => {
    toast.success('Signed in successfully', 5000);

    expect(toast.all()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(toast.all()).toHaveLength(0);
  });

  it('dismisses a single toast by id', () => {
    toast.error('First');
    toast.error('Second');

    toast.dismiss(toast.all()[0].id);

    expect(toast.all().map((t) => t.message)).toEqual(['Second']);
  });
});
