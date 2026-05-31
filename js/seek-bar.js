/* ==========================================================
   SEEK BAR — Density visualization & scrub interaction
   ========================================================== */

import state from './state.js';
import { clamp } from './utils.js';
import { seekTo } from './audio-engine.js';

/**
 * Draw the note-density histogram on the seek bar canvas.
 */
export function drawSeekDensity(canvas, containerEl) {
  const rect = containerEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!state.notes.length || state.totalDuration <= 0) return;

  const buckets = Math.max(1, Math.floor(rect.width / 2));
  const density = new Float32Array(buckets);
  let maxDensity = 0;

  for (const note of state.notes) {
    const bucket = Math.floor((note.time / state.totalDuration) * buckets);
    if (bucket >= 0 && bucket < buckets) {
      density[bucket] += note.velocity;
      if (density[bucket] > maxDensity) maxDensity = density[bucket];
    }
  }

  if (maxDensity === 0) return;

  const barW = rect.width / buckets;
  ctx.fillStyle = 'rgba(76, 201, 240, 0.25)';
  for (let i = 0; i < buckets; i++) {
    const h = (density[i] / maxDensity) * rect.height;
    ctx.fillRect(i * barW, rect.height - h, barW, h);
  }

  // Draw loop region overlay
  drawLoopRegion(ctx, rect.width, rect.height);
}

/**
 * Draw loop region markers on the seek bar.
 */
function drawLoopRegion(ctx, w, h) {
  if (state.totalDuration <= 0) return;
  const loopStart = state.loopStart;
  const loopEnd = state.loopEnd != null ? state.loopEnd : state.totalDuration;

  // Only draw if region differs from full song
  const isCustom = loopStart > 0.5 || (state.loopEnd != null && loopEnd < state.totalDuration - 0.5);
  if (!isCustom) return;

  const x1 = (loopStart / state.totalDuration) * w;
  const x2 = (loopEnd / state.totalDuration) * w;

  // Dim areas outside the region
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  if (x1 > 0) ctx.fillRect(0, 0, x1, h);
  if (x2 < w) ctx.fillRect(x2, 0, w - x2, h);

  // Marker lines at start/end
  ctx.fillStyle = state.loopEnabled ? 'rgba(76, 201, 240, 0.7)' : 'rgba(180, 180, 200, 0.5)';
  ctx.fillRect(x1, 0, 2, h);
  ctx.fillRect(x2 - 2, 0, 2, h);
}

/**
 * Attach mousedown/move/up handlers for click-to-seek and drag-to-scrub.
 */
export function initSeekInteraction(containerEl) {
  let isSeeking = false;

  function handleSeek(e) {
    if (!state.midi) return;
    const rect = containerEl.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * state.totalDuration);
  }

  containerEl.addEventListener('mousedown', (e) => {
    isSeeking = true;
    handleSeek(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isSeeking) handleSeek(e);
  });

  window.addEventListener('mouseup', () => {
    isSeeking = false;
  });

  // Touch support for mobile
  containerEl.addEventListener('touchstart', (e) => {
    isSeeking = true;
    const touch = e.touches[0];
    if (!state.midi) return;
    const rect = containerEl.getBoundingClientRect();
    const ratio = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * state.totalDuration);
    e.preventDefault();
  }, { passive: false });

  containerEl.addEventListener('touchmove', (e) => {
    if (!isSeeking) return;
    const touch = e.touches[0];
    if (!state.midi) return;
    const rect = containerEl.getBoundingClientRect();
    const ratio = clamp((touch.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * state.totalDuration);
    e.preventDefault();
  }, { passive: false });

  containerEl.addEventListener('touchend', () => {
    isSeeking = false;
  });
}
