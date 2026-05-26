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
  transportToMidiTime,
} from './audio-engine.js';
import { exportMidi, parseMidiFile } from './midi-loader.js';
import { buildPiano, scrollPianoToActiveRange } from './piano-keyboard.js';
import { createSynth } from './audio-engine.js';
import { drawSeekDensity, initSeekInteraction } from './seek-bar.js';

/**
 * Wire up all header controls and keyboard shortcuts.
 * @param {Object} dom — map of DOM element references
 */
export function initControls(dom) {
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
    exportMidi(parseFloat(dom.bpmInput.value) || 120);
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
  function handleBpmChange(value) {
    const bpm = clamp(parseInt(value) || 120, 20, 300);
    dom.bpmInput.value = bpm;
    dom.bpmSlider.value = bpm;
    clearTimeout(state.bpmDebounceTimer);
    state.bpmDebounceTimer = setTimeout(() => {
      Tone.Transport.bpm.value = bpm;
    }, BPM_DEBOUNCE_MS);
  }

  dom.bpmInput.addEventListener('input', (e) => handleBpmChange(e.target.value));
  dom.bpmSlider.addEventListener('input', (e) => handleBpmChange(e.target.value));

  // ---- Reset ----
  dom.btnReset.addEventListener('click', () => {
    if (!state.midi) return;
    const bpm = state.originalBpm;
    dom.bpmInput.value = bpm;
    dom.bpmSlider.value = bpm;
    Tone.Transport.bpm.value = bpm;
    state.transpose = 0;
    dom.transposeSelect.value = '0';

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

  // Set BPM
  const bpm = state.originalBpm;
  dom.bpmInput.value = bpm;
  dom.bpmSlider.value = bpm;
  Tone.Transport.bpm.value = bpm;

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
