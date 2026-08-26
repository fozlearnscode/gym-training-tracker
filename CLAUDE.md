# Claude Code Instructions — Gym & Training Tracker

This file is read automatically at the start of every Claude Code session in this repo. Follow these constraints on every task unless explicitly told otherwise in a prompt.

## Hard constraints

1. **Vanilla HTML/CSS/JS only.** No frameworks (React, Vue, etc.), no build step, no npm dependencies for the deployed site itself. A Google Fonts CDN `<link>` is fine — that's already in use.
2. **No bundler, no TypeScript, no compile step.** GitHub Pages must be able to serve the files as-is.
3. **Data persists only via `localStorage`.** No backend, no database — unless the task is specifically Phase 3 (see Roadmap), which needs a serverless function only for hiding an API key, not for data storage.
4. **Match the existing design tokens** defined in `style.css`'s `:root` block — coral `#E8623D`, green `#4F7942`, cream `#FAF7F0`, ink `#1F2A24`, stone `#8B8578`; fonts Fraunces / Inter / JetBrains Mono. Don't introduce new colors or fonts without being asked.
5. **The project owner is a beginner developer**, using this project to learn. Prefer clear, commented code over compressed or clever code. When making a nontrivial change, add a short comment explaining *why*, not just what.
6. **The project owner does not use the terminal directly.** When asked to commit, push, or run git/GitHub commands, run them and then summarize what was done in plain language — don't assume familiarity with git terminology.

## Current architecture

- `index.html` — markup only, no inline logic
- `style.css` — all styling
- `script.js` — all application logic
- Three `localStorage` keys: `templates`, `weeklyAssignments`, `trainingLog`

Exercises (inside templates, and inside logged entries) always carry a `type` field: `"strength"` (uses `sets`/`reps`/`weight`) or `"cardio"` (uses `distance`/`duration`). Always branch on `type` when touching exercise-related rendering or logging code — don't assume one shape fits all exercises.

Stats and streaks (`calculateStreak`, `calculateLast30DayStats`) are derived, not stored — they're recalculated from `trainingLog` on every render. Keep it this way; don't cache these values in `localStorage`, since that would create a second source of truth that can drift out of sync.

## Roadmap

- **Phase 1 — COMPLETE.** Weekly plan, templates, strength + cardio logging, calendar view, rest timer, stats/streaks.
- **Phase 2 — not started.** Save TikTok workout videos via TikTok's public oEmbed endpoint (`https://www.tiktok.com/oembed`) — no key or login required. Store saved video references (not the video itself) in a new `localStorage` key, and render each as an embedded preview with title and creator.
- **Phase 3 — not started.** AI-generated exercise suggestions via a real LLM API call. This needs a small serverless function to keep the API key secret — do not call an LLM API directly from client-side JavaScript, the key would be exposed. Do not use GitHub Actions for this; Actions suits scheduled/batch jobs, not instant on-demand requests. This phase has a real ongoing cost per generation, unlike the free public APIs used elsewhere in the project — flag this clearly to the project owner before implementing.

## Explicitly rejected approaches — do not attempt

- **Pulling data from Nike Run Club.** No public API exists. The only workarounds require manually extracted, unstable personal auth tokens and would breach Nike's terms of service. Do not suggest or implement this, even if asked to "find a workaround."
- **Strava API integration.** A legitimate option for the future, but treat it as out of scope unless the project owner explicitly opens it as a new, separate task.
- **Switching to a component framework (React, etc.) or a design system like shadcn/ui**, even for "just polishing the UI." This project intentionally uses a bespoke visual identity (calendar-page day cards, custom color tokens) — a framework switch was already considered and declined.
