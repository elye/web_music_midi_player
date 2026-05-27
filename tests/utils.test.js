import { describe, expect, it, vi } from 'vitest';

import {
  clamp,
  formatTime,
  isBlackKey,
  midiToFreq,
  noteName,
  roundRect,
  setupCanvas,
} from '../js/utils.js';

describe('utils', () => {
  it('formats note names from MIDI values', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C♯4');
    expect(noteName(69)).toBe('A4');
  });

  it('detects black and white keys', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(62)).toBe(false);
    expect(isBlackKey(70)).toBe(true);
  });

  it('formats seconds as mm:ss.mmm', () => {
    expect(formatTime(0)).toBe('00:00.000');
    expect(formatTime(65.123)).toBe('01:05.123');
    expect(formatTime(-2)).toBe('00:00.000');
    expect(formatTime(Number.NaN)).toBe('00:00.000');
  });

  it('clamps values to a range', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-1, 1, 10)).toBe(1);
    expect(clamp(22, 1, 10)).toBe(10);
  });

  it('converts MIDI notes to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
  });

  it('sets up HiDPI canvas dimensions and scaling', () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2,
      configurable: true,
    });

    const ctx = { scale: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(() => ctx),
    };
    const container = {
      getBoundingClientRect: () => ({ width: 120, height: 40 }),
    };

    const result = setupCanvas(canvas, container);

    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(80);
    expect(canvas.style.width).toBe('120px');
    expect(canvas.style.height).toBe('40px');
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(result.w).toBe(120);
    expect(result.h).toBe(40);

    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDpr,
      configurable: true,
    });
  });

  it('draws a rounded rectangle path when dimensions are valid', () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
    };

    roundRect(ctx, 0, 0, 10, 8, 3);

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
  });
});
