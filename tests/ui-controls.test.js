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
  const soundPreset = document.createElement('select');
  soundPreset.innerHTML = '<option value="">— Preset —</option><option value="Piano">Piano</option>';
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
  const pianoRollPanel = document.createElement('div');
  pianoRollPanel.classList.add('hidden');
  const btnTogglePianoRoll = document.createElement('button');
  const btnFullscreen = document.createElement('button');
  const iconFullscreenEnter = document.createElement('div');
  const iconFullscreenExit = document.createElement('div');
  const moreBtn = document.createElement('button');
  moreBtn.setAttribute('aria-expanded', 'false');
  const menuRow2 = document.createElement('div');

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
    soundPreset,
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
    pianoRollPanel,
    btnTogglePianoRoll,
    btnFullscreen,
    iconFullscreenEnter,
    iconFullscreenExit,
    moreBtn,
    menuRow2,
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
  // jsdom may not include the Touch constructor — polyfill it so touch events work
  if (typeof globalThis.Touch === 'undefined') {
    globalThis.Touch = class Touch {
      constructor({ identifier = 0, target, clientX = 0, clientY = 0 } = {}) {
        this.identifier = identifier;
        this.target = target;
        this.clientX = clientX;
        this.clientY = clientY;
      }
    };
  }

  resetStateForTest();
  const mockSynth = { dispose: vi.fn(), toDestination() { return this; } };
  globalThis.Tone = {
    context: { state: 'running' },
    start: vi.fn(async () => {}),
    Synth: function Synth() {},
    PolySynth: vi.fn(() => mockSynth),
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

// ---------------------------------------------------------------------------
// Helper: fire a touch event with a single touch point on the given element
// ---------------------------------------------------------------------------
function fireTouchEvent(el, type, { clientX = 0, clientY = 0 } = {}) {
  const touch = new Touch({ identifier: 1, target: el, clientX, clientY });
  el.dispatchEvent(
    new TouchEvent(type, {
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
      changedTouches: [touch],
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('more button (row 2 toggle)', () => {
  it('clicking More adds the open class to #menu-row-2', () => {
    const dom = makeDom();
    initControls(dom);

    dom.moreBtn.click();

    expect(dom.menuRow2.classList.contains('open')).toBe(true);
  });

  it('clicking More a second time removes the open class from #menu-row-2', () => {
    const dom = makeDom();
    initControls(dom);

    dom.moreBtn.click(); // open
    dom.moreBtn.click(); // close

    expect(dom.menuRow2.classList.contains('open')).toBe(false);
  });

  it('aria-expanded starts false and toggles true/false on each click', () => {
    const dom = makeDom();
    initControls(dom);

    expect(dom.moreBtn.getAttribute('aria-expanded')).toBe('false');

    dom.moreBtn.click();
    expect(dom.moreBtn.getAttribute('aria-expanded')).toBe('true');

    dom.moreBtn.click();
    expect(dom.moreBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('button text changes to "▲ Less" when opened and back to "▼ More" when closed', () => {
    const dom = makeDom();
    initControls(dom);

    dom.moreBtn.click();
    expect(dom.moreBtn.textContent).toBe('\u25b2 Less');

    dom.moreBtn.click();
    expect(dom.moreBtn.textContent).toBe('\u25bc More');
  });
});

describe('BPM touch drag (mobile)', () => {
  it('dragging up on bpmInput increases BPM', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    // Start touch at y=100
    fireTouchEvent(dom.bpmInput, 'touchstart', { clientY: 100 });
    // Move up by 30 px — past the 5 px dead zone; delta = round(30/3) = 10 BPM
    fireTouchEvent(dom.bpmInput, 'touchmove', { clientY: 70 });
    fireTouchEvent(dom.bpmInput, 'touchend', { clientY: 70 });

    expect(parseInt(dom.bpmInput.value)).toBe(130);
    expect(parseInt(dom.bpmSlider.value)).toBe(130);
  });

  it('dragging down on bpmInput decreases BPM', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    // Start touch at y=100
    fireTouchEvent(dom.bpmInput, 'touchstart', { clientY: 100 });
    // Move down by 30 px — past the dead zone; delta = round(-30/3) = -10 BPM
    fireTouchEvent(dom.bpmInput, 'touchmove', { clientY: 130 });
    fireTouchEvent(dom.bpmInput, 'touchend', { clientY: 130 });

    expect(parseInt(dom.bpmInput.value)).toBe(110);
    expect(parseInt(dom.bpmSlider.value)).toBe(110);
  });

  it('small vertical movement within dead zone does not activate BPM drag', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    fireTouchEvent(dom.bpmInput, 'touchstart', { clientY: 100 });
    // Only 3 px — within the 5 px dead zone; BPM must not change
    fireTouchEvent(dom.bpmInput, 'touchmove', { clientY: 97 });
    fireTouchEvent(dom.bpmInput, 'touchend', { clientY: 97 });

    expect(parseInt(dom.bpmInput.value)).toBe(120);
  });

  it('dragging bpmInput clamps BPM to max 300', () => {
    const dom = makeDom();
    dom.bpmInput.value = '290';
    dom.bpmSlider.value = '290';
    initControls(dom);

    fireTouchEvent(dom.bpmInput, 'touchstart', { clientY: 100 });
    // Move up 60 px — would add 20 BPM, capped at 300
    fireTouchEvent(dom.bpmInput, 'touchmove', { clientY: 40 });
    fireTouchEvent(dom.bpmInput, 'touchend', { clientY: 40 });

    expect(parseInt(dom.bpmInput.value)).toBe(300);
  });

  it('dragging bpmInput clamps BPM to min 20', () => {
    const dom = makeDom();
    dom.bpmInput.value = '30';
    dom.bpmSlider.value = '30';
    initControls(dom);

    fireTouchEvent(dom.bpmInput, 'touchstart', { clientY: 100 });
    // Move down 60 px — would subtract 20 BPM, capped at 20
    fireTouchEvent(dom.bpmInput, 'touchmove', { clientY: 160 });
    fireTouchEvent(dom.bpmInput, 'touchend', { clientY: 160 });

    expect(parseInt(dom.bpmInput.value)).toBe(20);
  });

  it('touchend commits BPM to Tone.Transport immediately (bypassing debounce)', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    fireTouchEvent(dom.bpmInput, 'touchstart', { clientY: 100 });
    fireTouchEvent(dom.bpmInput, 'touchmove', { clientY: 70 }); // +10 BPM
    fireTouchEvent(dom.bpmInput, 'touchend', { clientY: 70 });

    expect(Tone.Transport.bpm.value).toBe(130);
  });

  it('dragging bpmSlider right increases BPM proportionally', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    // getBoundingClientRect returns width=0 in jsdom, fallback sliderWidth=120
    // dx=30 → delta = round((30/120)*280) = round(70) = 70 → newBpm = 190
    fireTouchEvent(dom.bpmSlider, 'touchstart', { clientX: 60 });
    fireTouchEvent(dom.bpmSlider, 'touchmove', { clientX: 90 });
    fireTouchEvent(dom.bpmSlider, 'touchend', { clientX: 90 });

    expect(parseInt(dom.bpmInput.value)).toBe(190);
    expect(parseInt(dom.bpmSlider.value)).toBe(190);
  });

  it('dragging bpmSlider left decreases BPM proportionally', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    // dx=-30 → delta = round((-30/120)*280) = -70 → newBpm = 50
    fireTouchEvent(dom.bpmSlider, 'touchstart', { clientX: 90 });
    fireTouchEvent(dom.bpmSlider, 'touchmove', { clientX: 60 });
    fireTouchEvent(dom.bpmSlider, 'touchend', { clientX: 60 });

    expect(parseInt(dom.bpmInput.value)).toBe(50);
    expect(parseInt(dom.bpmSlider.value)).toBe(50);
  });

  it('bpmSlider touchend commits BPM to Tone.Transport immediately', () => {
    const dom = makeDom();
    dom.bpmInput.value = '120';
    dom.bpmSlider.value = '120';
    initControls(dom);

    fireTouchEvent(dom.bpmSlider, 'touchstart', { clientX: 60 });
    fireTouchEvent(dom.bpmSlider, 'touchmove', { clientX: 90 }); // +70 BPM
    fireTouchEvent(dom.bpmSlider, 'touchend', { clientX: 90 });

    expect(Tone.Transport.bpm.value).toBe(190);
  });
});
