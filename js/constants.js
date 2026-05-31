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

// ---------- General MIDI instrument families ----------
// Maps program number ranges to family keys
export const INSTRUMENT_FAMILIES = [
  { key: 'piano',      name: 'Piano',              lo: 0,   hi: 7   },
  { key: 'chromPerc',  name: 'Chromatic Percussion', lo: 8,   hi: 15  },
  { key: 'organ',      name: 'Organ',              lo: 16,  hi: 23  },
  { key: 'guitar',     name: 'Guitar',             lo: 24,  hi: 31  },
  { key: 'bass',       name: 'Bass',               lo: 32,  hi: 39  },
  { key: 'strings',    name: 'Strings',            lo: 40,  hi: 55  },
  { key: 'brass',      name: 'Brass',              lo: 56,  hi: 63  },
  { key: 'reedPipe',   name: 'Reed / Pipe',        lo: 64,  hi: 79  },
  { key: 'synthLead',  name: 'Synth Lead',         lo: 80,  hi: 87  },
  { key: 'synthPad',   name: 'Synth Pad',          lo: 88,  hi: 95  },
  { key: 'sfx',        name: 'Sound Effects',      lo: 96,  hi: 127 },
];

/** Return the family key for a given MIDI program number (0-127) */
export function instrumentFamily(programNumber) {
  for (const f of INSTRUMENT_FAMILIES) {
    if (programNumber >= f.lo && programNumber <= f.hi) return f.key;
  }
  return 'piano'; // fallback
}

// ---------- Drum note ranges ----------
export const DRUM_NOTE_MAP = {
  kick:    [35, 36],
  snare:   [38, 40],
  hihat:   [42, 44, 46],
  tom:     [41, 43, 45, 47, 48, 50],
  cymbal:  [49, 51, 52, 55, 57, 59],
};
