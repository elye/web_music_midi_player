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
}
