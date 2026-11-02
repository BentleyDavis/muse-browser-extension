# Muse Browser Extension

Chrome extension for real-time browser automation with human-like mouse movement.

## Setup

1. Copy `src/config.example.js` to `src/config.local.js`
2. Fill in your Firebase config and secret token
3. Load unpacked in Chrome (developer mode)
4. `config.local.js` is gitignored — never commit it

## Architecture

- **content.js** — main content script, runs on messages.google.com
- **firebase.js** — Realtime Database listener for commands
- **recorder.js** — records real mouse movements
- **player.js** — transforms recordings (rotate/scale/translate) with variation
- **archiver.js** — thread matching and bulk archive

## Movement Philosophy

Transform, don't synthesize. All mouse movements are real recordings,
mathematically transformed (affine: rotate + scale + translate) to fit
new start/end points. Variation comes from recording selection and
transform perturbation — never from generated data.
