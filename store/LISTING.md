# Chrome Web Store listing

Use these fields when submitting ChillYWait.

## Short description (≤132 characters)

Play arcade minigames while Gemini thinks. Traffic Rider, Last Token, and Compile Run.

## Detailed description

ChillYWait turns Gemini wait time into a quick arcade break.

When Gemini is generating a response on gemini.google.com, ChillYWait opens a small overlay with three minigames:

• Traffic Rider — dodge traffic, nail near-misses, stage up forever
• Last Token — stack chips, cash out before heat eats the payout, catch the answer ring
• Compile Run — coyote jumps, perfect landings, escalating hazards

Features
• Auto-activates on Gemini (threshold delay or immediate)
• Local high scores by default
• Optional opt-in world leaderboards (all-time + daily) with username claim
• Mute toggle, pause-safe scoring, and answer-ready Finish / Bank / Close
• Privacy-first: no Gemini chat content is collected

Permissions
• storage — settings, local scores, player profile
• Host access to gemini.google.com — detect generating state and show the overlay
• Host access to chillywait.onrender.com — optional leaderboard API only

Privacy policy
https://github.com/Manthan-1610/chillywait/blob/main/store/PRIVACY.md

## Category

Productivity (or Fun)

## Language

English

## Single purpose

Arcade overlay while waiting for Gemini responses.

## Screenshots needed (you capture these)

Chrome requires at least 1 screenshot. Recommended size: **1280×800** or **640×400**.

1. Overlay on Gemini with Traffic Rider mid-run
2. Last Token answer-ring catch moment
3. World leaderboard panel (All-time / Daily tabs)
4. Extension popup with profile + mute

Place captures in `store/screenshots/` before upload.

## Store package

```bash
npm run build
npm run pack
```

Upload `store/chillywait-1.7.0.zip` (manifest.json at zip root).
