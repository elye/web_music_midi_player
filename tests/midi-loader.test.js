import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/toast.js', () => ({
  showToast: vi.fn(),
}));

import state from '../js/state.js';
import { exportMidi, parseMidiFile } from '../js/midi-loader.js';
import { showToast } from '../js/toast.js';

function makeMidiData() {
  return {
    header: { tempos: [{ bpm: 132 }] },
    tracks: [
      {
        channel: 1,
        notes: [
          { midi: 64, time: 0.5, duration: 0.25, velocity: 0.9 },
          { midi: 60, time: 0.1, duration: 0.5, velocity: 0.8 },
        ],
      },
    ],
    toArray: () => [1, 2, 3],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.midi = null;
  state.fileName = '';
  state.notes = [];
  state.totalDuration = 0;
  state.originalBpm = 120;
  state.transpose = 0;
});

describe('parseMidiFile', () => {
  it('parses MIDI and populates flattened state', async () => {
    const midi = makeMidiData();
    globalThis.Midi = vi.fn(() => midi);

    const file = {
      name: 'demo.mid',
      arrayBuffer: async () => new ArrayBuffer(8),
    };

    const ok = await parseMidiFile(file);

    expect(ok).toBe(true);
    expect(state.fileName).toBe('demo');
    expect(state.notes).toHaveLength(2);
    expect(state.notes[0].time).toBe(0.1);
    expect(state.totalDuration).toBeCloseTo(0.75, 6);
    expect(state.originalBpm).toBe(132);
    expect(showToast).toHaveBeenCalledWith('Loaded "demo.mid" — 2 notes', 'success');
  });

  it('returns false when MIDI has no tracks', async () => {
    globalThis.Midi = vi.fn(() => ({ header: { tempos: [] }, tracks: [] }));
    const file = {
      name: 'empty.mid',
      arrayBuffer: async () => new ArrayBuffer(8),
    };

    const ok = await parseMidiFile(file);

    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('MIDI file has no tracks.', 'error');
  });
});

describe('exportMidi', () => {
  it('exports transposed MIDI and updates first tempo', () => {
    state.transpose = 2;
    state.fileName = 'song';
    state.midi = {
      toArray: () => [7, 8, 9],
    };

    const cloned = {
      tracks: [
        {
          notes: [
            { midi: 60 },
            { midi: 126 },
          ],
        },
      ],
      header: { tempos: [{ bpm: 120 }] },
      toArray: () => [9, 9, 9],
    };

    globalThis.Midi = vi.fn(() => cloned);

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    exportMidi(150);

    expect(cloned.tracks[0].notes[0].midi).toBe(62);
    expect(cloned.tracks[0].notes[1].midi).toBe(127);
    expect(cloned.header.tempos[0].bpm).toBe(150);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(showToast).toHaveBeenCalledWith('MIDI exported successfully!', 'success');
  });
});
