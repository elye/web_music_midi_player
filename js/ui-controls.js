/* ==========================================================
   UI CONTROLS — Header bar buttons, BPM, transpose, shortcuts
   ========================================================== */

import state from './state.js';
import { clamp, formatTime } from './utils.js';
import { showToast } from './toast.js';
import { BPM_DEBOUNCE_MS } from './constants.js';
import {
  startPlayback, pausePlayback, stopPlayback, seekTo,
  schedulePart, performCountIn, ensureAudioContext,
  transportToMidiTime, updateSynthSettings,
} from './audio-engine.js';
import { exportMidi, parseMidiFile } from './midi-loader.js';
import { buildPiano, scrollPianoToActiveRange } from './piano-keyboard.js';
import { createSynth } from './audio-engine.js';
import { drawSeekDensity, initSeekInteraction } from './seek-bar.js';

const SOUND_PRESETS = {
  Piano:   { oscillator: 'triangle', attack: 0.001, decay: 1.5,  sustain: 0,    release: 1.2,  volume: -6  },
  Organ:   { oscillator: 'sine',     attack: 0.015, decay: 0.05, sustain: 0.85, release: 0.15, volume: -9  },
  Guitar:  { oscillator: 'triangle', attack: 0.004, decay: 0.85, sustain: 0,    release: 0.12, volume: -10 },
  Brass:   { oscillator: 'sawtooth', attack: 0.002, decay: 0.18, sustain: 0.7,  release: 0.25, volume: -9  },
  Digital: { oscillator: 'square',   attack: 0.006, decay: 0.12, sustain: 0.5,  release: 0.35, volume: -6  },
};

const SOUND_LIMITS = {
  attack: { min: 0.001, max: 0.1, digits: 3 },
  decay: { min: 0.05, max: 2, digits: 2 },
  sustain: { min: 0, max: 0.9, digits: 2 },
  release: { min: 0.05, max: 2, digits: 2 },
  volume: { min: -24, max: 0, digits: 0 },
};

function formatSynthNumber(value, digits) {
  if (digits === 0) return String(Math.round(value));
  return Number(value).toFixed(digits);
}

function setSoundPanelExpanded(dom, expanded) {
  dom.soundPanel.classList.toggle('hidden', !expanded);
  dom.btnSoundAdvanced.setAttribute('aria-expanded', String(expanded));
}

function syncSoundControls(dom) {
  const s = state.synthSettings;
  dom.soundOscType.value = s.oscillator;
  dom.soundAttack.value = s.attack;
  dom.soundDecay.value = s.decay;
  dom.soundSustain.value = s.sustain;
  dom.soundRelease.value = s.release;
  dom.soundVolume.value = s.volume;

  dom.soundAttackValue.textContent = formatSynthNumber(s.attack, SOUND_LIMITS.attack.digits) + ' s';
  dom.soundDecayValue.textContent = formatSynthNumber(s.decay, SOUND_LIMITS.decay.digits) + ' s';
  dom.soundSustainValue.textContent = formatSynthNumber(s.sustain, SOUND_LIMITS.sustain.digits);
  dom.soundReleaseValue.textContent = formatSynthNumber(s.release, SOUND_LIMITS.release.digits) + ' s';
  dom.soundVolumeValue.textContent = formatSynthNumber(s.volume, SOUND_LIMITS.volume.digits) + ' dB';
}

/**
 * Wire up all header controls and keyboard shortcuts.
 * @param {Object} dom — map of DOM element references
 */
export function initControls(dom) {
  // Apply Piano preset as default, then sync controls
  updateSynthSettings(SOUND_PRESETS.Piano);
  dom.soundPreset.value = 'Piano';
  setSoundPanelExpanded(dom, false);
  syncSoundControls(dom);

  dom.soundPreset.addEventListener('change', (e) => {
    const preset = SOUND_PRESETS[e.target.value];
    if (preset) {
      updateSynthSettings(preset);
      syncSoundControls(dom);
    }
  });

  dom.btnSoundAdvanced.addEventListener('click', () => {
    const isExpanded = dom.btnSoundAdvanced.getAttribute('aria-expanded') === 'true';
    setSoundPanelExpanded(dom, !isExpanded);
  });

  // ---- Piano Roll toggle ----
  dom.btnTogglePianoRoll.addEventListener('click', () => {
    const isHidden = dom.pianoRollPanel.classList.toggle('hidden');
    dom.btnTogglePianoRoll.setAttribute('aria-pressed', String(!isHidden));
    dom.btnTogglePianoRoll.setAttribute('aria-label', isHidden ? 'Show piano roll' : 'Hide piano roll');
    dom.btnTogglePianoRoll.setAttribute('title', isHidden ? 'Show piano roll' : 'Hide piano roll');
  });

  dom.soundOscType.addEventListener('change', (e) => {
    updateSynthSettings({ oscillator: e.target.value });
    syncSoundControls(dom);
  });

  const bindSoundSlider = (inputEl, valueEl, key) => {
    const { min, max, digits } = SOUND_LIMITS[key];
    inputEl.addEventListener('input', (e) => {
      const next = clamp(parseFloat(e.target.value), min, max);
      updateSynthSettings({ [key]: next });
      valueEl.textContent = key === 'volume'
        ? formatSynthNumber(state.synthSettings[key], digits) + ' dB'
        : (key === 'sustain'
          ? formatSynthNumber(state.synthSettings[key], digits)
          : formatSynthNumber(state.synthSettings[key], digits) + ' s');
      inputEl.value = state.synthSettings[key];
    });
  };

  bindSoundSlider(dom.soundAttack, dom.soundAttackValue, 'attack');
  bindSoundSlider(dom.soundDecay, dom.soundDecayValue, 'decay');
  bindSoundSlider(dom.soundSustain, dom.soundSustainValue, 'sustain');
  bindSoundSlider(dom.soundRelease, dom.soundReleaseValue, 'release');
  bindSoundSlider(dom.soundVolume, dom.soundVolumeValue, 'volume');

  // ---- File loading ----
  dom.btnLoad.addEventListener('click', () => dom.fileInput.click());

  dom.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handleFileLoad(file, dom);
    e.target.value = '';
  });

  // Drag & drop
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /\.(mid|midi)$/i.test(file.name)) {
      await handleFileLoad(file, dom);
    } else if (file) {
      showToast('Please drop a .mid or .midi file.', 'error');
    }
  });

  // ---- Export ----
  dom.btnExport.addEventListener('click', () => {
    exportMidi(parseFloat(dom.bpmInput.value) || 120).catch(() => {});
  });

  // ---- Transport ----
  dom.btnPlay.addEventListener('click', async () => {
    if (!state.midi || state.countingIn) return;

    if (state.isPlaying) {
      pausePlayback();
    } else {
      const countIn = parseInt(dom.countInInput.value) || 0;
      const shouldCountIn = countIn > 0 && Tone.Transport.state === 'stopped';

      if (shouldCountIn) {
        await ensureAudioContext(dom.audioOverlay);
        state.countingIn = true;
        dom.btnPlay.disabled = true;
        dom.btnStop.disabled = true;
        await performCountIn(countIn, dom.countInOverlay, dom.countInBeat);
        state.countingIn = false;
        dom.btnPlay.disabled = false;
        dom.btnStop.disabled = false;
      }

      await startPlayback(dom.audioOverlay);
    }
  });

  dom.btnStop.addEventListener('click', () => {
    if (!state.midi) return;
    stopPlayback();
  });

  dom.btnRewind.addEventListener('click', () => {
    if (!state.midi) return;
    seekTo(0);
  });

  // ---- BPM ----
  dom.bpmInput.addEventListener('input', (e) => {
    const raw = parseInt(e.target.value);
    if (isNaN(raw)) return;
    if (raw >= 20 && raw <= 300) {
      dom.bpmSlider.value = raw;
      clearTimeout(state.bpmDebounceTimer);
      state.bpmDebounceTimer = setTimeout(() => {
        Tone.Transport.bpm.value = raw;
      }, BPM_DEBOUNCE_MS);
    }
  });

  dom.bpmInput.addEventListener('blur', () => {
    const bpm = clamp(parseInt(dom.bpmInput.value) || 120, 20, 300);
    dom.bpmInput.value = bpm;
    dom.bpmSlider.value = bpm;
    clearTimeout(state.bpmDebounceTimer);
    Tone.Transport.bpm.value = bpm;
  });

  dom.bpmSlider.addEventListener('input', (e) => {
    const bpm = clamp(parseInt(e.target.value) || 120, 20, 300);
    dom.bpmInput.value = bpm;
    dom.bpmSlider.value = bpm;
    clearTimeout(state.bpmDebounceTimer);
    state.bpmDebounceTimer = setTimeout(() => {
      Tone.Transport.bpm.value = bpm;
    }, BPM_DEBOUNCE_MS);
  });

  // ---- Reset ----
  dom.btnReset.addEventListener('click', () => {
    if (!state.midi) return;
    const bpm = state.originalBpm;
    resetBpmAndTranspose(bpm, dom);

    if (state.isPlaying) {
      Tone.Transport.pause();
      if (state.part) { state.part.dispose(); state.part = null; }
      schedulePart();
      Tone.Transport.start();
    }

    showToast(`Reset to ${bpm} BPM, no transpose`, 'info');
  });

  // ---- Transpose ----
  dom.transposeSelect.addEventListener('change', (e) => {
    state.transpose = parseInt(e.target.value) || 0;
    if (state.isPlaying) {
      Tone.Transport.pause();
      if (state.part) { state.part.dispose(); state.part = null; }
      schedulePart();
      Tone.Transport.start();
    }
  });

  // ---- Seek bar ----
  initSeekInteraction(dom.seekContainer);

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        dom.btnPlay.click();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (state.midi) seekTo(transportToMidiTime(Tone.Transport.seconds) - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (state.midi) seekTo(transportToMidiTime(Tone.Transport.seconds) + 5);
        break;
    }
  });

  // ---- Playback state listeners ----
  state.on('playback-started', () => {
    dom.iconPlay.style.display = 'none';
    dom.iconPause.style.display = 'block';
  });

  state.on('playback-paused', () => {
    dom.iconPlay.style.display = 'block';
    dom.iconPause.style.display = 'none';
  });

  state.on('playback-stopped', () => {
    dom.iconPlay.style.display = 'block';
    dom.iconPause.style.display = 'none';
    dom.currentTime.textContent = formatTime(0);
    dom.seekProgress.style.width = '0%';
  });

  state.on('seeked', (seconds) => {
    dom.currentTime.textContent = formatTime(seconds);
    const pct = state.totalDuration > 0 ? (seconds / state.totalDuration * 100) : 0;
    dom.seekProgress.style.width = pct + '%';
  });

  // ---- First-click audio unlock ----
  document.addEventListener('click', async () => {
    if (Tone.context.state === 'suspended') {
      await Tone.start();
    }
  }, { once: true });

  // ---- Fullscreen ----
  dom.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = !!document.fullscreenElement;
    dom.iconFullscreenEnter.style.display = isFullscreen ? 'none' : '';
    dom.iconFullscreenExit.style.display = isFullscreen ? '' : 'none';
    dom.btnFullscreen.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen');
    dom.btnFullscreen.setAttribute('title', isFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen');
  });
}

/**
 * Reset BPM and transpose state/UI to defaults.
 * @param {number} newBpm — BPM value to set
 * @param {Object} dom — map of DOM element references
 */
export function resetBpmAndTranspose(newBpm, dom) {
  clearTimeout(state.bpmDebounceTimer);
  state.bpmDebounceTimer = null;

  dom.bpmInput.value = newBpm;
  dom.bpmSlider.value = newBpm;
  Tone.Transport.bpm.value = newBpm;

  state.transpose = 0;
  dom.transposeSelect.value = '0';
}

export function resetRuntimeControlsForNewFile(dom) {
  const bpm = state.originalBpm;
  resetBpmAndTranspose(bpm, dom);

  dom.countInInput.value = '0';
  state.countingIn = false;
  dom.countInOverlay.classList.add('hidden');
  dom.countInBeat.textContent = '';
}

/* ----------------------------------------------------------
   File load handler (orchestrates all modules)
   ---------------------------------------------------------- */
async function handleFileLoad(file, dom) {
  dom.loadingOverlay.classList.remove('hidden');

  // Stop current playback
  stopPlayback();

  const success = await parseMidiFile(file);

  if (!success) {
    dom.loadingOverlay.classList.add('hidden');
    return;
  }

  // Re-assert a clean transport state after async parse work completes.
  stopPlayback();
  resetRuntimeControlsForNewFile(dom);

  // Update time display
  dom.totalTime.textContent = formatTime(state.totalDuration);
  dom.currentTime.textContent = formatTime(0);
  dom.seekProgress.style.width = '0%';

  // Enable controls
  dom.btnExport.disabled = false;
  dom.btnPlay.disabled = false;
  dom.btnStop.disabled = false;
  dom.btnRewind.disabled = false;
  dom.btnReset.disabled = false;

  // Show visualizers
  dom.emptyState.classList.add('hidden');
  dom.visualizers.style.display = 'flex';

  // Initialize audio
  createSynth();

  // Draw seek density
  drawSeekDensity(dom.seekDensityCanvas, dom.seekContainer);

  // Center piano
  scrollPianoToActiveRange(dom.pianoContainer);

  // Signal that a file was loaded
  state.emit('file-loaded');

  dom.loadingOverlay.classList.add('hidden');
}
