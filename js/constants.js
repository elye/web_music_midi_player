/* ==========================================================
   CONSTANTS — All configuration & magic numbers
   ========================================================== */

export const MIDI_NOTE_MIN = 21;   // A0
export const MIDI_NOTE_MAX = 108;  // C8
export const TOTAL_KEYS = MIDI_NOTE_MAX - MIDI_NOTE_MIN + 1;
export const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

// Rendering
export const PLAYHEAD_X_RATIO = 0.25;       // Playhead at 25% from left
export const PIXELS_PER_SECOND = 200;       // Base scale for piano roll
export const WATERFALL_PPS = 150;           // Waterfall pixels per second
export const GUTTER_WIDTH = 36;             // Piano roll label gutter

// Timing
export const BPM_DEBOUNCE_MS = 50;
export const TOAST_DURATION_MS = 3500;

// Piano key dimensions
export const WHITE_KEY_WIDTH = 18;
export const BLACK_KEY_WIDTH = 12;
export const BLACK_KEY_HEIGHT_RATIO = 0.6;
export const PIANO_HEIGHT = 80;             // px
