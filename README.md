# Muse Browser Extension

Chrome extension for real-time browser automation with human-like mouse movement.

## Setup

1. Clone this repo
2. In Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select the `src` folder
3. Click the extension icon to open the side panel
4. Paste your Firebase config into the setup screen (JS-style, comments OK) and hit Save

No `config.local.js` needed — the side panel handles configuration.

## Architecture

**Content script** (injected into page): Firebase listener, DOM manipulation, archiver, movement recorder/player. This is where commands land.

**Service worker** (background): Chrome APIs only — screenshots, opening tabs, side panel. No DOM access.

**Side panel**: Persistent control UI. Send commands, run scripts, view logs.

## Commands (via Firebase)

- `ping` — health check
- `archive` — bulk archive with address list
- `execute` — run arbitrary JavaScript in page context
- `run-script` — run a named script from `/scripts/`
- `snapshot` — screenshot + optional HTML
- `record` — start/stop movement recording
- `open-url` — open URL in new tab

## Scripts

Reusable scripts live in `/scripts/`. Each exports an async function:

```js
async function myScript(params, { archiver, player, recorder, muse }) {
  // ... do work ...
  return { /* results */ };
}
```

The extension fetches scripts from GitHub at runtime — no reload needed after pushing updates.

## Movement Philosophy

Transform, don't synthesize. All mouse movements are real recordings,
mathematically transformed (affine: rotate + scale + translate) to fit
new start/end points. Variation comes from recording selection and
transform perturbation — never from generated data.
