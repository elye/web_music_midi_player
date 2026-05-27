import { beforeEach, describe, expect, it, vi } from 'vitest';

import state from '../js/state.js';
import { createSynth, midiTimeToTransport, stopPlayback, transportToMidiTime } from '../js/audio-engine.js';

beforeEach(() => {
  state.originalBpm = 120;
  state.isPlaying = false;
  state.part = null;
  state.synth = null;
  state.activeNotes.clear();

  const newSynth = {
    dispose: vi.fn(),
  };

  globalThis.Tone = {
    Transport: {
      bpm: { value: 120 },
      stop: vi.fn(),
      seconds: 0,
    },
    Synth: function Synth() {},
    PolySynth: vi.fn(() => ({
      ...newSynth,
      toDestination() {
        return this;
      },
    })),
  };
});

describe('audio engine time conversion', () => {
  it('converts MIDI time to transport time using BPM ratio', () => {
    state.originalBpm = 120;
    Tone.Transport.bpm.value = 60;

    expect(midiTimeToTransport(10)).toBeCloseTo(20, 6);
  });

  it('converts transport time to MIDI time using BPM ratio', () => {
    state.originalBpm = 120;
    Tone.Transport.bpm.value = 60;

    expect(transportToMidiTime(20)).toBeCloseTo(10, 6);
  });

  it('round-trips time conversion at non-default BPM', () => {
    state.originalBpm = 140;
    Tone.Transport.bpm.value = 100;
    const original = 7.25;

    const transport = midiTimeToTransport(original);
    const roundTrip = transportToMidiTime(transport);

    expect(roundTrip).toBeCloseTo(original, 6);
  });

  it('stopPlayback immediately disposes active synth and recreates it', () => {
    createSynth();
    const oldSynth = state.synth;

    state.part = { dispose: vi.fn() };
    state.isPlaying = true;
    state.activeNotes.add(60);

    stopPlayback();

    expect(Tone.Transport.stop).toHaveBeenCalledTimes(1);
    expect(oldSynth.dispose).toHaveBeenCalledTimes(1);
    expect(state.synth).not.toBeNull();
    expect(state.synth).not.toBe(oldSynth);
    expect(state.part).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.activeNotes.size).toBe(0);
  });
});
