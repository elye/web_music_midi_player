/* ==========================================================
   MAIN — Application entry point. Wires all modules together.
   ========================================================== */

import state from './state.js';
import { formatTime, clamp } from './utils.js';
import { initToast } from './toast.js';
import { buildPiano, updatePianoHighlights } from './piano-keyboard.js';
import { renderPianoRoll } from './piano-roll.js';
import { renderWaterfall, initWaterfallSeek, setWaterfallSeekInverted } from './waterfall.js';
import { drawSeekDensity } from './seek-bar.js';
import { transportToMidiTime, stopPlayback } from './audio-engine.js';
import { initControls } from './ui-controls.js';
import { MIDI_NOTE_MIN, MIDI_NOTE_MAX } from './constants.js';

/* ==========================================================
   DOM REFERENCES
   ========================================================== */
const dom = {
  audioOverlay:     document.getElementById('audio-overlay'),
  btnLoad:          document.getElementById('btn-load'),
  btnExport:        document.getElementById('btn-export'),
  btnRewind:        document.getElementById('btn-rewind'),
  btnPlay:          document.getElementById('btn-play'),
  btnStop:          document.getElementById('btn-stop'),
  iconPlay:         document.getElementById('icon-play'),
  iconPause:        document.getElementById('icon-pause'),
  fileInput:        document.getElementById('file-input'),
  bpmInput:         document.getElementById('bpm-input'),
  bpmSlider:        document.getElementById('bpm-slider'),
  transposeSelect:  document.getElementById('transpose-select'),
  btnReset:         document.getElementById('btn-reset'),
  currentTime:      document.querySelector('#time-display .current-time'),
  totalTime:        document.querySelector('#time-display .total-time'),
  seekContainer:    document.getElementById('seek-bar-container'),
  seekDensityCanvas:document.getElementById('seek-density-canvas'),
  seekProgress:     document.getElementById('seek-progress'),
  emptyState:       document.getElementById('empty-state'),
  loadingOverlay:   document.getElementById('loading-overlay'),
  visualizers:      document.getElementById('visualizers'),
  pianoRollPanel:   document.getElementById('piano-roll-panel'),
  btnTogglePianoRoll: document.getElementById('btn-toggle-piano-roll'),
  pianoRollCanvas:  document.getElementById('piano-roll-canvas'),
  waterfallPanel:   document.getElementById('waterfall-panel'),
  waterfallCanvas:  document.getElementById('waterfall-canvas'),
  pianoContainer:   document.getElementById('piano-container'),
  piano:            document.getElementById('piano'),
  toastContainer:   document.getElementById('toast-container'),
  countInInput:     document.getElementById('count-in-input'),
  countInOverlay:   document.getElementById('count-in-overlay'),
  countInBeat:      document.getElementById('count-in-beat'),
  btnSoundAdvanced: document.getElementById('btn-sound-advanced'),
  btnFullscreen:        document.getElementById('btn-fullscreen'),
  iconFullscreenEnter:  document.getElementById('icon-fullscreen-enter'),
  iconFullscreenExit:   document.getElementById('icon-fullscreen-exit'),
  soundPreset:      document.getElementById('sound-preset'),
  soundModeSelect:  document.getElementById('sound-mode-select'),
  soundPanel:       document.getElementById('sound-settings-panel'),
  soundOscType:     document.getElementById('sound-osc-type'),
  soundAttack:      document.getElementById('sound-attack'),
  soundAttackValue: document.getElementById('sound-attack-value'),
  soundDecay:       document.getElementById('sound-decay'),
  soundDecayValue:  document.getElementById('sound-decay-value'),
  soundSustain:     document.getElementById('sound-sustain'),
  soundSustainValue:document.getElementById('sound-sustain-value'),
  soundRelease:     document.getElementById('sound-release'),
  soundReleaseValue:document.getElementById('sound-release-value'),
  soundVolume:           document.getElementById('sound-volume'),
  soundVolumeValue:      document.getElementById('sound-volume-value'),
  waterfallInvertToggle: document.getElementById('waterfall-invert-toggle'),
  moreBtn:              document.getElementById('more-btn'),
  menuRow2:             document.getElementById('menu-row-2'),
  trackPanelWrap:       document.getElementById('track-panel-wrap'),
  btnToggleTracks:      document.getElementById('btn-toggle-tracks'),
  trackList:            document.getElementById('track-list'),
  btnTrackAll:          document.getElementById('btn-track-all'),
  btnTrackNone:         document.getElementById('btn-track-none'),
};

/* ==========================================================
   ANIMATION LOOP
   ========================================================== */
function renderLoop() {
  const currentTime = transportToMidiTime(Tone.Transport.seconds);

  // Time display
  dom.currentTime.textContent = formatTime(currentTime);

  // Seek bar progress
  if (state.totalDuration > 0) {
    const pct = clamp(currentTime / state.totalDuration, 0, 1) * 100;
    dom.seekProgress.style.width = pct + '%';
  }

  // Compute active notes
  state.activeNotes.clear();
  const transpose = state.transpose;
  for (const note of state.notes) {
    if (state.hiddenTracks.has(note.trackIndex)) continue;
    if (note.time <= currentTime && note.time + note.duration > currentTime) {
      const transposed = note.midi + transpose;
      if (transposed >= MIDI_NOTE_MIN && transposed <= MIDI_NOTE_MAX) {
        state.activeNotes.add(transposed);
      }
    }
  }
  updatePianoHighlights();

  // Render canvases
  renderPianoRoll(dom.pianoRollCanvas, dom.pianoRollPanel, currentTime);
  renderWaterfall(dom.waterfallCanvas, dom.waterfallPanel, dom.piano, currentTime);

  // Auto-stop at end
  if (state.isPlaying && currentTime >= state.totalDuration) {
    stopPlayback();
  }

  state.animFrameId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
  if (state.animFrameId) return;
  state.animFrameId = requestAnimationFrame(renderLoop);
}

/* ==========================================================
   RESIZE HANDLING
   ========================================================== */
const resizeObserver = new ResizeObserver(() => {
  drawSeekDensity(dom.seekDensityCanvas, dom.seekContainer);
  if (state.midi) {
    const t = transportToMidiTime(Tone.Transport.seconds);
    renderPianoRoll(dom.pianoRollCanvas, dom.pianoRollPanel, t);
    renderWaterfall(dom.waterfallCanvas, dom.waterfallPanel, dom.piano, t);
  }
});

/* ==========================================================
   BOOTSTRAP
   ========================================================== */
initToast(dom.toastContainer);
buildPiano(dom.piano);
initControls(dom);
initWaterfallSeek(dom.waterfallPanel);

// Sync waterfall seek inversion toggle (default: checked = inverted)
dom.waterfallInvertToggle.addEventListener('change', (e) => {
  setWaterfallSeekInverted(e.target.checked);
});

dom.pianoContainer.addEventListener('scroll', () => {
  if (state.midi) {
    const t = transportToMidiTime(Tone.Transport.seconds);
    renderWaterfall(dom.waterfallCanvas, dom.waterfallPanel, dom.piano, t);
  }
});

resizeObserver.observe(dom.pianoRollPanel);
resizeObserver.observe(dom.waterfallPanel);
resizeObserver.observe(dom.seekContainer);

// Start render loop when a file is loaded
state.on('file-loaded', () => {
  startRenderLoop();
  const t = transportToMidiTime(Tone.Transport.seconds);
  renderPianoRoll(dom.pianoRollCanvas, dom.pianoRollPanel, t);
  renderWaterfall(dom.waterfallCanvas, dom.waterfallPanel, dom.piano, t);
});

// Re-render on stop
state.on('playback-stopped', () => {
  renderPianoRoll(dom.pianoRollCanvas, dom.pianoRollPanel, 0);
  renderWaterfall(dom.waterfallCanvas, dom.waterfallPanel, dom.piano, 0);
});
