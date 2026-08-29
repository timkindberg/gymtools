// =============================================================================
// app.js — bootstrap, navigation, and all views.
// =============================================================================
import {
  PROGRAM, PRINCIPLES, DISCLAIMER, SYMPTOMS, WATCH_METRICS, MOBILITY_ROUTINE, FLAG_LABELS,
  dayForDate, dayById, alternativeNames, findExercise,
} from "./program.js";
import { getMovement, movementName, loadLabel } from "./movements.js";
import {
  measureInfo, prescriptionFor, formatSet, setAmount,
  isLogged, validateSet,
} from "./measures.js";
import { applyInferredRoles, roleLabel, roleOf, nextRole, lastWorkingIndex, topWorkingLoad } from "./sets.js";
import {
  RIR_CHOICES, RIR_LABELS, RIR_HINTS, setRir, hasEffort, recordEffort,
  effortLabel, effortGlyph, targetRir,
  HARDER_SIDES, SIDE_LABELS, harderSide, harderSideLabel, recordHarderSide,
} from "./effort.js";
import { progressionTerms } from "./engine.js";
import { stackText, plateStack, stackDelta } from "./plates.js";
import * as store from "./store.js";
import * as sync from "./sync.js";
import { APP_VERSION, BUILD_DATE } from "./version.js";
import {
  el, clear, fmtDate, fmtDateTime, relDay, lineChart, severityBar,
  route, startRouter, navigate, toast, confirmDialog, promptDialog, currentRoute, keepScroll,
} from "./ui.js";

const app = document.getElementById("app");
const units = () => store.getProfile().units;

// --- Session scroll memory (survives swaps, re-renders, and app relaunch) ---
let prevRoutePath = null; // the route rendered before the current one
let sessionScroll = Number(localStorage.getItem("gymtools.sessionScroll") || 0) || 0;
let ignoreScrollSave = false;
let scrollTick = false;
window.addEventListener("scroll", () => {
  if (ignoreScrollSave || scrollTick) return;
  if (currentRoute().path !== "session") return;
  scrollTick = true;
  requestAnimationFrame(() => {
    sessionScroll = window.scrollY;
    try { localStorage.setItem("gymtools.sessionScroll", String(sessionScroll)); } catch (e) { /* ignore */ }
    scrollTick = false;
  });
}, { passive: true });
function restoreSessionScroll() {
  ignoreScrollSave = true;
  window.scrollTo(0, sessionScroll);
  requestAnimationFrame(() => requestAnimationFrame(() => { ignoreScrollSave = false; }));
}
function resetSessionScroll() {
  sessionScroll = 0;
  try { localStorage.removeItem("gymtools.sessionScroll"); } catch (e) { /* ignore */ }
}

// --- Last-screen memory ------------------------------------------------------
// Closing the app (or iOS quietly reloading the PWA) shouldn't cost you your
// place. Every navigation records the route; a cold start with no hash of its
// own reopens it. Old routes go stale so that coming back days later still
// starts you on Today, and screens that are one-shot flows aren't restored.
const LAST_ROUTE_KEY = "gymtools.lastRoute";
const LAST_ROUTE_MAX_AGE = 12 * 3600 * 1000; // 12h
const RESTORABLE = new Set(["today", "session", "program", "history", "mobility"]);

function rememberRoute(path, param) {
  try {
    // Left off somewhere we don't reopen (settings, the coach report)? Forget
    // the older screen too, so the next launch starts clean on Today.
    if (!RESTORABLE.has(path)) localStorage.removeItem(LAST_ROUTE_KEY);
    else localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ path, param: param || "", at: Date.now() }));
  } catch (e) { /* private mode / quota — the memory is a nicety, not a feature */ }
}

// The route a cold start should open, or null to take the default (today).
function lastRoute() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) || "null"); } catch (e) { return null; }
  if (!saved || !RESTORABLE.has(saved.path)) return null;
  // A workout in progress is worth coming back to however long you were gone;
  // everything else expires.
  const inProgress = saved.path === "session" && !!store.loadDraft();
  if (!inProgress && (!saved.at || Date.now() - saved.at > LAST_ROUTE_MAX_AGE)) return null;
  if (saved.path === "session" && !inProgress) return null; // draft is gone
  return saved.path + (saved.param ? "/" + saved.param : "");
}

// --- Cloud sync orchestration (all additive; no-op unless signed in) ---------
let cloudUser = null;                 // signed-in Supabase user, or null
let cloudStatus = "local";            // local | syncing | synced | error
let cloudView = { email: "", password: "" };
let pushTimer = null;

const refreshCurrent = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
const refreshIfSettings = () => { if (currentRoute().path === "settings") refreshCurrent(); };

async function initCloud() {
  if (!sync.configured() || !sync.hasStoredSession()) return;
  try {
    cloudUser = await sync.currentUser();
    if (cloudUser) await mergeWithCloud();
  } catch (e) { console.warn("cloud init failed", e); }
}

async function mergeWithCloud() {
  if (!cloudUser) return;
  cloudStatus = "syncing"; refreshIfSettings();
  try {
    const remote = await sync.pull(cloudUser.id);
    const localTs = store.getUpdatedAt();
    if (remote && (!localTs || remote.updated_at > localTs)) {
      store.applyRemote(remote.data);   // remote is newer — take it
      cloudStatus = "synced"; refreshCurrent();
    } else {
      await sync.push(cloudUser.id, store.load(), store.getUpdatedAt()); // local newer/empty remote
      cloudStatus = "synced";
    }
  } catch (e) { console.warn("merge failed", e); cloudStatus = "error"; }
  refreshIfSettings();
}

function schedulePush() {
  if (!cloudUser) return;
  cloudStatus = "syncing";
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await sync.push(cloudUser.id, store.load(), store.getUpdatedAt());
      cloudStatus = "synced";
    } catch (e) { console.warn("push failed", e); cloudStatus = "error"; }
    refreshIfSettings();
  }, 1500);
}

// ---------------------------------------------------------------------------
// TODAY
// ---------------------------------------------------------------------------
// Which workout the Today card is showing. The calendar picks the default,
// but you're the one who knows what you feel like training — tap another day
// and it sticks until the app reloads.
let pickedDayId = null;

route("today", () => {
  const today = new Date();
  const sessions = store.getSessions();
  const draft = store.loadDraft();
  const scheduled = dayForDate(today, sessions);
  // A workout in progress wins the default slot so the big button resumes it.
  const day = (pickedDayId && dayById(pickedDayId))
    || (draft && dayById(draft.dayId))
    || scheduled;
  const lastSession = sessions[0];

  const view = el("div.view");

  view.appendChild(el("header.hero", {}, [
    el("p.hero-eyebrow", { text: fmtDate(today.toISOString(), { weekday: "long", month: "long", day: "numeric" }) }),
    el("h1.hero-title", { text: `Hey ${store.getProfile().name || "there"} 👋` }),
    el("p.hero-sub", { text: sessions.length ? `${sessions.length} session${sessions.length > 1 ? "s" : ""} logged — keep it rolling.` : "Let's get your first session in the books." }),
  ]));

  // Resume banner
  if (draft) {
    view.appendChild(el("div.card.resume", {}, [
      el("div", {}, [
        el("strong", { text: "Workout in progress" }),
        el("p.muted", { text: `${draft.dayName} — started ${relDay(draft.startedAt)}` }),
      ]),
      el("button.btn.primary", { text: "Resume", onclick: () => navigate("session") }),
    ]));
  }

  // Today's plan card
  const planCard = el("div.card.today-card");
  const badge = day.optional ? `Day ${day.id} · bonus` : `Day ${day.id}`;
  planCard.appendChild(el("div.today-badge", { text: day.id === scheduled.id ? `${badge} · today` : badge }));
  planCard.appendChild(el("h2", { text: day.name.replace(/^Day [A-C] — /, "") }));
  planCard.appendChild(el("p.muted", { text: day.focus }));
  if (day.optional && day.note) planCard.appendChild(el("p.optional-note", { text: "🎈 " + day.note }));

  // Pick any day — the schedule is a suggestion, not a lock.
  planCard.appendChild(dayPicker(day, scheduled));
  const preview = el("ul.today-list");
  day.exercises.slice(0, 6).forEach((e) =>
    preview.appendChild(el("li", {}, [
      el("span", { text: e.name }),
      el("span.muted.small", { text: `${e.sets}×${e.reps}` }),
    ])));
  if (day.exercises.length > 6) preview.appendChild(el("li.muted", { text: `+ ${day.exercises.length - 6} more…` }));
  planCard.appendChild(preview);
  const resuming = !!draft && draft.dayId === day.id;
  planCard.appendChild(el("div.today-actions", {}, [
    el("button.btn.primary.big", { text: resuming ? "Resume workout" : "Start workout", onclick: () => startOrResume(day) }),
    el("button.btn.ghost", { text: "View full plan", onclick: () => navigate("program/" + day.id) }),
  ]));
  view.appendChild(planCard);

  // Loosen-up shortcut — the leg-length front line, usable any day
  view.appendChild(el("button.btn.ghost.full.loosen", {
    html: "🧘 Loosen up &nbsp;·&nbsp; <span class='muted'>5-min mobility for the right side</span>",
    onclick: () => navigate("mobility"),
  }));

  // Last session recap
  if (lastSession) {
    view.appendChild(sectionTitle("Last session"));
    view.appendChild(sessionSummaryCard(lastSession));
  }

  // Quick stats
  view.appendChild(quickStats(sessions));

  render(view);
});

// The day-chip strip: every workout in the program, the scheduled one marked.
function dayPicker(current, scheduled) {
  const wrap = el("div.day-picker", { role: "group", "aria-label": "Choose a workout" });
  PROGRAM.days.forEach((d) => {
    const active = d.id === current.id;
    wrap.appendChild(el("button", {
      class: "day-chip" + (active ? " active" : ""),
      "aria-pressed": active ? "true" : "false",
      title: d.name,
      onclick: () => { pickedDayId = d.id; refreshCurrent(); },
    }, [
      el("span.day-chip-id", { text: "Day " + d.id }),
      el("span.day-chip-name", { text: d.name.replace(/^Day [A-C] — /, "") }),
      d.id === scheduled.id ? el("span.day-chip-dot", { title: "Today's scheduled day", text: "•" }) : null,
    ]));
  });
  return wrap;
}

async function startOrResume(day) {
  const draft = store.loadDraft();
  // A draft for a different day is real work — never blow it away silently.
  if (draft && draft.dayId !== day.id) {
    const ok = await confirmDialog(
      `${draft.dayName} is still in progress. Discard it and start ${day.name}?`,
      { okText: "Discard & start", cancelText: "Keep it", danger: true });
    if (!ok) { navigate("session"); return; }
    store.clearDraft();
    return startOrResume(day);
  }
  if (!draft) {
    resetSessionScroll(); // fresh workout starts at the top
    const newDraft = {
      date: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      dayId: day.id,
      dayName: day.name,
      symptoms: {},
      symptomsDone: false,
      metrics: {},
      entries: day.exercises.map(blankEntry),
      notes: "",
    };
    store.saveDraft(newDraft);
  }
  navigate("session");
}

function quickStats(sessions) {
  const wrap = el("div.stat-row");
  const thisWeek = sessions.filter((s) => (Date.now() - new Date(s.date)) < 7 * 86400000).length;
  const streak = computeStreak(sessions);
  const totalVol = sessions.slice(0, 8).reduce((sum, s) => sum + store.sessionVolume(s), 0);
  wrap.appendChild(statTile(thisWeek + "/3", "This week"));
  wrap.appendChild(statTile(String(sessions.length), "Total sessions"));
  wrap.appendChild(statTile(streak + "w", "Week streak"));
  return wrap;
}

function computeStreak(sessions) {
  if (!sessions.length) return 0;
  const weeks = new Set(sessions.map((s) => weekKey(new Date(s.date))));
  let streak = 0;
  let cursor = new Date();
  for (;;) {
    if (weeks.has(weekKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 7); }
    else break;
  }
  return streak;
}
function weekKey(d) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // Monday
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SESSION (active workout)
// ---------------------------------------------------------------------------
route("session", () => {
  const draft = store.loadDraft();
  if (!draft) { navigate("today"); return; }
  // Fresh entry (opening/resuming): restore your saved scroll. In-place
  // re-renders (swap, +set…) are left to the router, which keeps your spot.
  const freshEntry = prevRoutePath !== "session";
  if (freshEntry) keepScroll();
  const day = PROGRAM.days.find((d) => d.id === draft.dayId);

  const view = el("div.view");
  view.appendChild(el("header.subhead", {}, [
    el("button.icon-btn", { html: "&larr;", title: "Back", onclick: () => navigate("today") }),
    el("div", {}, [
      el("h1.subhead-title", { text: day.name }),
      el("p.muted.small", { text: day.focus }),
    ]),
    el("button.btn.ghost.small", { text: "Discard", onclick: async () => {
      if (await confirmDialog("Discard this in-progress workout? Logged sets will be lost.", { okText: "Discard", danger: true })) {
        store.clearDraft(); pickedDayId = null; navigate("today");
      }
    }}),
  ]));

  // Symptom check gate
  if (!draft.symptomsDone) {
    view.appendChild(symptomCheck(draft));
    render(view);
    return;
  }

  // Warmup accordion
  view.appendChild(collapsible("🔥 Warm-up (~8 min)", day.warmup.map(warmItem), false));

  // Symptom-aware banner
  const alerts = symptomAlerts(draft.symptoms);
  if (alerts.length) {
    view.appendChild(el("div.card.alert", {}, [
      el("strong", { text: "⚠️ Heads-up based on today's check-in" }),
      el("ul", {}, alerts.map((a) => el("li", { text: a }))),
    ]));
  }

  // Is this a deload week? (#8) Computed once and handed to every card, so one
  // session can't be half deloaded.
  const deload = store.deloadStatus();
  if (deload.due) {
    view.appendChild(el("div.card.alert.deload", {}, [
      el("strong", { text: "\u2193 Deload week" }),
      el("p", { text: deload.reason === "symptoms"
        ? `Your knee, shoulder and tightness scores have averaged ${deload.symptomLoad}/10 across this week's sessions after ${deload.streak} straight weeks of training. Every lift below is dropped about 10% and a set — take it, and come back at full load next week.`
        : `That's ${deload.streak} consecutive weeks of training. Every lift below is dropped about 10% and a set. This is programmed, not a bad day \u2014 the loads you left are waiting next week.` }),
      el("p.muted.small", { text: "Change the cadence, or switch it off, in Settings \u2192 Workout." }),
    ]));
  }

  // Exercises, as a focus stack: one open at a time. Six expanded cards is the
  // pile-up no amount of card-level tidying fixes, so everything but the lift
  // you're on collapses to a line — name, what it asks for, and a dot per set.
  const ctx = { deload: deload.due, symptoms: draft.symptoms };
  const groups = exerciseGroups(day.exercises);
  const activeGroup = activeGroupIndex(groups, draft);

  view.appendChild(sessionProgress(draft, groups, activeGroup));
  groups.forEach((group, gi) => {
    if (gi === activeGroup) {
      // A ⇄ superset opens as a unit: alternating between two lifts is the whole
      // point of the pairing, so hiding one of them would break it.
      const wrap = el("div.active-group" + (group.length > 1 ? ".superset" : ""));
      if (group.length > 1) wrap.appendChild(el("p.ss-lead.tiny", { text: `⇄ Superset ${group[0].exDef.ss} — alternate these two` }));
      group.forEach(({ exDef, idx }) => wrap.appendChild(exerciseCard(exDef, draft, idx, ctx)));
      wrap.appendChild(advanceRow(draft, groups, gi));
      view.appendChild(wrap);
    } else {
      group.forEach(({ exDef }) => view.appendChild(collapsedExercise(exDef, draft, groups, gi)));
    }
  });

  // Cooldown
  view.appendChild(collapsible("🧘 Cool-down", day.cooldown.map(warmItem), false));

  // Optional Apple Watch metrics
  view.appendChild(watchMetricsCard(draft));

  // Session note + finish
  view.appendChild(el("div.card", {}, [
    el("label.field-label", { text: "Session notes" }),
    el("textarea.input", {
      rows: 3, placeholder: "How did it feel? Anything to remember for next time?",
      value: draft.notes || "",
      oninput: (e) => { draft.notes = e.target.value; store.saveDraft(draft); },
    }),
  ]));

  view.appendChild(el("button.btn.primary.big.full", { text: "Finish & save workout", onclick: () => finishSession(draft, day) }));
  // spacer so the floating rest timer never covers the Finish button
  view.appendChild(el("div.session-spacer"));

  render(view);
  mountRestTimer();
  if (freshEntry) restoreSessionScroll();
});

function symptomCheck(draft) {
  const card = el("div.card.symptom-check");
  card.appendChild(el("h2", { text: "Quick check-in" }));
  card.appendChild(el("p.muted", { text: "Two taps per slider. This tells the coach when to push and when to protect a joint." }));

  // Migraine follow-up on the previous session (they hit ~5h later, so we ask now)
  const prev = store.lastSession();
  if (prev) {
    const setMig = (v) => { store.updateSession(prev.id, { causedMigraine: v }); navigate("session"); };
    card.appendChild(el("div.migraine-q", {}, [
      // A session from an old backup or a cloud merge can arrive without a day
      // name. Losing the label is fine; taking the check-in screen down with it
      // — and with it the ability to start a workout at all — is not.
      el("p.field-label", { text: `Did a migraine follow your last workout? (${sessionDayName(prev)}${fmtDate(prev.date)})` }),
      el("div.seg", {}, [
        el("button", { class: "seg-btn" + (prev.causedMigraine === false ? " active" : ""), text: "No", onclick: () => setMig(false) }),
        el("button", { class: "seg-btn" + (prev.causedMigraine === true ? " active" : ""), text: "Yes 🤕", onclick: () => setMig(true) }),
      ]),
    ]));
  }

  SYMPTOMS.forEach((s) => {
    const val = draft.symptoms[s.id] != null ? draft.symptoms[s.id] : (s.invert ? 7 : 0);
    draft.symptoms[s.id] = val;
    const out = el("span.slider-val", { text: String(val) });
    const slider = el("input.slider", {
      type: "range", min: 0, max: 10, step: 1, value: val,
      oninput: (e) => { draft.symptoms[s.id] = Number(e.target.value); out.textContent = e.target.value; store.saveDraft(draft); },
    });
    card.appendChild(el("div.slider-row", {}, [
      el("div.slider-head", {}, [
        el("label", { text: s.label }),
        out,
      ]),
      el("p.muted.tiny", { text: s.hint }),
      slider,
      el("div.slider-scale", {}, [
        el("span", { text: s.invert ? "poor" : "none" }),
        el("span", { text: s.invert ? "great" : "severe" }),
      ]),
    ]));
  });
  card.appendChild(el("button.btn.primary.big.full", { text: "Start lifting →", onclick: () => {
    draft.symptomsDone = true; store.saveDraft(draft); navigate("session");
  }}));
  return card;
}

function watchMetricsCard(draft) {
  draft.metrics = draft.metrics || {};
  const card = el("details.card.collapsible");
  card.appendChild(el("summary", { text: "⌚ Apple Watch numbers (optional)" }));
  const grid = el("div.metrics-grid");
  WATCH_METRICS.forEach((m) => {
    grid.appendChild(el("label.metric-field", {}, [
      el("span.field-label", { text: `${m.label} (${m.unit})` }),
      el("input.input", {
        type: "number", inputmode: "numeric", placeholder: m.placeholder,
        value: draft.metrics[m.id] ?? "",
        oninput: (e) => { draft.metrics[m.id] = e.target.value === "" ? null : Number(e.target.value); store.saveDraft(draft); },
      }),
    ]));
  });
  card.appendChild(grid);
  card.appendChild(el("p.muted.tiny", { text: "Glance at your Watch after the session and punch these in — they'll chart over time on the Progress tab." }));
  return card;
}

function symptomAlerts(symptoms) {
  // Injury management only — no migraine/fatigue coddling (Tim trains through those).
  const out = [];
  if ((symptoms.knee || 0) >= 4) out.push("Right knee is flaring — 🎲 swap to the lower-impact options, keep squat/press depth shallow, and skip deep loaded bends today.");
  if ((symptoms.tightness || 0) >= 5) out.push("Right side is locked up — give the Loosen-up routine extra time and keep your hips square on every hinge.");
  if ((symptoms.shoulder || 0) >= 4) out.push("Right shoulder is cranky — 🎲 swap barbell presses to the neutral-grip DB versions and add an extra cuff/face-pull warm-up set.");
  return out;
}

// A draft can outlive a program change (an exercise added to the day, an app
// update mid-workout), so a slot with no entry gets one rather than blowing up
// the whole session view.
function entryForSlot(draft, exDef) {
  let entry = draft.entries.find((e) => e.exerciseId === exDef.id);
  if (!entry) {
    entry = blankEntry(exDef);
    draft.entries.push(entry);
    store.saveDraft(draft);
  }
  return entry;
}

// An entry records BOTH the slot it filled and the movement performed in it.
// The movement is what history keys on; the slot only says what was programmed
// today. measure/loadMode are denormalized so an old session still reads
// correctly if the registry later changes.
function blankEntry(exDef) {
  const mv = getMovement(exDef.movement);
  return {
    exerciseId: exDef.id,
    movementId: exDef.movement,
    name: exDef.name,
    variant: null,
    measure: mv ? mv.measure : "reps",
    loadMode: mv ? mv.loadMode : "total",
    sets: Array.from({ length: exDef.sets }, () => ({ weight: null, amount: null, role: "work", done: false })),
    pain: false,
    note: "",
  };
}

// ---------------------------------------------------------------------------
// THE FOCUS STACK
//
// The session renders one open exercise at a time. Which one is `draft.activeId`
// — persisted, so closing the app mid-session brings you back to the lift you
// were on rather than the top of the list.
// ---------------------------------------------------------------------------

// Exercises, grouped so a ⇄ superset pair opens together.
// "Bonus: Mobility, Single-Leg & Arms, " — trimmed of its "Day C — " prefix,
// and empty rather than fatal when the session never recorded one.
function sessionDayName(session) {
  const name = session && session.dayName;
  return name ? String(name).replace(/^Day [A-C] — /, "") + ", " : "";
}

function exerciseGroups(exercises) {
  const groups = [];
  const bySs = {};
  exercises.forEach((exDef, idx) => {
    const item = { exDef, idx };
    if (exDef.ss && bySs[exDef.ss]) { bySs[exDef.ss].push(item); return; }
    const group = [item];
    if (exDef.ss) bySs[exDef.ss] = group;
    groups.push(group);
  });
  return groups;
}

// Which set rows in this entry have something logged in them.
function entryProgress(draft, exDef) {
  const entry = (draft.entries || []).find((e) => e.exerciseId === exDef.id);
  const sets = (entry && entry.sets) || [];
  return { total: sets.length || Number(exDef.sets) || 3, done: sets.filter((x) => x.done || isLogged(x)).length };
}

const groupDone = (draft, group) => group.every(({ exDef }) => {
  const p = entryProgress(draft, exDef);
  return p.total > 0 && p.done >= p.total;
});

// Where to open: the athlete's last choice if it's still in this day, otherwise
// the first group with work left, otherwise the last one.
function activeGroupIndex(groups, draft) {
  if (draft.activeId) {
    const i = groups.findIndex((g) => g.some(({ exDef }) => exDef.id === draft.activeId));
    if (i >= 0) return i;
  }
  const next = groups.findIndex((g) => !groupDone(draft, g));
  return next >= 0 ? next : groups.length - 1;
}

function openGroup(draft, groups, gi) {
  const group = groups[Math.max(0, Math.min(gi, groups.length - 1))];
  draft.activeId = group[0].exDef.id;
  store.saveDraft(draft);
  navigate("session");
}

// One line at the top of the session: how far in you are, without counting cards.
function sessionProgress(draft, groups, activeGroup) {
  const done = groups.filter((g) => groupDone(draft, g)).length;
  const pct = groups.length ? Math.round((done / groups.length) * 100) : 0;
  return el("div.session-progress", {}, [
    el("span.tiny.muted", { text: `Lift ${activeGroup + 1} of ${groups.length}` }),
    el("span.prog-track", {}, [el("span.prog-fill", { style: `width:${pct}%` })]),
    el("span.tiny.muted", { text: `${done} done` }),
  ]);
}

// The collapsed row: name, what it's asking for (or what you did), set dots.
function collapsedExercise(exDef, draft, groups, gi) {
  const entry = (draft.entries || []).find((e) => e.exerciseId === exDef.id);
  const movementId = (entry && (entry.variant || entry.movementId)) || exDef.movement;
  const movement = getMovement(movementId);
  const prescription = prescriptionFor(exDef, movement);
  const measure = (movement && movement.measure) || prescription.measure;
  const info = measureInfo(measure);
  const progress = entryProgress(draft, exDef);
  const complete = progress.total > 0 && progress.done >= progress.total;

  // Done → what you actually did. Not done → what it's going to ask for.
  const logged = (entry && store.loggedSets(entry.sets)) || [];
  const sugg = complete ? null : store.suggestion(movementId, prescription, {
    symptoms: draft.symptoms, flags: exDef.flags || [],
  });
  const load = complete
    ? topWorkingLoad(logged, movement)
    : sugg && sugg.weight != null ? sugg.weight : null;
  const amount = complete
    ? Math.max(0, ...logged.map((x) => setAmount(x) || 0))
    : (sugg && sugg.amount != null ? sugg.amount : prescription.max);
  const summary = (load != null ? `${load} × ` : "") +
    (measure === "reps" ? amount : `${amount}${info.unit}`);

  const dots = el("span.set-dots", {}, Array.from({ length: progress.total }, (_, i) =>
    el("span.dot" + (i < progress.done ? ".on" : ""))));

  const row = el("div.stack-row" + (complete ? ".done" : "") + (entry && entry.pain ? ".has-pain" : ""), {
    role: "button", tabindex: 0,
    onclick: () => openGroup(draft, groups, gi),
  }, [
    dots,
    el("span.stack-name", {}, [
      el("span", { text: movementName(movementId, exDef.name) }),
      exDef.ss ? el("span.ss-badge.tiny", { text: "⇄ " + exDef.ss }) : null,
    ]),
    el("span.stack-rx" + (complete ? ".done" : ""), { text: summary }),
  ]);
  row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); } });
  return row;
}

// Move to the next lift. The one control that makes a stack feel like a session
// rather than a list.
function advanceRow(draft, groups, gi) {
  const last = gi >= groups.length - 1;
  return el("div.advance-row", {}, [
    gi > 0 ? el("button.btn.ghost.small", { text: "‹ Previous", onclick: () => openGroup(draft, groups, gi - 1) }) : el("span"),
    last
      ? el("span.muted.tiny", { text: "Last one — finish below." })
      : el("button.btn.primary.small", { text: "Next lift ›", onclick: () => openGroup(draft, groups, gi + 1) }),
  ]);
}

// ---------------------------------------------------------------------------
// THE EXERCISE CARD
//
// Rebuilt around the three moments a card actually serves, because it had grown
// ten equally-weighted zones and the one number you came for was competing with
// a paragraph explaining it:
//
//   DECIDE   (~8× a session)  the prescription. Load, range, sets, RPE, and —
//                             new — what topping the range earns you.
//   LOG     (~30× a session)  the grid, the ✓, the one tap of effort.
//   CONSULT (a few × a month) why this lift, how it's cued, what the number was
//                             based on, what you did last time, the swap.
//
// Decide is a single block at the top, Log sits directly under it, and every
// Consult element folds behind one row of chips or the ⋯ menu. Nothing was
// dropped in the move.
// ---------------------------------------------------------------------------

// "8–12 reps", "45s", "30yd" — the range as a unit, not a bare number.
function rangeText(prescription, measure, info) {
  const min = prescription && prescription.min > 0 ? prescription.min : null;
  const max = prescription && prescription.max > 0 ? prescription.max : null;
  if (max == null) return "";
  const span = min != null && min !== max ? `${min}–${max}` : String(max);
  return measure === "reps" ? `${span} reps` : `${span}${info.unit}`;
}

// What changes on the bar at this step, per side. "+ 25" you can act on;
// "45 + 25 per side" you have to diff against what's already loaded.
function plateMove(step, barbell) {
  if (!barbell) return "";
  if (!step.side || !step.side.length) return "empty bar";
  const list = (a) => a.join(" + ");
  if (step.remove && step.remove.length) return `⇄ ${list(step.remove)} off, ${list(step.add)} on`;
  if (step.add && step.add.length) return `+ ${list(step.add)}`;
  return "as loaded";
}

function rampRow(step, move, right) {
  return el("div.ramp-row" + (step.work ? ".work" : "") + (step.swap ? ".swap" : ""), {}, [
    el("span.ramp-load", { text: String(step.load) }),
    el("span.ramp-move", { text: move }),
    el("span.ramp-reps", { text: right }),
  ]);
}

// A chip that opens one drawer under the strip. One open at a time: two open
// drawers is the pile-up this redesign exists to remove.
function drawerChip(strip, host, label, build) {
  let open = false;
  const btn = el("button.chip-btn", { text: label, "aria-expanded": "false" });
  btn.addEventListener("click", () => {
    const wasOpen = open;
    strip.querySelectorAll(".chip-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
    clear(host);
    open = false;
    if (!wasOpen) {
      btn.setAttribute("aria-expanded", "true");
      host.appendChild(build());
      open = true;
    }
  });
  return btn;
}

function exerciseCard(exDef, draft, idx, session = {}) {
  const entry = entryForSlot(draft, exDef);

  // The movement actually being performed here — the slot's default, or
  // whatever 🎲 landed on. Everything below reads from this, not from the slot.
  const movementId = entry.variant || entry.movementId || exDef.movement;
  const movement = getMovement(movementId);
  const prescription = prescriptionFor(exDef, movement);
  const measure = (movement && movement.measure) || prescription.measure;
  const info = measureInfo(measure);
  const target = prescription.max;
  const card = el("div.card.exercise");

  // Everything the engine can't know from history alone: how the joints this
  // lift leans on feel today, and whether the calendar says deload (#7, #8).
  const sugg = store.suggestion(movementId, prescription, {
    symptoms: session.symptoms || draft.symptoms,
    flags: exDef.flags || [],
    scheduledDeload: !!session.deload,
  });
  // A deload only counts as one if he actually takes it — the flag is confirmed
  // against what he logs when the session is saved.
  if (sugg && sugg.action === "deload") { entry.deload = true; entry.deloadTo = sugg.weight; }
  else { delete entry.deload; delete entry.deloadTo; }
  // A deload week cuts volume as well as load, so take the set off the card
  // rather than asking him to remember to. Only before anything is logged, and
  // only once — he can always tap "+ set" back.
  if (sugg && sugg.dropSet && !entry.deloadTrimmed && entry.sets.length > 2 && !entry.sets.some(isLogged)) {
    entry.sets.pop();
    entry.deloadTrimmed = true;
    store.saveDraft(draft);
  }
  const last = store.lastPerformance(movementId);
  // What was last done in this SLOT, whatever it was. Context only — a barbell
  // incline number never becomes a dumbbell shoulder-press suggestion (#2).
  const slotLast = last ? null : store.lastPerformanceInSlot(exDef.id);

  // A movement with no history of its own can still be seeded from a related
  // one (#12). Never mixed into `sugg`: a seed is a guess, not a data point.
  const seed = sugg ? null : store.seedFor(movementId, prescription);
  // Performed before, but nothing in it the engine can read as a working set.
  // That is not a first session, and saying it is sends you hunting for a bug
  // in the wrong place.
  const unreadable = sugg ? null : store.unreadableHistory(movementId);
  const startWeight = sugg && sugg.weight != null
    ? sugg.weight
    : seed ? seed.weight
    : unreadable && unreadable.load ? unreadable.load
    : (!entry.variant && exDef.start != null ? exDef.start : null);
  const startAmount = sugg && sugg.amount != null ? sugg.amount : target;

  // Variety swap: cycle through the main lift + its listed alternatives.
  const displayName = movementName(movementId, entry.variantName || exDef.name);
  const swapOptions = [exDef.movement, ...(exDef.alternatives || [])];
  const swapTo = (next) => {
    entry.variant = next === exDef.movement ? null : next;
    entry.movementId = next;
    entry.variantName = null;
    const mv = getMovement(next);
    if (mv) { entry.measure = mv.measure; entry.loadMode = mv.loadMode; }
    // Swapping to a two-limbs-at-once movement retires the harder-side tap.
    if (!(mv && mv.unilateral)) recordHarderSide(entry, null);
    store.saveDraft(draft);
    navigate("session");
  };
  const doSwap = () => swapTo(swapOptions[(swapOptions.indexOf(movementId) + 1) % swapOptions.length]);

  // ---- Header. Name, the flags that change how you lift it, and one ⋯ for the
  // things you do to an exercise a few times a month.
  const menu = el("details.ex-menu", {}, [
    el("summary.icon-btn", { html: "⋯", title: "More" }),
    el("div.menu-sheet", {}, [
      swapOptions.length > 1 ? el("button.menu-item", { text: "🎲  Swap for variety", onclick: doSwap }) : null,
      el("a.menu-item", {
        text: "▶  How-to video",
        href: "https://www.youtube.com/results?search_query=" + encodeURIComponent("how to " + displayName + " proper form"),
        target: "_blank", rel: "noopener",
      }),
      entry.sets.length > 1 ? el("button.menu-item", { text: "–  Remove a set", onclick: () => {
        entry.sets.pop(); store.saveDraft(draft); navigate("session");
      }}) : null,
      entry.variant ? el("button.menu-item", { text: "↩  Back to " + exDef.name, onclick: () => swapTo(exDef.movement) }) : null,
    ]),
  ]);

  card.appendChild(el("div.ex-head", {}, [
    el("div.ex-idx", { text: String(idx + 1) }),
    el("div.ex-title", {}, [
      el("div.title-row", {}, [
        el("h3", { text: displayName }),
        exDef.ss ? el("span.ss-badge", { text: "⇄ " + exDef.ss }) : null,
        exDef.learn ? el("span.learn-badge", { text: "🎥" }) : null,
      ]),
      el("p.muted.tiny", { text: exDef.target + (entry.variant ? " · swapped from " + exDef.name : "") }),
    ]),
    menu,
  ]));

  // ---- DECIDE. The load at a glance, the range it lives in, and the terms.
  const rx = el("div.rx");
  if (startWeight != null) {
    rx.appendChild(el("span.rx-load", { text: String(startWeight) }));
    rx.appendChild(el("span.rx-unit", { text: loadLabel(movement, units()) }));
    rx.appendChild(el("span.rx-x", { text: "×" }));
  }
  rx.appendChild(el("span.rx-range", { text: rangeText(prescription, measure, info) || `${startAmount ?? target}` }));
  card.appendChild(rx);

  // Sets, effort and rest were a single grey run-on line under the title. They
  // are three separate facts you act on, so they get three separate cells.
  card.appendChild(el("div.rx-stats", {}, [
    el("span.stat", {}, [el("b", { text: String(entry.sets.length) }), el("span", { text: "sets" })]),
    el("span.stat", {}, [el("b", { text: "RPE " + exDef.rpe }), el("span", { text: rpeHint(exDef.rpe) })]),
    el("span.stat", {}, [el("b", { text: exDef.rest }), el("span", { text: "rest" })]),
  ]));

  const goal = progressionTerms(sugg, { movement, prescription, units: units() });
  if (goal) card.appendChild(el("p.rx-goal", { text: goal }));

  // The engine's verdict at a glance; the full reasoning and the audit trail are
  // one tap away, where they belong — you read them when you doubt the number.
  const drawerHost = el("div.drawer-host");
  if (sugg) {
    const why = el("button.why-line", { "aria-expanded": "false" }, [
      el("span.q", { text: "?" }),
      el("span", { text: sugg.headline || "Why this number" }),
    ]);
    let open = false;
    why.addEventListener("click", () => {
      open = !open;
      why.setAttribute("aria-expanded", String(open));
      clear(drawerHost);
      if (open) {
        drawerHost.appendChild(el("div.drawer", {}, [
          el("p", { text: sugg.note }),
          sugg.basis ? el("p.tiny.muted", { text: sugg.basis }) : null,
        ]));
      }
    });
    card.appendChild(why);
  } else {
    // No history for THIS movement. A seed from a related lift (#12) reads as an
    // estimate; with nothing to seed from, coach the weight pick instead.
    const amountHint = measure === "reps" ? `${target} reps` : `${target}${info.unit}`;
    card.appendChild(seed
      ? el("p.rx-seed", { text: "≈ " + seed.note })
      : unreadable
        ? el("p.rx-seed.unreadable", { text:
            `You did this ${relDay(unreadable.date)} (${unreadable.text}), but nothing in that session counts as a working set, ` +
            `so there's nothing to progress from. ` +
            (unreadable.flagged
              ? `${unreadable.flagged} set${unreadable.flagged === 1 ? " is" : "s are"} flagged as a possible typo — fix or confirm ${unreadable.flagged === 1 ? "it" : "them"} in History.`
              : `Tap a set's role badge to mark one as work.`) })
        : el("p.rx-seed", { text: `First time on ${entry.variant ? displayName : "this one"} — pick a weight where ${amountHint} is genuinely hard, with a rep or two left. I'll suggest the load from next session.` }));
  }

  // ---- CONSULT. One strip, one drawer at a time.
  const strip = el("div.chip-strip");
  const ramp = store.rampFor(movementId, startWeight, measure);
  const barbell = !!(movement && movement.implement === "barbell");
  if (ramp.length) {
    // The chip carries the loads, because that's what you glance at between
    // sets. The drawer carries the plates, in load order, saying what changes
    // at each step — a ramp you can build without stripping the bar twice.
    const label = "🔥 " + ramp.map((r) => r.load).join(" · ");
    strip.appendChild(drawerChip(strip, drawerHost, label, () => {
      const box = el("div.drawer");
      const rows = el("div.ramp-rows");
      const workSide = barbell && startWeight != null ? (plateStack(startWeight) || {}).side || [] : null;
      ramp.forEach((r, i) => rows.appendChild(rampRow(r, plateMove(r, barbell), `× ${r.amount}`)));
      if (workSide) {
        const toWork = stackDelta(ramp[ramp.length - 1].side || [], workSide);
        rows.appendChild(rampRow({ load: startWeight, work: true },
          plateMove({ add: toWork.add, remove: toWork.remove, swap: toWork.remove.length > 0, side: workSide }, true),
          "work"));
      }
      box.appendChild(rows);
      if (workSide) box.appendChild(el("p.tiny", { text: `Working set: ${stackText(startWeight)}` }));
      box.appendChild(el("p.tiny.muted", {
        text: barbell
          ? "Loaded so the plates go on and stay on — a ⇄ is the one place something comes back off. Warm-up sets: easy speed, stop each one well short. They're marked as ramp-ups and never count toward your progression."
          : "Warm-up sets, not working sets — easy speed, stop each one well short. They're marked as ramp-ups and never count toward your progression.",
      }));
      return box;
    }));
  }
  if (barbell && startWeight != null && !ramp.length) {
    strip.appendChild(drawerChip(strip, drawerHost, "🏋️ Plates", () => el("div.drawer", {}, [
      el("p", { text: stackText(startWeight) || "Enter a weight for the plate math." }),
    ])));
  }
  if (last) {
    strip.appendChild(drawerChip(strip, drawerHost, "📈 Last", () => {
      const setStr = store.loggedSets(last.sets).map((x) => setText(movement, x)).join(", ");
      const lastHarder = harderSide(last.entry);
      return el("div.drawer", {}, [
        el("p", { text: `${relDay(last.date)}: ${setStr || "—"}` }),
        lastHarder ? el("p.tiny.balance", { text: `⇄ ${harderSideLabel(lastHarder)} side was the harder one` }) : null,
        last.entry && last.entry.note ? el("p.tiny.muted", { text: `"${last.entry.note}"` }) : null,
      ]);
    }));
  } else if (slotLast && slotLast.movementId && slotLast.movementId !== movementId) {
    strip.appendChild(drawerChip(strip, drawerHost, "📈 This slot", () => {
      const prevMv = getMovement(slotLast.movementId);
      return el("div.drawer", {}, [el("p", {
        text: `${relDay(slotLast.date)} you did ${movementName(slotLast.movementId, slotLast.entry.name)} here ` +
          `(${store.loggedSets(slotLast.sets).map((x) => setText(prevMv, x)).join(", ")}) — different movement, so that weight isn't carried over.`,
      })]);
    }));
  }
  strip.appendChild(drawerChip(strip, drawerHost, "📋 Cues", () => {
    const box = el("div.drawer");
    if (entry.variant) {
      box.appendChild(el("p", { text: `You swapped to ${displayName} — it fills the same slot as ${exDef.name}. The flags are why this slot is in your program.` }));
    } else {
      if (exDef.why) box.appendChild(el("p", { text: exDef.why }));
      if (exDef.cues && exDef.cues.length) box.appendChild(el("ul.cues", {}, exDef.cues.map((c) => el("li", { text: c }))));
      if (exDef.techNote) box.appendChild(el("p.tiny.muted", { text: "🎥 " + exDef.techNote }));
    }
    if (exDef.flags && exDef.flags.length) {
      box.appendChild(el("div.flags", {}, exDef.flags.map((f) => el("span.flag", { text: FLAG_LABELS[f] || f }))));
    }
    const altNames = alternativeNames(exDef);
    if (altNames.length) box.appendChild(el("p.tiny.muted", { text: "Swaps: " + altNames.join(" · ") }));
    if (exDef.ss) box.appendChild(el("p.tiny.muted", { text: `Optional superset (${exDef.ss}) — pair with the other ⇄ ${exDef.ss} move if you can hold both, otherwise straight sets.` }));
    return box;
  }));
  card.appendChild(strip);
  card.appendChild(drawerHost);

  // ---- LOG. Directly under the prescription, where it should always have been.
  const badges = [];
  const effortHost = el("div.effort");
  const ctx = {
    exDef, movement, measure, info, draft, entry, badges,
    unilateral: !!(movement && movement.unilateral),
    phWeight: startWeight, phAmount: startAmount,
    refreshRoles: () => {},
  };
  ctx.refreshRoles = () => {
    applyInferredRoles(entry.sets, prescription, movement);
    badges.forEach((b, i) => paintRoleBadge(b, entry.sets[i]));
    renderEffort(effortHost, ctx);
  };

  const setsWrap = el("div.sets");
  setsWrap.appendChild(el("div.set-row.set-header", {}, [
    el("span.set-col", { text: "Set" }),
    el("span.set-col", { text: loadLabel(movement, units()) }),
    el("span.set-col", { text: info.short }),
    el("span.set-col", { text: "Role" }),
    el("span.set-col", { text: "✓" }),
  ]));
  entry.sets.forEach((setData, si) => setsWrap.appendChild(setRow(ctx, setData, si)));
  card.appendChild(setsWrap);
  card.appendChild(effortHost);
  ctx.refreshRoles();

  // ---- Tools. What's left is exceptions: another set, a note, a pain flag.
  const noteHost = el("div.note-host");
  const showNote = () => {
    clear(noteHost);
    noteHost.appendChild(el("textarea.input.note-input", {
      rows: 2, placeholder: "form cues, how it felt, tweaks…", value: entry.note || "",
      oninput: (e) => { entry.note = e.target.value; store.saveDraft(draft); },
    }));
    noteHost.firstChild.focus();
  };
  const painBtn = el("button.btn.ghost.small" + (entry.pain ? ".on" : ""), {
    text: "⚠︎ pain",
    onclick: () => {
      entry.pain = !entry.pain;
      store.saveDraft(draft);
      painBtn.classList.toggle("on", entry.pain);
      card.classList.toggle("has-pain", entry.pain);
    },
  });
  card.appendChild(el("div.set-tools", {}, [
    el("button.btn.ghost.small", { text: "+ set", onclick: () => {
      entry.sets.push({ weight: entry.sets.at(-1)?.weight ?? null, amount: null, role: "work", done: false });
      store.saveDraft(draft); navigate("session");
    }}),
    el("button.btn.ghost.small", { text: "✎ note", onclick: showNote }),
    painBtn,
  ]));
  card.appendChild(noteHost);
  if (entry.note) showNote();
  if (entry.pain) card.classList.add("has-pain");

  return card;
}

// "RPE 8" means nothing on its own to anyone who hasn't memorised the scale.
// The program prescribes in RPE; the athlete thinks in reps left in the tank.
function rpeHint(rpe) {
  const rir = targetRir(rpe);
  return rir == null ? "effort" : `${rir} in the tank`;
}

// How one logged set reads in a list: "165×8↗", "L 50×10 · R 55×10 @9".
// Sides only appear when they were logged apart; the RPE only when it was given.
function setText(movement, set) {
  return formatSet(movement, set) + roleGlyph(set) + effortGlyph(set);
}

// Ramp-ups and back-offs are marked so a glance at a set list shows what was
// actually work. Work sets carry no glyph — they're the common case.
function roleGlyph(set) {
  if (set && set.failed) return "✗";
  const r = roleOf(set);
  return r === "ramp" ? "↗" : r === "backoff" ? "↘" : "";
}

// What the role you just picked means for the engine, said once, on the tap.
const ROLE_TOASTS = {
  ramp: "Ramp-up — ignored by the next suggestion",
  work: "Working set — this is what the suggestion reads",
  backoff: "Back-off — counted as fatigue, not as your working load",
};

const ROLE_TITLES = {
  ramp: "Ramp-up set — doesn't count toward progression",
  work: "Working set — this is what the load suggestion reads",
  backoff: "Back-off set — counted as fatigue, not as the working load",
};

function paintRoleBadge(badge, setData) {
  const role = roleOf(setData);
  badge.textContent = roleLabel(setData);
  badge.dataset.role = setData && setData.failed ? "failed" : role;
  badge.title = setData && setData.failed
    ? "Failed opener — you started here and had to come down. Tap to change."
    : ROLE_TITLES[role] + ". Tap to change.";
  badge.classList.toggle("locked", !!(setData && setData.roleLocked));
}

function setRow(ctx, setData, si) {
  const { info, draft, entry, badges } = ctx;
  const row = el("div.set-row");
  row.appendChild(el("span.set-col.set-num", { text: String(si + 1) }));

  const write = (patch) => {
    Object.assign(setData, patch);
    delete setData.confirmed;
    store.saveDraft(draft);
    ctx.refreshRoles();
  };
  const wInput = el("input.set-input", {
    type: "number", inputmode: "decimal",
    placeholder: ctx.phWeight != null ? String(ctx.phWeight) : "–",
    value: setData.weight ?? "",
    oninput: (e) => write({ weight: e.target.value === "" ? null : Number(e.target.value) }),
  });
  const aInput = el("input.set-input", {
    type: "number", inputmode: info.inputmode,
    placeholder: ctx.phAmount != null ? String(ctx.phAmount) : "–",
    value: setAmount(setData) ?? "",
    oninput: (e) => write({ amount: e.target.value === "" ? null : Number(e.target.value) }),
  });
  // Sanity-check on commit (blur/enter), never mid-keystroke: 140 × 120 is a
  // typo worth catching, but "1" on the way to "12" is not (#4).
  const recheck = () => checkSet(ctx, setData, { weight: wInput, amount: aInput });
  wInput.addEventListener("change", recheck);
  aInput.addEventListener("change", recheck);

  row.appendChild(el("span.set-col", {}, [wInput]));
  row.appendChild(el("span.set-col", {}, [aInput]));

  // Tapping the badge cycles the role and locks it, so inference stops
  // overwriting your call. A silent relabel isn't enough — the role decides
  // whether this set feeds the next suggestion at all, so say what it did.
  const badge = el("button.role-badge", {
    onclick: () => {
      setData.role = nextRole(roleOf(setData));
      setData.roleLocked = true;
      delete setData.failed;
      store.saveDraft(draft);
      paintRoleBadge(badge, setData);
      ctx.refreshRoles();
      toast(ROLE_TOASTS[roleOf(setData)]);
    },
  });
  badges[si] = badge;
  paintRoleBadge(badge, setData);
  row.appendChild(el("span.set-col", {}, [badge]));

  const check = el("button.set-check", { html: setData.done ? "✓" : "", "aria-label": "mark set done" });
  if (setData.done) check.classList.add("on");
  check.addEventListener("click", () => {
    setData.done = !setData.done;
    check.classList.toggle("on", setData.done);
    check.innerHTML = setData.done ? "✓" : "";
    // autofill blanks from placeholder-ish previous set
    if (setData.done && setAmount(setData) == null && si > 0) {
      const prev = entry.sets[si - 1];
      const prevAmount = setAmount(prev);
      if (prevAmount != null) { setData.amount = prevAmount; aInput.value = prevAmount; }
      if (setData.weight == null && prev.weight != null) { setData.weight = prev.weight; wInput.value = prev.weight; }
    }
    store.saveDraft(draft);
    ctx.refreshRoles();
    if (setData.done) startRest();
  });
  row.appendChild(el("span.set-col", {}, [check]));
  return row;
}

// ---- Effort (#5) ------------------------------------------------------------
// One tap, on the last working set only — that's where the signal is, and a
// 50-minute session can't afford a question after every set. Re-rendered
// whenever roles change, so the chips follow the set that is currently "last
// working" as you log.
function renderEffort(host, ctx) {
  clear(host);
  const { entry, exDef } = ctx;
  const lastWork = lastWorkingIndex(entry.sets);
  const indices = entry.sets
    .map((s, i) => i)
    .filter((i) => i === lastWork || hasEffort(entry.sets[i]));
  if (!indices.length) return;
  indices.forEach((i) => host.appendChild(effortRow(ctx, i, i === lastWork)));
  if (ctx.unilateral) host.appendChild(harderSideRow(ctx));
  const wanted = targetRir(exDef && exDef.rpe);
  host.appendChild(el("p.muted.tiny", {
    text: wanted != null
      ? `Optional. Programmed RPE ${exDef.rpe} ≈ ${wanted} left in the tank — logging it is what lets the app tell "too light" from "at your limit".`
      : "Optional — how many more reps you could have done on that set.",
  }));
}

// The one left/right question worth a tap (#6): which side gave out first.
// Not per-side weights and reps — you load both sides the same and match the
// reps to the weaker one, so those numbers would read identical every session.
// Which side was the hard one is the part that actually moves.
function harderSideRow(ctx) {
  const { entry, draft } = ctx;
  const current = harderSide(entry);
  const chips = el("div.effort-chips", {}, HARDER_SIDES.map((side) => el("button", {
    class: "chip" + (current === side ? " on" : ""),
    text: side, title: `The ${SIDE_LABELS[side]} side was the harder one — tap again to clear`,
    onclick: () => {
      recordHarderSide(entry, current === side ? null : side);
      store.saveDraft(draft);
      ctx.refreshRoles();
    },
  })));
  return el("div.effort-row", {}, [
    el("div.effort-head", {}, [
      el("span.effort-label", { text: "Harder side" }),
      el("span.muted.tiny", { text: "if one gave out first" }),
    ]),
    chips,
    el("span.effort-read", { text: current ? `${harderSideLabel(current)} was harder` : "sides felt even" }),
  ]);
}

function effortRow(ctx, si, isLastWorking) {
  const { entry, draft } = ctx;
  const setData = entry.sets[si];
  const current = setRir(setData);
  const readout = el("span.effort-read", { text: current == null ? "not logged" : effortLabel(setData) });

  const chips = el("div.effort-chips", {}, RIR_CHOICES.map((rir) => el("button", {
    class: "chip" + (current === rir ? " on" : ""),
    text: RIR_LABELS[rir], title: RIR_HINTS[rir],
    onclick: () => {
      // Tapping the chip that's already on clears it — nothing is ever stuck.
      recordEffort(setData, current === rir ? null : rir);
      store.saveDraft(draft);
      ctx.refreshRoles();
    },
  })));

  // "Reps left in the tank" is the plain-language version of RPE. On a timed or
  // measured hold there are no reps to leave, so ask how much more he had.
  const question = ctx.measure === "reps" ? "reps left in the tank" : "how much more you had in you";
  return el("div.effort-row", {}, [
    el("div.effort-head", {}, [
      el("span.effort-label", { text: `Set ${si + 1} — ${question}` }),
      isLastWorking ? el("span.muted.tiny", { text: "last working set" }) : null,
    ]),
    chips,
    readout,
  ]);
}

// Warn, never block: the athlete is the authority on what he just did, so every
// check is one tap from "yes, that's right".
const WARNING_FIELDS = { "high-amount": "amount", "amount-jump": "amount", "high-weight": "weight", "load-jump": "weight" };

async function checkSet(ctx, setData, inputs) {
  if (setData.confirmed) return;
  const warning = validateSet(ctx.movement, setData, store.movementBests(ctx.entry.movementId))[0];
  if (!warning) { delete setData.suspect; return; }
  const keep = await confirmDialog(warning.message, { okText: "Yes, that's right", cancelText: "Let me fix it" });
  if (keep) {
    setData.confirmed = true;
    delete setData.suspect;
  } else {
    const field = WARNING_FIELDS[warning.code] || "amount";
    setData[field] = null;
    const input = inputs[field];
    if (input) { input.value = ""; input.focus(); }
  }
  store.saveDraft(ctx.draft);
  ctx.refreshRoles();
}

function warmItem(w) {
  return el("li.warm-item", {}, [
    el("span.warm-name", { text: w.name }),
    el("span.muted.small", { text: w.detail }),
  ]);
}

async function finishSession(draft, day) {
  const logged = draft.entries.some((e) => e.sets.some((s) => isLogged(s) || s.done));
  if (!logged) {
    if (!(await confirmDialog("Nothing was logged yet. Save an empty session anyway?", { okText: "Save empty" }))) return;
  }
  const session = {
    date: draft.date,
    completedAt: new Date().toISOString(),
    dayId: draft.dayId,
    dayName: draft.dayName,
    symptoms: draft.symptoms,
    metrics: draft.metrics || {},
    entries: draft.entries.map((e) => {
      const movementId = e.variant || e.movementId;
      const mv = getMovement(movementId);
      const prescription = prescriptionFor(findExercise(e.exerciseId), mv);
      const sets = e.sets.filter(isLogged);
      applyInferredRoles(sets, prescription, mv);
      // Anything still implausible and unconfirmed is flagged rather than
      // silently kept — the history view offers a one-tap correction (#4).
      const bests = store.movementBests(movementId);
      sets.forEach((set) => {
        if (set.confirmed) return;
        const warning = validateSet(mv, set, bests)[0];
        if (warning) set.suspect = warning.code; else delete set.suspect;
      });
      // A deload is only recorded if he took it. Suggesting one and then
      // loading the bar up anyway is a normal session, and the chart should
      // read it as one (#8).
      const tookDeload = !!e.deload && e.deloadTo != null &&
        (topWorkingLoad(sets, mv) == null || topWorkingLoad(sets, mv) <= e.deloadTo * 1.02);
      return {
        exerciseId: e.exerciseId,
        movementId,
        name: e.name,
        deload: tookDeload || undefined,
        variant: e.variant || null,
        variantName: e.variantName || null,
        prescription,
        measure: (mv && mv.measure) || e.measure || "reps",
        loadMode: (mv && mv.loadMode) || e.loadMode || "total",
        harderSide: harderSide(e),
        pain: e.pain,
        note: e.note,
        sets,
      };
    }),
    notes: draft.notes,
  };
  store.addSession(session);
  pickedDayId = null; // done — Today goes back to the calendar's suggestion
  toast("Workout saved 💪");
  navigate("history");
}

// ---- Rest timer (floating) --------------------------------------------------
let restState = { end: 0, interval: null, duration: 90 };
function startRest(sec) {
  const s = sec || store.getSettings().restTimerDefault || 90;
  restState.duration = s;
  restState.end = Date.now() + s * 1000;
  const bar = document.getElementById("rest-timer");
  if (bar) bar.classList.add("active");
  tickRest();
  clearInterval(restState.interval);
  restState.interval = setInterval(tickRest, 250);
}
function tickRest() {
  const bar = document.getElementById("rest-timer");
  if (!bar) return;
  const remain = Math.max(0, restState.end - Date.now());
  const label = bar.querySelector(".rest-label");
  const fill = bar.querySelector(".rest-fill");
  const secs = Math.ceil(remain / 1000);
  if (label) label.textContent = `Rest ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  if (fill) fill.style.width = (100 * remain / (restState.duration * 1000)) + "%";
  if (remain <= 0) {
    clearInterval(restState.interval);
    bar.classList.remove("active");
    if (store.getSettings().sound) beep();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }
}
function mountRestTimer() {
  if (document.getElementById("rest-timer")) return;
  const bar = el("div", { id: "rest-timer", class: "rest-timer" }, [
    el("div.rest-fill"),
    el("div.rest-body", {}, [
      el("span.rest-label", { text: "Rest" }),
      el("div.rest-btns", {}, [
        el("button.rest-adj", { text: "-15", onclick: () => { restState.end -= 15000; } }),
        el("button.rest-adj", { text: "+15", onclick: () => { restState.end += 15000; } }),
        el("button.rest-adj", { text: "skip", onclick: () => { restState.end = Date.now(); } }),
      ]),
    ]),
  ]);
  document.body.appendChild(bar);
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.05;
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// MOBILITY (Loosen up)
// ---------------------------------------------------------------------------
route("mobility", () => {
  const view = el("div.view");
  view.appendChild(el("header.subhead", {}, [
    el("button.icon-btn", { html: "&larr;", title: "Back", onclick: () => navigate("today") }),
    el("h1.subhead-title", { text: MOBILITY_ROUTINE.name }),
  ]));
  view.appendChild(el("div.card", {}, [
    el("p", { text: MOBILITY_ROUTINE.blurb }),
  ]));
  const list = el("ol.mobility-list");
  MOBILITY_ROUTINE.steps.forEach((s) => {
    list.appendChild(el("li.mobility-item", {}, [
      el("div", {}, [
        el("span.warm-name", { text: s.name }),
        el("span.muted.small", { text: s.detail }),
      ]),
      el("a.icon-btn", { html: "▶", title: "How-to",
        href: "https://www.youtube.com/results?search_query=" + encodeURIComponent(s.name + " stretch how to"),
        target: "_blank", rel: "noopener" }),
    ]));
  });
  view.appendChild(el("div.card", {}, [list]));
  view.appendChild(el("p.muted.small.center", { text: "Give the right side extra time. Consistency beats intensity here." }));
  render(view);
});

// ---------------------------------------------------------------------------
// COACH REPORT (the bridge to Claude)
// ---------------------------------------------------------------------------
route("report", () => {
  const view = el("div.view");
  view.appendChild(el("header.subhead", {}, [
    el("button.icon-btn", { html: "&larr;", title: "Back", onclick: () => navigate("settings") }),
    el("h1.subhead-title", { text: "Coach report" }),
  ]));
  const text = store.coachReport();
  view.appendChild(el("div.card", {}, [
    el("p.muted.small", { text: "This is how your data reaches Claude. Copy it, paste it into a Claude conversation, and ask for a program update — roughly every 4 weeks, or whenever something stalls or hurts." }),
    el("button.btn.primary.full", { text: "📋 Copy to clipboard", onclick: () => copyText(text) }),
    el("pre.report", { text }),
  ]));
  render(view);
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied — paste it into a Claude chat");
  } catch (e) {
    const ta = el("textarea", { value: text });
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); toast("Copied"); }
    catch (e2) { toast("Select the text below and copy manually"); }
    ta.remove();
  }
}

// ---------------------------------------------------------------------------
// PROGRAM (browse)
// ---------------------------------------------------------------------------
route("program", (param) => {
  const view = el("div.view");
  view.appendChild(el("header.subhead", {}, [
    el("h1.subhead-title", { text: "Your program" }),
  ]));
  view.appendChild(el("p.muted", { text: PROGRAM.name + " · updated " + PROGRAM.updated }));

  // principles
  const princ = el("details.card.principles");
  princ.appendChild(el("summary", { text: "How this program is built (worth a read)" }));
  PRINCIPLES.forEach((p) => princ.appendChild(el("div.princ", {}, [
    el("strong", { text: p.t }), el("p.muted.small", { text: p.d }),
  ])));
  view.appendChild(princ);

  // day tabs
  const tabs = el("div.tabs");
  PROGRAM.days.forEach((d) => {
    const active = (param || PROGRAM.days[0].id) === d.id;
    tabs.appendChild(el("button", { class: "tab" + (active ? " active" : ""), text: `Day ${d.id}`, onclick: () => navigate("program/" + d.id) }));
  });
  view.appendChild(tabs);

  const day = PROGRAM.days.find((d) => d.id === (param || "A")) || PROGRAM.days[0];
  view.appendChild(el("div.card.day-head", {}, [
    el("h2", { text: day.name }),
    el("p.muted", { text: day.focus }),
    el("p.muted.small", { text: dayScheduleLabel(day) }),
    day.optional && day.note ? el("p.optional-note", { text: "🎈 " + day.note }) : null,
    // Any day, any time — you don't have to wait for its slot on the calendar.
    el("button.btn.primary.full", { text: "Start this workout", onclick: () => startOrResume(day) }),
  ]));
  view.appendChild(collapsible("🔥 Warm-up", day.warmup.map(warmItem), false));
  day.exercises.forEach((e, i) => view.appendChild(programExercise(e, i)));
  view.appendChild(collapsible("🧘 Cool-down", day.cooldown.map(warmItem), false));

  render(view);
});

function dayScheduleLabel(day) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `Scheduled: ${names[day.dow]} · ~60 min · start it any day you like`;
}

function programExercise(e, i) {
  const card = el("div.card.prog-ex");
  card.appendChild(el("div.exercise-head", {}, [
    el("div.exercise-idx", { text: String(i + 1) }),
    el("div.exercise-title", {}, [
      el("div.title-row", {}, [
        el("h3", { text: e.name }),
        e.ss ? el("span.ss-badge", { text: "⇄ superset " + e.ss }) : null,
        e.learn ? el("span.learn-badge", { text: "🎥 technique" }) : null,
      ]),
      el("p.muted.small", { text: `${e.target} · ${e.sets}×${e.reps} · RPE ${e.rpe} · rest ${e.rest}` }),
    ]),
    el("a.icon-btn", { html: "▶", href: "https://www.youtube.com/results?search_query=" + encodeURIComponent("how to " + e.name + " proper form"), target: "_blank", rel: "noopener" }),
  ]));
  if (e.why) card.appendChild(el("p.why", { text: e.why }));
  if (e.cues && e.cues.length) card.appendChild(el("ul.cues", {}, e.cues.map((c) => el("li", { text: c }))));
  if (e.techNote) card.appendChild(el("p.barbell-note.small", { text: "🎥 " + e.techNote }));
  const progMv = getMovement(e.movement);
  if (progMv && progMv.implement === "barbell" && e.start != null) {
    const b = stackText(e.start);
    if (b) card.appendChild(el("div.plate-note", { text: `🏋️ Start ${e.start} lb → ${b}` }));
  }
  if (e.flags && e.flags.length) card.appendChild(el("div.flags", {}, e.flags.map((f) => el("span.flag", { text: FLAG_LABELS[f] || f }))));
  const altNames = alternativeNames(e);
  if (altNames.length) card.appendChild(el("p.muted.small", { text: "Swaps: " + altNames.join(" · ") }));
  return card;
}

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------
route("history", () => {
  const sessions = store.getSessions();
  const view = el("div.view");
  view.appendChild(el("header.subhead", {}, [el("h1.subhead-title", { text: "History & progress" })]));

  if (!sessions.length) {
    view.appendChild(el("div.card.empty", {}, [
      el("p", { text: "No sessions yet." }),
      el("button.btn.primary", { text: "Start today's workout", onclick: () => navigate("today") }),
    ]));
    render(view); return;
  }

  // Anything logged that can't be right gets surfaced here for correction,
  // rather than quietly skewing the charts (#4).
  const flagged = store.suspectSets();
  if (flagged.length) view.appendChild(dataCheckCard(flagged));

  // Progress explorer — one series per MOVEMENT, so the same lift performed in
  // two different slots shares a single chart (#2).
  view.appendChild(sectionTitle("Exercise progress"));
  const withData = store.loggedMovementIds().filter((id) => store.movementHistory(id).some((h) => h.sets > 0));
  const progressCard = el("div.card");
  if (withData.length) {
    const select = el("select.input", {}, withData.map((id) => el("option", { value: id, text: movementName(id, id) })));
    const chartHost = el("div.chart-host");
    const renderChart = () => {
      clear(chartHost);
      const hist = store.movementHistory(select.value).filter((h) => h.sets > 0);
      const mv = getMovement(select.value);
      const info = measureInfo(hist.length ? hist[0].measure : "reps");
      // Epley only means something for loaded rep work below the rep ceiling.
      // Carries, planks and assisted work chart what they actually measure.
      const series = hist.some((h) => h.e1rm != null)
        ? { key: "e1rm", label: "Estimated 1-rep-max over time (working sets)", unit: units() }
        : hist[0] && hist[0].measure !== "reps"
          ? { key: "bestAmount", label: `Best working set over time (${info.label.toLowerCase()})`, unit: info.unit }
          : { key: "volume", label: "Working-set volume over time", unit: units() };
      // A session can be missing the chosen series (all-high-rep work has no
      // e1RM) — those are gaps in the line, not zeroes.
      const points = hist.filter((h) => h[series.key] != null).map((h) => ({ date: h.date, value: h[series.key] }));
      chartHost.appendChild(el("p.muted.small", { text: series.label }));
      chartHost.appendChild(lineChart(points, { color: "var(--accent)" }));
      const latest = hist.filter((h) => h[series.key] != null).at(-1), first = hist.filter((h) => h[series.key] != null)[0];
      if (latest && first) {
        const delta = latest[series.key] - first[series.key];
        const top = latest.topWeight ? `top working set ${latest.topWeight}${units()} · ` : "";
        chartHost.appendChild(el("p.muted.small", {
          text: `${points.length} data point${points.length === 1 ? "" : "s"} · ${top}${Math.round(latest[series.key])}${series.unit} ${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))} since start`,
        }));
      }
      if (mv && mv.measure !== "reps") {
        chartHost.appendChild(el("p.muted.tiny", { text: `Measured in ${info.label.toLowerCase()} — no estimated 1RM for this one.` }));
      }
      // A dip the app asked for reads as a dip like any other on a line chart.
      // Name the deloads so a planned reset isn't mistaken for losing ground (#8).
      const deloads = hist.filter((h) => h.deload);
      if (deloads.length) {
        chartHost.appendChild(el("p.muted.tiny", {
          text: `↓ Deload${deloads.length === 1 ? "" : "s"} on ${deloads.map((h) => fmtDate(h.date)).join(", ")} — a planned step back, not a regression.`,
        }));
      }
      // Where the engine currently thinks this lift stands (#8).
      const stall = store.movementStall(select.value);
      if (stall.stalled) {
        chartHost.appendChild(el("p.warn-text.small", {
          text: stall.deloadDue
            ? `⚠️ Stalled ${stall.consecutive} sessions — the next suggestion drops the load ~10% and rebuilds.`
            : "⚠️ No gain last session in reps or load. One more and the app will deload it.",
        }));
      }
    };
    select.addEventListener("change", renderChart);
    progressCard.appendChild(select);
    progressCard.appendChild(chartHost);
    renderChart();
  } else {
    progressCard.appendChild(el("p.muted", { text: "Log a couple sessions and your strength charts will appear here." }));
  }
  view.appendChild(progressCard);

  // Symptom trends
  view.appendChild(sectionTitle("Symptom trends"));
  const symCard = el("div.card");
  SYMPTOMS.filter((s) => !s.invert).forEach((s) => {
    const hist = store.symptomHistory(s.id);
    if (!hist.length) return;
    symCard.appendChild(el("p.muted.small", { text: s.label + " (lower = better)" }));
    symCard.appendChild(lineChart(hist, { color: "var(--warn)", height: 90 }));
  });
  if (!symCard.children.length) symCard.appendChild(el("p.muted", { text: "Symptom trends appear after a few check-ins." }));
  view.appendChild(symCard);

  // Migraine threshold insight
  const mig = store.migraineInsight();
  if (mig.ratedCount >= 1) {
    view.appendChild(sectionTitle("Migraine threshold"));
    const mCard = el("div.card");
    if (mig.enough) {
      mCard.appendChild(el("p", { html: `Sessions that triggered a migraine averaged <strong>${mig.avgVolMigraine.toLocaleString()} ${units()}</strong> of volume; sessions that didn't averaged <strong>${mig.avgVolOk.toLocaleString()} ${units()}</strong>.` }));
      mCard.appendChild(el("p.muted.small", { text: mig.avgVolMigraine > mig.avgVolOk
        ? "Bigger/heavier sessions look like the trigger — we'll keep load under that line and back off when your neck score is up."
        : "No clear volume pattern yet — the trigger may be intensity or something outside the gym (alcohol, sleep). Keep logging." }));
    } else {
      mCard.appendChild(el("p.muted", { text: `Logged ${mig.migraineCount} migraine follow-up${mig.migraineCount === 1 ? "" : "s"} so far. Once there's a mix of yes/no answers, this shows what session load tends to set one off.` }));
    }
    view.appendChild(mCard);
  }

  // Cardio & heart rate (from Watch)
  const cardioMetrics = WATCH_METRICS.filter((m) => store.metricHistory(m.id).length);
  if (cardioMetrics.length) {
    view.appendChild(sectionTitle("Cardio & heart rate"));
    const cCard = el("div.card");
    cardioMetrics.forEach((m) => {
      const hist = store.metricHistory(m.id);
      cCard.appendChild(el("p.muted.small", { text: `${m.label} (${m.unit})` }));
      cCard.appendChild(lineChart(hist, { color: "var(--accent2)", height: 90 }));
    });
    view.appendChild(cCard);
  }

  // Session log
  view.appendChild(sectionTitle("Sessions"));
  sessions.forEach((s) => view.appendChild(sessionSummaryCard(s, true)));

  render(view);
});

// A logged number that almost certainly isn't real (140 × 120 reps) gets one
// tap to correct and one tap to keep. Until it's resolved it stays out of the
// charts, the bests, and the coach report.
function dataCheckCard(flagged) {
  const wrap = el("div.card.data-check");
  wrap.appendChild(el("h3", { text: `⚠︎ ${flagged.length} logged set${flagged.length === 1 ? "" : "s"} to check` }));
  wrap.appendChild(el("p.muted.small", { text: "These look like typos, so they're excluded from your charts and bests until you say otherwise." }));
  flagged.forEach((f) => {
    const info = measureInfo(f.measure);
    const row = el("div.check-row", {}, [
      el("div", {}, [
        el("strong", { text: `${f.name} — ${f.text}` }),
        el("p.muted.tiny", { text: `${fmtDate(f.date)} · set ${f.setIndex + 1}` }),
      ]),
      el("div.check-actions", {}, [
        el("button.btn.ghost.small", { text: "Fix", onclick: async () => {
          const v = await promptDialog(`What was the real number of ${info.short} for ${f.name}?`, {
            value: "", inputmode: info.inputmode, suffix: info.short,
          });
          if (v == null) return;
          store.fixSuspectSet(f.sessionId, f.entryIndex, f.setIndex, v);
          toast("Corrected");
          navigate("history");
        }}),
        el("button.btn.ghost.small", { text: "It's right", onclick: () => {
          store.confirmSuspectSet(f.sessionId, f.entryIndex, f.setIndex);
          toast("Kept as logged");
          navigate("history");
        }}),
      ]),
    ]);
    wrap.appendChild(row);
  });
  return wrap;
}

function sessionSummaryCard(s, withDelete) {
  const totalSets = (s.entries || []).reduce((n, e) => n + (e.sets || []).length, 0);
  const vol = store.sessionVolume(s);
  const painFlags = (s.entries || []).filter((e) => e.pain).length;
  const card = el("div.card.session-card");
  const head = el("div.session-head", {}, [
    el("div", {}, [
      el("strong", { text: s.dayName }),
      el("p.muted.small", { text: `${fmtDate(s.date)} · ${totalSets} sets · ${Math.round(vol).toLocaleString()} ${units()} volume` }),
    ]),
    el("div.session-badges", {}, [
      s.causedMigraine === true ? el("span.pill.migraine", { text: "🤕" }) : null,
      s.symptoms ? severityBar(worstSymptom(s.symptoms), false) : null,
      painFlags ? el("span.pill.warn", { text: `⚠︎ ${painFlags}` }) : null,
    ]),
  ]);
  card.appendChild(head);

  const det = el("details");
  det.appendChild(el("summary.muted.small", { text: "details" }));
  (s.entries || []).forEach((e) => {
    if (!e.sets || !e.sets.length) return;
    const mv = getMovement(e.movementId);
    det.appendChild(el("div.log-line", { title: "↗ ramp-up · ↘ back-off · ✗ failed opener · @n RPE" }, [
      el("span", { text: store.entryName(e) + (e.pain ? " ⚠︎" : "") + (harderSide(e) ? ` (${harderSide(e)} harder)` : "") }),
      el("span.muted.small", { text: e.sets.map((x) => setText(mv, x) + (x.suspect ? " ⚠︎" : "")).join(", ") }),
    ]));
  });
  if (s.metrics && WATCH_METRICS.some((m) => s.metrics[m.id] != null && s.metrics[m.id] !== "")) {
    const parts = WATCH_METRICS.filter((m) => s.metrics[m.id] != null && s.metrics[m.id] !== "")
      .map((m) => `${m.label} ${s.metrics[m.id]}${m.unit === "min" ? "m" : m.unit === "bpm" ? "" : m.unit === "kcal" ? "cal" : ""}`);
    det.appendChild(el("p.muted.small", { text: "⌚ " + parts.join(" · ") }));
  }
  if (s.notes) det.appendChild(el("p.muted.small.note", { text: "“" + s.notes + "”" }));
  if (s.symptoms) {
    const sc = el("div.sym-grid");
    SYMPTOMS.forEach((sym) => {
      if (s.symptoms[sym.id] == null) return;
      sc.appendChild(el("div.sym-cell", {}, [el("span.muted.tiny", { text: sym.label }), severityBar(s.symptoms[sym.id], sym.invert)]));
    });
    det.appendChild(sc);
  }
  if (withDelete) {
    det.appendChild(el("button.btn.ghost.small.danger-text", { text: "Delete session", onclick: async () => {
      if (await confirmDialog("Delete this session permanently?", { okText: "Delete", danger: true })) {
        store.deleteSession(s.id); toast("Deleted"); navigate("history");
      }
    }}));
  }
  card.appendChild(det);
  return card;
}
function worstSymptom(sym) {
  return Math.max(sym.knee || 0, sym.tightness || 0, sym.shoulder || 0, sym.neck || 0);
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
route("settings", () => {
  const p = store.getProfile();
  const st = store.getSettings();
  const view = el("div.view");
  view.appendChild(el("header.subhead", {}, [el("h1.subhead-title", { text: "Settings" })]));

  // profile
  view.appendChild(el("div.card", {}, [
    el("h3", { text: "Profile" }),
    labeledInput("Name", el("input.input", { type: "text", value: p.name || "", oninput: (e) => store.setProfile({ name: e.target.value }) })),
    el("label.field-label", { text: "Units" }),
    el("div.seg", {}, ["lb", "kg"].map((u) => el("button", {
      class: "seg-btn" + (p.units === u ? " active" : ""), text: u,
      onclick: () => { store.setProfile({ units: u }); navigate("settings"); },
    }))),
  ]));

  // bodyweight
  const bw = store.getBodyweight();
  const bwCard = el("div.card", {}, [el("h3", { text: "Bodyweight" })]);
  const bwInput = el("input.input", { type: "number", inputmode: "decimal", placeholder: `Today's weight (${p.units})` });
  bwCard.appendChild(el("div.inline-form", {}, [
    bwInput,
    el("button.btn.primary", { text: "Log", onclick: () => {
      if (bwInput.value) { store.addBodyweight(bwInput.value); toast("Logged"); navigate("settings"); }
    }}),
  ]));
  if (bw.length) {
    bwCard.appendChild(lineChart(bw.map((b) => ({ date: b.date, value: b.weight })), { color: "var(--accent2)", height: 90 }));
    bwCard.appendChild(el("p.muted.small", { text: `Latest: ${bw.at(-1).weight} ${p.units} · ${bw.length} entries` }));
  }
  view.appendChild(bwCard);

  // workout prefs
  const deloadLabel = (n) => n ? `Deload every ${n} trained week${n === 1 ? "" : "s"}` : "Deload weeks: off";
  const deloadState = () => {
    const d = store.deloadStatus();
    if (!d.cadence) return "Nothing scheduled — the app still deloads a lift that stalls twice.";
    return d.due
      ? `You're due one now (${d.reason === "symptoms" ? "symptom load" : "cadence"}).`
      : `${d.streak} week${d.streak === 1 ? "" : "s"} in.`;
  };
  view.appendChild(el("div.card", {}, [
    el("h3", { text: "Workout" }),
    el("label.field-label", { text: `Default rest timer: ${st.restTimerDefault}s` }),
    el("input.slider", { type: "range", min: 30, max: 180, step: 15, value: st.restTimerDefault,
      oninput: (e) => { store.setSettings({ restTimerDefault: Number(e.target.value) }); e.target.previousSibling.textContent = `Default rest timer: ${e.target.value}s`; } }),
    el("label.toggle", {}, [
      el("input", { type: "checkbox", checked: st.sound, onchange: (e) => store.setSettings({ sound: e.target.checked }) }),
      el("span", { text: "Rest-timer sound" }),
    ]),
    el("label.field-label", { text: deloadLabel(st.deloadEveryWeeks) }),
    el("input.slider", { type: "range", min: 0, max: 8, step: 1, value: st.deloadEveryWeeks,
      oninput: (e) => { store.setSettings({ deloadEveryWeeks: Number(e.target.value) }); e.target.previousSibling.textContent = deloadLabel(Number(e.target.value)); } }),
    el("p.muted.tiny", { text: `Counted in weeks you actually trained, so a skipped week is its own rest. ${deloadState()}` }),
  ]));

  // cloud sync
  view.appendChild(cloudCard());

  // coaching bridge
  view.appendChild(el("div.card.coach-card", {}, [
    el("h3", { text: "🧑‍🏫 Coaching with Claude" }),
    el("p.muted.small", { text: "This app is your daily coach and logs everything. Every few weeks — or whenever a lift stalls or something hurts — send Claude your report to get an updated program. That's how the two connect." }),
    el("button.btn.primary", { text: "📋 Coach report", onclick: () => navigate("report") }),
  ]));

  // the return leg of the loop (#11): what the review sends back
  view.appendChild(overridesCard());

  // data
  view.appendChild(el("div.card", {}, [
    el("h3", { text: "Your data" }),
    el("p.muted.small", { text: "Everything is stored only on this device. Export regularly to back up or move to another phone." }),
    el("div.btn-col", {}, [
      el("button.btn.primary", { text: "⬇ Export backup (.json)", onclick: exportBackup }),
      el("button.btn.ghost", { text: "⬆ Import backup", onclick: importBackup }),
      el("button.btn.ghost.danger-text", { text: "Erase all data", onclick: async () => {
        if (await confirmDialog("Erase ALL sessions and settings on this device? This cannot be undone.", { okText: "Erase everything", danger: true })) {
          store.wipe(); toast("Wiped"); navigate("today");
        }
      }}),
    ]),
  ]));

  // about
  view.appendChild(el("div.card.disclaimer", {}, [
    el("h3", { text: "A note on safety" }),
    el("p.muted.small", { text: DISCLAIMER }),
  ]));
  view.appendChild(versionFooter());

  render(view);
});

// The review's corrections coming back in (#11). The report asks Claude to end
// with a block of adjustment lines; this is where they land. Each one steers a
// single movement's NEXT session and then retires itself, so a correction can
// never quietly outlive the evidence it was based on.
function overridesCard() {
  const live = store.getOverrides();
  const ids = Object.keys(live);
  const card = el("div.card", {}, [
    el("h3", { text: "✎ Coach adjustments" }),
    el("p.muted.small", { text: "Paste the adjustment block from your coach report review. One movement per line — \"Barbell Bench Press: 155 x 8 — take the jump\", or \"Barbell Row: clear\" to drop one. Each applies to that lift's next session only." }),
  ]);
  const ta = el("textarea.input.report-input", { rows: 4, placeholder: "Barbell Bench Press: 155 x 8 — you left 3 in the tank" });
  card.appendChild(ta);
  card.appendChild(el("button.btn.primary", { text: "Apply adjustments", onclick: () => {
    const res = store.applyOverrideText(ta.value);
    if (res.errors.length) toast(`Couldn't read: ${res.errors[0]}`);
    else if (!res.applied.length && !res.cleared.length) toast("Nothing to apply");
    else toast(`${res.applied.length} set, ${res.cleared.length} cleared`);
    if (res.applied.length || res.cleared.length) navigate("settings");
  }}));
  if (ids.length) {
    card.appendChild(el("h4.mt", { text: "In effect" }));
    ids.forEach((id) => {
      const ov = live[id];
      card.appendChild(el("div.override-row", {}, [
        el("span.small", {
          text: `${movementName(id, id)} → ${ov.weight == null ? "—" : ov.weight + " " + units()}` +
            (ov.amount == null ? "" : ` × ${ov.amount}`) +
            (ov.engineWeight != null ? ` (app said ${ov.engineWeight})` : ""),
        }),
        ov.note ? el("span.muted.tiny", { text: ov.note }) : null,
        el("button.icon-btn", { html: "✕", title: "Remove", onclick: () => { store.clearOverride(id); navigate("settings"); } }),
      ]));
    });
  } else {
    card.appendChild(el("p.muted.tiny", { text: "None in effect — every suggestion is the app's own." }));
  }
  return card;
}

function versionFooter() {
  const wrap = el("div.version-footer");
  const status = el("span.update-status");
  wrap.appendChild(el("p.muted.tiny.center", {}, [
    `gymtools ${APP_VERSION} · ${BUILD_DATE} · `, status,
  ]));

  // Compare the running version against the freshly-fetched one.
  status.textContent = "checking…";
  fetch("./js/version.js", { cache: "no-store" })
    .then((r) => r.text())
    .then((t) => {
      const m = t.match(/APP_VERSION\s*=\s*"([^"]+)"/);
      const latest = m ? m[1] : null;
      if (!latest) { status.textContent = ""; return; }
      if (latest === APP_VERSION) { status.textContent = "✓ up to date"; }
      else { status.textContent = `update ${latest} available — reopen the app`; status.classList.add("update-avail"); }
    })
    .catch(() => { status.textContent = ""; });

  // Live changelog from the repo's recent commits — loaded only when expanded.
  const details = el("details.card.changelog");
  details.appendChild(el("summary", { text: "Recent changes" }));
  const list = el("div.changelog-list");
  details.appendChild(list);
  let loaded = false;
  details.addEventListener("toggle", () => {
    if (!details.open || loaded) return;
    loaded = true;
    list.appendChild(el("p.muted.small", { text: "Loading…" }));
    fetch("https://api.github.com/repos/timkindberg/gymtools/commits?per_page=15", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http " + r.status))))
      .then((commits) => {
        clear(list);
        commits.forEach((c) => {
          const msg = ((c.commit && c.commit.message) || "").split("\n")[0];
          const date = c.commit && c.commit.author && c.commit.author.date;
          list.appendChild(el("div.change-item", {}, [
            el("span.change-msg", { text: msg }),
            date ? el("span.muted.tiny", { text: relDay(date) }) : null,
          ]));
        });
        if (!commits.length) list.appendChild(el("p.muted.small", { text: "No changes found." }));
      })
      .catch(() => { clear(list); loaded = false; list.appendChild(el("p.muted.small", { text: "Couldn't load recent changes (offline, or GitHub rate-limited)." })); });
  });
  wrap.appendChild(details);
  return wrap;
}

function exportBackup() {
  const blob = new Blob([store.exportData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `gymtools-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Backup downloaded");
}
function importBackup() {
  const input = el("input", { type: "file", accept: "application/json,.json" });
  input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const merge = await confirmDialog("Merge with existing data (keeps both), or replace everything with the file?", { okText: "Merge", cancelText: "Replace" });
      store.importData(text, { merge });
      toast("Imported"); navigate("history");
    } catch (e) { toast("Import failed — invalid file"); }
  });
  input.click();
}

function cloudCard() {
  const card = el("div.card.cloud-card", {}, [el("h3", { text: "☁️ Cloud sync" })]);
  if (!sync.configured()) {
    card.appendChild(el("p.muted.small", { text: "Not configured — running local-only." }));
    return card;
  }
  if (cloudUser) {
    card.appendChild(el("p.muted.small", { html: `Signed in as <strong>${cloudUser.email || "you"}</strong>. Your data backs up and syncs across your devices automatically.` }));
    card.appendChild(el("p.muted.tiny", { text: "Status: " + cloudStatus }));
    card.appendChild(el("div.btn-col", {}, [
      el("button.btn.ghost", { text: "Sync now", onclick: () => mergeWithCloud() }),
      el("button.btn.ghost.danger-text", { text: "Sign out (data stays on this device)", onclick: async () => {
        await sync.signOut(); cloudUser = null; cloudStatus = "local"; cloudView = { email: "", password: "" };
        toast("Signed out"); navigate("settings");
      } }),
    ]));
    return card;
  }
  card.appendChild(el("p.muted.small", { text: "Sign in with an email + password to back up and sync across devices. No confirmation emails — just pick a password you'll remember. Your data stays private (only you can read it)." }));
  const emailInput = el("input.input", { type: "email", inputmode: "email", autocapitalize: "off", autocomplete: "username", placeholder: "you@email.com", value: cloudView.email });
  emailInput.addEventListener("input", (e) => { cloudView.email = e.target.value; });
  const pwInput = el("input.input", { type: "password", autocomplete: "current-password", placeholder: "password (8+ characters)", value: cloudView.password || "" });
  pwInput.addEventListener("input", (e) => { cloudView.password = e.target.value; });
  card.appendChild(emailInput);
  card.appendChild(pwInput);

  const doAuth = async (mode) => {
    const email = (cloudView.email || "").trim();
    const pw = cloudView.password || "";
    if (!email || !pw) { toast("Enter your email and a password"); return; }
    try {
      cloudUser = mode === "signup" ? await sync.signUp(email, pw) : await sync.signInPassword(email, pw);
      cloudView = { email: "", password: "" };
      toast("Signed in ☁️");
      await mergeWithCloud();
      navigate("settings");
    } catch (e) {
      const msg = (e && e.message) || "";
      if (msg === "no-session") toast("Turn off 'Confirm email' in Supabase, then try again.");
      else if (/already/i.test(msg)) toast("That account exists — use Sign in.");
      else if (/invalid|credential/i.test(msg)) toast("Wrong email or password.");
      else toast("Sign-in failed: " + msg);
    }
  };

  card.appendChild(el("div.btn-col", {}, [
    el("button.btn.primary", { text: "Sign in", onclick: () => doAuth("signin") }),
    el("button.btn.ghost.small", { text: "First time here? Create account", onclick: () => doAuth("signup") }),
  ]));
  return card;
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
// Plate math for a barbell total (standard 45 lb bar, symmetric loading).
function statTile(value, label) {
  return el("div.stat-tile", {}, [el("span.stat-value", { text: value }), el("span.stat-label", { text: label })]);
}
function sectionTitle(text) { return el("h2.section-title", { text }); }
function labeledInput(label, input) {
  return el("div.field", {}, [el("label.field-label", { text: label }), input]);
}
function collapsible(title, items, open) {
  const d = el("details.card.collapsible", open ? { open: true } : {});
  d.appendChild(el("summary", { text: title }));
  d.appendChild(el("ul.warm-list", {}, items));
  return d;
}

function render(view) {
  clear(app);
  app.appendChild(view);
}

// ---------------------------------------------------------------------------
// Navigation + boot
// ---------------------------------------------------------------------------
const NAV = [
  { path: "today", label: "Today", icon: "🏠" },
  { path: "program", label: "Program", icon: "📋" },
  { path: "history", label: "Progress", icon: "📈" },
  { path: "settings", label: "Settings", icon: "⚙️" },
];
function buildNav() {
  const nav = document.getElementById("nav");
  clear(nav);
  NAV.forEach((n) => {
    nav.appendChild(el("button", { class: "nav-btn", dataset: { path: n.path }, onclick: () => navigate(n.path) }, [
      el("span.nav-icon", { text: n.icon }),
      el("span.nav-label", { text: n.label }),
    ]));
  });
}
function highlightNav(path) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.path === path || (path === "session" && b.dataset.path === "today"));
  });
}

store.onSave(schedulePush); // push local changes to the cloud when signed in
buildNav();
// Cold start with no route of its own (home-screen icon, a relaunch): pick up
// where you left off — the workout you were mid-way through, at your scroll
// position, or whatever screen you were last reading. A URL that names a
// screen (a link, a bookmark) always wins over the memory.
if (["", "#", "#/"].includes(location.hash)) {
  const back = lastRoute();
  if (back && back !== "today") location.hash = "/" + back;
}
startRouter((path, param) => {
  rememberRoute(path, param);
  highlightNav(path);
  // The rest timer lives outside #app, so make sure it never lingers on a
  // non-workout screen.
  if (path !== "session") {
    const bar = document.getElementById("rest-timer");
    if (bar) bar.classList.remove("active");
    clearInterval(restState.interval);
  }
  prevRoutePath = path;
});

// PWA: register the service worker for offline use, and check for updates
// whenever the app is brought back to the foreground so it stays current.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }).catch((e) => console.warn("SW failed", e));
  });
}

// Kick off cloud sync if the user has signed in before (no-op otherwise).
initCloud();
