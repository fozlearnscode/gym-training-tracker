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
    { id: generateId(), name: "Run day", exercises: [{ name: "5km run", sets: 1, reps: 1 }] },
    {
      id: generateId(),
      name: "Leg day",
      exercises: [
        { name: "Squats", sets: 3, reps: 10 },
        { name: "Lunges", sets: 3, reps: 12 }
      ]
    },
    {
      id: generateId(),
      name: "Core & mobility",
      exercises: [
        { name: "Plank", sets: 3, reps: 1 },
        { name: "Mountain climbers", sets: 3, reps: 20 }
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

  const datesWithEntries = [...new Set(recentEntries.map((entry) => entry.date))];
  const sessionsCompleted = datesWithEntries.filter((dateString) => {
    const dayName = dayNames[new Date(dateString).getDay()];
    const plan = findPlanForDay(dayName);
    return plan && isDayFullyLogged(dateString, plan);
  }).length;

  return { totalSets, sessionsCompleted };
}

function renderStats() {
  const container = document.getElementById("stats-grid");
  const streak = calculateStreak();
  const { totalSets, sessionsCompleted } = calculateLast30DayStats();

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
  `;
}

// ---------- REST TIMER ----------

let timerDuration = 90;    // seconds selected, used when (re)starting
let timerRemaining = 90;   // seconds left to show, kept in sync while paused
let timerEndTime = null;   // the actual clock time the timer should finish — the key idea
let timerInterval = null;
let timerRunning = false;

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateTimerDisplay(seconds) {
  document.getElementById("timer-display").textContent = formatTime(seconds);
}

function selectPreset(seconds) {
  if (timerRunning) return; // don't let a preset change interrupt a running timer

  timerDuration = seconds;
  timerRemaining = seconds;
  updateTimerDisplay(seconds);

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("is-selected", Number(btn.dataset.seconds) === seconds);
  });
}

function tick() {
  // The core idea: don't subtract, just check how far away the target end time still is.
  const secondsLeft = Math.round((timerEndTime - Date.now()) / 1000);

  if (secondsLeft <= 0) {
    stopTimer();
    updateTimerDisplay(0);
    notifyTimerDone();
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
  updateTimerTabIndicator();
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
  updateTimerTabIndicator();
}

function resetTimer() {
  stopTimer();
  timerRemaining = timerDuration;
  updateTimerDisplay(timerDuration);
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

document.getElementById("timer-start").addEventListener("click", startTimer);
document.getElementById("timer-pause").addEventListener("click", pauseTimer);
document.getElementById("timer-reset").addEventListener("click", resetTimer);

// ---------- TEMPLATE MANAGEMENT ----------

let editingTemplateId = null; // null means we're creating a new template, not editing one

function renderTemplateList() {
  const container = document.getElementById("template-list");
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

  const row = document.createElement("div");
  row.className = "exercise-row";
  row.innerHTML = `
    <input type="text" class="row-name" placeholder="Exercise" value="${prefill ? prefill.name : ""}" required>
    <input type="number" class="row-sets" placeholder="Sets" min="1" value="${prefill ? prefill.sets : ""}" required>
    <input type="number" class="row-reps" placeholder="Reps" min="1" value="${prefill ? prefill.reps : ""}" required>
    <button type="button" class="remove-row-btn" aria-label="Remove exercise">&times;</button>
  `;

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

document.getElementById("new-template-btn").addEventListener("click", () => openTemplateForm(null));
document.getElementById("cancel-template").addEventListener("click", closeTemplateForm);
document.getElementById("add-exercise-row").addEventListener("click", () => addExerciseRow(null));

document.getElementById("template-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.getElementById("template-name").value;

  const exercises = Array.from(document.querySelectorAll(".exercise-row")).map((row) => ({
    name: row.querySelector(".row-name").value,
    sets: Number(row.querySelector(".row-sets").value),
    reps: Number(row.querySelector(".row-reps").value)
  }));

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

// ---------- WEEKLY ASSIGNMENT GRID ----------

function renderAssignGrid() {
  const container = document.getElementById("assign-grid");
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

    const item = document.createElement("li");
    item.className = "exercise-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "exercise-checkbox";
    checkbox.checked = Boolean(existingEntry);

    const info = document.createElement("div");
    info.className = "exercise-info";
    info.innerHTML = `
      <span class="exercise-name">${exercise.name}</span>
      <span class="exercise-meta">${exercise.sets} x ${exercise.reps}</span>
    `;

    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.className = "weight-input-small";
    weightInput.placeholder = "kg";
    weightInput.min = "0";
    weightInput.step = "0.5";
    weightInput.value = existingEntry ? existingEntry.weight ?? "" : "";

    // --- Event listener #1: checking the box logs (or unlogs) this exercise ---
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        trainingLog.push({
          date: todayString,
          exercise: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          weight: weightInput.value ? Number(weightInput.value) : null
        });
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

    // --- Event listener #2: editing weight updates today's entry, if it exists ---
    weightInput.addEventListener("change", () => {
      const entry = trainingLog.find(
        (e) => e.date === todayString && e.exercise === exercise.name
      );
      if (entry) {
        entry.weight = weightInput.value ? Number(weightInput.value) : null;
        saveLog();
        renderCalendar();
        renderDayDetail();
      }
    });

    item.appendChild(checkbox);
    item.appendChild(info);
    item.appendChild(weightInput);
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
      const weightText = entry.weight ? `@ ${entry.weight}kg` : "";
      return `<li><span>${entry.exercise}</span><span class="stat">${entry.sets}x${entry.reps} ${weightText}</span></li>`;
    })
    .join("");

  container.innerHTML = `<h3>${label}</h3><ul class="exercise-list">${itemsHtml}</ul>`;
}

document.getElementById("prev-month").addEventListener("click", () => {
  viewedDate.setMonth(viewedDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  viewedDate.setMonth(viewedDate.getMonth() + 1);
  renderCalendar();
});

function renderCountdown() {
  const raceDate = new Date("2026-10-11"); // Melbourne Marathon day — adjust if needed
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((raceDate - today) / msPerDay);
  document.getElementById("countdown-text").textContent = `${daysLeft} days to race day`;
}

// ---------- MANUAL LOG FORM (for anything outside the plan) ----------

document.getElementById("log-form").addEventListener("submit", (event) => {
  event.preventDefault(); // stops the page from reloading, which forms do by default

  const exerciseName = document.getElementById("exercise-name").value;
  const sets = Number(document.getElementById("sets").value);
  const reps = Number(document.getElementById("reps").value);
  const weight = document.getElementById("weight").value
    ? Number(document.getElementById("weight").value)
    : null;

  trainingLog.push({
    date: toDateString(new Date()),
    exercise: exerciseName,
    sets,
    reps,
    weight
  });

  saveLog();
  renderCalendar();
  renderDayDetail();
  renderWeekTrail();
  renderStats();
  event.target.reset();
});

// ---------- TABS ----------

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

function activateTab(tabName) {
  const matchingButton = Array.from(tabButtons).find((btn) => btn.dataset.tab === tabName);
  if (!matchingButton) return; // ignore unknown/stale tab names, e.g. from an old localStorage value

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive);
  });

  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  });

  localStorage.setItem("activeTab", tabName);
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// A small dot on the Timer tab so a rest timer counting down in the background isn't forgotten
// just because the user switched to another tab.
function updateTimerTabIndicator() {
  const timerIconWrap = document.querySelector('.tab-btn[data-tab="timer"] .tab-icon-wrap');
  const existingDot = timerIconWrap.querySelector(".tab-dot");

  if (timerRunning && !existingDot) {
    timerIconWrap.insertAdjacentHTML("beforeend", '<span class="tab-dot"></span>');
  } else if (!timerRunning && existingDot) {
    existingDot.remove();
  }
}

// ---------- INITIAL RENDER ----------

renderCountdown();
selectPreset(timerDuration);
renderTemplateList();
renderAssignGrid();
renderWeekTrail();
renderStats();
renderTodayPlan();
renderCalendar();
activateTab(localStorage.getItem("activeTab") || "log");
renderDayDetail();
