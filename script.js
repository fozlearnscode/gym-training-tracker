// ---------- DATA ----------

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const orderedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Not a simple slice(0, 3) -- "Tues" and "Thurs" are 4 letters, so each day needs its own
// entry rather than a uniform truncation rule.
const dayAbbreviations = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tues",
  Wednesday: "Wed",
  Thursday: "Thurs",
  Friday: "Fri",
  Saturday: "Sat"
};

function generateId() {
  // Good enough for a personal app: current time + a random chunk, base-36 for shortness.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function seedTemplates() {
  // Starting templates, used only the very first time the app runs on a device.
  return [
    { id: generateId(), name: "Run day", exercises: [{ name: "5km run", type: "cardio", distance: 5, duration: 30 }] },
    {
      id: generateId(),
      name: "Leg day",
      exercises: [
        { name: "Squats", type: "strength", sets: 3, reps: 10 },
        { name: "Lunges", type: "strength", sets: 3, reps: 12 }
      ]
    },
    {
      id: generateId(),
      name: "Core & mobility",
      exercises: [
        { name: "Plank", type: "strength", sets: 3, reps: 1 },
        { name: "Mountain climbers", type: "strength", sets: 3, reps: 20 }
      ]
    },
    {
      id: generateId(),
      name: "Pilates",
      exercises: [
        { name: "The Hundred", type: "strength", sets: 1, reps: 100 },
        { name: "Roll-Up", type: "strength", sets: 3, reps: 8 },
        { name: "Single-Leg Stretch", type: "strength", sets: 3, reps: 12 },
        { name: "Leg Circles", type: "strength", sets: 2, reps: 10 }
      ]
    },
    {
      id: generateId(),
      name: "Yoga",
      // Held poses don't really have "reps" — following the same convention as Plank above,
      // a hold is logged as reps: 1 so it still fits the sets/reps shape every exercise uses.
      exercises: [
        { name: "Sun Salutations", type: "strength", sets: 3, reps: 5 },
        { name: "Downward Dog", type: "strength", sets: 3, reps: 1 },
        { name: "Warrior II", type: "strength", sets: 2, reps: 1 },
        { name: "Child's Pose", type: "strength", sets: 1, reps: 1 }
      ]
    }
  ];
}

// Templates: the reusable definitions ("what's in Leg day").
let templates = JSON.parse(localStorage.getItem("templates")) || seedTemplates();

function saveTemplates() {
  localStorage.setItem("templates", JSON.stringify(templates));
}

// Adds the "Dance cardio" template once, on every load, for anyone who already has saved
// templates (not just brand-new devices, which get it for free via seedTemplates above).
// Checked by name each time rather than a one-off migration flag, so it's safe to run on
// every page load without touching any existing templates or logged data.
function ensureDanceCardioTemplate() {
  const hasDanceTemplate = templates.some((t) => t.name === "Dance cardio");
  if (hasDanceTemplate) return;

  templates.push({
    id: generateId(),
    name: "Dance cardio",
    exercises: [
      {
        name: "15 Min Dance Party",
        type: "dance",
        duration: 15,
        songs: 4,
        link: "https://youtu.be/1vRto-2MMZo" // MadFit's 15 Min Dance Party Workout
      }
    ]
  });
  saveTemplates();
}

ensureDanceCardioTemplate();

// Assignments: a lookup table from day name -> template id ("Wednesday uses Leg day").
// This is seeded to match the templates above, but only on first run.
let weeklyAssignments = JSON.parse(localStorage.getItem("weeklyAssignments")) || {
  Monday: templates[0].id,
  Tuesday: templates[3].id,
  Wednesday: templates[1].id,
  Thursday: templates[4].id,
  Friday: templates[2].id
};

function saveAssignments() {
  localStorage.setItem("weeklyAssignments", JSON.stringify(weeklyAssignments));
}

// The log is loaded from localStorage if it exists, otherwise we start empty.
// This is the ONE line that makes data survive a page refresh.
let trainingLog = JSON.parse(localStorage.getItem("trainingLog")) || [];

function saveLog() {
  localStorage.setItem("trainingLog", JSON.stringify(trainingLog));
}

// ---------- PERSONAL BESTS ----------

// Checks a just-logged strength entry against every PRIOR entry for the same exercise (the
// entry itself must already be pushed into trainingLog before calling this, so pass it in to
// exclude it from its own comparison). Returns which metric was beaten ("weight", "reps", or
// "volume"), in that priority order, or null if nothing was beaten — including when this is
// the very first time the exercise has been logged, since there's nothing yet to beat.
function checkForNewPB(entry) {
  if (entry.type !== "strength" || entry.weight == null) return null;

  const priorEntries = trainingLog.filter(
    (e) => e !== entry && e.type === "strength" && e.exercise === entry.exercise && e.weight != null
  );
  if (priorEntries.length === 0) return null;

  const bestWeight = Math.max(...priorEntries.map((e) => e.weight));
  const bestReps = Math.max(...priorEntries.map((e) => e.reps));
  const bestVolume = Math.max(...priorEntries.map((e) => e.sets * e.reps * e.weight));
  const newVolume = entry.sets * entry.reps * entry.weight;

  if (entry.weight > bestWeight) return "weight";
  if (entry.reps > bestReps) return "reps";
  if (newVolume > bestVolume) return "volume";
  return null;
}

const PB_MESSAGES = {
  weight: "New PB — heaviest weight yet!",
  reps: "New PB — most reps yet!",
  volume: "New PB — biggest volume yet!"
};

// ---------- CARDIO PACE ----------

// Pace isn't a separate thing to log — it's just distance and duration divided, so it's
// computed on the fly wherever a cardio entry is already shown rather than stored anywhere.
function formatPace(distanceKm, durationMin) {
  if (!distanceKm || !durationMin || distanceKm <= 0 || durationMin <= 0) return null;

  const paceMinPerKm = durationMin / distanceKm;
  let minutes = Math.floor(paceMinPerKm);
  let seconds = Math.round((paceMinPerKm - minutes) * 60);
  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

// ---------- DATE HELPERS ----------

function toDateString(date) {
  // Formats a Date object as YYYY-MM-DD, which is easy to compare and store.
  return date.toISOString().split("T")[0];
}

function getWeekDates() {
  // Returns an array of 7 date strings for this week, Monday through Sunday.
  const today = new Date();
  const currentDayIndex = today.getDay(); // 0 = Sunday, 1 = Monday, ...
  const mondayOffset = currentDayIndex === 0 ? -6 : 1 - currentDayIndex;

  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push(toDateString(d));
  }
  return week;
}

function findPlanForDay(dayName) {
  // Look up the day's assigned template id, then look up that template.
  // Two steps, matching the two-part model: assignment -> template.
  const templateId = weeklyAssignments[dayName];
  if (!templateId) return null; // no assignment = rest day

  const template = templates.find((t) => t.id === templateId);
  if (!template) return null; // the template was deleted since being assigned

  return { day: dayName, sessionName: template.name, exercises: template.exercises };
}

// ---------- STATS & STREAKS ----------

function isDayFullyLogged(dateString, plan) {
  return plan.exercises.every((exercise) =>
    trainingLog.some((entry) => entry.date === dateString && entry.exercise === exercise.name)
  );
}

function calculateStreak() {
  let streak = 0;
  const cursor = new Date();
  const todayString = toDateString(new Date());

  // Walk backward one day at a time. Capped so a mostly-rest-day plan can't loop forever.
  for (let i = 0; i < 365; i++) {
    const dateString = toDateString(cursor);
    const dayName = dayNames[cursor.getDay()];
    const plan = findPlanForDay(dayName);

    if (plan) {
      const done = isDayFullyLogged(dateString, plan);
      if (done) {
        streak++;
      } else if (dateString !== todayString) {
        // A scheduled day, in the past, that wasn't completed — the streak ends here.
        break;
      }
      // If it's today and not done yet, we just don't count it — the day isn't over.
    }
    // Rest days (no plan) don't affect the streak either way — just keep walking backward.

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function calculateLast30DayStats() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29); // last 30 days, inclusive of today
  const cutoffString = toDateString(cutoff);

  const recentEntries = trainingLog.filter((entry) => entry.date >= cutoffString);
  const totalSets = recentEntries.reduce((sum, entry) => sum + (entry.sets || 0), 0);
  const totalDistance = recentEntries.reduce((sum, entry) => sum + (entry.distance || 0), 0);

  const datesWithEntries = [...new Set(recentEntries.map((entry) => entry.date))];
  const sessionsCompleted = datesWithEntries.filter((dateString) => {
    const dayName = dayNames[new Date(dateString).getDay()];
    const plan = findPlanForDay(dayName);
    return plan && isDayFullyLogged(dateString, plan);
  }).length;

  return { totalSets, totalDistance, sessionsCompleted };
}

// ---------- BADGES ----------

// Badges need to feel permanent — once earned, always earned — unlike the stats above,
// which deliberately reflect only the current state (a "30-day streak" badge that vanished
// the moment a streak broke would defeat the point of a badge). So every criterion here is
// phrased as an all-time, cumulative total rather than a current one: total sets ever logged
// only grows, and "longest streak ever" (below) remembers past runs instead of just the
// active one — both stay true forever once reached, with nothing extra needing to be stored.

function calculateAllTimeTotalSets() {
  return trainingLog.reduce((sum, entry) => sum + (entry.sets || 0), 0);
}

function calculateAllTimeTotalDistance() {
  return trainingLog.reduce((sum, entry) => sum + (entry.distance || 0), 0);
}

// Same day-by-day completion check as calculateStreak() above, but instead of stopping at
// the first broken day, it keeps walking the full logged history and remembers the longest
// run it ever found — so a streak that broke months ago still counts for a badge today.
function calculateLongestStreakEver() {
  if (trainingLog.length === 0) return 0;

  const earliestDate = trainingLog.reduce((min, e) => (e.date < min ? e.date : min), trainingLog[0].date);
  const todayString = toDateString(new Date());
  const cursor = new Date();
  let currentRun = 0;
  let longestRun = 0;

  for (let i = 0; i < 730; i++) { // a two-year cap — generous, but not unbounded
    const dateString = toDateString(cursor);
    if (dateString < earliestDate) break; // nothing further back to check

    const dayName = dayNames[cursor.getDay()];
    const plan = findPlanForDay(dayName);

    if (plan) {
      if (isDayFullyLogged(dateString, plan)) {
        currentRun++;
        longestRun = Math.max(longestRun, currentRun);
      } else if (dateString !== todayString) {
        currentRun = 0;
      }
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return longestRun;
}

// The exact exercise names from the Pilates and Yoga seed templates (see seedTemplates()).
// trainingLog entries don't record which session/template they came from — only the exercise
// name — so this is a best-effort match rather than a guarantee: renaming these exercises, or
// building a custom Pilates/Yoga template with different move names, means this specific badge
// just won't trigger for them. Everything else here is unaffected either way.
const PILATES_YOGA_MOVE_NAMES = [
  "The Hundred", "Roll-Up", "Single-Leg Stretch", "Leg Circles",
  "Sun Salutations", "Downward Dog", "Warrior II", "Child's Pose"
];

const BADGE_DEFINITIONS = [
  { icon: "🎉", name: "First Session", isEarned: () => trainingLog.length > 0 },
  { icon: "🏃", name: "On the Move", isEarned: () => trainingLog.some((e) => e.type === "cardio") },
  {
    icon: "🧘",
    name: "Mind & Body",
    isEarned: () => trainingLog.some((e) => PILATES_YOGA_MOVE_NAMES.includes(e.exercise))
  },
  { icon: "💪", name: "50 Sets", isEarned: () => calculateAllTimeTotalSets() >= 50 },
  { icon: "🏆", name: "200 Sets", isEarned: () => calculateAllTimeTotalSets() >= 200 },
  { icon: "🔥", name: "7-Day Streak", isEarned: () => calculateLongestStreakEver() >= 7 },
  { icon: "🌟", name: "30-Day Streak", isEarned: () => calculateLongestStreakEver() >= 30 }
];

// Tracks which badges have already been seen as earned during THIS page session, so the
// unlock animation only plays the moment a badge is actually newly earned — not every time the
// shelf happens to re-render, and not for badges that were already earned before this page
// even loaded (badgeShelfInitialized guards that very first render).
let previouslyEarnedBadges = new Set();
let badgeShelfInitialized = false;

function renderBadgeShelf() {
  const container = document.getElementById("badge-shelf");
  if (!container) return; // this page doesn't show badges

  container.innerHTML = BADGE_DEFINITIONS.map((badge) => {
    const earned = badge.isEarned();
    const justUnlocked = badgeShelfInitialized && earned && !previouslyEarnedBadges.has(badge.name);
    const classes = ["badge-tile", earned && "is-earned", justUnlocked && "just-unlocked"]
      .filter(Boolean)
      .join(" ");
    return `
      <div class="${classes}" title="${earned ? "Earned!" : "Not earned yet"}">
        <span class="badge-icon">${badge.icon}</span>
        <span class="badge-name">${badge.name}</span>
      </div>
    `;
  }).join("");

  BADGE_DEFINITIONS.forEach((badge) => {
    if (badge.isEarned()) previouslyEarnedBadges.add(badge.name);
  });
  badgeShelfInitialized = true;
}

// Below the first milestone, the streak stat is just a plain number like any other stat.
// At 3, 7, 14, and 30+ days it becomes a full-width encouraging message instead — checked
// highest-first so e.g. a 40-day streak matches the 30+ tier, not the 3-day one.
function buildStreakStatHtml(streak) {
  if (streak >= 30) {
    return `<div class="stat-block stat-block-message"><span class="stat-message">Steph's on a ${streak}-day streak! 🔥🔥🔥</span></div>`;
  }
  if (streak >= 14) {
    return `<div class="stat-block stat-block-message"><span class="stat-message">Steph's on a ${streak}-day streak! 🔥🔥</span></div>`;
  }
  if (streak >= 7) {
    return `<div class="stat-block stat-block-message"><span class="stat-message">Steph's on a ${streak}-day streak! 🔥</span></div>`;
  }
  if (streak >= 3) {
    return `<div class="stat-block stat-block-message"><span class="stat-message">Steph's on a ${streak}-day streak! 👏</span></div>`;
  }
  return `
    <div class="stat-block">
      <span class="stat-number" data-target="${streak}">0</span>
      <span class="stat-label">day streak</span>
    </div>
  `;
}

// Counts a stat number up from 0 to its real value instead of just appearing fully-formed —
// respects prefers-reduced-motion by jumping straight to the final value for anyone who's
// asked for less motion, same as every animation in this file.
function animateCountUp(element, endValue) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || endValue === 0) {
    element.textContent = endValue;
    return;
  }

  const duration = 600;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic — fast start, gentle finish
    element.textContent = Math.round(endValue * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderStats() {
  const container = document.getElementById("stats-grid");
  if (!container) return; // this page doesn't show stats

  const streak = calculateStreak();
  const { totalSets, totalDistance, sessionsCompleted } = calculateLast30DayStats();

  container.innerHTML = `
    ${buildStreakStatHtml(streak)}
    <div class="stat-block">
      <span class="stat-number" data-target="${sessionsCompleted}">0</span>
      <span class="stat-label">sessions (30d)</span>
    </div>
    <div class="stat-block">
      <span class="stat-number" data-target="${totalSets}">0</span>
      <span class="stat-label">sets logged (30d)</span>
    </div>
    <div class="stat-block">
      <span class="stat-number" data-target="${totalDistance}">0</span>
      <span class="stat-label">km run (30d)</span>
    </div>
  `;

  container.querySelectorAll(".stat-number[data-target]").forEach((el) => {
    animateCountUp(el, Number(el.dataset.target));
  });

  renderBadgeShelf();
}

// ---------- REST TIMER ----------

const WHEEL_ROW_HEIGHT = 36; // px — must match .wheel-row's height in style.css
const WHEEL_MAX_MINUTES = 59;
const WHEEL_MAX_SECONDS = 59;

let timerDuration = 90;    // seconds selected, used when (re)starting
let timerRemaining = 90;   // seconds left to show, kept in sync while paused
let timerEndTime = null;   // the actual clock time the timer should finish — the key idea
let timerInterval = null;
let timerRunning = false;
let timerActive = false;   // true from Start until Cancel — switches the picker for the countdown

// Remembers the last rest duration used for each exercise by name (e.g. Squats -> 90), so
// the picker can default to it next time instead of starting from a blank slate every visit.
let exerciseRestPreferences = JSON.parse(localStorage.getItem("exerciseRestPreferences")) || {};

function saveExerciseRestPreferences() {
  localStorage.setItem("exerciseRestPreferences", JSON.stringify(exerciseRestPreferences));
}

// Every exercise name that appears in any template, regardless of type — pulled fresh each
// time the Timer page loads rather than stored separately, so it can't drift out of sync
// with whatever templates currently exist.
function getAllTemplateExerciseNames() {
  const names = new Set();
  templates.forEach((template) => {
    template.exercises.forEach((exercise) => names.add(exercise.name));
  });
  return Array.from(names).sort();
}

function renderTimerExerciseSelect() {
  const select = document.getElementById("timer-exercise-select");
  if (!select) return; // this page doesn't have the timer

  const names = getAllTemplateExerciseNames();
  const optionsHtml = names.map((name) => `<option value="${name}">${name}</option>`).join("");
  select.innerHTML = `<option value="">— General rest —</option>${optionsHtml}`;

  select.addEventListener("change", () => {
    if (timerActive) return; // don't yank the picker out from under a countdown already running
    const remembered = exerciseRestPreferences[select.value];
    if (remembered) selectPreset(remembered);
  });
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateTimerDisplay(seconds) {
  document.getElementById("timer-display").textContent = formatTime(seconds);
}

// The timer now lives on its own page, so a countdown started there has to survive
// navigating to another page (the whole document, and its setInterval, gets torn down).
// Persisting the end time lets any page reconstruct "how much time is actually left."
function loadTimerState() {
  try {
    return JSON.parse(localStorage.getItem("timerState"));
  } catch (error) {
    return null;
  }
}

function saveTimerState() {
  localStorage.setItem("timerState", JSON.stringify({
    duration: timerDuration,
    remaining: timerRemaining,
    endTime: timerEndTime,
    active: timerActive,
    running: timerRunning
  }));
}

// ---- Minute/second wheel picker, styled after the iOS Clock app's timer ----

const minuteWheel = document.getElementById("minute-wheel");
const secondWheel = document.getElementById("second-wheel");

function buildWheel(wheel, maxValue) {
  const topPad = document.createElement("div");
  topPad.className = "wheel-pad";
  wheel.appendChild(topPad);

  for (let value = 0; value <= maxValue; value++) {
    const row = document.createElement("div");
    row.className = "wheel-row";
    row.textContent = value;
    row.dataset.value = value;
    row.addEventListener("click", () => scrollWheelTo(wheel, value, true));
    wheel.appendChild(row);
  }

  const bottomPad = document.createElement("div");
  bottomPad.className = "wheel-pad";
  wheel.appendChild(bottomPad);
}

function scrollWheelTo(wheel, value, smooth) {
  wheel.scrollTo({ top: value * WHEEL_ROW_HEIGHT, behavior: smooth ? "smooth" : "auto" });
}

// Fades rows by distance from center as the wheel scrolls, matching the real iOS picker's look.
function updateWheelFade(wheel) {
  const center = wheel.scrollTop / WHEEL_ROW_HEIGHT;
  wheel.querySelectorAll(".wheel-row").forEach((row) => {
    const distance = Math.abs(Number(row.dataset.value) - center);
    row.style.opacity = Math.max(0.25, 1 - distance * 0.35).toFixed(2);
  });
}

function markWheelSelection(wheel, index) {
  wheel.dataset.selected = index;
  wheel.querySelectorAll(".wheel-row").forEach((row) => {
    row.classList.toggle("is-selected", Number(row.dataset.value) === index);
  });
}

// Called once scrolling has settled: snaps exactly to the nearest row and records its value.
function commitWheelSelection(wheel, maxValue) {
  const index = Math.min(maxValue, Math.max(0, Math.round(wheel.scrollTop / WHEEL_ROW_HEIGHT)));
  scrollWheelTo(wheel, index, true);
  markWheelSelection(wheel, index);
  syncPresetHighlight();
}

function setupWheelScrolling(wheel, maxValue) {
  let settleTimer = null;

  wheel.addEventListener("scroll", () => {
    updateWheelFade(wheel);
    // Debounced rather than using "scrollend" so this keeps working on older Safari/iOS.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => commitWheelSelection(wheel, maxValue), 120);
  });
}

function getPickerTotalSeconds() {
  return Number(minuteWheel.dataset.selected || 0) * 60 + Number(secondWheel.dataset.selected || 0);
}

function setPickerValue(minutes, seconds, smooth) {
  scrollWheelTo(minuteWheel, minutes, smooth);
  scrollWheelTo(secondWheel, seconds, smooth);
  markWheelSelection(minuteWheel, minutes);
  markWheelSelection(secondWheel, seconds);
  updateWheelFade(minuteWheel);
  updateWheelFade(secondWheel);
  syncPresetHighlight();
}

function syncPresetHighlight() {
  const total = getPickerTotalSeconds();
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", Number(btn.dataset.seconds) === total);
  });
}

function initTimerPicker() {
  if (!minuteWheel) return; // this page doesn't have the timer

  renderTimerExerciseSelect();
  buildWheel(minuteWheel, WHEEL_MAX_MINUTES);
  buildWheel(secondWheel, WHEEL_MAX_SECONDS);
  setupWheelScrolling(minuteWheel, WHEEL_MAX_MINUTES);
  setupWheelScrolling(secondWheel, WHEEL_MAX_SECONDS);

  const saved = loadTimerState();

  if (saved && saved.active && saved.running && saved.endTime - Date.now() > 0) {
    // A rest timer was left counting down on another page — pick it back up.
    timerDuration = saved.duration;
    timerEndTime = saved.endTime;
    timerRemaining = Math.round((timerEndTime - Date.now()) / 1000);
    timerActive = true;
    showCountdown();
    updateTimerDisplay(timerRemaining);
    timerRunning = true;
    document.getElementById("timer-display").classList.add("is-running");
    timerInterval = setInterval(tick, 250);
  } else if (saved && saved.active && saved.running) {
    // It was running but finished while this page wasn't open to catch the tick.
    timerDuration = saved.duration;
    notifyTimerDone();
    resetTimer();
    timerActive = false;
    saveTimerState();
    showPicker();
  } else if (saved && saved.active) {
    // Left paused.
    timerDuration = saved.duration;
    timerRemaining = saved.remaining;
    timerActive = true;
    showCountdown();
    updateTimerDisplay(timerRemaining);
    document.getElementById("timer-pause").textContent = "Resume";
  } else {
    showPicker();
  }

  setPickerValue(Math.floor(timerDuration / 60), timerDuration % 60, false);
}

function selectPreset(seconds) {
  if (timerActive) return; // presets only adjust the picker before the timer is started
  setPickerValue(Math.floor(seconds / 60), seconds % 60, true);
}

// ---- Idle (picker) <-> active (countdown) view ----

function showPicker() {
  document.getElementById("timer-picker").hidden = false;
  document.getElementById("timer-presets").hidden = false;
  document.getElementById("timer-exercise-select").parentElement.hidden = false;
  document.getElementById("timer-display").hidden = true;
  document.getElementById("timer-start").hidden = false;
  document.getElementById("timer-pause").hidden = true;
  document.getElementById("timer-reset").hidden = true;
}

function showCountdown() {
  document.getElementById("timer-picker").hidden = true;
  document.getElementById("timer-presets").hidden = true;
  document.getElementById("timer-exercise-select").parentElement.hidden = true;
  document.getElementById("timer-display").hidden = false;
  document.getElementById("timer-start").hidden = true;
  document.getElementById("timer-pause").hidden = false;
  document.getElementById("timer-reset").hidden = false;
}

function tick() {
  // The core idea: don't subtract, just check how far away the target end time still is.
  const secondsLeft = Math.round((timerEndTime - Date.now()) / 1000);

  if (secondsLeft <= 0) {
    stopTimer();
    updateTimerDisplay(0);
    notifyTimerDone();
    goToIdle();
    return;
  }

  timerRemaining = secondsLeft;
  updateTimerDisplay(secondsLeft);
}

function startTimer() {
  if (timerRunning) return;

  // Ask for notification permission the first time — must happen from a real click,
  // browsers block permission requests that aren't triggered by user interaction.
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }

  timerEndTime = Date.now() + timerRemaining * 1000;
  timerRunning = true;
  document.getElementById("timer-display").classList.add("is-running");
  timerInterval = setInterval(tick, 250);
  saveTimerState();
  updateTimerNavDot();
}

function pauseTimer() {
  if (!timerRunning) return;

  // Recalculate precisely from the clock rather than trusting whatever the last tick said.
  timerRemaining = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
  stopTimer();
}

function stopTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById("timer-display").classList.remove("is-running");
  saveTimerState();
  updateTimerNavDot();
}

function resetTimer() {
  stopTimer();
  timerRemaining = timerDuration;
  updateTimerDisplay(timerDuration);
}

// Cancel: back to the picker, ready to dial in the next rest period.
function goToIdle() {
  resetTimer();
  timerActive = false;
  document.getElementById("timer-pause").textContent = "Pause";
  showPicker();
  saveTimerState();
}

function notifyTimerDone() {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("Rest complete", { body: "Time for your next set." });
  }

  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }

  // A short beep generated in code — no audio file needed, and it works offline.
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch (error) {
    // Some browsers block audio until the user has interacted with the page — safe to ignore.
  }
}

// If the tab was backgrounded, the browser may have throttled our interval.
// The moment it's visible again, re-check the real time immediately rather than
// waiting for the next tick — this is what makes the timer feel like it "kept going."
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timerRunning) {
    tick();
  }
});

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => selectPreset(Number(btn.dataset.seconds)));
});

if (document.getElementById("timer-start")) {
  document.getElementById("timer-start").addEventListener("click", () => {
    const total = getPickerTotalSeconds();
    if (total <= 0) return; // nothing to count down from

    const exerciseName = document.getElementById("timer-exercise-select").value;
    if (exerciseName) {
      exerciseRestPreferences[exerciseName] = total;
      saveExerciseRestPreferences();
    }

    timerDuration = total;
    timerRemaining = total;
    timerActive = true;
    showCountdown();
    updateTimerDisplay(timerRemaining);
    startTimer();
  });

  document.getElementById("timer-pause").addEventListener("click", () => {
    if (timerRunning) {
      pauseTimer();
      document.getElementById("timer-pause").textContent = "Resume";
    } else {
      startTimer();
      document.getElementById("timer-pause").textContent = "Pause";
    }
  });

  document.getElementById("timer-reset").addEventListener("click", goToIdle);
}

// ---------- TYPE TOGGLE (icon buttons shared by the log form and template rows) ----------

// "weight-lifter", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/weight-lifter/
const STRENGTH_ICON_SVG = '<path fill="currentColor" d="M12 5C10.89 5 10 5.89 10 7S10.89 9 12 9 14 8.11 14 7 13.11 5 12 5M22 1V6H20V4H4V6H2V1H4V3H20V1H22M15 11.26V23H13V18H11V23H9V11.26C6.93 10.17 5.5 8 5.5 5.5L5.5 5H7.5L7.5 5.5C7.5 8 9.5 10 12 10S16.5 8 16.5 5.5L16.5 5H18.5L18.5 5.5C18.5 8 17.07 10.17 15 11.26Z"/>';
// "run", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/run/
const CARDIO_ICON_SVG = '<path fill="currentColor" d="M13.5,5.5C14.59,5.5 15.5,4.58 15.5,3.5C15.5,2.38 14.59,1.5 13.5,1.5C12.39,1.5 11.5,2.38 11.5,3.5C11.5,4.58 12.39,5.5 13.5,5.5M9.89,19.38L10.89,15L13,17V23H15V15.5L12.89,13.5L13.5,10.5C14.79,12 16.79,13 19,13V11C17.09,11 15.5,10 14.69,8.58L13.69,7C13.29,6.38 12.69,6 12,6C11.69,6 11.5,6.08 11.19,6.08L6,8.28V13H8V9.58L9.79,8.88L8.19,17L3.29,16L2.89,18L9.89,19.38Z"/>';
// "human-female-dance", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/human-female-dance/
const DANCE_ICON_SVG = '<path fill="currentColor" d="M17 17H15V23H13V17H10.88L9.34 18.93L11.71 21.29L10.29 22.71L7.93 20.34C7.58 20 7.38 19.53 7.35 19.04C7.32 18.55 7.47 18.06 7.78 17.68L8.32 17H7L9 13V10C8.38 10.47 7.88 11.07 7.53 11.76C7.18 12.46 7 13.22 7 14H5C5 12.14 5.74 10.36 7.05 9.05C8.36 7.74 10.14 7 12 7C13.33 7 14.6 6.47 15.54 5.54C16.47 4.6 17 3.33 17 2H19C19 3.32 18.62 4.62 17.91 5.73C17.2 6.85 16.2 7.74 15 8.31V13L17 17M14 4C14 4.4 13.88 4.78 13.66 5.11C13.44 5.44 13.13 5.7 12.77 5.85C12.4 6 12 6.04 11.61 5.96C11.22 5.88 10.87 5.69 10.59 5.41C10.31 5.13 10.12 4.78 10.04 4.39C9.96 4 10 3.6 10.15 3.24C10.3 2.87 10.56 2.56 10.89 2.34C11.22 2.12 11.6 2 12 2C12.53 2 13.04 2.21 13.41 2.59C13.79 2.96 14 3.47 14 4Z"/>';

// ---------- WEEK TRAIL DAY-CARD ICONS ----------

// No icon set has an actual "person squatting" pictogram, so a kettlebell stands in for
// leg day — the closest gym-equipment association available. Matched by keywords in the
// session name below, since templates don't have a separate "category" field.
// "kettlebell", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/kettlebell/
const LEG_ICON_SVG = '<path fill="currentColor" d="M16.2 10.7L16.8 8.3C16.9 8 17.3 6.6 16.5 5.4C15.9 4.5 14.7 4 13 4H11C9.3 4 8.1 4.5 7.5 5.4C6.7 6.6 7.1 7.9 7.2 8.3L7.8 10.7C6.7 11.8 6 13.3 6 15C6 17.1 7.1 18.9 8.7 20H15.3C16.9 18.9 18 17.1 18 15C18 13.3 17.3 11.8 16.2 10.7M9.6 9.5L9.1 7.8V7.7C9.1 7.7 8.9 7 9.2 6.6C9.4 6.2 10 6 11 6H13C13.9 6 14.6 6.2 14.9 6.5C15.2 6.9 15 7.6 15 7.6L14.5 9.5C13.7 9.2 12.9 9 12 9C11.1 9 10.3 9.2 9.6 9.5Z"/>';
// "arm-flex", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/arm-flex/
const ARM_ICON_SVG = '<path fill="currentColor" d="M3 18.34C3 18.34 4 7.09 7 3L12 4L11 7.09H9V14.25H10C12 11.18 16.14 10.06 18.64 11.18C21.94 12.71 21.64 17.32 18.64 19.36C16.24 21 9 22.43 3 18.34Z"/>';
// "moon-waning-crescent", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/moon-waning-crescent/
const REST_ICON_SVG = '<path fill="currentColor" d="M2 12A10 10 0 0 0 15 21.54A10 10 0 0 1 15 2.46A10 10 0 0 0 2 12Z"/>';
// "meditation", Material Design Icons (Pictogrammers), Apache-2.0: https://pictogrammers.com/library/mdi/icon/meditation/
const YOGA_ICON_SVG = '<path fill="currentColor" d="M12 4C13.11 4 14 4.89 14 6S13.11 8 12 8 10 7.11 10 6 10.9 4 12 4M21 16V14C18.76 14 16.84 13.04 15.4 11.32L14.06 9.72C13.68 9.26 13.12 9 12.53 9H11.5C10.89 9 10.33 9.26 9.95 9.72L8.61 11.32C7.16 13.04 5.24 14 3 14V16C5.77 16 8.19 14.83 10 12.75V15L6.12 16.55C5.45 16.82 5 17.5 5 18.21C5 19.2 5.8 20 6.79 20H9V19.5C9 18.12 10.12 17 11.5 17H14.5C14.78 17 15 17.22 15 17.5S14.78 18 14.5 18H11.5C10.67 18 10 18.67 10 19.5V20H17.21C18.2 20 19 19.2 19 18.21C19 17.5 18.55 16.82 17.88 16.55L14 15V12.75C15.81 14.83 18.23 16 21 16Z"/>';

// Pilates gets a real reformer-bed image (a licensed icon, supplied directly rather than
// sourced from an icon library — no set has one, and a hand-drawn attempt didn't hold up at
// this small a size). It's recolored via a CSS mask instead of an inline SVG path, since a
// mask lets a plain black-on-transparent PNG still follow currentColor like every other
// day-card icon — see .day-card-icon-pilates in style.css.
const PILATES_ICON_MARKUP = '<span class="day-card-icon day-card-icon-pilates" role="img" aria-label="Pilates"></span>';

// Templates don't carry a structured "category" — just a free-text session name — so the
// day-card icon is guessed from keywords in that name. Falls back to the generic strength
// icon (already used for the Strength type toggle) for anything unmatched, e.g.
// "Core & mobility" — mat-based resistance work is a reasonable enough fit for it.
function getDayIconMarkup(sessionName) {
  const name = sessionName.toLowerCase();
  if (name.includes("leg")) return `<svg class="day-card-icon" viewBox="0 0 24 24">${LEG_ICON_SVG}</svg>`;
  if (name.includes("run")) return `<svg class="day-card-icon" viewBox="0 0 24 24">${CARDIO_ICON_SVG}</svg>`;
  if (name.includes("upper") || name.includes("arm")) return `<svg class="day-card-icon" viewBox="0 0 24 24">${ARM_ICON_SVG}</svg>`;
  if (name.includes("yoga")) return `<svg class="day-card-icon" viewBox="0 0 24 24">${YOGA_ICON_SVG}</svg>`;
  if (name.includes("pilates")) return PILATES_ICON_MARKUP;
  if (name.includes("dance")) return `<svg class="day-card-icon" viewBox="0 0 24 24">${DANCE_ICON_SVG}</svg>`;
  return `<svg class="day-card-icon" viewBox="0 0 24 24">${STRENGTH_ICON_SVG}</svg>`;
}

function setTypeToggleValue(toggleEl, type) {
  toggleEl.dataset.value = type;
  toggleEl.querySelectorAll(".type-toggle-btn").forEach((btn) => {
    const isActive = btn.dataset.type === type;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive);
  });
}

function setupTypeToggle(toggleEl, onChange) {
  toggleEl.querySelectorAll(".type-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTypeToggleValue(toggleEl, btn.dataset.type);
      onChange();
    });
  });
}

// ---------- TEMPLATE MANAGEMENT ----------

let editingTemplateId = null; // null means we're creating a new template, not editing one

function renderTemplateList() {
  const container = document.getElementById("template-list");
  if (!container) return; // this page doesn't show templates

  container.innerHTML = "";

  if (templates.length === 0) {
    container.innerHTML = `<p class="rest-day-message">No templates yet — create one below.</p>`;
    return;
  }

  templates.forEach((template) => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <div class="template-info">
        <span class="template-name">${template.name}</span>
        <span class="template-meta">${template.exercises.length} exercise${template.exercises.length === 1 ? "" : "s"}</span>
      </div>
      <div class="template-actions">
        <button type="button" class="btn-small edit-template-btn">Edit</button>
        <button type="button" class="btn-small delete-template-btn">Delete</button>
      </div>
    `;

    card.querySelector(".edit-template-btn").addEventListener("click", () => openTemplateForm(template));
    card.querySelector(".delete-template-btn").addEventListener("click", () => deleteTemplate(template.id));

    container.appendChild(card);
  });
}

function addExerciseRow(prefill) {
  const rowsContainer = document.getElementById("template-exercise-rows");
  const isCardio = prefill && prefill.type === "cardio";
  const isDance = prefill && prefill.type === "dance";
  const isStrength = !isCardio && !isDance;
  const rowType = isDance ? "dance" : isCardio ? "cardio" : "strength";
  const isLinked = Boolean(prefill && prefill.linkedToNext);

  const row = document.createElement("div");
  row.className = "exercise-row-group";
  row.innerHTML = `
    <div class="exercise-row">
      <input type="text" class="row-name" placeholder="Exercise" value="${prefill ? prefill.name : ""}" required>
      <div class="type-toggle row-type" data-value="${rowType}">
        <button type="button" class="type-toggle-btn ${isStrength ? "is-active" : ""}" data-type="strength" aria-pressed="${isStrength}" aria-label="Strength">
          <svg class="type-icon" viewBox="0 0 24 24">${STRENGTH_ICON_SVG}</svg>
        </button>
        <button type="button" class="type-toggle-btn ${isCardio ? "is-active" : ""}" data-type="cardio" aria-pressed="${isCardio}" aria-label="Cardio">
          <svg class="type-icon" viewBox="0 0 24 24">${CARDIO_ICON_SVG}</svg>
        </button>
        <button type="button" class="type-toggle-btn ${isDance ? "is-active" : ""}" data-type="dance" aria-pressed="${isDance}" aria-label="Dance">
          <svg class="type-icon" viewBox="0 0 24 24">${DANCE_ICON_SVG}</svg>
        </button>
      </div>
      <button type="button" class="remove-row-btn" aria-label="Remove exercise">&times;</button>
    </div>
    <div class="exercise-row-fields strength-fields" ${isStrength ? "" : "hidden"}>
      <input type="number" class="row-sets" placeholder="Sets" min="1" value="${isStrength && prefill ? prefill.sets : ""}">
      <input type="number" class="row-reps" placeholder="Reps" min="1" value="${isStrength && prefill ? prefill.reps : ""}">
    </div>
    <div class="exercise-row-fields cardio-fields" ${isCardio ? "" : "hidden"}>
      <input type="number" class="row-distance" placeholder="Distance (km)" min="0" step="0.1" value="${isCardio ? prefill.distance : ""}">
      <input type="number" class="row-duration" placeholder="Duration (min)" min="0" value="${isCardio ? prefill.duration : ""}">
    </div>
    <div class="exercise-row-fields dance-fields" ${isDance ? "" : "hidden"}>
      <input type="number" class="row-dance-duration" placeholder="Duration (min)" min="0" value="${isDance ? prefill.duration : ""}">
      <input type="number" class="row-songs" placeholder="Songs" min="0" value="${isDance ? prefill.songs : ""}">
      <input type="url" class="row-link" placeholder="Reference video link (optional)" value="${isDance && prefill.link ? prefill.link : ""}">
    </div>
    <label class="superset-toggle">
      <input type="checkbox" class="row-superset-checkbox" ${isLinked ? "checked" : ""}>
      <span>Superset with next exercise</span>
    </label>
  `;

  const typeToggle = row.querySelector(".row-type");
  const strengthFields = row.querySelector(".strength-fields");
  const cardioFields = row.querySelector(".cardio-fields");
  const danceFields = row.querySelector(".dance-fields");

  setupTypeToggle(typeToggle, () => {
    const value = typeToggle.dataset.value;
    strengthFields.hidden = value !== "strength";
    cardioFields.hidden = value !== "cardio";
    danceFields.hidden = value !== "dance";
  });

  row.querySelector(".remove-row-btn").addEventListener("click", () => row.remove());

  rowsContainer.appendChild(row);
}

function openTemplateForm(template) {
  editingTemplateId = template ? template.id : null;

  document.getElementById("template-name").value = template ? template.name : "";
  document.getElementById("template-exercise-rows").innerHTML = "";

  if (template) {
    template.exercises.forEach((exercise) => addExerciseRow(exercise));
  } else {
    addExerciseRow(null); // start a fresh template with one empty row
  }

  document.getElementById("template-form-wrapper").hidden = false;
}

function closeTemplateForm() {
  document.getElementById("template-form-wrapper").hidden = true;
  editingTemplateId = null;
}

function deleteTemplate(templateId) {
  const confirmed = confirm("Delete this template? Any days assigned to it will become rest days.");
  if (!confirmed) return;

  templates = templates.filter((t) => t.id !== templateId);

  // Clear out any day assignments that pointed at the now-deleted template.
  Object.keys(weeklyAssignments).forEach((day) => {
    if (weeklyAssignments[day] === templateId) {
      delete weeklyAssignments[day];
    }
  });

  saveTemplates();
  saveAssignments();
  renderTemplateList();
  renderAssignGrid();
  renderTodayPlan();
  renderWeekTrail();
  renderStats();
}

if (document.getElementById("new-template-btn")) {
  document.getElementById("new-template-btn").addEventListener("click", () => openTemplateForm(null));
  document.getElementById("cancel-template").addEventListener("click", closeTemplateForm);
  document.getElementById("add-exercise-row").addEventListener("click", () => addExerciseRow(null));

  document.getElementById("template-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("template-name").value;

    const exercises = Array.from(document.querySelectorAll(".exercise-row-group")).map((row) => {
      const type = row.querySelector(".row-type").dataset.value;
      const name = row.querySelector(".row-name").value;
      const linkedToNext = row.querySelector(".row-superset-checkbox").checked;

      if (type === "cardio") {
        return {
          name,
          type,
          distance: Number(row.querySelector(".row-distance").value) || 0,
          duration: Number(row.querySelector(".row-duration").value) || 0,
          linkedToNext
        };
      }

      if (type === "dance") {
        const link = row.querySelector(".row-link").value.trim();
        return {
          name,
          type,
          duration: Number(row.querySelector(".row-dance-duration").value) || 0,
          songs: Number(row.querySelector(".row-songs").value) || 0,
          link: link || null,
          linkedToNext
        };
      }

      return {
        name,
        type,
        sets: Number(row.querySelector(".row-sets").value) || 0,
        reps: Number(row.querySelector(".row-reps").value) || 0,
        linkedToNext
      };
    });

    if (editingTemplateId) {
      const template = templates.find((t) => t.id === editingTemplateId);
      template.name = name;
      template.exercises = exercises;
    } else {
      templates.push({ id: generateId(), name, exercises });
    }

    saveTemplates();
    closeTemplateForm();
    renderTemplateList();
    renderAssignGrid(); // template names may have changed, so refresh the dropdowns too
    renderTodayPlan();
    renderWeekTrail();
    renderStats();
  });
}

// ---------- AI TEMPLATE SUGGESTIONS (Phase 3) ----------

// This is the one place the app talks to a server we control, rather than a public API (like
// TikTok's oEmbed) directly. The Anthropic API key has to stay secret, so a small Vercel
// function does the actual talking to Claude — see api/suggest-template.js and CLAUDE.md for
// why.
const SUGGEST_API_URL = "https://gym-training-tracker-gamma.vercel.app/api/suggest-template";

let lastSuggestedTemplate = null; // holds the AI's draft between "Generate" and "Save"

async function fetchSuggestedTemplate(goal) {
  const response = await fetch(SUGGEST_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal })
  });

  const data = await response.json();
  if (!response.ok) {
    // The server sends back a friendly { error: "..." } message on every failure case
    // (rate limit hit, bad input, Claude API error) — just surface it as-is.
    throw new Error(data.error || "Something went wrong.");
  }

  return data.template;
}

function renderSuggestedTemplate(template) {
  const resultSection = document.getElementById("suggest-result-section");
  const nameEl = document.getElementById("suggest-result-name");
  const listEl = document.getElementById("suggest-result-list");

  nameEl.textContent = template.name;
  listEl.innerHTML = template.exercises
    .map((exercise) => {
      const meta = exercise.type === "cardio"
        ? `${exercise.distance}km · ${exercise.duration}min`
        : `${exercise.sets} x ${exercise.reps}`;
      return `
        <li class="exercise-item">
          <div class="exercise-info">
            <span class="exercise-name">${exercise.name}</span>
            <span class="exercise-meta">${meta}</span>
          </div>
        </li>
      `;
    })
    .join("");

  resultSection.hidden = false;
}

if (document.getElementById("suggest-form")) {
  document.getElementById("suggest-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const goalInput = document.getElementById("suggest-goal");
    const errorEl = document.getElementById("suggest-error");
    const submitBtn = document.getElementById("suggest-btn");

    errorEl.hidden = true;
    document.getElementById("suggest-result-section").hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Generating...";

    try {
      lastSuggestedTemplate = await fetchSuggestedTemplate(goalInput.value.trim());
      renderSuggestedTemplate(lastSuggestedTemplate);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate suggestion";
    }
  });

  document.getElementById("save-suggestion-btn").addEventListener("click", () => {
    if (!lastSuggestedTemplate) return;

    templates.push({
      id: generateId(),
      name: lastSuggestedTemplate.name,
      exercises: lastSuggestedTemplate.exercises
    });
    saveTemplates();

    lastSuggestedTemplate = null;
    document.getElementById("suggest-result-section").hidden = true;
    document.getElementById("suggest-form").reset();

    // Jump to the Templates page so Steph can see it landed and assign it to a day.
    window.location.href = "templates.html";
  });

  document.getElementById("discard-suggestion-btn").addEventListener("click", () => {
    lastSuggestedTemplate = null;
    document.getElementById("suggest-result-section").hidden = true;
  });
}

// ---------- WEEKLY ASSIGNMENT GRID ----------

function renderAssignGrid() {
  const container = document.getElementById("assign-grid");
  if (!container) return; // this page doesn't show the weekly plan

  container.innerHTML = "";

  orderedDays.forEach((day) => {
    const row = document.createElement("div");
    row.className = "assign-row";

    const label = document.createElement("label");
    label.textContent = day;

    const select = document.createElement("select");

    const restOption = document.createElement("option");
    restOption.value = "";
    restOption.textContent = "Rest day";
    select.appendChild(restOption);

    templates.forEach((template) => {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.name;
      select.appendChild(option);
    });

    select.value = weeklyAssignments[day] || "";

    select.addEventListener("change", () => {
      if (select.value) {
        weeklyAssignments[day] = select.value;
      } else {
        delete weeklyAssignments[day];
      }
      saveAssignments();
      renderTodayPlan();
      renderWeekTrail();
      renderStats();
    });

    row.appendChild(label);
    row.appendChild(select);
    container.appendChild(row);
  });
}

// ---------- RENDERING ----------

// Tracks whether the week carousel has been scrolled to today yet. Re-renders happen a lot
// (any log change, template edit, etc.) and each one rebuilds the cards from scratch, but we
// only want to auto-center on today the very first time — after that, whichever day the user
// has swiped to should stay put across re-renders instead of jumping back.
let weekCarouselCentered = false;
let weekCarouselListenerAttached = false;

// Must match .day-card's compact `width` in style.css — used below to work out how much side
// padding the carousel needs so the very first and last day can still be scrolled to center.
const COMPACT_DAY_CARD_WIDTH = 68;

// Marks whichever day card's center is geometrically closest to the carousel's own center as
// "active" (full title revealed), un-marking every other card. Tried this first with
// IntersectionObserver's isIntersecting/threshold, but that just answers "is this card >X%
// visible" — with several compact 56px cards fitting in the viewport at once, more than one
// can clear the same threshold simultaneously, so it can't tell us which ONE is centered.
// Plain geometry (nearest center-to-center distance) always picks exactly one.
function updateActiveDayCard(trail) {
  const containerCenter = trail.getBoundingClientRect().left + trail.clientWidth / 2;
  let closestCard = null;
  let closestDistance = Infinity;

  trail.querySelectorAll(".day-card").forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const distance = Math.abs(cardRect.left + cardRect.width / 2 - containerCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestCard = card;
    }
  });

  trail.querySelectorAll(".day-card").forEach((card) => {
    card.classList.toggle("is-active", card === closestCard);
  });
}

function renderWeekTrail() {
  const trail = document.getElementById("week-trail");
  if (!trail) return; // this page doesn't show the week trail

  // A rebuild (trail.innerHTML = "") resets scroll position to 0, so capture it first and
  // restore it after — otherwise every re-render would yank the carousel back to Monday.
  const previousScrollLeft = trail.scrollLeft;

  trail.innerHTML = ""; // clear out anything from a previous render

  const weekDates = getWeekDates();
  const todayString = toDateString(new Date());
  let todayCard = null;

  weekDates.forEach((dateString) => {
    const date = new Date(dateString);
    const dayName = dayNames[date.getDay()];
    const plan = findPlanForDay(dayName);

    const card = document.createElement("div");
    card.className = "day-card";
    if (!plan) card.classList.add("is-rest");
    if (dateString === todayString) card.classList.add("is-today");

    let isComplete = false;
    if (plan) {
      isComplete = plan.exercises.every((ex) =>
        trainingLog.some((entry) => entry.date === dateString && entry.exercise === ex.name)
      );
      if (isComplete) card.classList.add("is-complete");
    }

    // The binder-hole dots that make this read as a torn calendar page
    const rings = document.createElement("div");
    rings.className = "day-card-rings";
    rings.innerHTML = "<span></span><span></span>";

    // Both labels are always in the DOM; CSS shows whichever one matches the card's
    // compact/active state (see .day-card-header-full in style.css). Toggling visibility
    // this way means the carousel's scroll handler only ever needs to flip the .is-active
    // class -- it doesn't have to also swap text content on every scroll frame.
    const header = document.createElement("div");
    header.className = "day-card-header";
    header.innerHTML = `
      <span class="day-card-header-abbr">${dayAbbreviations[dayName]}</span>
      <span class="day-card-header-full">${dayName}</span>
    `;

    const body = document.createElement("div");
    body.className = "day-card-body";

    body.innerHTML = plan
      ? getDayIconMarkup(plan.sessionName)
      : `<svg class="day-card-icon" viewBox="0 0 24 24">${REST_ICON_SVG}</svg>`;

    const sessionLabel = document.createElement("span");
    sessionLabel.className = "day-card-session";
    sessionLabel.textContent = plan ? plan.sessionName : "Rest day";
    body.appendChild(sessionLabel);

    card.appendChild(rings);
    card.appendChild(header);
    card.appendChild(body);

    if (isComplete) {
      const check = document.createElement("div");
      check.className = "day-card-check";
      check.textContent = "\u2713"; // checkmark character
      card.appendChild(check);
    }

    if (dateString === todayString) todayCard = card;

    trail.appendChild(card);
  });

  // Enough left/right padding that the very first and last day can still be scrolled all the
  // way to center, not just up against the edge of the screen. This has to be worked out from
  // the container's actual width rather than a fixed CSS value, since that width varies by
  // device \u2014 style.css can't know it up front.
  const sidePadding = Math.max(0, (trail.clientWidth - COMPACT_DAY_CARD_WIDTH) / 2);
  trail.style.paddingLeft = `${sidePadding}px`;
  trail.style.paddingRight = `${sidePadding}px`;

  // Re-check the active (centered) card on every scroll frame as the user swipes. The
  // listener is only attached once ever, not on every render -- `trail` itself is never
  // recreated (only its contents are), so re-attaching here on each rebuild would stack up a
  // fresh duplicate listener every time instead of replacing the old one.
  if (!weekCarouselListenerAttached) {
    trail.addEventListener("scroll", () => {
      requestAnimationFrame(() => updateActiveDayCard(trail));
    });
    weekCarouselListenerAttached = true;
  }

  if (!weekCarouselCentered && todayCard) {
    // "auto" (not "smooth") on first load -- there's nothing to animate from yet.
    todayCard.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    weekCarouselCentered = true;
  } else {
    trail.scrollLeft = previousScrollLeft;
  }

  // Set the correct active card immediately rather than waiting for a scroll event to fire \u2014
  // setting scrollLeft/scrollIntoView above doesn't reliably fire one synchronously.
  updateActiveDayCard(trail);
}

// ---------- EXERCISE REFERENCE ("How do I do this?") ----------

// free-exercise-db (yuhonas/free-exercise-db on GitHub, Unlicense/public domain) is a static
// JSON file plus JPEGs served straight from raw.githubusercontent.com with CORS wide open —
// no API key, no backend, same "call it straight from the browser" pattern as TikTok's oEmbed
// endpoint elsewhere in this file. It's a weightlifting-focused dataset (873 exercises) with
// real photos, so it's tried first — but it has none at all for cardio or Pilates/Yoga, which
// is why wger (below) exists as a second, broader-but-photo-less fallback source.
const EXERCISE_REFERENCE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const EXERCISE_REFERENCE_IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// wger.de (CC-BY-SA 4.0, community-maintained, no API key needed) is a general fitness
// database rather than a pure weightlifting one — it has an actual Cardio category, so it
// picks up moves free-exercise-db has zero coverage for. It still has no yoga or Pilates pose
// names at all (checked directly against wger's own data), so that gap is handled by the
// YouTube-search fallback in toggleExerciseReference below rather than a third data source.
const WGER_TRANSLATION_URL = "https://wger.de/api/v2/exercise-translation/?format=json&language=2&limit=500";

let exerciseReferenceDatabase = null; // lazy-loaded on first use, then kept for the rest of the session
let wgerReferenceDatabase = null; // same, for the second-tier source

async function loadExerciseReferenceDatabase() {
  if (exerciseReferenceDatabase) return exerciseReferenceDatabase;

  // Cached locally too — it's ~1MB, no need to re-download it every single visit.
  const cached = localStorage.getItem("exerciseReferenceCache");
  if (cached) {
    exerciseReferenceDatabase = JSON.parse(cached);
    return exerciseReferenceDatabase;
  }

  const response = await fetch(EXERCISE_REFERENCE_URL);
  const data = await response.json();
  exerciseReferenceDatabase = data;
  try {
    localStorage.setItem("exerciseReferenceCache", JSON.stringify(data));
  } catch (error) {
    // Safari private browsing (or a full quota) throws on write — fine to just skip caching
    // and re-fetch next time rather than breaking the lookup itself.
  }
  return data;
}

// wger's own query-string filters (?name=, ?language=) don't reliably narrow results server
// side, so this fetches every English-tagged translation (a few thousand, paginated via the
// API's own "next" links) and matches client side — same shape as free-exercise-db above,
// just assembled from a paginated API instead of one static file.
async function loadWgerReferenceDatabase() {
  if (wgerReferenceDatabase) return wgerReferenceDatabase;

  const cached = localStorage.getItem("wgerReferenceCache");
  if (cached) {
    wgerReferenceDatabase = JSON.parse(cached);
    return wgerReferenceDatabase;
  }

  let url = WGER_TRANSLATION_URL;
  const entries = [];
  while (url) {
    const response = await fetch(url);
    const page = await response.json();
    page.results.forEach((entry) => {
      if (entry.name && entry.description) {
        entries.push({ name: entry.name, description: entry.description });
      }
    });
    url = page.next;
  }

  wgerReferenceDatabase = entries;
  try {
    localStorage.setItem("wgerReferenceCache", JSON.stringify(entries));
  } catch (error) {
    // Same reasoning as the free-exercise-db cache above — skip on quota/private-mode errors.
  }
  return entries;
}

// Very basic singular/plural handling ("Squats" -> "squat") so the word-matching below isn't
// tripped up by something as simple as pluralization.
function normalizeReferenceWord(word) {
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

function getReferenceWords(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeReferenceWord);
}

// Matches by whole words, not raw substring — a naive "does the string contain this text"
// check matches "run" inside "cRUNches", which is exactly the kind of wrong match this avoids.
// Among every candidate where one name's words are fully contained in the other's, the one
// with the fewest extra words wins, as a simple stand-in for "the more generic match". Takes
// a `getName` accessor so it works against both the free-exercise-db and wger shapes below.
function findExerciseReference(exerciseName, database, getName) {
  const queryWords = getReferenceWords(exerciseName);
  if (queryWords.length === 0) return null;

  let bestMatch = null;
  let bestExtraWords = Infinity;

  database.forEach((entry) => {
    const candidateWords = getReferenceWords(getName(entry));
    // A name that normalizes to zero words (non-Latin script, punctuation-only — wger's
    // community data has a few) would otherwise vacuously pass the "every candidate word is
    // in the query" check below for literally any query, since [].every() is always true.
    if (candidateWords.length === 0) return;
    const allQueryWordsFound = queryWords.every((w) => candidateWords.includes(w));
    const allCandidateWordsFound = candidateWords.every((w) => queryWords.includes(w));
    if (allQueryWordsFound || allCandidateWordsFound) {
      const extraWords = Math.abs(candidateWords.length - queryWords.length);
      if (extraWords < bestExtraWords) {
        bestExtraWords = extraWords;
        bestMatch = entry;
      }
    }
  });

  return bestMatch;
}

// wger descriptions are raw HTML (<p>, <ol>, <li>...) rather than plain text. Stripped down to
// text rather than injected as-is, since this is third-party content and innerHTML-ing markup
// straight from an external API is exactly the kind of thing that shouldn't be trusted blindly.
function stripHtmlTags(html) {
  const withoutTags = html.replace(/<[^>]*>/g, " ");
  const withoutEntities = withoutTags.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  return withoutEntities.replace(/\s+/g, " ").trim();
}

function buildYouTubeSearchUrl(exerciseName) {
  const query = encodeURIComponent(`${exerciseName} exercise how to`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

async function toggleExerciseReference(exerciseName, panel, button) {
  if (!panel.hidden) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `
    <div class="reference-images">
      <div class="shimmer-block reference-image"></div>
      <div class="shimmer-block reference-image"></div>
    </div>
  `;
  button.disabled = true;

  try {
    const database = await loadExerciseReferenceDatabase();
    const match = findExerciseReference(exerciseName, database, (entry) => entry.name);

    if (match) {
      const imagesHtml = match.images
        .map(
          (path) =>
            `<img src="${EXERCISE_REFERENCE_IMAGE_BASE}${path}" alt="${match.name}" class="reference-image" loading="lazy">`
        )
        .join("");
      const firstStep = match.instructions[0] || "";

      panel.innerHTML = `
        <div class="reference-images">${imagesHtml}</div>
        <p class="reference-caption">${match.name}${firstStep ? ` — ${firstStep}` : ""}</p>
      `;
      return;
    }

    // Nothing in the strength-focused dataset — try the broader, photo-less wger source
    // (this is where cardio moves free-exercise-db has zero coverage for get picked up).
    const wgerDatabase = await loadWgerReferenceDatabase();
    const wgerMatch = findExerciseReference(exerciseName, wgerDatabase, (entry) => entry.name);

    if (wgerMatch) {
      const description = stripHtmlTags(wgerMatch.description);
      panel.innerHTML = `
        <p class="reference-caption">${wgerMatch.name}${description ? ` — ${description}` : ""}</p>
        <p class="reference-source">via wger.de (CC BY-SA 4.0)</p>
      `;
      return;
    }

    // Neither database has it — true for every yoga pose, Pilates move, and Dance routine
    // right now, since no free structured dataset covers those. A search link beats a dead end.
    panel.innerHTML = `
      <p class="reference-empty">No visual reference found for "${exerciseName}".</p>
      <a class="reference-search-link" href="${buildYouTubeSearchUrl(exerciseName)}" target="_blank" rel="noopener noreferrer">Search YouTube for "${exerciseName}"</a>
    `;
  } catch (error) {
    panel.innerHTML = `<p class="reference-empty">Couldn't load a reference right now.</p>`;
  } finally {
    button.disabled = false;
  }
}

// Templates mark a superset with a plain boolean on each exercise (linkedToNext) rather than
// numbered group IDs — much simpler, and it's all a "chain" of consecutive linked exercises
// needs. This turns that flat boolean into actual groups: a run of exercises where each one
// (except the last) has linkedToNext set. A solo, unlinked exercise is just a group of one.
function groupExercisesForDisplay(exercises) {
  const groups = [];
  let current = [];

  exercises.forEach((exercise) => {
    current.push(exercise);
    if (!exercise.linkedToNext) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length > 0) groups.push(current); // a trailing linkedToNext with no next exercise

  return groups;
}

// Builds one exercise's checkbox/info/inputs <li> — pulled out of renderTodayPlan() so a
// superset group (see groupExercisesForDisplay above) can build several of these and wrap
// them together, without duplicating all of this per-exercise logic.
function buildTodayPlanItem(exercise, todayString, isBodyweightSession) {
  const existingEntry = trainingLog.find(
    (entry) => entry.date === todayString && entry.exercise === exercise.name
  );
  const isCardio = exercise.type === "cardio";
  const isDance = exercise.type === "dance";

  const item = document.createElement("li");
  item.className = "exercise-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "exercise-checkbox";
  if (isDance) checkbox.classList.add("is-dance"); // blush instead of mocha — see style.css
  checkbox.checked = Boolean(existingEntry);

  const info = document.createElement("div");
  info.className = "exercise-info";
  const targetMetaText = isCardio
    ? `${exercise.distance}km target`
    : isDance
    ? `${exercise.duration}min · ${exercise.songs} songs target`
    : `${exercise.sets} x ${exercise.reps}`;
  // A template-defined reference video (dance exercises only) gets its own small link next
  // to the name, separate from the "How do I do this?" reference lookup below.
  const watchLinkHtml = isDance && exercise.link
    ? `<a class="watch-link" href="${exercise.link}" target="_blank" rel="noopener noreferrer">Watch</a>`
    : "";
  info.innerHTML = `
    <div class="exercise-name-row">
      <span class="exercise-name">${exercise.name}</span>
      <button type="button" class="reference-btn" aria-label="How do I do this?">?</button>
      ${watchLinkHtml}
    </div>
    <span class="exercise-meta">${targetMetaText}</span>
    <div class="reference-panel" hidden></div>
  `;
  const metaEl = info.querySelector(".exercise-meta");
  const referenceBtn = info.querySelector(".reference-btn");
  const referencePanel = info.querySelector(".reference-panel");
  referenceBtn.addEventListener("click", () => {
    toggleExerciseReference(exercise.name, referencePanel, referenceBtn);
  });

  const inputsWrapper = document.createElement("div");
  inputsWrapper.className = "exercise-inputs";

  // Build the right set of inputs for this exercise's type.
  let firstInput, secondInput, thirdInput;
  if (isCardio) {
    firstInput = document.createElement("input");
    firstInput.type = "number";
    firstInput.className = "weight-input-small";
    firstInput.placeholder = "km";
    firstInput.min = "0";
    firstInput.step = "0.1";
    firstInput.value = existingEntry ? existingEntry.distance ?? "" : "";

    secondInput = document.createElement("input");
    secondInput.type = "number";
    secondInput.className = "weight-input-small";
    secondInput.placeholder = "min";
    secondInput.min = "0";
    secondInput.value = existingEntry ? existingEntry.duration ?? "" : "";

    // Pace isn't logged separately — it's shown live as distance/duration are typed, right
    // in the same meta text that otherwise just shows the planned target.
    function updatePaceMeta() {
      const pace = formatPace(Number(firstInput.value), Number(secondInput.value));
      metaEl.textContent = pace ? `${targetMetaText} · ${pace}` : targetMetaText;
    }
    firstInput.addEventListener("input", updatePaceMeta);
    secondInput.addEventListener("input", updatePaceMeta);
    updatePaceMeta(); // in case this exercise was already logged before the page loaded

    inputsWrapper.appendChild(firstInput);
    inputsWrapper.appendChild(secondInput);
  } else if (isDance) {
    firstInput = document.createElement("input");
    firstInput.type = "number";
    firstInput.className = "weight-input-small";
    firstInput.placeholder = "min";
    firstInput.min = "0";
    firstInput.value = existingEntry ? existingEntry.duration ?? "" : "";

    secondInput = document.createElement("input");
    secondInput.type = "number";
    secondInput.className = "weight-input-small";
    secondInput.placeholder = "songs";
    secondInput.min = "0";
    secondInput.value = existingEntry ? existingEntry.songs ?? "" : "";

    thirdInput = document.createElement("select");
    thirdInput.className = "effort-select-small";
    ["Low", "Medium", "High"].forEach((level) => {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = level;
      thirdInput.appendChild(option);
    });
    thirdInput.value = existingEntry && existingEntry.effort ? existingEntry.effort : "Medium";

    inputsWrapper.appendChild(firstInput);
    inputsWrapper.appendChild(secondInput);
    inputsWrapper.appendChild(thirdInput);
  } else if (!isBodyweightSession) {
    firstInput = document.createElement("input");
    firstInput.type = "number";
    firstInput.className = "weight-input-small";
    firstInput.placeholder = "kg";
    firstInput.min = "0";
    firstInput.step = "0.5";
    firstInput.value = existingEntry ? existingEntry.weight ?? "" : "";

    inputsWrapper.appendChild(firstInput);
  }

  function buildLogEntry() {
    if (isCardio) {
      return {
        date: todayString,
        exercise: exercise.name,
        type: "cardio",
        distance: firstInput.value ? Number(firstInput.value) : exercise.distance,
        duration: secondInput.value ? Number(secondInput.value) : exercise.duration
      };
    }
    if (isDance) {
      return {
        date: todayString,
        exercise: exercise.name,
        type: "dance",
        duration: firstInput.value ? Number(firstInput.value) : exercise.duration,
        songs: secondInput.value ? Number(secondInput.value) : exercise.songs,
        effort: thirdInput.value
      };
    }
    return {
      date: todayString,
      exercise: exercise.name,
      type: "strength",
      sets: exercise.sets,
      reps: exercise.reps,
      // No weight input at all for a bodyweight session (firstInput is undefined there).
      weight: firstInput && firstInput.value ? Number(firstInput.value) : null
    };
  }

  // --- Event listener #1: checking the box logs (or unlogs) this exercise ---
  checkbox.addEventListener("change", () => {
    // Clear out any earlier PB badge before re-deciding whether one applies now.
    const existingBadge = info.querySelector(".pb-badge");
    if (existingBadge) existingBadge.remove();

    if (checkbox.checked) {
      // Only added here, on the actual click — never when re-rendering an exercise that was
      // already checked off earlier — so this plays once as real feedback, not on every redraw.
      checkbox.classList.add("just-checked");
      checkbox.addEventListener("animationend", () => checkbox.classList.remove("just-checked"), { once: true });

      const newEntry = buildLogEntry();
      trainingLog.push(newEntry);

      const pbMetric = checkForNewPB(newEntry);
      if (pbMetric) {
        const badge = document.createElement("span");
        badge.className = "pb-badge";
        badge.textContent = "New PB";
        badge.title = PB_MESSAGES[pbMetric];
        info.appendChild(badge);
      }
    } else {
      trainingLog = trainingLog.filter(
        (entry) => !(entry.date === todayString && entry.exercise === exercise.name)
      );
    }
    saveLog();
    renderWeekTrail();
    renderStats();
    renderCalendar();
    renderDayDetail();
  });

  // --- Event listener #2: editing the input(s) updates today's entry, if it exists ---
  function handleInputChange() {
    const entry = trainingLog.find(
      (e) => e.date === todayString && e.exercise === exercise.name
    );
    if (!entry) return;

    if (isCardio) {
      entry.distance = firstInput.value ? Number(firstInput.value) : null;
      entry.duration = secondInput.value ? Number(secondInput.value) : null;
    } else if (isDance) {
      entry.duration = firstInput.value ? Number(firstInput.value) : null;
      entry.songs = secondInput.value ? Number(secondInput.value) : null;
      entry.effort = thirdInput.value;
    } else {
      entry.weight = firstInput.value ? Number(firstInput.value) : null;
    }
    saveLog();
    renderCalendar();
    renderDayDetail();
  }

  if (firstInput) firstInput.addEventListener("change", handleInputChange);
  if (secondInput) secondInput.addEventListener("change", handleInputChange);
  if (thirdInput) thirdInput.addEventListener("change", handleInputChange);

  item.appendChild(checkbox);
  item.appendChild(info);
  item.appendChild(inputsWrapper);
  return item;
}

function renderTodayPlan() {
  const container = document.getElementById("today-plan");
  if (!container) return; // this page doesn't show today's plan

  container.innerHTML = "";

  const todayString = toDateString(new Date());
  const todayName = dayNames[new Date().getDay()];
  const plan = findPlanForDay(todayName);

  if (!plan) {
    container.innerHTML = `<p class="rest-day-message">Rest day — nothing scheduled. Feel free to log anything extra below.</p>`;
    return;
  }

  const list = document.createElement("ul");
  list.className = "exercise-list";

  // Pilates/Yoga are bodyweight sessions — tracked by sets/reps (already shown in the meta
  // text below) rather than a weight lifted, so skip the weight input for these specifically
  // rather than showing an input that never applies.
  const isBodyweightSession = /pilates|yoga/i.test(plan.sessionName);

  groupExercisesForDisplay(plan.exercises).forEach((group) => {
    if (group.length === 1) {
      list.appendChild(buildTodayPlanItem(group[0], todayString, isBodyweightSession));
      return;
    }

    // A superset: several exercises meant to be done back to back, so they're visually
    // bracketed together under one label instead of reading as unrelated list items.
    const wrapper = document.createElement("li");
    wrapper.className = "superset-group";

    const label = document.createElement("span");
    label.className = "superset-label";
    label.textContent = "Superset";
    wrapper.appendChild(label);

    const innerList = document.createElement("ul");
    innerList.className = "exercise-list superset-list";
    group.forEach((exercise) => {
      innerList.appendChild(buildTodayPlanItem(exercise, todayString, isBodyweightSession));
    });
    wrapper.appendChild(innerList);

    list.appendChild(wrapper);
  });

  container.appendChild(list);
}

// Which month is currently showing, and which day is selected in the detail panel.
let viewedDate = new Date();
let selectedDate = toDateString(new Date());

function daysInMonth(year, month) {
  // Passing day "0" rolls back one day from the 1st of `month`,
  // which conveniently gives us the last day of the PREVIOUS month.
  // So this same trick gives us "days in this month" when we ask for month + 1.
  return new Date(year, month + 1, 0).getDate();
}

function mondayIndex(date) {
  // JS's getDay() returns 0 for Sunday, 1 for Monday... 6 for Saturday.
  // We want Monday = 0, so we shift everything back by one, wrapping Sunday around.
  return (date.getDay() + 6) % 7;
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return; // this page doesn't show the history calendar

  grid.innerHTML = "";

  const year = viewedDate.getFullYear();
  const month = viewedDate.getMonth();

  document.getElementById("calendar-month-label").textContent =
    viewedDate.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const totalDaysThisMonth = daysInMonth(year, month);
  const totalDaysLastMonth = daysInMonth(year, month - 1);
  const offset = mondayIndex(new Date(year, month, 1));
  const todayString = toDateString(new Date());

  const cells = [];

  // Leading cells: trailing days from last month
  for (let i = offset - 1; i >= 0; i--) {
    cells.push({ label: totalDaysLastMonth - i, otherMonth: true });
  }

  // This month's real days
  for (let day = 1; day <= totalDaysThisMonth; day++) {
    cells.push({ label: day, otherMonth: false, dateString: toDateString(new Date(year, month, day)) });
  }

  // Trailing cells: leading days of next month, just enough to complete the last row
  let nextMonthDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ label: nextMonthDay, otherMonth: true });
    nextMonthDay++;
  }

  cells.forEach((cell) => {
    const cellEl = document.createElement("div");
    cellEl.className = "calendar-cell";
    cellEl.textContent = cell.label;

    if (cell.otherMonth) {
      cellEl.classList.add("other-month");
      grid.appendChild(cellEl);
      return; // other-month cells aren't clickable — they're just for visual continuity
    }

    cellEl.classList.add("current-month");
    if (cell.dateString === todayString) cellEl.classList.add("is-today");
    if (cell.dateString === selectedDate) cellEl.classList.add("is-selected");
    if (trainingLog.some((entry) => entry.date === cell.dateString)) {
      cellEl.classList.add("has-entries");
    }

    cellEl.addEventListener("click", () => {
      selectedDate = cell.dateString;
      renderCalendar();
      renderDayDetail();
    });

    grid.appendChild(cellEl);
  });
}

function renderDayDetail() {
  const container = document.getElementById("day-detail");
  if (!container) return; // this page doesn't show day detail

  const entries = trainingLog.filter((entry) => entry.date === selectedDate);
  const label = new Date(selectedDate).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  if (entries.length === 0) {
    container.innerHTML = `<h3>${label}</h3><p class="rest-day-message">No entries logged.</p>`;
    return;
  }

  const itemsHtml = entries
    .map((entry) => {
      if (entry.type === "cardio") {
        const pace = formatPace(entry.distance, entry.duration);
        const paceText = pace ? ` · ${pace}` : "";
        return `<li><span>${entry.exercise}</span><span class="stat">${entry.distance}km · ${entry.duration}min${paceText}</span></li>`;
      }
      if (entry.type === "dance") {
        return `<li><span>${entry.exercise}</span><span class="stat">${entry.duration} min · ${entry.songs} songs · ${entry.effort} effort</span></li>`;
      }
      const weightText = entry.weight ? `@ ${entry.weight}kg` : "";
      return `<li><span>${entry.exercise}</span><span class="stat">${entry.sets}x${entry.reps} ${weightText}</span></li>`;
    })
    .join("");

  container.innerHTML = `<h3>${label}</h3><ul class="exercise-list">${itemsHtml}</ul>`;
}

if (document.getElementById("prev-month")) {
  document.getElementById("prev-month").addEventListener("click", () => {
    viewedDate.setMonth(viewedDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    viewedDate.setMonth(viewedDate.getMonth() + 1);
    renderCalendar();
  });
}

// ---------- PROGRESS CHART ----------

// Every strength exercise that's ever had an actual weight logged against it (bodyweight
// entries, where weight is null, don't have anything numeric to chart).
function getLoggedStrengthExerciseNames() {
  const names = new Set();
  trainingLog.forEach((entry) => {
    if (entry.type === "strength" && entry.weight != null) names.add(entry.exercise);
  });
  return Array.from(names).sort();
}

// Draws one plain line onto the canvas — no charting library needed for a single series.
// Reads its colors from the CSS custom properties so it automatically matches the rest of
// the app's palette (and picks up the dark/light values if those are ever added later).
function drawProgressChart(exerciseName, metric) {
  const canvas = document.getElementById("progress-canvas");
  const emptyMessage = document.getElementById("progress-empty-message");
  if (!canvas) return;

  const entries = trainingLog
    .filter((e) => e.type === "strength" && e.exercise === exerciseName && e.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length < 2) {
    canvas.hidden = true;
    emptyMessage.hidden = false;
    emptyMessage.textContent = exerciseName
      ? `Log "${exerciseName}" a couple more times to see a trend.`
      : "Log a few strength sets to see progress here.";
    return;
  }
  canvas.hidden = false;
  emptyMessage.hidden = true;

  // Match the canvas's drawing buffer to its displayed size so it stays sharp on retina
  // screens, then work in CSS pixels from here on.
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const values = entries.map((e) => (metric === "volume" ? e.sets * e.reps * e.weight : e.weight));
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1; // avoid dividing by zero if every value is identical
  const padding = 20;

  const pointX = (i) => padding + (i / (entries.length - 1)) * (width - padding * 2);
  const pointY = (v) => height - padding - ((v - minValue) / range) * (height - padding * 2);

  const rootStyle = getComputedStyle(document.documentElement);
  const hairline = rootStyle.getPropertyValue("--color-hairline").trim();
  const mocha = rootStyle.getPropertyValue("--color-mocha").trim();
  const blush = rootStyle.getPropertyValue("--color-blush").trim();

  // Baseline
  ctx.strokeStyle = hairline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  // The trend line
  ctx.strokeStyle = mocha;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pointX(i);
    const y = pointY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // A dot at every point, with the most recent one emphasized in blush — the same accent
  // the rest of the app reserves for "this is the current best/latest" moments.
  values.forEach((v, i) => {
    const isLast = i === values.length - 1;
    ctx.beginPath();
    ctx.arc(pointX(i), pointY(v), isLast ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isLast ? blush : mocha;
    ctx.fill();
  });
}

function renderProgressSection() {
  const select = document.getElementById("progress-exercise-select");
  if (!select) return; // this page doesn't show the progress chart

  const names = getLoggedStrengthExerciseNames();
  const previousValue = select.value;

  if (names.length === 0) {
    select.hidden = true;
    document.getElementById("progress-canvas").hidden = true;
    const emptyMessage = document.getElementById("progress-empty-message");
    emptyMessage.hidden = false;
    emptyMessage.textContent = "Log a few strength sets to see progress here.";
    return;
  }

  select.hidden = false;
  select.innerHTML = names.map((name) => `<option value="${name}">${name}</option>`).join("");
  if (names.includes(previousValue)) select.value = previousValue;

  const metric = document.getElementById("progress-metric-toggle").dataset.value;
  drawProgressChart(select.value, metric);
}

if (document.getElementById("progress-exercise-select")) {
  document.getElementById("progress-exercise-select").addEventListener("change", (event) => {
    const metric = document.getElementById("progress-metric-toggle").dataset.value;
    drawProgressChart(event.target.value, metric);
  });

  setupTypeToggle(document.getElementById("progress-metric-toggle"), () => {
    const select = document.getElementById("progress-exercise-select");
    const metric = document.getElementById("progress-metric-toggle").dataset.value;
    drawProgressChart(select.value, metric);
  });
}

// Below ~3 weeks out, the countdown becomes taper-aware instead of just ticking down the same
// way it does for the other four months of training — every real marathon plan (Hal Higdon,
// Runna, etc.) treats taper as its own distinct phase, not a quiet fade-out at the end. Kept
// as its own pure function (just daysLeft in, a string out) so it's easy to test every tier
// directly without having to fake the system clock.
function buildCountdownText(daysLeft) {
  if (daysLeft <= 0) return "Race day! Go get 'em, Steph 🤎";
  if (daysLeft === 1) return "1 day to go — trust the training, keep it easy from here.";
  if (daysLeft <= 3) return `${daysLeft} days to go — trust the training, keep it easy from here.`;
  if (daysLeft <= 7) return `${daysLeft} days to go — race week. Short and easy, nothing new.`;
  if (daysLeft <= 14) return `${daysLeft} days to go — taper time, ease back the mileage.`;
  if (daysLeft <= 21) return `${daysLeft} days until Raggy's run — taper starts soon.`;
  return `${daysLeft} days until Raggy's run at the Melbourne Marathon`;
}

function renderCountdown() {
  const countdownEl = document.getElementById("countdown-text");
  if (!countdownEl) return;

  const raceDate = new Date("2026-10-11"); // Melbourne Marathon day — adjust if needed
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((raceDate - today) / msPerDay);
  countdownEl.textContent = buildCountdownText(daysLeft);
}

// Same taper-phase idea as buildCountdownText above, but returning structured data (a phase
// name + guidance sentence) instead of a single ticking-down string, so the Run Coach card can
// show a clear heading and separate body text. Kept as its own pure function (daysUntilRace in,
// object out) for the same testability reason.
function getRunCoachPhase(daysUntilRace) {
  if (daysUntilRace < 0) {
    return {
      phase: "Recovery",
      guidance: "Race complete! Light movement only for the next few days.",
    };
  }
  if (daysUntilRace === 0) {
    return {
      phase: "Race day",
      guidance: "Trust your training — this is the easiest run of the block, because the work is already done.",
    };
  }
  if (daysUntilRace <= 1) {
    return {
      phase: "Final stretch",
      guidance: "A light 10–15 minute jog is fine, or full rest. Hydrate, relax, lay out your race kit.",
    };
  }
  if (daysUntilRace <= 7) {
    return {
      phase: "Race week",
      guidance: "Short, easy shakeout runs only. Drop strength training from today. Nothing new — same shoes, same breakfast you've trained with.",
    };
  }
  if (daysUntilRace <= 14) {
    return {
      phase: "Taper begins",
      guidance: "Cut your usual run distance by about 25–30%, but keep the pace similar — shorter, not slower. Strength sessions can stay light.",
    };
  }
  if (daysUntilRace <= 21) {
    return {
      phase: "Peak week",
      guidance: "This is your longest or hardest effort of the whole block — after this, everything eases off.",
    };
  }
  return {
    phase: "Build phase",
    guidance: "Keep the current mix — easy runs, one longer run weekly, strength as normal.",
  };
}

// Renders the Run Coach card on the home page. Only needs to run once on load — the phase
// only changes day to day, so there's no need to keep it live like the countdown/timer.
function renderRunCoach() {
  const phaseEl = document.getElementById("run-coach-phase");
  const guidanceEl = document.getElementById("run-coach-guidance");
  if (!phaseEl || !guidanceEl) return;

  const raceDate = new Date("2026-10-11"); // Melbourne Marathon day — matches renderCountdown
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilRace = Math.ceil((raceDate - today) / msPerDay);

  const { phase, guidance } = getRunCoachPhase(daysUntilRace);
  phaseEl.textContent = phase;
  guidanceEl.textContent = guidance;
}

// Greets Steph by name, varying the wording by the time of day — a nice personal touch that's
// cheap to compute since we already have the current time from `new Date()`.
function renderGreeting() {
  const greetingEl = document.getElementById("greeting-text");
  if (!greetingEl) return; // only the home page has a greeting

  const hour = new Date().getHours();
  let timeOfDay;
  if (hour < 12) {
    timeOfDay = "morning";
  } else if (hour < 18) {
    timeOfDay = "afternoon";
  } else {
    timeOfDay = "evening";
  }

  greetingEl.textContent = `Good ${timeOfDay}, Steph`;
}

// ---------- MANUAL LOG FORM (for anything outside the plan) ----------

function toggleLogFormFields() {
  const type = document.getElementById("log-type").dataset.value;
  document.getElementById("strength-fields").hidden = type !== "strength";
  document.getElementById("cardio-fields").hidden = type !== "cardio";
  document.getElementById("dance-fields").hidden = type !== "dance";
  if (type !== "cardio") document.getElementById("log-pace-preview").hidden = true;
}

// Pace isn't logged separately — see formatPace — so this just previews it live as distance
// and duration are typed, the same way Today's Plan's cardio row does.
function updateLogPacePreview() {
  const distance = Number(document.getElementById("distance").value);
  const duration = Number(document.getElementById("duration").value);
  const pace = formatPace(distance, duration);
  const previewEl = document.getElementById("log-pace-preview");
  previewEl.textContent = pace ? `Pace: ${pace}` : "";
  previewEl.hidden = !pace;
}

if (document.getElementById("log-form")) {
  setupTypeToggle(document.getElementById("log-type"), toggleLogFormFields);
  document.getElementById("distance").addEventListener("input", updateLogPacePreview);
  document.getElementById("duration").addEventListener("input", updateLogPacePreview);

  document.getElementById("log-form").addEventListener("submit", (event) => {
    event.preventDefault(); // stops the page from reloading, which forms do by default

    const exerciseName = document.getElementById("exercise-name").value;
    const type = document.getElementById("log-type").dataset.value;

    let entry = { date: toDateString(new Date()), exercise: exerciseName, type };

    if (type === "cardio") {
      entry.distance = Number(document.getElementById("distance").value) || 0;
      entry.duration = Number(document.getElementById("duration").value) || 0;
    } else if (type === "dance") {
      entry.duration = Number(document.getElementById("dance-duration").value) || 0;
      entry.songs = Number(document.getElementById("songs").value) || 0;
      entry.effort = document.getElementById("effort").value;
    } else {
      entry.sets = Number(document.getElementById("sets").value) || 0;
      entry.reps = Number(document.getElementById("reps").value) || 0;
      entry.weight = document.getElementById("weight").value
        ? Number(document.getElementById("weight").value)
        : null;
    }

    trainingLog.push(entry);
    const pbMetric = checkForNewPB(entry);

    saveLog();
    renderCalendar();
    renderDayDetail();
    renderWeekTrail();
    renderStats();
    event.target.reset();
    // reset() only touches native form controls — the type toggle is a custom div, so reset it by hand.
    setTypeToggleValue(document.getElementById("log-type"), "strength");
    toggleLogFormFields();
    updateLogPacePreview(); // the distance/duration inputs just got cleared by reset()

    const pbMessageEl = document.getElementById("log-pb-message");
    if (pbMetric) {
      pbMessageEl.textContent = PB_MESSAGES[pbMetric];
      pbMessageEl.hidden = false;
    } else {
      pbMessageEl.hidden = true;
    }
  });
}

// ---------- SAVED VIDEOS (Phase 2: TikTok workout videos) ----------

// Same load-from-localStorage-or-start-empty pattern as trainingLog above.
let savedVideos = JSON.parse(localStorage.getItem("savedVideos")) || [];

function saveSavedVideos() {
  localStorage.setItem("savedVideos", JSON.stringify(savedVideos));
}

// Asks TikTok's public oEmbed endpoint for details about a video URL: title, creator, and a
// numeric video ID we can use to build an embed. This endpoint needs no API key or login, and
// (unlike most of TikTok's site) it explicitly allows cross-origin requests — that's what lets
// us call it straight from the browser with no backend server involved.
async function fetchTikTokOEmbed(videoUrl) {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    // TikTok returns an error status for URLs that aren't real, public video links.
    throw new Error("Not a valid TikTok video link");
  }

  return response.json();
}

// TikTok's embed script (embed.js) is what actually turns a <blockquote class="tiktok-embed">
// into a playable video. We only want to load that script once per page, no matter how many
// videos get saved, so we tag it with an id and check for that id before adding another.
function ensureTikTokEmbedScript() {
  if (document.getElementById("tiktok-embed-script")) return;

  const script = document.createElement("script");
  script.id = "tiktok-embed-script";
  script.src = "https://www.tiktok.com/embed.js";
  script.async = true;
  document.body.appendChild(script);
}

// embed.js only scans the page for blockquotes to convert ONE TIME, right when it finishes
// loading. If we add more saved-video blockquotes after that (e.g. the user saves a second
// video), it won't notice them on its own — we have to explicitly ask it to look again, which
// is what its reload() function is for. We guard with `typeof` checks because reload() only
// exists once embed.js has actually finished loading.
function refreshTikTokEmbeds() {
  if (window.tiktokEmbed && typeof window.tiktokEmbed.reload === "function") {
    window.tiktokEmbed.reload();
  }
}

function renderSavedVideos() {
  const container = document.getElementById("video-list");
  if (!container) return; // this page doesn't show saved videos

  container.innerHTML = "";

  if (savedVideos.length === 0) {
    container.innerHTML = `<p class="rest-day-message">No videos saved yet.</p>`;
    return;
  }

  savedVideos.forEach((video) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.innerHTML = `
      <div class="video-card-header">
        <span class="video-card-title">${video.title}</span>
        <button type="button" class="btn-small delete-video-btn">Remove</button>
      </div>
      <span class="video-card-meta">by ${video.authorName}</span>
      <blockquote class="tiktok-embed" cite="${video.url}" data-video-id="${video.videoId}" style="max-width: 605px; min-width: 325px;">
        <section></section>
      </blockquote>
    `;

    card.querySelector(".delete-video-btn").addEventListener("click", () => {
      savedVideos = savedVideos.filter((v) => v.id !== video.id);
      saveSavedVideos();
      renderSavedVideos();
    });

    container.appendChild(card);
  });

  // The blockquotes above are just placeholders until TikTok's script processes them.
  ensureTikTokEmbedScript();
  refreshTikTokEmbeds();
}

if (document.getElementById("add-video-form")) {
  // If the page was opened as videos.html?url=..., pre-fill the input with that link. This is
  // meant for a phone's share sheet (or a bookmarklet) handing off a TikTok link directly,
  // rather than the user having to copy/paste it in by hand.
  const sharedUrl = new URLSearchParams(window.location.search).get("url");
  if (sharedUrl) {
    document.getElementById("video-url").value = sharedUrl;
  }

  document.getElementById("add-video-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const urlInput = document.getElementById("video-url");
    const errorEl = document.getElementById("video-error");
    const submitBtn = document.getElementById("add-video-btn");

    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      const data = await fetchTikTokOEmbed(urlInput.value.trim());

      // We deliberately store only the small pieces of data we need to render our own card
      // and rebuild the embed later — not the raw HTML TikTok returns. That HTML embeds a
      // thumbnail URL that expires after a while, so storing it would mean saved videos start
      // showing broken images over time. Rebuilding the blockquote fresh from videoId every
      // time avoids that problem entirely.
      savedVideos.push({
        id: generateId(),
        videoId: data.embed_product_id,
        url: urlInput.value.trim(),
        title: data.title,
        authorName: data.author_name,
        savedAt: toDateString(new Date())
      });

      saveSavedVideos();
      renderSavedVideos();
      event.target.reset();
    } catch (error) {
      errorEl.textContent = "Couldn't save that video — check the link and try again.";
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save video";
    }
  });
}

// ---------- SCREENSHOT IMPORT (Phase 3.5) ----------

// Same reasoning as SUGGEST_API_URL above — this calls a Vercel function that holds the
// Anthropic API key, since the browser can never be trusted with it. See
// api/import-screenshot.js for the vision call itself.
const IMPORT_API_URL = "https://gym-training-tracker-gamma.vercel.app/api/import-screenshot";

let lastImportPreviewUrl = null; // tracks the object URL so it can be revoked, avoiding a leak

// Vercel's Node functions reject request bodies over ~4.5MB, and a raw phone screenshot can
// easily exceed that. Shrinking it in the browser first — to a width/height a screen is
// perfectly readable at anyway — keeps every upload comfortably under that limit and makes the
// API call itself faster and cheaper.
function resizeImageForUpload(file, maxDimension = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image."));
    };
    img.src = objectUrl;
  });
}

async function fetchImportedExercises(imageDataUrl) {
  const response = await fetch(IMPORT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data.exercises;
}

// One editable row per extracted exercise — deliberately editable rather than read-only, since
// reading a screenshot can misfire on a blurry number or an unusual exercise name, and this is
// going straight into the real log rather than just a template draft.
function addImportRow(prefill) {
  const rowsContainer = document.getElementById("import-exercise-rows");

  const row = document.createElement("div");
  row.className = "exercise-row-group";
  row.innerHTML = `
    <div class="exercise-row">
      <input type="text" class="row-name" placeholder="Exercise" value="${prefill ? prefill.name : ""}" required>
      <button type="button" class="remove-row-btn" aria-label="Remove exercise">&times;</button>
    </div>
    <div class="exercise-row-fields strength-fields">
      <input type="number" class="row-sets" placeholder="Sets" min="1" value="${prefill ? prefill.sets : ""}">
      <input type="number" class="row-reps" placeholder="Reps" min="1" value="${prefill ? prefill.reps : ""}">
      <input type="number" class="row-weight" placeholder="Weight (kg)" min="0" step="0.5" value="${prefill && prefill.weight != null ? prefill.weight : ""}">
    </div>
  `;

  row.querySelector(".remove-row-btn").addEventListener("click", () => row.remove());

  rowsContainer.appendChild(row);
}

function renderImportResults(exercises) {
  document.getElementById("import-exercise-rows").innerHTML = "";
  exercises.forEach((exercise) => addImportRow(exercise));
  document.getElementById("import-result-section").hidden = false;
}

if (document.getElementById("import-form")) {
  document.getElementById("import-date").value = toDateString(new Date());

  document.getElementById("screenshot-input").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const previewEl = document.getElementById("screenshot-preview");
    if (!file) {
      previewEl.hidden = true;
      return;
    }

    if (lastImportPreviewUrl) URL.revokeObjectURL(lastImportPreviewUrl);
    lastImportPreviewUrl = URL.createObjectURL(file);
    previewEl.src = lastImportPreviewUrl;
    previewEl.hidden = false;
  });

  document.getElementById("import-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const fileInput = document.getElementById("screenshot-input");
    const errorEl = document.getElementById("import-error");
    const submitBtn = document.getElementById("import-btn");

    errorEl.hidden = true;
    document.getElementById("import-result-section").hidden = true;

    const file = fileInput.files[0];
    if (!file) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Reading screenshot...";

    try {
      const imageDataUrl = await resizeImageForUpload(file);
      const exercises = await fetchImportedExercises(imageDataUrl);

      if (exercises.length === 0) {
        throw new Error("Couldn't find any exercises in that screenshot. Try a clearer photo.");
      }

      renderImportResults(exercises);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Extract exercises";
    }
  });

  document.getElementById("add-import-row").addEventListener("click", () => addImportRow(null));

  document.getElementById("save-import-btn").addEventListener("click", () => {
    const date = document.getElementById("import-date").value;

    Array.from(document.querySelectorAll("#import-exercise-rows .exercise-row-group")).forEach((row) => {
      trainingLog.push({
        date,
        exercise: row.querySelector(".row-name").value,
        type: "strength",
        sets: Number(row.querySelector(".row-sets").value) || 0,
        reps: Number(row.querySelector(".row-reps").value) || 0,
        weight: row.querySelector(".row-weight").value
          ? Number(row.querySelector(".row-weight").value)
          : null
      });
    });

    saveLog();

    // Jump to History so Steph can see the imported entries land on the right day.
    window.location.href = "history.html";
  });

  document.getElementById("discard-import-btn").addEventListener("click", () => {
    document.getElementById("import-result-section").hidden = true;
    document.getElementById("import-form").reset();
    document.getElementById("screenshot-preview").hidden = true;
    document.getElementById("import-date").value = toDateString(new Date());
  });
}

// ---------- BOTTOM NAV ----------

// A small dot on the Timer link so a rest timer counting down on another page isn't
// forgotten. Reads from localStorage (not the in-memory timerRunning flag) since it has
// to work correctly on every page, most of which never touch the timer's own state.
function updateTimerNavDot() {
  const timerIconWrap = document.querySelector('a[href="timer.html"] .tab-icon-wrap');
  if (!timerIconWrap) return;

  const saved = loadTimerState();
  const isRunning = Boolean(saved && saved.active && saved.running && saved.endTime - Date.now() > 0);
  const existingDot = timerIconWrap.querySelector(".tab-dot");

  if (isRunning && !existingDot) {
    timerIconWrap.insertAdjacentHTML("beforeend", '<span class="tab-dot"></span>');
  } else if (!isRunning && existingDot) {
    existingDot.remove();
  }
}

// ---------- INITIAL RENDER ----------

renderCountdown();
renderRunCoach();
renderGreeting();
initTimerPicker();
renderTemplateList();
renderAssignGrid();
renderWeekTrail();
renderStats();
renderTodayPlan();
renderCalendar();
renderDayDetail();
renderProgressSection();
renderSavedVideos();
updateTimerNavDot();
