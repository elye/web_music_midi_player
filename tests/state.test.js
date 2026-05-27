import { describe, expect, it, vi } from 'vitest';

import state from '../js/state.js';

describe('state store', () => {
  it('has expected default values', () => {
    expect(state.midi).toBeNull();
    expect(state.fileName).toBe('');
    expect(Array.isArray(state.notes)).toBe(true);
    expect(state.totalDuration).toBe(0);
    expect(state.originalBpm).toBe(120);
    expect(state.isPlaying).toBe(false);
    expect(state.transpose).toBe(0);
    expect(state.activeNotes instanceof Set).toBe(true);
  });

  it('emits events to all listeners', () => {
    const event = `evt-${Date.now()}-${Math.random()}`;
    const a = vi.fn();
    const b = vi.fn();

    state.on(event, a);
    state.on(event, b);
    state.emit(event, { ok: true });

    expect(a).toHaveBeenCalledWith({ ok: true });
    expect(b).toHaveBeenCalledWith({ ok: true });

    state.off(event, a);
    state.off(event, b);
  });

  it('supports unsubscribing listeners', () => {
    const event = `evt-off-${Date.now()}-${Math.random()}`;
    const cb = vi.fn();

    state.on(event, cb);
    state.off(event, cb);
    state.emit(event, 123);

    expect(cb).not.toHaveBeenCalled();
  });
});
