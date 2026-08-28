// Runs on Vercel, same as suggest-template.js and import-screenshot.js — see CLAUDE.md for why
// this project has a /api folder at all despite being "vanilla, no backend" everywhere else.
//
// This one exists for the step-count automation: Apple's HealthKit has no public web API, so
// the only way to get Steph's daily step count out of her phone and onto this website is to
// have something ON her phone push it out. An iOS Shortcuts automation (see the setup guide
// Claude provided alongside this file) does that — it reads today's step count and POSTs it
// here whenever she opens the Health app. The web app then GETs the stored numbers to show in
// the Stats card. This is the one place in the whole project that stores data outside
// localStorage, because a browser has no way to read HealthKit data directly.

// Same "accept whichever the Vercel integration named it" fallback as suggest-template.js.
const UPSTASH_BASE = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// All of Steph's step counts live under one Redis key, as a single JSON blob (date -> steps).
// A personal app with one contributor writing at most once a day doesn't need one key per
// date — a single blob keeps reading and writing both a single round trip to Upstash.
const STEPS_LOG_KEY = "steps-log";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Steps-Secret");
}

async function getStepsLog() {
  const response = await fetch(`${UPSTASH_BASE}/get/${STEPS_LOG_KEY}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const { result } = await response.json();
  return result ? JSON.parse(result) : {};
}

async function saveStepsLog(log) {
  // Upstash's REST API treats the request body as the value to SET when one command argument
  // (the key) is in the URL — sending it this way, rather than URL-encoding the JSON into the
  // path like suggest-template.js does for incr/expire, avoids any issue with special
  // characters a path segment can't safely hold.
  await fetch(`${UPSTASH_BASE}/set/${STEPS_LOG_KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(log)
  });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    try {
      const log = await getStepsLog();
      res.status(200).json({ steps: log });
    } catch (error) {
      console.error("Failed to read steps log:", error);
      res.status(503).json({ error: "Couldn't load step data right now." });
    }
    return;
  }

  if (req.method === "POST") {
    // A shared secret rather than a full login system — this is a personal automation with
    // exactly one writer (Steph's own Shortcut), not a multi-user feature, so a long random
    // token checked against an env var is enough to stop a random visitor from posting fake
    // numbers without needing real auth infrastructure for a single-user write.
    const providedSecret = req.headers["x-steps-secret"];
    if (!providedSecret || providedSecret !== process.env.STEPS_WRITE_SECRET) {
      res.status(401).json({ error: "Missing or incorrect secret." });
      return;
    }

    const { date, steps } = req.body || {};
    const stepsNumber = Number(steps);
    if (!DATE_PATTERN.test(date) || !Number.isFinite(stepsNumber) || stepsNumber < 0 || stepsNumber > 100000) {
      res.status(400).json({ error: "Expected { date: \"YYYY-MM-DD\", steps: <0-100000> }." });
      return;
    }

    try {
      const log = await getStepsLog();
      log[date] = Math.round(stepsNumber);
      await saveStepsLog(log);
      res.status(200).json({ ok: true, date, steps: log[date] });
    } catch (error) {
      console.error("Failed to save steps log:", error);
      res.status(503).json({ error: "Couldn't save step data right now." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
