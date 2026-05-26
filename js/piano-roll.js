/* ==========================================================
   PIANO ROLL — Horizontal scrolling note visualizer
   ========================================================== */

import state from './state.js';
import { noteName } from './utils.js';
import { setupCanvas, roundRect } from './utils.js';
import {
  MIDI_NOTE_MIN, MIDI_NOTE_MAX,
  PIXELS_PER_SECOND, PLAYHEAD_X_RATIO, GUTTER_WIDTH,
} from './constants.js';

/**
 * Render the piano roll canvas at the given MIDI time.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} container
 * @param {number} currentTime — current playback position in MIDI seconds
 */
export function renderPianoRoll(canvas, container, currentTime) {
  const { ctx, w, h } = setupCanvas(canvas, container);
  ctx.clearRect(0, 0, w, h);

  const noteRange = MIDI_NOTE_MAX - MIDI_NOTE_MIN + 1;
  const noteHeight = h / noteRange;
  const pps = PIXELS_PER_SECOND * (state.originalBpm / 120);

  const gutterW = GUTTER_WIDTH;
  const rollW = w - gutterW;
  const playheadX = gutterW + rollW * PLAYHEAD_X_RATIO;

  // Visible time window
  const timeLeft = currentTime - (playheadX - gutterW) / pps;
  const timeRight = currentTime + (w - playheadX) / pps;

  // Octave grid lines
  ctx.strokeStyle = '#2a2a3e';
  ctx.lineWidth = 1;
  for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
    if (midi % 12 === 0) {
      const y = h - (midi - MIDI_NOTE_MIN + 0.5) * noteHeight;
      ctx.beginPath();
      ctx.moveTo(gutterW, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // Gutter labels
  ctx.fillStyle = '#6c757d';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi += 12) {
    const y = h - (midi - MIDI_NOTE_MIN + 0.5) * noteHeight;
    ctx.fillText(noteName(midi), gutterW - 4, y);
  }

  // Gutter separator
  ctx.strokeStyle = '#2a2a3e';
  ctx.beginPath();
  ctx.moveTo(gutterW, 0);
  ctx.lineTo(gutterW, h);
  ctx.stroke();

  // Notes
  const transpose = state.transpose;
  for (const note of state.notes) {
    const noteEnd = note.time + note.duration;
    if (noteEnd < timeLeft || note.time > timeRight) continue;

    const transposedMidi = note.midi + transpose;
    if (transposedMidi < MIDI_NOTE_MIN || transposedMidi > MIDI_NOTE_MAX) continue;

    const x = playheadX + (note.time - currentTime) * pps;
    const noteW = note.duration * pps;
    const y = h - (transposedMidi - MIDI_NOTE_MIN + 1) * noteHeight;
    const isActive = note.time <= currentTime && noteEnd > currentTime;

    const hue = (note.channel * 37) % 360;
    const alpha = 0.4 + note.velocity * 0.6;

    if (isActive) {
      ctx.fillStyle = `rgba(76, 201, 240, ${alpha})`;
      ctx.shadowColor = 'rgba(76, 201, 240, 0.5)';
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    const r = Math.min(3, noteHeight / 2, noteW / 2);
    roundRect(ctx, x, y, Math.max(noteW, 2), noteHeight - 1, r);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Playhead
  ctx.strokeStyle = '#4cc9f0';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(76, 201, 240, 0.6)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
