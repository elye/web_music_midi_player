/* ==========================================================
   UTILS — Pure helper functions (no side effects)
   ========================================================== */

import { NOTE_NAMES } from './constants.js';

/** Convert MIDI note number to human-readable name (e.g. 60 → "C4") */
export function noteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

/** Returns true if the given MIDI note is a black key */
export function isBlackKey(midi) {
  const n = midi % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

/** Format seconds to mm:ss.ms display string */
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const whole = Math.floor(secs);
  const ms = Math.floor((secs - whole) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Clamp a value between lo and hi */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Convert MIDI note number to frequency in Hz */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Set up a canvas for HiDPI rendering.
 * Returns { ctx, w, h } where w/h are CSS pixel dimensions.
 */
export function setupCanvas(canvas, container) {
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

/** Draw a rounded rectangle path on the canvas context */
export function roundRect(ctx, x, y, w, h, r) {
  if (w < 0 || h < 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
