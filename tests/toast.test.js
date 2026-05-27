import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOAST_DURATION_MS } from '../js/constants.js';
import { initToast, showToast } from '../js/toast.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('toast', () => {
  it('adds and removes a toast element', () => {
    const container = document.createElement('div');
    initToast(container);

    showToast('Saved', 'success');
    expect(container.children.length).toBe(1);

    const toastEl = container.children[0];
    expect(toastEl.className).toContain('toast success');
    expect(toastEl.textContent).toBe('Saved');

    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toastEl.classList.contains('fade-out')).toBe(true);

    toastEl.dispatchEvent(new Event('animationend'));
    expect(container.children.length).toBe(0);
  });

  it('does nothing if toast container is not initialized', () => {
    initToast(null);
    expect(() => showToast('No crash')).not.toThrow();
  });
});
