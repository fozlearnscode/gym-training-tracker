// Runs on Vercel, same as suggest-template.js — see that file and CLAUDE.md for the full
// explanation of why this app has a tiny backend at all. This one reads a screenshot of a
// workout app (e.g. Heather Robertson Fitness) and extracts the exercises so they can be
// dropped straight into the strength log, instead of typing each one in by hand.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Same reasoning as suggest-template.js's DAILY_LIMIT: a real per-request cost, so a generous
// but finite daily ceiling guards against runaway usage. Tracked separately from the template
// suggestion counter since they're two different features with two different budgets.
const DAILY_LIMIT = 15;

// A screenshot resized in the browser (see resizeImageForUpload in script.js) should never get
// close to this — it exists as a safety net, since Vercel's Node functions reject request
// bodies over ~4.5MB anyway and a clear error here is friendlier than a generic platform one.
const MAX_BASE64_LENGTH = 6_000_000; // ~4.4MB decoded

// One extracted exercise. Always "strength" — this feature is specifically for reading sets/
// reps/weight off a workout screen, not cardio distances. weight is nullable because bodyweight
// exercises (push-ups, planks) genuinely have none to report.
const ImportedExerciseSchema = z.object({
  name: z.string(),
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
  weight: z.number().nonnegative().nullable()
});

const ImportSchema = z.object({
  exercises: z.array(ImportedExerciseSchema).max(20)
});

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Identical pattern to suggest-template.js's counter, just under its own key prefix so the two
// features don't share (or fight over) the same daily budget.
async function incrementAndGetTodaysCount() {
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const today = new Date().toISOString().split("T")[0];
  const key = `imports:${today}`;

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

// The browser sends a data URL like "data:image/jpeg;base64,/9j/4AAQ...". Claude's API wants
// the media type and the base64 payload as separate fields, so split it back apart here.
function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl || "");
  return match ? { mediaType: match[1], base64: match[2] } : null;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const parsed = parseDataUrl(req.body?.image);
  if (!parsed) {
    res.status(400).json({ error: "Please choose a PNG, JPEG, or WebP screenshot." });
    return;
  }

  if (parsed.base64.length > MAX_BASE64_LENGTH) {
    res.status(400).json({ error: "That image is too large. Try cropping it a bit smaller." });
    return;
  }

  try {
    const todaysCount = await incrementAndGetTodaysCount();
    if (todaysCount > DAILY_LIMIT) {
      res.status(429).json({
        error: "The daily limit for screenshot imports has been reached. Try again tomorrow."
      });
      return;
    }
  } catch (error) {
    console.error("Rate limit check failed:", error);
    res.status(503).json({ error: "Couldn't reach the import service. Please try again." });
    return;
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: {
        format: zodOutputFormat(ImportSchema),
        effort: "low" // reading a screenshot is a transcription task, not a reasoning one
      },
      system:
        "You read screenshots of workout-tracking apps (such as Heather Robertson Fitness) and " +
        "extract each strength exercise shown into a structured list. For every exercise " +
        "report: name (as displayed), sets (integer), reps (integer — the reps per set; if a " +
        "range is shown, use the higher end), and weight in kilograms as a number, or null if " +
        "no weight is shown (e.g. bodyweight moves). If a weight is shown in lbs, convert it to " +
        "kg (1 lb = 0.453592 kg) and round to the nearest 0.5. Ignore anything that isn't a " +
        "logged exercise — headers, timers, warm-up notes, navigation chrome. If the image " +
        "doesn't show a recognizable workout list, return an empty exercises array.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64 }
            },
            { type: "text", text: "Extract the exercises from this workout screenshot." }
          ]
        }
      ]
    });

    if (!response.parsed_output) {
      res.status(502).json({ error: "Couldn't read that screenshot. Please try again." });
      return;
    }

    res.status(200).json({ exercises: response.parsed_output.exercises });
  } catch (error) {
    console.error("Anthropic API error:", error);

    if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "The AI service is busy right now. Please try again shortly." });
    } else if (error instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "The import service isn't configured correctly." });
    } else {
      res.status(502).json({ error: "Couldn't read that screenshot. Please try again." });
    }
  }
}
