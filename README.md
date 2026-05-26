# MIDI Visualizer and Editor

A web-based MIDI visualizer and editor with synchronized playback, dual visualizer panels, and export support.

## What this app does

- Loads MIDI files (.mid, .midi)
- Parses notes, tempo, and timing with @tonejs/midi
- Plays notes with Tone.js and keeps visuals synced to transport time
- Shows two live visualizers:
  - Horizontal piano roll
  - Waterfall/falling notes view
- Highlights active keys on an 88-key virtual piano
- Supports live BPM changes and transposition
- Exports an edited MIDI file with applied tempo and transpose

## Important: How to run

This project uses JavaScript ES modules (the entry script is loaded with type="module").

Because of browser security rules, opening index.html directly with file:// can prevent module loading and break functionality.

Use a local server instead.

### Recommended quick start

From this folder:

python3 -m http.server 8765

Then open:

http://localhost:8765/

## Why direct file opening can fail

When the page is opened as file://.../index.html:

- ES module imports are fetched under stricter origin/CORS rules
- Browsers may block module dependency loading from file origins
- App bootstrap code may never run
- Result: controls can look visible but actions like Load MIDI do not work

With http://localhost, modules load normally and all handlers are attached.

## Controls summary

- File
  - Load MIDI
  - Export MIDI (enabled after successful load)
- Transport
  - Rewind
  - Play/Pause
  - Stop
- Tempo
  - BPM input (20-300)
  - BPM slider
- Transpose
  - -12 to +12 semitones
- Timeline
  - Click or drag to seek

## Keyboard shortcuts

- Space: Play/Pause
- Left Arrow: Seek -5s
- Right Arrow: Seek +5s

## Troubleshooting

### Load MIDI button opens dialog but file does not load

- Confirm you are using http://localhost:8765 and not file://
- Check browser console for script/module errors
- Verify the selected file is .mid or .midi

### No sound

- Click in the page to unlock audio context (browser autoplay policy)
- Ensure your system output device is active

### Visuals not updating

- Verify the file actually contains note events
- Reload the page and try another MIDI file

## Project structure

- index.html: app shell and script includes
- css/: stylesheets
- js/: modular application logic (UI, audio, parsing, rendering)

## Notes

- This app treats Tone.Transport as the timing source of truth
- Tempo and transpose are non-destructive during editing
- Export applies current transpose and tempo to the saved MIDI output
