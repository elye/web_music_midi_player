import { beforeEach, describe, expect, it } from 'vitest';

import state from '../js/state.js';
import { midiTimeToTransport, transportToMidiTime } from '../js/audio-engine.js';

beforeEach(() => {
  state.originalBpm = 120;
  globalThis.Tone = {
    Transport: {
      bpm: { value: 120 },
    },
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
});
