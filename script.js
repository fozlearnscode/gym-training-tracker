// ---------- DATA ----------

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const orderedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
    }
  ];
}

// Templates: the reusable definitions ("what's in Leg day").
let templates = JSON.parse(localStorage.getItem("templates")) || seedTemplates();

function saveTemplates() {
  localStorage.setItem("templates", JSON.stringify(templates));
}

// Assignments: a lookup table from day name -> template id ("Wednesday uses Leg day").
// This is seeded to match the templates above, but only on first run.
let weeklyAssignments = JSON.parse(localStorage.getItem("weeklyAssignments")) || {
  Monday: templates[0].id,
  Wednesday: templates[1].id,
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

function renderStats() {
  const container = document.getElementById("stats-grid");
  if (!container) return; // this page doesn't show stats

  const streak = calculateStreak();
  const { totalSets, totalDistance, sessionsCompleted } = calculateLast30DayStats();

  container.innerHTML = `
    <div class="stat-block">
      <span class="stat-number">${streak}</span>
      <span class="stat-label">day streak</span>
    </div>
    <div class="stat-block">
      <span class="stat-number">${sessionsCompleted}</span>
      <span class="stat-label">sessions (30d)</span>
    </div>
    <div class="stat-block">
      <span class="stat-number">${totalSets}</span>
      <span class="stat-label">sets logged (30d)</span>
    </div>
    <div class="stat-block">
      <span class="stat-number">${totalDistance}</span>
      <span class="stat-label">km run (30d)</span>
    </div>
  `;
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
  document.getElementById("timer-display").hidden = true;
  document.getElementById("timer-start").hidden = false;
  document.getElementById("timer-pause").hidden = true;
  document.getElementById("timer-reset").hidden = true;
}

function showCountdown() {
  document.getElementById("timer-picker").hidden = true;
  document.getElementById("timer-presets").hidden = true;
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

const STRENGTH_ICON_SVG = '<rect x="1.5" y="8" width="3" height="8" rx="1.3" fill="currentColor"/><rect x="19.5" y="8" width="3" height="8" rx="1.3" fill="currentColor"/><rect x="5.5" y="9.5" width="2.5" height="5" rx="1" fill="currentColor"/><rect x="16" y="9.5" width="2.5" height="5" rx="1" fill="currentColor"/><rect x="7.5" y="10.8" width="9" height="2.4" rx="1.2" fill="currentColor"/>';
const CARDIO_ICON_SVG = '<path class="rt-limb" d="M15 6.2L11.3 12.6"/><path class="rt-limb" d="M11.3 12.6L15.2 10.8L17.3 15.8"/><path class="rt-limb" d="M11.3 12.6L7.2 13.6L4.7 18.3"/><path class="rt-limb" d="M13.4 7.6L17.6 6.3L20.2 8.8"/><path class="rt-limb" d="M13.4 7.6L9.3 9.1L6.8 7"/><circle class="rt-head" cx="16.3" cy="4" r="2"/><path class="rt-head" d="M15.3 2.8C13.5 0.5 10.8 -1 9.2 0.3C10.8 1.8 12.8 2.6 14.2 3.6Z"/>';

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

  const row = document.createElement("div");
  row.className = "exercise-row-group";
  row.innerHTML = `
    <div class="exercise-row">
      <input type="text" class="row-name" placeholder="Exercise" value="${prefill ? prefill.name : ""}" required>
      <div class="type-toggle row-type" data-value="${isCardio ? "cardio" : "strength"}">
        <button type="button" class="type-toggle-btn ${!isCardio ? "is-active" : ""}" data-type="strength" aria-pressed="${!isCardio}" aria-label="Strength">
          <svg class="type-icon" viewBox="0 0 24 24">${STRENGTH_ICON_SVG}</svg>
        </button>
        <button type="button" class="type-toggle-btn ${isCardio ? "is-active" : ""}" data-type="cardio" aria-pressed="${isCardio}" aria-label="Cardio">
          <svg class="type-icon" viewBox="0 0 24 24">${CARDIO_ICON_SVG}</svg>
        </button>
      </div>
      <button type="button" class="remove-row-btn" aria-label="Remove exercise">&times;</button>
    </div>
    <div class="exercise-row-fields strength-fields" ${isCardio ? "hidden" : ""}>
      <input type="number" class="row-sets" placeholder="Sets" min="1" value="${!isCardio && prefill ? prefill.sets : ""}">
      <input type="number" class="row-reps" placeholder="Reps" min="1" value="${!isCardio && prefill ? prefill.reps : ""}">
    </div>
    <div class="exercise-row-fields cardio-fields" ${isCardio ? "" : "hidden"}>
      <input type="number" class="row-distance" placeholder="Distance (km)" min="0" step="0.1" value="${isCardio ? prefill.distance : ""}">
      <input type="number" class="row-duration" placeholder="Duration (min)" min="0" value="${isCardio ? prefill.duration : ""}">
    </div>
  `;

  const typeToggle = row.querySelector(".row-type");
  const strengthFields = row.querySelector(".strength-fields");
  const cardioFields = row.querySelector(".cardio-fields");

  setupTypeToggle(typeToggle, () => {
    const showCardio = typeToggle.dataset.value === "cardio";
    strengthFields.hidden = showCardio;
    cardioFields.hidden = !showCardio;
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

      if (type === "cardio") {
        return {
          name,
          type,
          distance: Number(row.querySelector(".row-distance").value) || 0,
          duration: Number(row.querySelector(".row-duration").value) || 0
        };
      }

      return {
        name,
        type,
        sets: Number(row.querySelector(".row-sets").value) || 0,
        reps: Number(row.querySelector(".row-reps").value) || 0
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

function renderWeekTrail() {
  const trail = document.getElementById("week-trail");
  if (!trail) return; // this page doesn't show the week trail

  trail.innerHTML = ""; // clear out anything from a previous render

  const weekDates = getWeekDates();
  const todayString = toDateString(new Date());

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

    const header = document.createElement("div");
    header.className = "day-card-header";
    header.textContent = dayName.slice(0, 2);

    const body = document.createElement("div");
    body.className = "day-card-body";
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

    trail.appendChild(card);
  });
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

  plan.exercises.forEach((exercise) => {
    const existingEntry = trainingLog.find(
      (entry) => entry.date === todayString && entry.exercise === exercise.name
    );
    const isCardio = exercise.type === "cardio";

    const item = document.createElement("li");
    item.className = "exercise-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "exercise-checkbox";
    checkbox.checked = Boolean(existingEntry);

    const info = document.createElement("div");
    info.className = "exercise-info";
    const metaText = isCardio ? `${exercise.distance}km target` : `${exercise.sets} x ${exercise.reps}`;
    info.innerHTML = `
      <span class="exercise-name">${exercise.name}</span>
      <span class="exercise-meta">${metaText}</span>
    `;

    const inputsWrapper = document.createElement("div");
    inputsWrapper.className = "exercise-inputs";

    // Build the right pair (or single) input for this exercise's type.
    let firstInput, secondInput;
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

      inputsWrapper.appendChild(firstInput);
      inputsWrapper.appendChild(secondInput);
    } else {
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
      return {
        date: todayString,
        exercise: exercise.name,
        type: "strength",
        sets: exercise.sets,
        reps: exercise.reps,
        weight: firstInput.value ? Number(firstInput.value) : null
      };
    }

    // --- Event listener #1: checking the box logs (or unlogs) this exercise ---
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        trainingLog.push(buildLogEntry());
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
      } else {
        entry.weight = firstInput.value ? Number(firstInput.value) : null;
      }
      saveLog();
      renderCalendar();
      renderDayDetail();
    }

    firstInput.addEventListener("change", handleInputChange);
    if (secondInput) secondInput.addEventListener("change", handleInputChange);

    item.appendChild(checkbox);
    item.appendChild(info);
    item.appendChild(inputsWrapper);
    list.appendChild(item);
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
        return `<li><span>${entry.exercise}</span><span class="stat">${entry.distance}km · ${entry.duration}min</span></li>`;
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

function renderCountdown() {
  const countdownEl = document.getElementById("countdown-text");
  if (!countdownEl) return;

  const raceDate = new Date("2026-10-11"); // Melbourne Marathon day — adjust if needed
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((raceDate - today) / msPerDay);
  countdownEl.textContent = `${daysLeft} days to race day`;
}

// ---------- MANUAL LOG FORM (for anything outside the plan) ----------

function toggleLogFormFields() {
  const showCardio = document.getElementById("log-type").dataset.value === "cardio";
  document.getElementById("strength-fields").hidden = showCardio;
  document.getElementById("cardio-fields").hidden = !showCardio;
}

if (document.getElementById("log-form")) {
  setupTypeToggle(document.getElementById("log-type"), toggleLogFormFields);

  document.getElementById("log-form").addEventListener("submit", (event) => {
    event.preventDefault(); // stops the page from reloading, which forms do by default

    const exerciseName = document.getElementById("exercise-name").value;
    const type = document.getElementById("log-type").dataset.value;

    let entry = { date: toDateString(new Date()), exercise: exerciseName, type };

    if (type === "cardio") {
      entry.distance = Number(document.getElementById("distance").value) || 0;
      entry.duration = Number(document.getElementById("duration").value) || 0;
    } else {
      entry.sets = Number(document.getElementById("sets").value) || 0;
      entry.reps = Number(document.getElementById("reps").value) || 0;
      entry.weight = document.getElementById("weight").value
        ? Number(document.getElementById("weight").value)
        : null;
    }

    trainingLog.push(entry);

    saveLog();
    renderCalendar();
    renderDayDetail();
    renderWeekTrail();
    renderStats();
    event.target.reset();
    // reset() only touches native form controls — the type toggle is a custom div, so reset it by hand.
    setTypeToggleValue(document.getElementById("log-type"), "strength");
    toggleLogFormFields();
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
initTimerPicker();
renderTemplateList();
renderAssignGrid();
renderWeekTrail();
renderStats();
renderTodayPlan();
renderCalendar();
renderDayDetail();
updateTimerNavDot();
