# Claude Code Instructions — Gym & Training Tracker

This file is read automatically at the start of every Claude Code session in this repo. Follow these constraints on every task unless explicitly told otherwise in a prompt.

## Hard constraints

1. **Vanilla HTML/CSS/JS only.** No frameworks (React, Vue, etc.), no build step, no npm dependencies for the deployed site itself. A Google Fonts CDN `<link>` is fine — that's already in use. The repo-root `package.json` and `/api` folder (added in Phase 3) are the one exception: they exist purely so Vercel can install and run the serverless function in `/api`. GitHub Pages ignores both — it never runs `npm install` and just serves whatever static files exist, so this doesn't affect the deployed site itself.
2. **No bundler, no TypeScript, no compile step.** GitHub Pages must be able to serve the files as-is.
3. **Data persists only via `localStorage`.** No backend, no database — unless the task is specifically Phase 3 (see Roadmap), which needs a serverless function only for hiding an API key, not for data storage.
4. **Match the existing design tokens** defined in `style.css`'s `:root` block — a soft "pilates studio" palette: background `#F6EFE4` (warm oat), card `#FFFBF5`, ink `#4A3B32` (espresso brown), muted text `#8C7A68`, primary accent `#A9805F` (mocha), secondary/neutral accent `#B7B3AC` (soft silver-gray), complete/success accent `#DDBBAE` (dusty blush), hairline borders `#E7DDCF`. Don't introduce new colors or fonts without being asked.
   - **Fonts**: headings and page titles use `--font-display` ("Cormorant Garamond", always set `font-style: italic; font-weight: 500` — that's the only weight loaded). Body copy, labels, and buttons use `--font-body` ("Poppins", weights 300/400/500 only — nothing bolder is loaded, so don't reach for 600/700). `--font-mono` ("JetBrains Mono", weights 500/600) is unchanged from before and stays reserved for stat numbers and data read mid-workout — weights, sets, reps, the timer countdown, calendar/day-card labels — anywhere legibility of digits matters more than the display/body voice.
   - **Color semantics**: mocha (`--color-mocha`) is the one primary accent — active/selected tab, buttons, focus states, "today" highlights. Blush (`--color-blush`) is reserved for completion/success only — a finished day card, a checked exercise, the small checkmark badge — never used for plain selection or navigation. Silver (`--color-silver`) is the neutral tone for secondary/inactive UI — secondary and small buttons, icon buttons, unselected toggle segments, the calendar's "day being viewed" highlight (as opposed to "day completed," which is blush) and greyed-out other-month dates.
   - **Checkboxes/toggles**: the exercise checklist checkbox (`.exercise-checkbox`) is a custom circle (`appearance: none`), not a native checkbox — mocha outline unchecked, solid blush fill when checked. Follow that same pattern (mocha outline → blush fill) for any future checked/complete-style toggle; don't reach for `accent-color` with the old green.
   - **Cards**: `.card` and `.day-card` use `var(--radius)` (14px) corners and a 1px `var(--color-hairline)` border — no drop shadows. The one exception is the small mocha glow (`box-shadow`) on `.day-card.is-today`, which exists to reinforce the border, not replace it.
5. **The project owner is a beginner developer**, using this project to learn. Prefer clear, commented code over compressed or clever code. When making a nontrivial change, add a short comment explaining *why*, not just what.
6. **The project owner does not use the terminal directly.** When asked to commit, push, or run git/GitHub commands, run them and then summarize what was done in plain language — don't assume familiarity with git terminology.

## Current architecture

- `index.html`, `log.html`, `timer.html`, `plan.html`, `templates.html`, `history.html`, `videos.html`, `suggest.html`, `import.html` — markup only, no inline logic. Every page shares the same bottom tab bar; when adding a new page, add its tab link to all the others too.
- `style.css` — all styling
- `script.js` — all application logic, shared across every page (each render function guards itself with `if (!container) return` for pages that don't have that element)
- `api/suggest-template.js` — the one exception to "vanilla, no backend": a small Vercel serverless function that calls the Claude API on the site's behalf. See the Phase 3 entry below and the comments in that file for the full why.
- `api/import-screenshot.js` — same exception, for Phase 3.5: a vision-capable call to Claude that reads a workout screenshot and extracts exercises.
- `localStorage` keys: `templates`, `weeklyAssignments`, `trainingLog`, `savedVideos`, `timerState`, `activeTab`

Exercises (inside templates, and inside logged entries) always carry a `type` field: `"strength"` (uses `sets`/`reps`/`weight`) or `"cardio"` (uses `distance`/`duration`). Always branch on `type` when touching exercise-related rendering or logging code — don't assume one shape fits all exercises.

Stats and streaks (`calculateStreak`, `calculateLast30DayStats`) are derived, not stored — they're recalculated from `trainingLog` on every render. Keep it this way; don't cache these values in `localStorage`, since that would create a second source of truth that can drift out of sync.

## Roadmap

- **Phase 1 — COMPLETE.** Weekly plan, templates, strength + cardio logging, calendar view, rest timer, stats/streaks.
- **Phase 2 — COMPLETE.** Save TikTok workout videos via TikTok's public oEmbed endpoint (`https://www.tiktok.com/oembed`, CORS-enabled, no key needed). Saved as `savedVideos` in `localStorage`; the embed itself is rebuilt from `videoId` on every render rather than storing TikTok's returned HTML, since that HTML embeds a signed thumbnail URL that expires.
- **Phase 3 — COMPLETE.** AI-generated template suggestions. `suggest.html` posts a short goal string to `api/suggest-template.js` (deployed separately on Vercel — GitHub Pages can't run server code), which calls the Claude API (`claude-opus-5`, structured JSON output via a Zod schema) and returns a draft template the user can review and save into `templates`. The Anthropic API key lives only in Vercel's environment variables, never in this repo or in client-side code. A daily request cap (`DAILY_LIMIT` in that file, currently 15) is enforced server-side via a small Upstash Redis counter, since this is the one feature in the app with a real per-use cost. `script.js`'s `SUGGEST_API_URL` constant must point at the deployed Vercel function's URL.
- **Phase 3.5 — COMPLETE.** Screenshot import. `import.html` lets Steph upload a screenshot of a workout app screen (e.g. Heather Robertson Fitness); the image is resized in the browser (`resizeImageForUpload` in `script.js`, capped at 1280px so it stays well under Vercel's ~4.5MB request body limit) and posted to `api/import-screenshot.js`, which reuses the same Phase 3 infrastructure — same Vercel deployment, same Anthropic key, same Upstash-backed daily cap pattern, just a separate `DAILY_LIMIT` counter (`imports:${today}`) so the two AI features don't share a budget. Claude reads the screenshot with vision and returns structured strength exercises (name/sets/reps/weight, weight converted to kg if shown in lbs); the user reviews and edits the extracted rows before saving them straight into `trainingLog` for a chosen date. `script.js`'s `IMPORT_API_URL` constant must point at the same deployed Vercel function's URL as `SUGGEST_API_URL`.

## Explicitly rejected approaches — do not attempt

- **Pulling data from Nike Run Club.** No public API exists. The only workarounds require manually extracted, unstable personal auth tokens and would breach Nike's terms of service. Do not suggest or implement this, even if asked to "find a workaround."
- **Strava API integration.** A legitimate option for the future, but treat it as out of scope unless the project owner explicitly opens it as a new, separate task.
- **Switching to a component framework (React, etc.) or a design system like shadcn/ui**, even for "just polishing the UI." This project intentionally uses a bespoke visual identity (calendar-page day cards, custom color tokens) — a framework switch was already considered and declined.
