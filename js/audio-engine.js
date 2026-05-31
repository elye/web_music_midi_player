/* ==========================================================
   AUDIO ENGINE — All Tone.js interaction in one place
   ========================================================== */

import state from './state.js';
import { clamp, midiToFreq } from './utils.js';
import { instrumentFamily, DRUM_NOTE_MAP } from './constants.js';

const ALLOWED_OSCILLATORS = new Set(['sine', 'triangle', 'sawtooth', 'square']);

function normalizeSynthSettings(raw) {
  const oscillator = ALLOWED_OSCILLATORS.has(raw.oscillator) ? raw.oscillator : 'sine';
  return {
    oscillator,
    attack: clamp(Number(raw.attack), 0.001, 0.1),
    decay: clamp(Number(raw.decay), 0.05, 2),
    sustain: clamp(Number(raw.sustain), 0, 0.9),
    release: clamp(Number(raw.release), 0.05, 2),
    volume: clamp(Number(raw.volume), -24, 0),
  };
}

/* ---------- Instrument family synth presets ---------- */
const FAMILY_PRESETS = {
  piano:     { oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.2 }, volume: -6 },
  chromPerc: { oscillator: { type: 'sine' },     envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 }, volume: -8 },
  organ:     { oscillator: { type: 'square' },   envelope: { attack: 0.01,  decay: 0.1, sustain: 0.8, release: 0.2 }, volume: -10 },
  guitar:    { oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.1 }, volume: -8 },
  bass:      { oscillator: { type: 'sine' },     envelope: { attack: 0.005, decay: 0.8, sustain: 0.2, release: 0.4 }, volume: -6 },
  strings:   { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.08,  decay: 0.3, sustain: 0.7, release: 0.8 }, volume: -10 },
  brass:     { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.03,  decay: 0.2, sustain: 0.6, release: 0.3 }, volume: -10 },
  reedPipe:  { oscillator: { type: 'sine' },     envelope: { attack: 0.02,  decay: 0.3, sustain: 0.5, release: 0.3 }, volume: -9 },
  synthLead: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.3 }, volume: -8 },
  synthPad:  { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.1,   decay: 0.5, sustain: 0.7, release: 1.5 }, volume: -10 },
  sfx:       { oscillator: { type: 'sine' },     envelope: { attack: 0.01,  decay: 0.3, sustain: 0.3, release: 0.3 }, volume: -8 },
};

/** Convert MIDI time (seconds at original BPM) → Transport seconds */
export function midiTimeToTransport(midiTime) {
  return midiTime * (state.originalBpm / Tone.Transport.bpm.value);
}

/** Convert Transport seconds → MIDI time (seconds at original BPM) */
export function transportToMidiTime(transportSeconds) {
  return transportSeconds * (Tone.Transport.bpm.value / state.originalBpm);
}

/** Show overlay & wait for user click to resume AudioContext */
export async function ensureAudioContext(overlayEl) {
  if (Tone.context.state === 'suspended') {
    overlayEl.classList.remove('hidden');
    return new Promise(resolve => {
      const handler = async () => {
        await Tone.start();
        overlayEl.classList.add('hidden');
        overlayEl.removeEventListener('click', handler);
        document.removeEventListener('click', handler);
        resolve();
      };
      overlayEl.addEventListener('click', handler);
    });
  }
}

/* ---------- Dispose helpers ---------- */

/** Dispose all synths in state.synthMap */
function disposeSynthMap() {
  for (const key of Object.keys(state.synthMap)) {
    try { state.synthMap[key].dispose(); } catch (_) { /* already disposed */ }
  }
  state.synthMap = {};
}

/** Dispose drum synths */
function disposeDrumSynths() {
  if (!state.drumSynths) return;
  for (const key of Object.keys(state.drumSynths)) {
    try { state.drumSynths[key].dispose(); } catch (_) { /* already disposed */ }
  }
  state.drumSynths = null;
}

/** Dispose everything audio-related */
export function disposeAllSynths() {
  if (state.synth) { try { state.synth.dispose(); } catch (_) {} state.synth = null; }
  disposeSynthMap();
  disposeDrumSynths();
}

/* ---------- Synth creation ---------- */

/** Create (or recreate) the single PolySynth for custom mode */
export function createSynth() {
  if (state.synth) {
    state.synth.dispose();
  }
  const synthSettings = normalizeSynthSettings(state.synthSettings);
  state.synthSettings = synthSettings;

  state.synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: synthSettings.oscillator },
    envelope: {
      attack: synthSettings.attack,
      decay: synthSettings.decay,
      sustain: synthSettings.sustain,
      release: synthSettings.release,
    },
    volume: synthSettings.volume,
    maxPolyphony: 64,
  }).toDestination();
}

/** Determine which instrument families are actually used by the current notes */
function usedFamilies() {
  const families = new Set();
  let hasDrums = false;
  for (const n of state.notes) {
    if (n.isDrum) { hasDrums = true; continue; }
    families.add(instrumentFamily(n.instrumentNumber));
  }
  return { families, hasDrums };
}

/** Create per-family synths for auto mode (only for families actually in use) */
export function createAutoSynths() {
  disposeSynthMap();
  disposeDrumSynths();

  const { families, hasDrums } = usedFamilies();

  for (const fam of families) {
    const preset = FAMILY_PRESETS[fam] || FAMILY_PRESETS.piano;
    state.synthMap[fam] = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: preset.oscillator.type },
      envelope: { ...preset.envelope },
      volume: preset.volume,
      maxPolyphony: 32,
    }).toDestination();
  }

  if (hasDrums) {
    state.drumSynths = {
      kick: new Tone.MembraneSynth({
        pitchDecay: 0.05, octaves: 6,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
        volume: -6,
      }).toDestination(),
      snare: new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
        volume: -8,
      }).toDestination(),
      hihat: new Tone.MetalSynth({
        frequency: 400, envelope: { attack: 0.001, decay: 0.06, release: 0.01 },
        harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
        volume: -12,
      }).toDestination(),
      tom: new Tone.MembraneSynth({
        pitchDecay: 0.03, octaves: 4,
        envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.08 },
        volume: -8,
      }).toDestination(),
      cymbal: new Tone.MetalSynth({
        frequency: 300, envelope: { attack: 0.001, decay: 0.4, release: 0.1 },
        harmonicity: 5.1, modulationIndex: 40, resonance: 5000, octaves: 1.5,
        volume: -14,
      }).toDestination(),
      other: new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.03 },
        volume: -10,
      }).toDestination(),
    };
  }
}

/** Get the drum synth + optional pitch for a given MIDI note number */
function drumSynthForNote(midiNote) {
  if (!state.drumSynths) return null;
  if (DRUM_NOTE_MAP.kick.includes(midiNote))   return { synth: state.drumSynths.kick,   type: 'membrane', pitch: 'C1' };
  if (DRUM_NOTE_MAP.snare.includes(midiNote))  return { synth: state.drumSynths.snare,  type: 'noise' };
  if (DRUM_NOTE_MAP.hihat.includes(midiNote))  return { synth: state.drumSynths.hihat,  type: 'metal' };
  if (DRUM_NOTE_MAP.tom.includes(midiNote))    return { synth: state.drumSynths.tom,    type: 'membrane', pitch: midiToFreq(midiNote) };
  if (DRUM_NOTE_MAP.cymbal.includes(midiNote)) return { synth: state.drumSynths.cymbal, type: 'metal' };
  return { synth: state.drumSynths.other, type: 'noise' };
}

/** Update synth settings with bounded values and rebuild synth if needed. */
export function updateSynthSettings(partialSettings) {
  state.synthSettings = normalizeSynthSettings({
    ...state.synthSettings,
    ...partialSettings,
  });

  const wasPlaying = state.isPlaying && !!state.synth;
  if (wasPlaying) {
    Tone.Transport.pause();
  }

  createSynth();

  if (wasPlaying) {
    if (state.part) {
      state.part.dispose();
      state.part = null;
    }
    schedulePart();
    Tone.Transport.start();
  }

  return state.synthSettings;
}

/** Schedule all notes as a Tone.Part using tick-based timing */
export function schedulePart() {
  if (state.part) {
    state.part.dispose();
    state.part = null;
  }

  const transpose = state.transpose;
  const ppq = Tone.Transport.PPQ;
  const ticksPerSecond = (state.originalBpm / 60) * ppq;
  const autoMode = state.soundMode === 'auto';

  const events = state.notes
    .filter(n => !state.mutedTracks.has(n.trackIndex))
    .map(n => ({
      timeTicks: Math.round(n.time * ticksPerSecond),
      midi: n.isDrum ? n.midi : n.midi + transpose,
      duration: n.duration,
      velocity: n.velocity,
      isDrum: n.isDrum,
      instrumentNumber: n.instrumentNumber,
    }))
    .filter(n => n.midi >= 0 && n.midi <= 127);

  state.part = new Tone.Part((time, value) => {
    const scaledDuration = value.duration * (state.originalBpm / Tone.Transport.bpm.value);

    try {
      if (autoMode) {
        if (value.isDrum) {
          // Route to drum synth
          const d = drumSynthForNote(value.midi);
          if (!d) return;
          if (d.type === 'membrane') {
            d.synth.triggerAttackRelease(d.pitch, scaledDuration, time, value.velocity);
          } else if (d.type === 'noise') {
            d.synth.triggerAttackRelease(scaledDuration, time, value.velocity);
          } else {
            // metal synth
            d.synth.triggerAttackRelease('16n', time, value.velocity);
          }
        } else {
          // Route to family synth
          const fam = instrumentFamily(value.instrumentNumber);
          const synth = state.synthMap[fam];
          if (synth) {
            synth.triggerAttackRelease(midiToFreq(value.midi), scaledDuration, time, value.velocity);
          }
        }
      } else {
        // Custom mode — all through the single synth (drums still use drum synths if available)
        if (value.isDrum && state.drumSynths) {
          const d = drumSynthForNote(value.midi);
          if (!d) return;
          if (d.type === 'membrane') {
            d.synth.triggerAttackRelease(d.pitch, scaledDuration, time, value.velocity);
          } else if (d.type === 'noise') {
            d.synth.triggerAttackRelease(scaledDuration, time, value.velocity);
          } else {
            d.synth.triggerAttackRelease('16n', time, value.velocity);
          }
        } else {
          const freq = midiToFreq(value.midi);
          state.synth.triggerAttackRelease(freq, scaledDuration, time, value.velocity);
        }
      }
    } catch (e) {
      // Ignore polyphony overflow
    }
  }, events.map(e => [e.timeTicks + 'i', e]));

  state.part.start(0);
}

/** Start or resume Transport playback */
export async function startPlayback(audioOverlayEl) {
  await ensureAudioContext(audioOverlayEl);
  if (!state.midi) return;

  if (Tone.Transport.state !== 'started') {
    schedulePart();
    Tone.Transport.start();
  }

  state.isPlaying = true;
  state.emit('playback-started');
}

/** Pause Transport */
export function pausePlayback() {
  Tone.Transport.pause();
  state.isPlaying = false;
  state.emit('playback-paused');
}

/** Stop Transport and reset to 0 */
export function stopPlayback() {
  Tone.Transport.stop();
  disposeAllSynths();

  if (state.soundMode === 'auto') {
    createAutoSynths();
  } else {
    createSynth();
  }

  Tone.Transport.seconds = 0;
  if (state.part) {
    state.part.dispose();
    state.part = null;
  }
  state.isPlaying = false;
  state.activeNotes.clear();
  state.emit('playback-stopped');
}

/** Seek to a position in MIDI time (seconds) */
export function seekTo(seconds) {
  seconds = clamp(seconds, 0, state.totalDuration);
  const wasPlaying = state.isPlaying;

  if (wasPlaying) {
    Tone.Transport.pause();
    if (state.part) {
      state.part.dispose();
      state.part = null;
    }
  }

  Tone.Transport.seconds = midiTimeToTransport(seconds);

  if (wasPlaying) {
    schedulePart();
    Tone.Transport.start();
  }

  state.emit('seeked', seconds);
}

/** Play count-in clicks before starting playback */
export async function performCountIn(beats, overlayEl, beatEl) {
  const bpm = Tone.Transport.bpm.value;
  const beatDurationMs = (60 / bpm) * 1000;

  const clickSynth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
    volume: -6,
  }).toDestination();

  overlayEl.classList.remove('hidden');

  return new Promise(resolve => {
    let beat = 0;

    function tick() {
      beat++;
      beatEl.textContent = beat;
      beatEl.classList.remove('count-in-pop');
      void beatEl.offsetWidth; // force reflow
      beatEl.classList.add('count-in-pop');
      clickSynth.triggerAttackRelease('C2', '32n');

      if (beat < beats) {
        setTimeout(tick, beatDurationMs);
      } else {
        setTimeout(() => {
          overlayEl.classList.add('hidden');
          clickSynth.dispose();
          resolve();
        }, beatDurationMs);
      }
    }

    tick();
  });
}

/**
 * Switch sound mode between 'auto' and 'custom'.
 * Rebuilds the synth graph and reschedules if playing.
 */
export function setSoundMode(mode) {
  state.soundMode = mode;
  const wasPlaying = state.isPlaying;

  if (wasPlaying) {
    Tone.Transport.pause();
    if (state.part) { state.part.dispose(); state.part = null; }
  }

  disposeAllSynths();

  if (mode === 'auto') {
    createAutoSynths();
  } else {
    createSynth();
  }

  if (wasPlaying) {
    schedulePart();
    Tone.Transport.start();
  }
}
