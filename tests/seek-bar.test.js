import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/audio-engine.js', () => ({
  seekTo: vi.fn(),
}));

import state from '../js/state.js';
import { drawSeekDensity, initSeekInteraction } from '../js/seek-bar.js';
import { seekTo } from '../js/audio-engine.js';

beforeEach(() => {
  vi.clearAllMocks();
  state.midi = { tracks: [] };
  state.totalDuration = 100;
  state.notes = [];
});

describe('drawSeekDensity', () => {
  it('draws density bars when notes are present', () => {
    state.notes = [
      { time: 10, velocity: 0.5 },
      { time: 30, velocity: 1.0 },
      { time: 30, velocity: 0.5 },
    ];

    const ctx = {
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(() => ctx),
    };
    const container = {
      getBoundingClientRect: () => ({ width: 200, height: 20 }),
    };

    drawSeekDensity(canvas, container);

    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(0);
  });

  it('returns early when no note data exists', () => {
    state.notes = [];

    const ctx = {
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(() => ctx),
    };
    const container = {
      getBoundingClientRect: () => ({ width: 200, height: 20 }),
    };

    drawSeekDensity(canvas, container);

    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe('initSeekInteraction', () => {
  it('seeks on mousedown and while dragging', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 100, width: 200 });

    initSeekInteraction(container);

    container.dispatchEvent(new MouseEvent('mousedown', { clientX: 200 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260 }));

    expect(seekTo).toHaveBeenCalledTimes(2);
    expect(seekTo).toHaveBeenNthCalledWith(1, 50);
    expect(seekTo).toHaveBeenNthCalledWith(2, 75);
  });

  it('does nothing when no midi is loaded', () => {
    state.midi = null;
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 100, width: 200 });

    initSeekInteraction(container);
    container.dispatchEvent(new MouseEvent('mousedown', { clientX: 200 }));

    expect(seekTo).not.toHaveBeenCalled();
  });

  it('seeks on touch start and while dragging', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 100, width: 200 });

    initSeekInteraction(container);

    container.dispatchEvent(new TouchEvent('touchstart', {
      touches: [{ clientX: 200 }],
      cancelable: true,
    }));
    container.dispatchEvent(new TouchEvent('touchmove', {
      touches: [{ clientX: 250 }],
      cancelable: true,
    }));
    container.dispatchEvent(new TouchEvent('touchend', {}));
    container.dispatchEvent(new TouchEvent('touchmove', {
      touches: [{ clientX: 260 }],
      cancelable: true,
    }));

    expect(seekTo).toHaveBeenCalledTimes(2);
    expect(seekTo).toHaveBeenNthCalledWith(1, 50);
    expect(seekTo).toHaveBeenNthCalledWith(2, 75);
  });
});
