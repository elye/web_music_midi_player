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
          channel,
        });
        const end = note.time + note.duration;
        if (end > maxTime) maxTime = end;
      }
    }

    state.notes.sort((a, b) => a.time - b.time);
    state.totalDuration = maxTime;

    if (state.notes.length === 0) {
      showToast('MIDI file has no note events.', 'error');
      return false;
    }

    // BPM from first tempo marker
    const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
    state.originalBpm = clamp(bpm, 20, 300);

    showToast(`Loaded "${file.name}" — ${state.notes.length} notes`, 'success');
    return true;
  } catch (e) {
    console.error(e);
    showToast('Failed to parse MIDI file. Please check the file format.', 'error');
    return false;
  }
}

/** Export the current MIDI with applied transposition & tempo */
export function exportMidi(currentBpm) {
  if (!state.midi) return;

  try {
    const cloned = new Midi(state.midi.toArray());
    const transpose = state.transpose;

    for (const track of cloned.tracks) {
      for (const note of track.notes) {
        note.midi = clamp(note.midi + transpose, 0, 127);
      }
    }

    if (cloned.header.tempos.length > 0) {
      cloned.header.tempos[0].bpm = currentBpm;
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
