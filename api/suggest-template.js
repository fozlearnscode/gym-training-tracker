// This file runs on Vercel, NOT in the browser — it's the one piece of "backend" this
// project has. Its whole job is to hold the secret Anthropic API key and talk to Claude on
// the website's behalf, since a key placed in script.js would be visible to anyone who opens
// their browser's dev tools. See CLAUDE.md for the full explanation of why this exists.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// A generous but real ceiling on how many AI suggestions can be generated per day, across
// everyone who uses the site. Each suggestion costs a small amount of real money, so this
// stops a bug (e.g. a button wired to call this in a loop) or unexpected traffic from running
// up a surprise bill. 15/day is far more than one person needs for planning workouts.
const DAILY_LIMIT = 15;

// The shape of a single exercise, matching exactly what the rest of the app already expects
// (see the `type` field convention documented in CLAUDE.md). We ask for every field up front
// rather than a stricter type-conditional shape because Claude's structured-output feature
// works best with a flat, fully-described schema — the frontend already knows to only look at
// sets/reps for "strength" and distance/duration for "cardio", so the unused fields are simply
// ignored, not a problem.
const ExerciseSchema = z.object({
  name: z.string(),
  type: z.enum(["strength", "cardio"]),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  distance: z.number().positive().optional(),
  duration: z.number().positive().optional()
});

const TemplateSchema = z.object({
  name: z.string(),
  exercises: z.array(ExerciseSchema).min(2).max(8)
});

// Every response — success or error — needs these so the browser will actually accept it.
// The site is hosted on GitHub Pages (a different domain to this function), so without these
// headers the browser blocks the response before our own JavaScript ever sees it.
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Upstash's REST API lets us store a small counter without adding a database or an extra npm
// package — it's just plain fetch() calls. `incr` both creates the key (starting at 1) and
// increments it in one step, so the very first call of the day also becomes the moment we set
// today's key to expire in 24 hours — after that, tomorrow's first request starts a fresh key.
async function incrementAndGetTodaysCount() {
  // Vercel's Upstash marketplace integration sometimes names these KV_REST_API_URL/TOKEN
  // instead, depending on which product you connect — accept either so setup doesn't hinge
  // on getting the exact variable name right.
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const today = new Date().toISOString().split("T")[0]; // e.g. "2026-08-27"
  const key = `suggestions:${today}`;

  const incrRes = await fetch(`${base}/incr/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { result: count } = await incrRes.json();

  if (count === 1) {
    await fetch(`${base}/expire/${key}/86400`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  return count;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  // The browser sends an OPTIONS "preflight" request before the real POST, to ask permission.
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const goal = typeof req.body?.goal === "string" ? req.body.goal.trim() : "";
  if (!goal || goal.length > 300) {
    res.status(400).json({ error: "Please describe your goal in a sentence or two." });
    return;
  }

  try {
    const todaysCount = await incrementAndGetTodaysCount();
    if (todaysCount > DAILY_LIMIT) {
      res.status(429).json({
        error: "The daily limit for AI suggestions has been reached. Try again tomorrow."
      });
      return;
    }
  } catch (error) {
    // If the rate-limit store itself is unreachable, fail safe by blocking the request rather
    // than silently skipping the cost guardrail it exists to enforce.
    console.error("Rate limit check failed:", error);
    res.status(503).json({ error: "Couldn't reach the suggestion service. Please try again." });
    return;
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4096, // headroom for Opus 5's default adaptive thinking + the JSON output
      output_config: {
        format: zodOutputFormat(TemplateSchema),
        effort: "low" // a short, well-specified task like this doesn't need deep reasoning
      },
      system:
        "You design short, sensible workout templates for a home gym-tracking app. Given a " +
        "short goal description from the user, respond with a template: a short punchy name " +
        "(2-5 words) and 2-6 exercises appropriate to the stated goal and time available. Use " +
        "type \"strength\" for weights/bodyweight exercises (set integer sets and reps), or " +
        "type \"cardio\" for continuous cardio movements (set distance in kilometers and " +
        "duration in minutes, decimals allowed). Keep it realistic for the time mentioned.",
      messages: [{ role: "user", content: goal }]
    });

    if (!response.parsed_output) {
      res.status(502).json({ error: "Couldn't generate a suggestion. Please try again." });
      return;
    }

    res.status(200).json({ template: response.parsed_output });
  } catch (error) {
    console.error("Anthropic API error:", error);

    if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "The AI service is busy right now. Please try again shortly." });
    } else if (error instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "The suggestion service isn't configured correctly." });
    } else {
      res.status(502).json({ error: "Couldn't generate a suggestion. Please try again." });
    }
  }
}
