/* ==========================================================
   PIANO KEYBOARD — Virtual 88-key keyboard
   ========================================================== */

import state from './state.js';
import { noteName, isBlackKey, clamp } from './utils.js';
import {
  MIDI_NOTE_MIN, MIDI_NOTE_MAX,
  WHITE_KEY_WIDTH, BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT_RATIO, PIANO_HEIGHT,
} from './constants.js';

/**
 * Build the piano keyboard DOM inside the given container element.
 */
export function buildPiano(pianoEl) {
  pianoEl.innerHTML = '';
  state.pianoKeys = [];
  state.keyPositions.clear();

  // First pass: white keys and their positions
  let whiteIndex = 0;
  const whitePositions = [];

  for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
    if (!isBlackKey(midi)) {
      whitePositions.push({
        midi,
        x: whiteIndex * WHITE_KEY_WIDTH,
        w: WHITE_KEY_WIDTH,
        isBlack: false,
      });
      whiteIndex++;
    }
  }

  const totalWidth = whiteIndex * WHITE_KEY_WIDTH;
  pianoEl.style.width = totalWidth + 'px';

  // Render white keys
  for (const pos of whitePositions) {
    state.keyPositions.set(pos.midi, pos);

    const key = document.createElement('div');
    key.className = 'piano-key white';
    key.style.left = pos.x + 'px';
    key.style.width = WHITE_KEY_WIDTH + 'px';
    key.style.height = '100%';
    key.dataset.midi = pos.midi;

    // Label on C notes
    if (pos.midi % 12 === 0) {
      const label = document.createElement('span');
      label.className = 'piano-key-label';
      label.textContent = noteName(pos.midi);
      key.appendChild(label);
    }

    pianoEl.appendChild(key);
    state.pianoKeys[pos.midi] = key;
  }

  // Second pass: black keys
  for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
    if (!isBlackKey(midi)) continue;

    const prevWhite = state.keyPositions.get(midi - 1);
    if (!prevWhite) continue;

    const x = prevWhite.x + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
    const pos = { midi, x, w: BLACK_KEY_WIDTH, isBlack: true };
    state.keyPositions.set(midi, pos);

    const key = document.createElement('div');
    key.className = 'piano-key black';
    key.style.left = x + 'px';
    key.style.width = BLACK_KEY_WIDTH + 'px';
    key.style.height = (PIANO_HEIGHT * BLACK_KEY_HEIGHT_RATIO) + 'px';
    key.dataset.midi = midi;

    const label = document.createElement('span');
    label.className = 'piano-key-label';
    label.textContent = noteName(midi);
    key.appendChild(label);

    pianoEl.appendChild(key);
    state.pianoKeys[midi] = key;
  }
}

/** Update key highlight classes based on state.activeNotes */
export function updatePianoHighlights() {
  for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
    const key = state.pianoKeys[midi];
    if (!key) continue;
    key.classList.toggle('active', state.activeNotes.has(midi));
  }
}

/** Scroll the piano container to center on the active note range */
export function scrollPianoToActiveRange(containerEl) {
  if (state.notes.length === 0) return;

  let minNote = 127;
  let maxNote = 0;
  for (const n of state.notes) {
    if (n.midi < minNote) minNote = n.midi;
    if (n.midi > maxNote) maxNote = n.midi;
  }

  const midNote = Math.floor((minNote + maxNote) / 2);
  const pos = state.keyPositions.get(clamp(midNote, MIDI_NOTE_MIN, MIDI_NOTE_MAX));
  if (pos) {
    const containerW = containerEl.offsetWidth;
    containerEl.scrollLeft = pos.x - containerW / 2;
  }
}
