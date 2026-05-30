# MIDI Visualizer and Editor

A web-based MIDI visualizer and editor with synchronized playback, dual visualizer panels, and export support.

## What this app does

- Loads MIDI files (.mid, .midi) via button click or drag-and-drop
- Parses notes, tempo, and timing with @tonejs/midi
- Plays notes with Tone.js and keeps visuals synced to transport time
- Shows two live visualizers:
  - Waterfall/falling notes view (always on)
  - Horizontal piano roll (toggleable, off by default)
- Highlights active keys on an 88-key virtual piano
- Supports live BPM changes and transposition
- Exports an edited MIDI file with applied tempo and transpose
  - Uses the native OS save dialog (`showSaveFilePicker`) on supported browsers (Chrome, Edge)
  - Falls back to standard download on unsupported browsers (Firefox, Safari, mobile)

## Important: How to run

This project uses JavaScript ES modules (the entry script is loaded with type="module").

Because of browser security rules, opening index.html directly with file:// can prevent module loading and break functionality.

Use a local server instead.

### Quick start

Option 1: npm

```bash
npm install
npm start
```

Option 2: Python

```bash
python3 -m http.server 8765
```

Then open:

http://localhost:8765/

### Running tests

The app runtime still uses a local HTTP server.

`npm` is only used for unit tests:

```bash
npm install
npm test
npm run test:run
```

## Why direct file opening can fail

When the page is opened as file://.../index.html:

- ES module imports are fetched under stricter origin/CORS rules
- Browsers may block module dependency loading from file origins
- App bootstrap code may never run
- Result: controls can look visible but actions like Load MIDI do not work

With http://localhost, modules load normally and all handlers are attached.

## Deploying

This is a pure static site with no build step. Deploy to Cloudflare Pages:

```bash
npx wrangler pages deploy . --project-name your-project-name
```

Or connect your Git repository in the Cloudflare dashboard under **Workers & Pages → Create Application → Pages**, with:

- Build command: *(leave empty)*
- Build output directory: `/`

## Controls summary

- File
  - Load MIDI
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
  - Click or drag to seek (mouse and touch)
- View
  - **▼ More / ▲ Less** — toggles a second row of additional controls
  - Fullscreen toggle — enter/exit fullscreen mode

### More controls (second row)

Tap or click **▼ More** in the top bar to reveal a second row of controls:

- Export MIDI — opens native save dialog (enabled after successful load)
- Count-In — beats of count-in before playback starts (0 = off)
- Preset — quick sound preset selector (Piano, Organ, Guitar, Brass, Digital)
- Piano Roll — show/hide the piano roll panel (off by default)
- Seek / Invert seek — checkbox to invert the waterfall seek direction
- Advanced Sound — expand the synth envelope and volume panel

## Piano keyboard

The virtual piano scrolls horizontally when the keyboard is wider than the viewport.

- **Desktop**: click and drag left/right to scroll
- **Mobile**: swipe left/right to scroll

The waterfall visualizer stays aligned with the visible keyboard region as you scroll.

## Mobile interactions

- **BPM input drag** — on touch devices, drag vertically on the BPM number input to adjust tempo: drag up to increase, drag down to decrease. A 5 px dead zone distinguishes a tap (opens the keyboard) from an intentional drag. Propagation is only blocked after the dead zone is crossed, so the header remains scrollable.
- **BPM slider drag** — swipe horizontally across the BPM slider to adjust tempo proportionally. Swiping the full slider width covers the entire 20–300 BPM range.

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

### Export dialog does not appear

- `showSaveFilePicker` requires a secure context (HTTPS or localhost)
- On unsupported browsers the file downloads automatically to the default downloads folder
- Ensure your system output device is active

### Visuals not updating

- Verify the file actually contains note events
- Reload the page and try another MIDI file

## Project structure

- index.html: app shell and script includes
- favicon.svg: app icon (purple eighth note on dark navy background)
- css/: stylesheets
- js/: modular application logic (UI, audio, parsing, rendering)

## Notes

- This app treats Tone.Transport as the timing source of truth
- Tempo and transpose are non-destructive during editing
- Export applies current transpose and tempo to the saved MIDI output
