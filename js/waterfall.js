/* ==========================================================
   WATERFALL — Falling-blocks note visualizer
   ========================================================== */

import state from './state.js';
import { setupCanvas, roundRect } from './utils.js';
import { MIDI_NOTE_MIN, MIDI_NOTE_MAX, WATERFALL_PPS } from './constants.js';
import { seekTo } from './audio-engine.js';
import { clamp } from './utils.js';

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

/* Seconds to seek per line/page unit in wheel events */
const WHEEL_SECONDS_PER_LINE = 5;
const WHEEL_SECONDS_PER_PAGE = 30;

/**
 * When true the seek direction is inverted from the raw input delta.
 * Default true = the user-expected direction (opposite of the original implementation).
 */
let invertSeekDirection = true;

export function setWaterfallSeekInverted(value) {
  invertSeekDirection = value;
}

/**
 * Attach wheel and touch event listeners to the waterfall panel for seek-on-scroll.
 * Scrolling down → seek forward; scrolling up → seek backward.
 * @param {HTMLElement} panelEl — the waterfall panel container element
 */
export function initWaterfallSeek(panelEl) {
  // --- Wheel (desktop mouse wheel / trackpad) ---
  panelEl.addEventListener('wheel', (e) => {
    if (!state.midi) return;
    e.preventDefault();

    let delta;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
      // Smooth trackpad: scale pixels → seconds (150 px/s native, ×2 for feel)
      const pps = WATERFALL_PPS * (state.originalBpm / 120);
      delta = (e.deltaY / pps) * 2;
    } else if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta = Math.sign(e.deltaY) * WHEEL_SECONDS_PER_LINE;
    } else {
      // DOM_DELTA_PAGE
      delta = Math.sign(e.deltaY) * WHEEL_SECONDS_PER_PAGE;
    }

    const dirMult = invertSeekDirection ? -1 : 1;
    const currentTime = state.totalDuration > 0
      ? clamp(Tone.Transport.seconds * (Tone.Transport.bpm.value / state.originalBpm), 0, state.totalDuration)
      : 0;
    seekTo(clamp(currentTime + dirMult * delta, 0, state.totalDuration));
  }, { passive: false });

  // --- Touch (mobile drag up/down for continuous seek) ---
  let touchStartY = 0;
  let touchSnapshotTime = 0;

  panelEl.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchSnapshotTime = state.totalDuration > 0
      ? clamp(Tone.Transport.seconds * (Tone.Transport.bpm.value / state.originalBpm), 0, state.totalDuration)
      : 0;
  }, { passive: true });

  panelEl.addEventListener('touchmove', (e) => {
    if (!state.midi) return;
    e.preventDefault(); // prevent page scroll while dragging on the waterfall

    const pps = WATERFALL_PPS * (state.originalBpm / 120);
    const dirMult = invertSeekDirection ? -1 : 1;
    const deltaY = e.touches[0].clientY - touchStartY;
    seekTo(clamp(touchSnapshotTime - dirMult * deltaY / pps, 0, state.totalDuration));
  }, { passive: false });
}
