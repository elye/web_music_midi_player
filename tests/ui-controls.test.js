import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import state from '../js/state.js';
import { initControls, resetBpmAndTranspose, resetRuntimeControlsForNewFile } from '../js/ui-controls.js';

function makeDom() {
  const btnLoad = document.createElement('button');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  const btnExport = document.createElement('button');
  const btnPlay = document.createElement('button');
  const btnStop = document.createElement('button');
  const btnRewind = document.createElement('button');
  const btnReset = document.createElement('button');
  const bpmInput = document.createElement('input');
  const bpmSlider = document.createElement('input');
  const transposeSelect = document.createElement('select');
  transposeSelect.innerHTML = '<option value="0">0</option><option value="5">5</option>';
  const countInInput = document.createElement('input');
  const countInOverlay = document.createElement('div');
  const countInBeat = document.createElement('div');
  const btnSoundAdvanced = document.createElement('button');
  const soundPanel = document.createElement('div');
  const soundOscType = document.createElement('select');
  soundOscType.innerHTML = '<option value="sine">sine</option><option value="triangle">triangle</option>';
  const soundAttack = document.createElement('input');
  const soundAttackValue = document.createElement('span');
  const soundDecay = document.createElement('input');
  const soundDecayValue = document.createElement('span');
  const soundSustain = document.createElement('input');
  const soundSustainValue = document.createElement('span');
  const soundRelease = document.createElement('input');
  const soundReleaseValue = document.createElement('span');
  const soundVolume = document.createElement('input');
  const soundVolumeValue = document.createElement('span');
  const seekContainer = document.createElement('div');
  const iconPlay = document.createElement('div');
  const iconPause = document.createElement('div');
  const currentTime = document.createElement('span');
  const seekProgress = document.createElement('div');
  const audioOverlay = document.createElement('div');
  const loadingOverlay = document.createElement('div');
  const totalTime = document.createElement('span');
  const emptyState = document.createElement('div');
  const visualizers = document.createElement('div');
  const seekDensityCanvas = document.createElement('canvas');
  const pianoContainer = document.createElement('div');

  return {
    btnLoad,
    fileInput,
    btnExport,
    btnPlay,
    btnStop,
    btnRewind,
    btnReset,
    bpmInput,
    bpmSlider,
    transposeSelect,
    countInInput,
    countInOverlay,
    countInBeat,
    btnSoundAdvanced,
    soundPanel,
    soundOscType,
    soundAttack,
    soundAttackValue,
    soundDecay,
    soundDecayValue,
    soundSustain,
    soundSustainValue,
    soundRelease,
    soundReleaseValue,
    soundVolume,
    soundVolumeValue,
    seekContainer,
    iconPlay,
    iconPause,
    currentTime,
    seekProgress,
    audioOverlay,
    loadingOverlay,
    totalTime,
    emptyState,
    visualizers,
    seekDensityCanvas,
    pianoContainer,
  };
}

function resetStateForTest() {
  state.midi = { tracks: [] };
  state.originalBpm = 140;
  state.transpose = 5;
  state.countingIn = true;
  state.isPlaying = false;
  state.totalDuration = 0;
  state.part = null;
  state.bpmDebounceTimer = null;
  state.synthSettings = {
    oscillator: 'sine',
    attack: 0.003,
    decay: 0.35,
    sustain: 0,
    release: 0.6,
    volume: -11,
  };
}

beforeEach(() => {
  resetStateForTest();
  globalThis.Tone = {
    context: { state: 'running' },
    start: vi.fn(async () => {}),
    Transport: {
      state: 'stopped',
      bpm: { value: 120 },
      seconds: 0,
      pause: vi.fn(() => {}),
      start: vi.fn(() => {}),
      stop: vi.fn(() => {}),
    },
  };
});

afterEach(() => {
  if (state.bpmDebounceTimer) {
    clearTimeout(state.bpmDebounceTimer);
    state.bpmDebounceTimer = null;
  }
  vi.restoreAllMocks();
});

describe('reset helper behavior', () => {
  it('resetBpmAndTranspose updates bpm, transpose, and clears debounce timer', () => {
    const dom = makeDom();
    dom.bpmInput.value = '99';
    dom.bpmSlider.value = '99';
    dom.transposeSelect.value = '5';
    state.bpmDebounceTimer = setTimeout(() => {}, 5000);

    resetBpmAndTranspose(128, dom);

    expect(dom.bpmInput.value).toBe('128');
    expect(dom.bpmSlider.value).toBe('128');
    expect(Tone.Transport.bpm.value).toBe(128);
    expect(state.transpose).toBe(0);
    expect(dom.transposeSelect.value).toBe('0');
    expect(state.bpmDebounceTimer).toBeNull();
  });

  it('resetRuntimeControlsForNewFile applies shared reset and count-in cleanup', () => {
    const dom = makeDom();
    dom.bpmInput.value = '87';
    dom.bpmSlider.value = '87';
    dom.transposeSelect.value = '5';
    dom.countInInput.value = '4';
    dom.countInBeat.textContent = '3';

    resetRuntimeControlsForNewFile(dom);

    expect(dom.bpmInput.value).toBe('140');
    expect(dom.bpmSlider.value).toBe('140');
    expect(Tone.Transport.bpm.value).toBe(140);
    expect(state.transpose).toBe(0);
    expect(dom.transposeSelect.value).toBe('0');
    expect(dom.countInInput.value).toBe('0');
    expect(state.countingIn).toBe(false);
    expect(dom.countInOverlay.classList.contains('hidden')).toBe(true);
    expect(dom.countInBeat.textContent).toBe('');
  });
});

describe('reset button integration', () => {
  it('clicking reset clears pending bpm debounce timer and restores defaults', () => {
    const dom = makeDom();
    state.originalBpm = 132;
    state.transpose = 7;
    dom.transposeSelect.value = '5';
    dom.bpmInput.value = '90';
    dom.bpmSlider.value = '90';
    state.bpmDebounceTimer = setTimeout(() => {}, 5000);

    initControls(dom);
    dom.btnReset.click();

    expect(dom.bpmInput.value).toBe('132');
    expect(dom.bpmSlider.value).toBe('132');
    expect(Tone.Transport.bpm.value).toBe(132);
    expect(state.transpose).toBe(0);
    expect(dom.transposeSelect.value).toBe('0');
    expect(state.bpmDebounceTimer).toBeNull();
  });
});
