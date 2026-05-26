(() => {
  'use strict';

  /* ==========================================================
     CONSTANTS
     ========================================================== */
  const MIDI_NOTE_MIN = 21;   // A0
  const MIDI_NOTE_MAX = 108;  // C8
  const TOTAL_KEYS = MIDI_NOTE_MAX - MIDI_NOTE_MIN + 1;
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const PLAYHEAD_X_RATIO = 0.25;       // Playhead at 25% from left
  const PIXELS_PER_SECOND = 200;       // Base scale for piano roll
  const WATERFALL_PPS = 150;           // Waterfall pixels per second
  const SEEK_DEBOUNCE_MS = 50;
  const BPM_DEBOUNCE_MS = 50;
  const TOAST_DURATION_MS = 3500;
  const WHITE_KEY_WIDTH = 18;
  const BLACK_KEY_WIDTH = 12;
  const BLACK_KEY_HEIGHT_RATIO = 0.6;

  /* ==========================================================
     DOM REFERENCES
     ========================================================== */
  const dom = {
    audioOverlay: document.getElementById('audio-overlay'),
    btnLoad: document.getElementById('btn-load'),
    btnExport: document.getElementById('btn-export'),
    btnRewind: document.getElementById('btn-rewind'),
    btnPlay: document.getElementById('btn-play'),
    btnStop: document.getElementById('btn-stop'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    fileInput: document.getElementById('file-input'),
    bpmInput: document.getElementById('bpm-input'),
    bpmSlider: document.getElementById('bpm-slider'),
    transposeSelect: document.getElementById('transpose-select'),
    btnReset: document.getElementById('btn-reset'),
    currentTime: document.querySelector('#time-display .current-time'),
    totalTime: document.querySelector('#time-display .total-time'),
    seekContainer: document.getElementById('seek-bar-container'),
    seekDensityCanvas: document.getElementById('seek-density-canvas'),
    seekProgress: document.getElementById('seek-progress'),
    emptyState: document.getElementById('empty-state'),
    loadingOverlay: document.getElementById('loading-overlay'),
    visualizers: document.getElementById('visualizers'),
    pianoRollPanel: document.getElementById('piano-roll-panel'),
    pianoRollCanvas: document.getElementById('piano-roll-canvas'),
    waterfallPanel: document.getElementById('waterfall-panel'),
    waterfallCanvas: document.getElementById('waterfall-canvas'),
    pianoContainer: document.getElementById('piano-container'),
    piano: document.getElementById('piano'),
    toastContainer: document.getElementById('toast-container'),
    countInInput: document.getElementById('count-in-input'),
    countInOverlay: document.getElementById('count-in-overlay'),
    countInBeat: document.getElementById('count-in-beat'),
  };

  /* ==========================================================
     STATE
     ========================================================== */
  const state = {
    midi: null,
    fileName: '',
    notes: [],            // Flattened, sorted notes: {midi, time, duration, velocity, channel}
    totalDuration: 0,
    originalBpm: 120,     // BPM from the MIDI file, used for time conversion
    isPlaying: false,
    transpose: 0,
    synth: null,
    part: null,
    activeNotes: new Set(),    // Currently sounding MIDI note numbers (transposed)
    animFrameId: null,
    bpmDebounceTimer: null,
    pianoKeys: [],             // DOM elements for piano keys
    keyPositions: new Map(),   // midi note -> {x, w, isBlack}
    countingIn: false,         // True during count-in sequence
  };

  /* ==========================================================
     UTILITY FUNCTIONS
     ========================================================== */
  function noteName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[midi % 12] + octave;
  }

  function isBlackKey(midi) {
    const n = midi % 12;
    return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const whole = Math.floor(secs);
    const ms = Math.floor((secs - whole) * 1000);
    return `${String(mins).padStart(2,'0')}:${String(whole).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Convert MIDI time (seconds at original BPM) to Transport seconds
  function midiTimeToTransport(midiTime) {
    return midiTime * (state.originalBpm / Tone.Transport.bpm.value);
  }

  // Convert Transport seconds to MIDI time (seconds at original BPM)
  function transportToMidiTime(transportSeconds) {
    return transportSeconds * (Tone.Transport.bpm.value / state.originalBpm);
  }

  /* ==========================================================
     TOAST NOTIFICATIONS
     ========================================================== */
  function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('fade-out');
      el.addEventListener('animationend', () => el.remove());
    }, TOAST_DURATION_MS);
  }

  /* ==========================================================
     AUDIO CONTEXT SETUP
     ========================================================== */
  async function ensureAudioContext() {
    if (Tone.context.state === 'suspended') {
      dom.audioOverlay.classList.remove('hidden');
      return new Promise(resolve => {
        const handler = async () => {
          await Tone.start();
          dom.audioOverlay.classList.add('hidden');
          dom.audioOverlay.removeEventListener('click', handler);
          document.removeEventListener('click', handler);
          resolve();
        };
        dom.audioOverlay.addEventListener('click', handler);
      });
    }
  }

  /* ==========================================================
     SYNTH SETUP
     ========================================================== */
  function createSynth() {
    if (state.synth) {
      state.synth.dispose();
    }
    state.synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 64,
      voice: Tone.Synth,
      options: {
        oscillator: { type: "triangle8" },
        envelope: { attack: 0.005, decay: 1.0, sustain: 0.1, release: 1.5 },
        volume: -12,
      }
    }).toDestination();
  }

  /* ==========================================================
     VIRTUAL PIANO KEYBOARD
     ========================================================== */
  function buildPiano() {
    dom.piano.innerHTML = '';
    state.pianoKeys = [];
    state.keyPositions.clear();

    // Calculate positions for each key
    let whiteIndex = 0;
    // First pass: count white keys and assign positions
    const positions = [];
    for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
      if (!isBlackKey(midi)) {
        positions.push({ midi, x: whiteIndex * WHITE_KEY_WIDTH, w: WHITE_KEY_WIDTH, isBlack: false });
        whiteIndex++;
      }
    }

    const totalWidth = whiteIndex * WHITE_KEY_WIDTH;
    dom.piano.style.width = totalWidth + 'px';

    // White keys first
    for (const pos of positions) {
      state.keyPositions.set(pos.midi, pos);
      const key = document.createElement('div');
      key.className = 'piano-key white';
      key.style.left = pos.x + 'px';
      key.style.width = WHITE_KEY_WIDTH + 'px';
      key.style.height = '100%';
      key.dataset.midi = pos.midi;

      // Label on C notes
      if (pos.midi % 12 === 0) {
        const label = document.createElement('span');
        label.className = 'piano-key-label';
        label.textContent = noteName(pos.midi);
        key.appendChild(label);
      }

      dom.piano.appendChild(key);
      state.pianoKeys[pos.midi] = key;
    }

    // Black keys on second pass
    for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
      if (isBlackKey(midi)) {
        // Find the white key just below
        const prevWhite = state.keyPositions.get(midi - 1);
        if (!prevWhite) continue;
        const x = prevWhite.x + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
        const pos = { midi, x, w: BLACK_KEY_WIDTH, isBlack: true };
        state.keyPositions.set(midi, pos);

        const key = document.createElement('div');
        key.className = 'piano-key black';
        key.style.left = x + 'px';
        key.style.width = BLACK_KEY_WIDTH + 'px';
        key.style.height = (80 * BLACK_KEY_HEIGHT_RATIO) + 'px';
        key.dataset.midi = midi;

        dom.piano.appendChild(key);
        state.pianoKeys[midi] = key;
      }
    }
  }

  function updatePianoHighlights() {
    for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
      const key = state.pianoKeys[midi];
      if (!key) continue;
      if (state.activeNotes.has(midi)) {
        key.classList.add('active');
      } else {
        key.classList.remove('active');
      }
    }
  }

  /* ==========================================================
     SEEK BAR DENSITY VISUALIZATION
     ========================================================== */
  function drawSeekDensity() {
    const canvas = dom.seekDensityCanvas;
    const rect = dom.seekContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!state.notes.length || state.totalDuration <= 0) return;

    // Bucket notes into columns
    const buckets = Math.max(1, Math.floor(rect.width / 2));
    const density = new Float32Array(buckets);
    let maxDensity = 0;

    for (const note of state.notes) {
      const bucket = Math.floor((note.time / state.totalDuration) * buckets);
      if (bucket >= 0 && bucket < buckets) {
        density[bucket] += note.velocity;
        if (density[bucket] > maxDensity) maxDensity = density[bucket];
      }
    }

    if (maxDensity === 0) return;

    const barW = rect.width / buckets;
    ctx.fillStyle = 'rgba(76, 201, 240, 0.25)';
    for (let i = 0; i < buckets; i++) {
      const h = (density[i] / maxDensity) * rect.height;
      ctx.fillRect(i * barW, rect.height - h, barW, h);
    }
  }

  /* ==========================================================
     CANVAS SETUP HELPERS
     ========================================================== */
  function setupCanvas(canvas, container) {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  }

  /* ==========================================================
     PIANO ROLL RENDERER
     ========================================================== */
  function renderPianoRoll(currentTime) {
    const { ctx, w, h } = setupCanvas(dom.pianoRollCanvas, dom.pianoRollPanel);
    ctx.clearRect(0, 0, w, h);

    const noteRange = MIDI_NOTE_MAX - MIDI_NOTE_MIN + 1;
    const noteHeight = h / noteRange;
    const pps = PIXELS_PER_SECOND * (state.originalBpm / 120);

    // Gutter width for labels
    const gutterW = 36;
    const rollW = w - gutterW;
    const playheadX = gutterW + rollW * PLAYHEAD_X_RATIO;

    // Time range visible
    const timeLeft = currentTime - (playheadX - gutterW) / pps;
    const timeRight = currentTime + (w - playheadX) / pps;

    // Draw octave grid lines
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
      if (midi % 12 === 0) {
        const y = h - (midi - MIDI_NOTE_MIN + 0.5) * noteHeight;
        ctx.beginPath();
        ctx.moveTo(gutterW, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // Draw gutter labels
    ctx.fillStyle = '#6c757d';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi += 12) {
      const y = h - (midi - MIDI_NOTE_MIN + 0.5) * noteHeight;
      ctx.fillText(noteName(midi), gutterW - 4, y);
    }

    // Gutter separator
    ctx.strokeStyle = '#2a2a3e';
    ctx.beginPath();
    ctx.moveTo(gutterW, 0);
    ctx.lineTo(gutterW, h);
    ctx.stroke();

    // Draw notes
    const transpose = state.transpose;
    for (const note of state.notes) {
      const noteEnd = note.time + note.duration;
      if (noteEnd < timeLeft || note.time > timeRight) continue;

      const transposedMidi = note.midi + transpose;
      if (transposedMidi < MIDI_NOTE_MIN || transposedMidi > MIDI_NOTE_MAX) continue;

      const x = playheadX + (note.time - currentTime) * pps;
      const noteW = note.duration * pps;
      const y = h - (transposedMidi - MIDI_NOTE_MIN + 1) * noteHeight;

      const isActive = note.time <= currentTime && noteEnd > currentTime;

      // Color by channel, opacity by velocity
      const hue = (note.channel * 37) % 360;
      const alpha = 0.4 + note.velocity * 0.6;

      if (isActive) {
        ctx.fillStyle = `rgba(76, 201, 240, ${alpha})`;
        ctx.shadowColor = 'rgba(76, 201, 240, 0.5)';
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      const r = Math.min(3, noteHeight / 2, noteW / 2);
      roundRect(ctx, x, y, Math.max(noteW, 2), noteHeight - 1, r);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Playhead
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(76, 201, 240, 0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ==========================================================
     WATERFALL RENDERER
     ========================================================== */
  function renderWaterfall(currentTime) {
    const { ctx, w, h } = setupCanvas(dom.waterfallCanvas, dom.waterfallPanel);
    ctx.clearRect(0, 0, w, h);

    if (!state.notes.length) return;

    const transpose = state.transpose;
    const pps = WATERFALL_PPS * (state.originalBpm / 120);

    // Time window: notes falling from top, reaching bottom at currentTime
    const timeTop = currentTime + h / pps;
    const timeBottom = currentTime;

    // Map pitch to x positions using the piano key positions
    // We need to get the piano total width and scale it to canvas width
    const pianoTotalWidth = dom.piano.offsetWidth || 1;
    const scaleX = w / pianoTotalWidth;

    // Draw octave grid lines (vertical, aligned with C notes)
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let midi = MIDI_NOTE_MIN; midi <= MIDI_NOTE_MAX; midi++) {
      if (midi % 12 === 0) {
        const pos = state.keyPositions.get(midi);
        if (pos) {
          const x = pos.x * scaleX;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
    }

    // Draw notes
    for (const note of state.notes) {
      const noteEnd = note.time + note.duration;
      if (noteEnd < timeBottom - 0.5 || note.time > timeTop) continue;

      const transposedMidi = note.midi + transpose;
      const pos = state.keyPositions.get(transposedMidi);
      if (!pos) continue;

      const x = pos.x * scaleX;
      const noteW = pos.w * scaleX;

      // Y: bottom of screen = currentTime, top = currentTime + windowDuration
      const yBottom = h - (note.time - currentTime) * pps;
      const yTop = h - (noteEnd - currentTime) * pps;
      const noteH = yBottom - yTop;

      const isActive = note.time <= currentTime && noteEnd > currentTime;

      const hue = (note.channel * 37) % 360;
      const alpha = 0.4 + note.velocity * 0.6;

      if (isActive) {
        ctx.fillStyle = `rgba(76, 201, 240, ${alpha})`;
        ctx.shadowColor = 'rgba(76, 201, 240, 0.6)';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      const r = Math.min(3, Math.max(noteH, 2) / 2);
      roundRect(ctx, x, yTop, Math.max(noteW - 1, 2), Math.max(noteH, 2), r);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /* ==========================================================
     ROUNDED RECT HELPER
     ========================================================== */
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 0 || h < 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* ==========================================================
     ANIMATION LOOP
     ========================================================== */
  function renderLoop() {
    const currentTime = transportToMidiTime(Tone.Transport.seconds);

    // Update time display
    dom.currentTime.textContent = formatTime(currentTime);

    // Update seek bar
    if (state.totalDuration > 0) {
      const pct = clamp(currentTime / state.totalDuration, 0, 1) * 100;
      dom.seekProgress.style.width = pct + '%';
    }

    // Update active notes
    state.activeNotes.clear();
    const transpose = state.transpose;
    for (const note of state.notes) {
      if (note.time <= currentTime && note.time + note.duration > currentTime) {
        const transposed = note.midi + transpose;
        if (transposed >= MIDI_NOTE_MIN && transposed <= MIDI_NOTE_MAX) {
          state.activeNotes.add(transposed);
        }
      }
    }
    updatePianoHighlights();

    // Render canvases
    renderPianoRoll(currentTime);
    renderWaterfall(currentTime);

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

  function stopRenderLoop() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
  }

  /* ==========================================================
     COUNT-IN
     ========================================================== */
  async function performCountIn(beats) {
    const bpm = Tone.Transport.bpm.value;
    const beatDurationMs = (60 / bpm) * 1000;

    const clickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      volume: -6,
    }).toDestination();

    dom.countInOverlay.classList.remove('hidden');

    return new Promise((resolve) => {
      let beat = 0;

      function tick() {
        beat++;
        dom.countInBeat.textContent = beat;
        dom.countInBeat.classList.remove('count-in-pop');
        void dom.countInBeat.offsetWidth; // force reflow to restart animation
        dom.countInBeat.classList.add('count-in-pop');

        clickSynth.triggerAttackRelease('C2', '32n');

        if (beat < beats) {
          setTimeout(tick, beatDurationMs);
        } else {
          setTimeout(() => {
            dom.countInOverlay.classList.add('hidden');
            clickSynth.dispose();
            resolve();
          }, beatDurationMs);
        }
      }

      tick();
    });
  }

  /* ==========================================================
     PLAYBACK CONTROLS
     ========================================================== */
  function schedulePart() {
    if (state.part) {
      state.part.dispose();
      state.part = null;
    }

    const transpose = state.transpose;
    const ppq = Tone.Transport.PPQ;
    const ticksPerSecond = (state.originalBpm / 60) * ppq;

    const events = state.notes.map(n => ({
      timeTicks: Math.round(n.time * ticksPerSecond),
      midi: n.midi + transpose,
      duration: n.duration,  // Keep in original seconds for synth
      velocity: n.velocity,
    })).filter(n => n.midi >= 0 && n.midi <= 127);

    state.part = new Tone.Part((time, value) => {
      const freq = midiToFreq(value.midi);
      // Scale duration by BPM ratio so notes shorten/lengthen with tempo
      const scaledDuration = value.duration * (state.originalBpm / Tone.Transport.bpm.value);
      try {
        state.synth.triggerAttackRelease(freq, scaledDuration, time, value.velocity);
      } catch (e) {
        // Ignore polyphony overflow
      }
    }, events.map(e => [e.timeTicks + "i", e]));

    state.part.start(0);
  }

  async function startPlayback() {
    await ensureAudioContext();
    if (!state.midi) return;

    if (Tone.Transport.state !== 'started') {
      schedulePart();
      Tone.Transport.start();
    }

    state.isPlaying = true;
    dom.iconPlay.style.display = 'none';
    dom.iconPause.style.display = 'block';
    startRenderLoop();
  }

  function pausePlayback() {
    Tone.Transport.pause();
    state.isPlaying = false;
    dom.iconPlay.style.display = 'block';
    dom.iconPause.style.display = 'none';
  }

  function stopPlayback() {
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    if (state.part) {
      state.part.dispose();
      state.part = null;
    }
    state.isPlaying = false;
    state.activeNotes.clear();
    updatePianoHighlights();
    dom.iconPlay.style.display = 'block';
    dom.iconPause.style.display = 'none';
    dom.currentTime.textContent = formatTime(0);
    dom.seekProgress.style.width = '0%';

    // Render one last frame at 0
    renderPianoRoll(0);
    renderWaterfall(0);
  }

  function seekTo(seconds) {
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
    dom.currentTime.textContent = formatTime(seconds);
    const pct = state.totalDuration > 0 ? (seconds / state.totalDuration * 100) : 0;
    dom.seekProgress.style.width = pct + '%';
  }

  /* ==========================================================
     MIDI FILE LOADING
     ========================================================== */
  async function loadMidiFile(file) {
    dom.loadingOverlay.classList.remove('hidden');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      if (!midi.tracks || midi.tracks.length === 0) {
        showToast('MIDI file has no tracks.', 'error');
        dom.loadingOverlay.classList.add('hidden');
        return;
      }

      // Stop any current playback
      stopPlayback();
      stopRenderLoop();

      state.midi = midi;
      state.fileName = file.name.replace(/\.(mid|midi)$/i, '');

      // Extract all notes from all tracks
      state.notes = [];
      let maxTime = 0;

      for (const track of midi.tracks) {
        const channel = track.channel || 0;
        for (const note of track.notes) {
          state.notes.push({
            midi: note.midi,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
            channel: channel,
          });
          const end = note.time + note.duration;
          if (end > maxTime) maxTime = end;
        }
      }

      state.notes.sort((a, b) => a.time - b.time);
      state.totalDuration = maxTime;

      if (state.notes.length === 0) {
        showToast('MIDI file has no note events.', 'error');
        dom.loadingOverlay.classList.add('hidden');
        return;
      }

      // Set BPM from MIDI (use first tempo)
      const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
      const clampedBpm = clamp(bpm, 20, 300);
      state.originalBpm = clampedBpm;
      dom.bpmInput.value = clampedBpm;
      dom.bpmSlider.value = clampedBpm;
      Tone.Transport.bpm.value = clampedBpm;

      // Update UI
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

      // Create synth
      createSynth();

      // Draw seek density
      drawSeekDensity();

      // Scroll piano to center of note range
      scrollPianoToActiveRange();

      // Start render loop for initial draw
      startRenderLoop();

      // Render initial frame
      renderPianoRoll(0);
      renderWaterfall(0);

      showToast(`Loaded "${file.name}" — ${state.notes.length} notes`, 'success');

    } catch (e) {
      console.error(e);
      showToast('Failed to parse MIDI file. Please check the file format.', 'error');
    } finally {
      dom.loadingOverlay.classList.add('hidden');
    }
  }

  function scrollPianoToActiveRange() {
    if (state.notes.length === 0) return;
    let minNote = 127, maxNote = 0;
    for (const n of state.notes) {
      if (n.midi < minNote) minNote = n.midi;
      if (n.midi > maxNote) maxNote = n.midi;
    }
    const midNote = Math.floor((minNote + maxNote) / 2);
    const pos = state.keyPositions.get(clamp(midNote, MIDI_NOTE_MIN, MIDI_NOTE_MAX));
    if (pos) {
      const containerW = dom.pianoContainer.offsetWidth;
      dom.pianoContainer.scrollLeft = pos.x - containerW / 2;
    }
  }

  /* ==========================================================
     MIDI EXPORT
     ========================================================== */
  function exportMidi() {
    if (!state.midi) return;

    try {
      // Clone by re-parsing the original data
      const cloned = new Midi(state.midi.toArray());
      const transpose = state.transpose;

      // Apply transposition
      for (const track of cloned.tracks) {
        for (const note of track.notes) {
          note.midi = clamp(note.midi + transpose, 0, 127);
        }
      }

      // Apply current tempo
      if (cloned.header.tempos.length > 0) {
        cloned.header.tempos[0].bpm = parseFloat(dom.bpmInput.value) || 120;
      }

      const data = cloned.toArray();
      const blob = new Blob([new Uint8Array(data)], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.fileName}-edited.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('MIDI exported successfully!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to export MIDI file.', 'error');
    }
  }

  /* ==========================================================
     EVENT HANDLERS
     ========================================================== */

  // File loading
  dom.btnLoad.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadMidiFile(file);
    e.target.value = ''; // Reset for re-loading same file
  });

  // Drag and drop on body
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /\.(mid|midi)$/i.test(file.name)) {
      loadMidiFile(file);
    } else if (file) {
      showToast('Please drop a .mid or .midi file.', 'error');
    }
  });

  // Export
  dom.btnExport.addEventListener('click', exportMidi);

  // Transport
  dom.btnPlay.addEventListener('click', async () => {
    if (!state.midi || state.countingIn) return;
    if (state.isPlaying) {
      pausePlayback();
    } else {
      const countIn = parseInt(dom.countInInput.value) || 0;
      const shouldCountIn = countIn > 0 && Tone.Transport.state === 'stopped';

      if (shouldCountIn) {
        await ensureAudioContext();
        state.countingIn = true;
        dom.btnPlay.disabled = true;
        dom.btnStop.disabled = true;
        await performCountIn(countIn);
        state.countingIn = false;
        dom.btnPlay.disabled = false;
        dom.btnStop.disabled = false;
      }

      await startPlayback();
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

  // BPM controls
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

  // Reset to original
  dom.btnReset.addEventListener('click', () => {
    if (!state.midi) return;

    // Reset BPM
    const bpm = state.originalBpm;
    dom.bpmInput.value = bpm;
    dom.bpmSlider.value = bpm;
    Tone.Transport.bpm.value = bpm;

    // Reset transpose
    state.transpose = 0;
    dom.transposeSelect.value = '0';

    // Reschedule if playing
    if (state.isPlaying) {
      const currentSeconds = Tone.Transport.seconds;
      Tone.Transport.pause();
      if (state.part) {
        state.part.dispose();
        state.part = null;
      }
      schedulePart();
      Tone.Transport.start();
    }

    showToast(`Reset to ${bpm} BPM, no transpose`, 'info');
  });

  // Transpose
  dom.transposeSelect.addEventListener('change', (e) => {
    state.transpose = parseInt(e.target.value) || 0;
    // Reschedule the part if playing
    if (state.isPlaying) {
      const currentTime = Tone.Transport.seconds;
      Tone.Transport.pause();
      if (state.part) {
        state.part.dispose();
        state.part = null;
      }
      schedulePart();
      Tone.Transport.start();
    }
  });

  // Seek bar
  let isSeeking = false;

  function handleSeek(e) {
    if (!state.midi) return;
    const rect = dom.seekContainer.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * state.totalDuration);
  }

  dom.seekContainer.addEventListener('mousedown', (e) => {
    isSeeking = true;
    handleSeek(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isSeeking) handleSeek(e);
  });

  window.addEventListener('mouseup', () => {
    isSeeking = false;
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        dom.btnPlay.click();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (state.midi) seekTo(Tone.Transport.seconds - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (state.midi) seekTo(Tone.Transport.seconds + 5);
        break;
    }
  });

  // Resize handling
  const resizeObserver = new ResizeObserver(() => {
    drawSeekDensity();
    if (state.midi) {
      const t = Tone.Transport.seconds;
      renderPianoRoll(t);
      renderWaterfall(t);
    }
  });

  resizeObserver.observe(dom.pianoRollPanel);
  resizeObserver.observe(dom.waterfallPanel);
  resizeObserver.observe(dom.seekContainer);

  /* ==========================================================
     INITIALIZATION
     ========================================================== */
  buildPiano();

  // Check audio context state on first interaction
  document.addEventListener('click', async () => {
    if (Tone.context.state === 'suspended') {
      await Tone.start();
    }
  }, { once: true });

})();
