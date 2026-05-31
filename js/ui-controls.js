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
  transportToMidiTime, updateSynthSettings, setSoundMode,
} from './audio-engine.js';
import { exportMidi, parseMidiFile } from './midi-loader.js';
import { buildPiano, scrollPianoToActiveRange } from './piano-keyboard.js';
import { createSynth, createAutoSynths } from './audio-engine.js';
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

  // Default to auto mode — preset & advanced controls disabled until Custom is selected
  dom.soundPreset.disabled = true;
  dom.btnSoundAdvanced.disabled = true;

  dom.soundPreset.addEventListener('change', (e) => {
    const preset = SOUND_PRESETS[e.target.value];
    if (preset) {
      updateSynthSettings(preset);
      syncSoundControls(dom);
    }
  });

  // ---- Sound Mode toggle (Auto / Custom) ----
  if (dom.soundModeSelect) {
    dom.soundModeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      setSoundMode(mode);

      // Show/hide the preset & advanced controls based on mode
      const customOnly = mode === 'custom';
      dom.soundPreset.disabled = !customOnly;
      dom.btnSoundAdvanced.disabled = !customOnly;
      if (!customOnly) setSoundPanelExpanded(dom, false);
    });
  }

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

  // ---- Track panel toggle ----
  dom.btnToggleTracks.addEventListener('click', () => {
    const isHidden = dom.trackPanelWrap.classList.toggle('hidden');
    dom.btnToggleTracks.setAttribute('aria-pressed', String(!isHidden));
    dom.btnToggleTracks.setAttribute('aria-label', isHidden ? 'Show track list' : 'Hide track list');
    dom.btnToggleTracks.setAttribute('title', isHidden ? 'Show track list' : 'Hide track list');
  });

  dom.btnTrackAll.addEventListener('click', () => setAllTracks(dom, true));
  dom.btnTrackNone.addEventListener('click', () => setAllTracks(dom, false));

  // ---- More button (row 2 toggle) ----
  dom.moreBtn.addEventListener('click', () => {
    const isOpen = dom.menuRow2.classList.toggle('open');
    dom.moreBtn.setAttribute('aria-expanded', String(isOpen));
    dom.moreBtn.textContent = isOpen ? '\u25b2 Less' : '\u25bc More';
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

  // ---- BPM touch drag (mobile) ----
  // Vertical drag on the number input: drag up = increase BPM, drag down = decrease BPM.
  // A dead zone of 5 px distinguishes a tap (opens keyboard) from an intentional drag.
  {
    const BPM_PX_PER_STEP = 3; // pixels of vertical movement per 1 BPM
    let bpmDrag = null; // null when idle; { startY, startBpm, active } while touching

    dom.bpmInput.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      // Do NOT stopPropagation here — allow the header to see this touch
      // so the menu bar can still be dragged when the user swipes over this field.
      bpmDrag = {
        startY: e.touches[0].clientY,
        startBpm: clamp(parseInt(dom.bpmInput.value) || 120, 20, 300),
        active: false,
      };
    }, { passive: true });

    dom.bpmInput.addEventListener('touchmove', (e) => {
      if (!bpmDrag || e.touches.length !== 1) return;

      const dy = bpmDrag.startY - e.touches[0].clientY; // positive = finger moved up

      // Enforce dead zone before committing to drag mode.
      // Inside the dead zone, let the event bubble so the header can scroll.
      if (!bpmDrag.active && Math.abs(dy) < 5) return;

      // Past the dead zone — prevent page scroll, stop propagation, enter drag mode
      e.preventDefault();
      e.stopPropagation(); // Only block header scrolling once we've confirmed a vertical drag
      if (!bpmDrag.active) {
        bpmDrag.active = true;
        dom.bpmInput.classList.add('bpm-dragging');
      }

      const delta = Math.round(dy / BPM_PX_PER_STEP);
      const newBpm = clamp(bpmDrag.startBpm + delta, 20, 300);

      dom.bpmInput.value = newBpm;
      dom.bpmSlider.value = newBpm;

      clearTimeout(state.bpmDebounceTimer);
      state.bpmDebounceTimer = setTimeout(() => {
        Tone.Transport.bpm.value = newBpm;
      }, BPM_DEBOUNCE_MS);
    }, { passive: false });

    const finishBpmDrag = () => {
      if (!bpmDrag) return;
      if (bpmDrag.active) {
        // Commit immediately instead of waiting for the debounce
        const bpm = clamp(parseInt(dom.bpmInput.value) || 120, 20, 300);
        clearTimeout(state.bpmDebounceTimer);
        Tone.Transport.bpm.value = bpm;
        dom.bpmInput.classList.remove('bpm-dragging');
      }
      bpmDrag = null;
    };

    dom.bpmInput.addEventListener('touchend', finishBpmDrag, { passive: true });
    dom.bpmInput.addEventListener('touchcancel', finishBpmDrag, { passive: true });

    // ---- BPM slider custom horizontal touch drag ----
    // Swiping across the full slider width changes BPM by the full range (20–300).
    // This replaces the unreliable native range-input touch behaviour on mobile.
    const BPM_MIN = 20;
    const BPM_MAX = 300;
    let sliderDrag = null; // null when idle

    dom.bpmSlider.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      e.stopPropagation();
      const rect = dom.bpmSlider.getBoundingClientRect();
      sliderDrag = {
        startX: e.touches[0].clientX,
        startBpm: clamp(parseInt(dom.bpmInput.value) || 120, BPM_MIN, BPM_MAX),
        sliderWidth: rect.width || 120,
      };
    }, { passive: true });

    dom.bpmSlider.addEventListener('touchmove', (e) => {
      if (!sliderDrag || e.touches.length !== 1) return;
      e.stopPropagation();
      e.preventDefault(); // prevent the header from scrolling horizontally

      const dx = e.touches[0].clientX - sliderDrag.startX;
      const delta = Math.round((dx / sliderDrag.sliderWidth) * (BPM_MAX - BPM_MIN));
      const newBpm = clamp(sliderDrag.startBpm + delta, BPM_MIN, BPM_MAX);

      dom.bpmInput.value = newBpm;
      dom.bpmSlider.value = newBpm;

      clearTimeout(state.bpmDebounceTimer);
      state.bpmDebounceTimer = setTimeout(() => {
        Tone.Transport.bpm.value = newBpm;
      }, BPM_DEBOUNCE_MS);
    }, { passive: false });

    const finishSliderDrag = () => {
      if (!sliderDrag) return;
      const bpm = clamp(parseInt(dom.bpmInput.value) || 120, BPM_MIN, BPM_MAX);
      clearTimeout(state.bpmDebounceTimer);
      Tone.Transport.bpm.value = bpm;
      sliderDrag = null;
    };

    dom.bpmSlider.addEventListener('touchend', finishSliderDrag, { passive: true });
    dom.bpmSlider.addEventListener('touchcancel', finishSliderDrag, { passive: true });
  }

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

  // ---- Piano container drag-scroll ----
  {
    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    dom.pianoContainer.addEventListener('mousedown', (e) => {
      // Only drag on the container itself or background, not on piano keys
      isDragging = true;
      startX = e.clientX;
      startScrollLeft = dom.pianoContainer.scrollLeft;
      dom.pianoContainer.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      dom.pianoContainer.scrollLeft = startScrollLeft - dx;
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      dom.pianoContainer.style.cursor = '';
    });
  }
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

  // Reset sound mode to auto for new file
  state.soundMode = 'auto';
  if (dom.soundModeSelect) {
    dom.soundModeSelect.value = 'auto';
    dom.soundPreset.disabled = true;
    dom.btnSoundAdvanced.disabled = true;
  }

  // Reset muted tracks
  state.mutedTracks.clear();
}

/* ----------------------------------------------------------
   Track list UI
   ---------------------------------------------------------- */

/** Populate the track list from state.tracks */
function populateTrackList(dom) {
  const list = dom.trackList;
  list.innerHTML = '';

  // Only show track panel when there are multiple tracks
  if (state.tracks.length <= 1) {
    dom.trackPanelWrap.classList.add('hidden');
    dom.btnToggleTracks.disabled = true;
    dom.btnToggleTracks.setAttribute('aria-pressed', 'false');
    return;
  }

  dom.btnToggleTracks.disabled = false;

  for (const track of state.tracks) {
    const row = document.createElement('label');
    row.className = 'track-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !state.mutedTracks.has(track.index);
    cb.dataset.trackIndex = track.index;

    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.mutedTracks.delete(track.index);
      } else {
        state.mutedTracks.add(track.index);
      }
      rescheduleIfPlaying();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'track-name';
    nameSpan.textContent = track.name || `Track ${track.index + 1}`;

    const instSpan = document.createElement('span');
    instSpan.className = 'track-instrument';
    instSpan.textContent = track.instrumentName || '';

    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(instSpan);

    if (track.isDrum) {
      const badge = document.createElement('span');
      badge.className = 'track-drum-badge';
      badge.textContent = 'Drums';
      row.appendChild(badge);
    }

    list.appendChild(row);
  }
}

/** Reschedule audio part while preserving playback position */
function rescheduleIfPlaying() {
  if (!state.isPlaying) return;
  const currentSeconds = Tone.Transport.seconds;
  Tone.Transport.pause();
  if (state.part) { state.part.dispose(); state.part = null; }
  schedulePart();
  Tone.Transport.seconds = currentSeconds;
  Tone.Transport.start();
}

/** Set all track checkboxes to a given state */
function setAllTracks(dom, audible) {
  state.mutedTracks.clear();
  if (!audible) {
    for (const track of state.tracks) {
      state.mutedTracks.add(track.index);
    }
  }
  const checkboxes = dom.trackList.querySelectorAll('input[type="checkbox"]');
  for (const cb of checkboxes) {
    cb.checked = audible;
  }
  rescheduleIfPlaying();
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
  if (state.soundMode === 'auto') {
    createAutoSynths();
  } else {
    createSynth();
  }

  // Draw seek density
  drawSeekDensity(dom.seekDensityCanvas, dom.seekContainer);

  // Center piano
  scrollPianoToActiveRange(dom.pianoContainer);

  // Populate track list
  populateTrackList(dom);

  // Signal that a file was loaded
  state.emit('file-loaded');

  dom.loadingOverlay.classList.add('hidden');
}
