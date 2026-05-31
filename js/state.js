/* ==========================================================
   STATE — Centralized state store with event emitter
   ========================================================== */

class StateStore {
  constructor() {
    this._listeners = new Map();

    // MIDI data
    this.midi = null;
    this.fileName = '';
    this.notes = [];              // Flattened, sorted: {midi, time, duration, velocity, channel, trackIndex, instrumentNumber, instrumentName, isDrum}
    this.tracks = [];             // Per-track info: [{index, name, instrumentNumber, instrumentName, channel, isDrum}]
    this.totalDuration = 0;
    this.originalBpm = 120;

    // Playback
    this.isPlaying = false;
    this.countingIn = false;

    // Per-track muting
    this.mutedTracks = new Set();  // Set of track indices that are muted
    this.hiddenTracks = new Set(); // Set of track indices hidden from visualizers

    // Loop/region playback
    this.loopStart = 0;           // Start of loop region in MIDI seconds
    this.loopEnd = null;          // End of loop region in MIDI seconds (null = totalDuration)
    this.loopEnabled = false;     // Whether looping is active

    // Modifications
    this.transpose = 0;

    // Sound mode: 'auto' uses per-track instruments, 'custom' uses selected preset
    this.soundMode = 'auto';

    // Audio references (managed by AudioEngine)
    this.synth = null;
    this.synthMap = {};           // family key → PolySynth (auto mode)
    this.drumSynths = null;       // {kick, snare, hihat, tom, cymbal, other}
    this.part = null;
    this.synthSettings = {
      oscillator: 'sine',
      attack: 0.003,
      decay: 0.35,
      sustain: 0,
      release: 0.6,
      volume: -11,
    };

    // Active notes for visualization
    this.activeNotes = new Set();

    // Piano key data
    this.pianoKeys = [];           // DOM elements indexed by MIDI note
    this.keyPositions = new Map(); // midi → {x, w, isBlack}

    // Animation
    this.animFrameId = null;

    // Debounce timer for BPM
    this.bpmDebounceTimer = null;
  }

  /** Subscribe to a named event */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
  }

  /** Remove a subscription */
  off(event, callback) {
    const cbs = this._listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    }
  }

  /** Emit a named event with optional data */
  emit(event, data) {
    const cbs = this._listeners.get(event);
    if (cbs) {
      for (const cb of cbs) cb(data);
    }
  }
}

/** Singleton state instance */
const state = new StateStore();
export default state;
