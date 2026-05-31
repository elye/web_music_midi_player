/* ==========================================================
   MIDI LOADER — File parsing & export
   ========================================================== */

import state from './state.js';
import { clamp } from './utils.js';
import { showToast } from './toast.js';

/**
 * Parse a MIDI File object and populate state.
 * Returns true on success, false on failure.
 */
export async function parseMidiFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const midi = new Midi(arrayBuffer);

    if (!midi.tracks || midi.tracks.length === 0) {
      showToast('MIDI file has no tracks.', 'error');
      return false;
    }

    state.midi = midi;
    state.fileName = file.name.replace(/\.(mid|midi)$/i, '');

    // Build track metadata and extract all notes
    state.notes = [];
    state.tracks = [];
    let maxTime = 0;

    midi.tracks.forEach((track, trackIndex) => {
      const channel = track.channel != null ? track.channel : 0;
      const isDrum = channel === 9;
      const instrumentNumber = track.instrument ? track.instrument.number : 0;
      const instrumentName = track.instrument ? track.instrument.name : '';

      state.tracks.push({
        index: trackIndex,
        name: track.name || `Track ${trackIndex + 1}`,
        instrumentNumber,
        instrumentName,
        channel,
        isDrum,
      });

      for (const note of track.notes) {
        state.notes.push({
          midi: note.midi,
          time: note.time,
          duration: note.duration,
          velocity: note.velocity,
          channel,
          trackIndex,
          instrumentNumber,
          instrumentName,
          isDrum,
        });
        const end = note.time + note.duration;
        if (end > maxTime) maxTime = end;
      }
    });

    state.notes.sort((a, b) => a.time - b.time);
    state.totalDuration = maxTime;

    if (state.notes.length === 0) {
      showToast('MIDI file has no note events.', 'error');
      return false;
    }

    // BPM from first tempo marker
    const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
    state.originalBpm = clamp(bpm, 20, 300);

    showToast(`Loaded "${file.name}" — ${state.notes.length} notes, ${state.tracks.length} track${state.tracks.length !== 1 ? 's' : ''}`, 'success');
    return true;
  } catch (e) {
    console.error(e);
    showToast('Failed to parse MIDI file. Please check the file format.', 'error');
    return false;
  }
}

/** Export the current MIDI with applied transposition & tempo */
export async function exportMidi(currentBpm, customFileName) {
  if (!state.midi) return;

  try {
    const cloned = new Midi(state.midi.toArray());
    const transpose = state.transpose;

    // Remove muted tracks' notes (export only selected/audible tracks)
    for (let i = cloned.tracks.length - 1; i >= 0; i--) {
      if (state.mutedTracks.has(i)) {
        cloned.tracks.splice(i, 1);
      } else {
        for (const note of cloned.tracks[i].notes) {
          note.midi = clamp(note.midi + transpose, 0, 127);
        }
      }
    }

    if (cloned.header.tempos.length > 0) {
      cloned.header.tempos[0].bpm = currentBpm;
    }

    const baseName = customFileName || `${state.fileName}-edited`;
    const fileName = baseName.endsWith('.mid') ? baseName : `${baseName}.mid`;
    const data = cloned.toArray();
    const uint8 = new Uint8Array(data);

    if (typeof window.showSaveFilePicker === 'function') {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'MIDI File', accept: { 'audio/midi': ['.mid', '.midi'] } }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(uint8);
      await writable.close();
    } else {
      // Fallback for browsers without File System Access API
      const blob = new Blob([uint8], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    const exportedTracks = cloned.tracks.length;
    const exportedNotes = cloned.tracks.reduce((sum, t) => sum + t.notes.length, 0);
    showToast(`Exported ${exportedNotes} notes, ${exportedTracks} track${exportedTracks !== 1 ? 's' : ''}`, 'success');
  } catch (e) {
    if (e.name === 'AbortError') return; // User cancelled the picker — do nothing
    console.error(e);
    showToast('Failed to export MIDI file.', 'error');
  }
}
