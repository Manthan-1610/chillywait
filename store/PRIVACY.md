# ChillYWait Privacy Policy

**Last updated:** 2026-10-04

ChillYWait is a Chrome extension that shows arcade minigames while Gemini is generating a response.

## Data we store on your device

- Extension settings (activation mode, delay, enabled sites, mute preference)
- An anonymous player ID created locally in the browser
- Local high scores for each minigame
- Optional claimed username and leaderboard opt-in preference

This data stays in Chrome sync/local storage on your devices.

## Optional world leaderboard

If you claim a username and enable **Share my best scores on the world leaderboard**, ChillYWait may send:

- Your claimed username
- Your anonymous player ID
- Game id, score, run duration, and a run seed used for fairness checks

Scores are stored on our MongoDB Atlas database via the ChillYWait API (`chillywait.onrender.com`).

You can stop sharing by turning off the leaderboard opt-in in the extension popup. Existing public scores may remain until removed by maintainers.

## What we do **not** collect

- Gemini prompt or response text
- Chat history
- Browsing history outside Gemini activation
- Payment information
- Precise location

ChillYWait does not intercept Gemini network traffic. It uses on-page UI signals to detect when Gemini is generating.

## Third parties

- **MongoDB Atlas** — stores optional leaderboard profiles and scores
- **Render** — hosts the leaderboard API

## Children

ChillYWait is not directed at children under 13.

## Contact

For privacy questions or score deletion requests, open an issue on the project repository:
https://github.com/Manthan-1610/chillywait

## Changes

We may update this policy. The “Last updated” date above will change when we do.
