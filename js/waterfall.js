/* ==========================================================
   WATERFALL — Falling-blocks note visualizer
   ========================================================== */

import state from './state.js';
import { setupCanvas, roundRect } from './utils.js';
import { MIDI_NOTE_MIN, MIDI_NOTE_MAX, WATERFALL_PPS } from './constants.js';

/**
 * Render the waterfall canvas at the given MIDI time.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} container
 * @param {HTMLElement} pianoEl — the piano DOM element for width reference
 * @param {number} currentTime — current playback position in MIDI seconds
 */
export function renderWaterfall(canvas, container, pianoEl, currentTime) {
  const { ctx, w, h } = setupCanvas(canvas, container);
  ctx.clearRect(0, 0, w, h);

  if (!state.notes.length) return;

  const transpose = state.transpose;
  const pps = WATERFALL_PPS * (state.originalBpm / 120);

  const timeTop = currentTime + h / pps;
  const timeBottom = currentTime;

  const pianoTotalWidth = pianoEl.offsetWidth || 1;
  const pianoContainer = pianoEl.parentElement;
  const scrollLeft = (pianoContainer && pianoTotalWidth > w) ? pianoContainer.scrollLeft : 0;
  // When piano fits: center it. When piano is wider: align to scroll position.
  const offsetX = pianoTotalWidth <= w
    ? (w - pianoTotalWidth) / 2
    : -scrollLeft;

  // Octave grid lines (vertical)
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1;
  for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
    if (midi % 12 === 0) {
      const pos = state.keyPositions.get(midi);
      if (pos) {
        const x = offsetX + pos.x;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
  }

  // Notes
  for (const note of state.notes) {
    const noteEnd = note.time + note.duration;
    if (noteEnd < timeBottom - 0.5 || note.time > timeTop) continue;

    const transposedMidi = note.midi + transpose;
    const pos = state.keyPositions.get(transposedMidi);
    if (!pos) continue;

    const x = offsetX + pos.x;
    const noteW = pos.w;

    const yBottom = h - (note.time - currentTime) * pps;
    const yTop = h - (noteEnd - currentTime) * pps;
    const noteH = yBottom - yTop;

    const isActive = note.time <= currentTime && noteEnd > currentTime;
    const hue = (note.channel * 37) % 360;
    const alpha = 0.4 + note.velocity * 0.6;

    if (isActive) {
      ctx.fillStyle = `rgba(76, 201, 240, ${alpha})`;
      ctx.shadowColor = 'rgba(76, 201, 240, 0.6)';
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    const r = Math.min(3, Math.max(noteH, 2) / 2);
    roundRect(ctx, x, yTop, Math.max(noteW - 1, 2), Math.max(noteH, 2), r);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}
