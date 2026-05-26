/* ==========================================================
   AUDIO ENGINE — All Tone.js interaction in one place
   ========================================================== */

import state from './state.js';
import { clamp, midiToFreq } from './utils.js';

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

/** Create (or recreate) the PolySynth with piano-like timbre */
export function createSynth() {
  if (state.synth) {
    state.synth.dispose();
  }
  state.synth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 64,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.005, decay: 1.0, sustain: 0.1, release: 1.5 },
      volume: -12,
    },
  }).toDestination();
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

  const events = state.notes
    .map(n => ({
      timeTicks: Math.round(n.time * ticksPerSecond),
      midi: n.midi + transpose,
      duration: n.duration,
      velocity: n.velocity,
    }))
    .filter(n => n.midi >= 0 && n.midi <= 127);

  state.part = new Tone.Part((time, value) => {
    const freq = midiToFreq(value.midi);
    const scaledDuration = value.duration * (state.originalBpm / Tone.Transport.bpm.value);
    try {
      state.synth.triggerAttackRelease(freq, scaledDuration, time, value.velocity);
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
