# ChillYWait

Play minigames while Gemini thinks. ChillYWait is a Chrome extension that detects when Gemini is generating a response and shows a small draggable overlay with minigames so you can pass the time.

## Features

- Auto-detects Gemini "thinking" / generating state on **gemini.google.com**
- Configurable activation: after a delay (default 8s) or immediately
- Three retro endless arcade games: **Traffic Rider**, **Coffee Frenzy**, **Compile Run**
- Wide arcade-style panel (520×340) with pixel-art canvas games
- DOM-based detection of generating/thinking UI (no fetch interception)
- **Player profile** with optional **global leaderboards** per game (opt-in)
- Shared **fixed-timestep game runtime** (Phase A) — fair pause, run-end scoring, answer-ready Finish/Bank/Close
- **Phase B gameplay**: Traffic near-miss/nitro/waves · Coffee mash→drink · Compile coyote/perfect jumps
- **Phase C polish**: shared juice (shake / hitstop / floaters), procedural SFX, controls hint, NEW BEST chime
- Privacy-first by default: scores stay local unless you enable world leaderboard sharing

## Global leaderboard (optional)

ChillYWait can share your **personal best** scores to a world leaderboard (one row per player per game). This is **opt-in** — toggle it in the extension popup under **Player profile**.

### One-time backend setup (maintainers)

1. Create a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster
2. Put `MONGODB_URI` and `VITE_LEADERBOARD_API_URL` in `.env` (see `.env.example`)
3. Start the API: `npm run leaderboard`
4. Rebuild the extension: `npm run build`

The extension calls the hosted API at `https://chillywait.onrender.com`. `npm run leaderboard` still runs a local copy at `http://127.0.0.1:8787`. The Atlas password stays on the server.

### Usernames

- Usernames are **globally unique** (checked against the database before claim).
- Format: 3–16 characters, `a–z`, `0–9`, and `_` only.
- You can **change your username once every 30 days** (enforced server-side).
- Leaderboard score sharing requires a claimed username.

## Development

### Prerequisites

- Node.js 18+
- Chrome (or Chromium-based browser)

### Setup

```bash
npm install
npm run dev
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder (created after first build)

For development with HMR, run `npm run dev` and load the `dist` folder — crxjs rebuilds on file changes.

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Usage

1. Install the extension and visit [Gemini](https://gemini.google.com)
2. Send a prompt that triggers a long thinking/generation phase
3. After the configured delay, the ChillYWait overlay appears
4. Play a minigame while your answer processes in the background
5. When the answer is ready, you'll see an "Answer ready!" notification

### Settings (extension popup)

- **Player profile**: display name and opt-in for global leaderboard
- **Activation mode**: threshold (recommended) or immediate
- **Delay**: 3–30 seconds before overlay appears
- **Gemini toggle**: enable/disable auto-activation on Gemini
- **Open games on current tab**: manual fallback if auto-detection doesn't trigger
- **Debug logging**: console messages for troubleshooting

## Manual QA Checklist

On Gemini (`gemini.google.com`):

- [ ] Fast reply (&lt;5s) does not pop overlay in threshold mode
- [ ] Long thinking reply triggers overlay at configured delay
- [ ] Immediate mode triggers on first detection signal
- [ ] Overlay minimizes and dismisses correctly
- [ ] Answer ready toast appears when generation completes
- [ ] Finish / Bank / Close behave correctly at answer-ready
- [ ] SPA navigation (new chat) does not break detection
- [ ] Keyboard in chat works when overlay is minimized
- [ ] Settings persist across browser restart
- [ ] Extension does **not** inject on ChatGPT or Claude tabs

## Troubleshooting

### CSP errors on Gemini (googletagmanager, googleadservices, doubleclick)

If you see console errors like *"Connecting to googletagmanager.com / googleadservices.com violates Content Security Policy"* on `gemini.google.com`, those come from **Google's own analytics/ads scripts** on the Gemini page — not from ChillYWait. Gemini's CSP blocks those third-party domains; the errors are harmless and do not affect the extension.

ChillYWait does **not** patch `window.fetch` or intercept network traffic, so it cannot cause these requests.

### Overlay doesn't appear

- Enable **Debug logging** in the popup and check the console for `[ChillYWait]` messages
- Use **Open games on current tab** in the popup as a manual fallback
- Try **Immediate** activation mode to rule out threshold timing
- Reload the extension after updates (`chrome://extensions` → Reload)

## Architecture

- **Content script** (`bootstrap.ts`): platform detector + state machine + overlay host
- **Overlay iframe** (`overlay.html`): isolated Preact app with minigames
- **Popup** (`popup.html`): settings UI

## License

MIT
