// =============================================================================
// app.js — bootstrap, navigation, and all views.
// =============================================================================
import { PROGRAM, PRINCIPLES, DISCLAIMER, SYMPTOMS, WATCH_METRICS, MOBILITY_ROUTINE, FLAG_LABELS, dayForDate } from "./program.js";
import * as store from "./store.js";
import {
  el, clear, fmtDate, fmtDateTime, relDay, lineChart, severityBar,
  route, startRouter, navigate, toast, confirmDialog,
} from "./ui.js";

const app = document.getElementById("app");
const units = () => store.getProfile().units;

// ---------------------------------------------------------------------------
// TODAY
// ---------------------------------------------------------------------------
route("today", () => {
  const today = new Date();
  const sessions = store.getSessions();
  const day = dayForDate(today, sessions);
  const draft = store.loadDraft();
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
  planCard.appendChild(el("div.today-badge", { text: day.optional ? `Day ${day.id} · bonus` : `Day ${day.id}` }));
  planCard.appendChild(el("h2", { text: day.name.replace(/^Day [A-C] — /, "") }));
  planCard.appendChild(el("p.muted", { text: day.focus }));
  if (day.optional && day.note) planCard.appendChild(el("p.optional-note", { text: "🎈 " + day.note }));
  const preview = el("ul.today-list");
  day.exercises.slice(0, 6).forEach((e) =>
    preview.appendChild(el("li", {}, [
      el("span", { text: e.name }),
      el("span.muted.small", { text: `${e.sets}×${e.reps}` }),
    ])));
  if (day.exercises.length > 6) preview.appendChild(el("li.muted", { text: `+ ${day.exercises.length - 6} more…` }));
  planCard.appendChild(preview);
  planCard.appendChild(el("div.today-actions", {}, [
    el("button.btn.primary.big", { text: draft ? "Resume workout" : "Start workout", onclick: () => startOrResume(day) }),
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

function startOrResume(day) {
  const draft = store.loadDraft();
  if (!draft) {
    const newDraft = {
      date: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      dayId: day.id,
      dayName: day.name,
      symptoms: {},
      symptomsDone: false,
      metrics: {},
      entries: day.exercises.map((e) => ({
        exerciseId: e.id,
        name: e.name,
        sets: Array.from({ length: e.sets }, () => ({ weight: null, reps: null, done: false })),
        pain: false,
        note: "",
      })),
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
  const totalVol = sessions.slice(0, 8).reduce((sum, s) =>
    sum + (s.entries || []).reduce((v, e) =>
      v + (e.sets || []).reduce((vv, x) => vv + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0), 0);
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
        store.clearDraft(); navigate("today");
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

  // Exercises
  day.exercises.forEach((exDef, idx) => {
    view.appendChild(exerciseCard(exDef, draft, idx));
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
      el("p.field-label", { text: `Did a migraine follow your last workout? (${prev.dayName.replace(/^Day [A-C] — /, "")}, ${fmtDate(prev.date)})` }),
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

function exerciseCard(exDef, draft, idx) {
  const entry = draft.entries.find((e) => e.exerciseId === exDef.id);
  const card = el("div.card.exercise");

  const topRep = parseInt(String(exDef.reps).split(/[–-]/).pop(), 10) || 10;
  const sugg = store.suggestion(exDef.id, topRep);
  const last = store.lastPerformance(exDef.id);

  // Variety swap: cycle through the main lift + its listed alternatives
  const displayName = entry.variant || exDef.name;
  const swapOptions = [exDef.name, ...(exDef.alternatives || [])];
  const doSwap = () => {
    const cur = entry.variant || exDef.name;
    const next = swapOptions[(swapOptions.indexOf(cur) + 1) % swapOptions.length];
    entry.variant = next === exDef.name ? null : next;
    store.saveDraft(draft);
    navigate("session");
  };

  // Header
  const head = el("div.exercise-head", {}, [
    el("div.exercise-idx", { text: String(idx + 1) }),
    el("div.exercise-title", {}, [
      el("div.title-row", {}, [
        el("h3", { text: displayName }),
        exDef.ss ? el("span.ss-badge", { text: "⇄ superset " + exDef.ss }) : null,
        exDef.learn ? el("span.learn-badge", { text: "🎥 technique" }) : null,
      ]),
      el("p.muted.small", { text: `${exDef.target} · ${exDef.sets}×${exDef.reps} · RPE ${exDef.rpe} · rest ${exDef.rest}` }),
      entry.variant ? el("p.variant-note.tiny", { text: "swapped from " + exDef.name }) : null,
    ]),
    el("div.exercise-actions", {}, [
      swapOptions.length > 1 ? el("button.icon-btn", { html: "🎲", title: "Swap for variety", onclick: doSwap }) : null,
      el("a.icon-btn", { html: "▶", title: "How-to video",
        href: "https://www.youtube.com/results?search_query=" + encodeURIComponent("how to " + displayName + " proper form"),
        target: "_blank", rel: "noopener" }),
    ]),
  ]);
  card.appendChild(head);

  if (exDef.ss) {
    card.appendChild(el("p.ss-hint.muted.tiny", { text: `Optional superset (${exDef.ss}) — pair with the other ⇄ ${exDef.ss} move if you can keep both, otherwise just do straight sets.` }));
  }

  // Coaching (why + cues + flags)
  const coach = el("details.coach");
  coach.appendChild(el("summary", { text: "Coach's notes" }));
  if (exDef.why) coach.appendChild(el("p.why", { text: exDef.why }));
  if (exDef.cues && exDef.cues.length) coach.appendChild(el("ul.cues", {}, exDef.cues.map((c) => el("li", { text: c }))));
  if (exDef.techNote) coach.appendChild(el("p.barbell-note.small", { text: "🎥 " + exDef.techNote }));
  if (exDef.flags && exDef.flags.length) {
    coach.appendChild(el("div.flags", {}, exDef.flags.map((f) => el("span.flag", { text: FLAG_LABELS[f] || f }))));
  }
  if (exDef.alternatives && exDef.alternatives.length) {
    coach.appendChild(el("p.muted.small", { text: "Swaps (or hit 🎲): " + exDef.alternatives.join(" · ") }));
  }
  card.appendChild(coach);

  // Last time / suggestion
  if (last) {
    const setStr = last.sets.filter((s) => s.weight != null).map((s) => `${s.weight}×${s.reps}`).join(", ");
    card.appendChild(el("div.lasttime", {}, [
      el("span.muted.small", { text: `Last (${relDay(last.date)}): ${setStr || "—"}` }),
      sugg ? el("span.sugg", { text: "🎯 " + sugg.note }) : null,
    ]));
  } else {
    // No history yet — coach the first-time weight pick, since we can't suggest one.
    const hint = exDef.start != null
      ? `🎯 Suggested start: ${exDef.start} ${units()}. Adjust so you stop around ${topRep} reps with the last one or two feeling hard. From next session I'll suggest the load.`
      : `🎯 First time on this one — pick a weight you could do about ${topRep + 2} reps with, and stop at ${topRep}. The last rep or two should feel genuinely hard. From next session I'll suggest the load.`;
    card.appendChild(el("div.lasttime", {}, [el("span.sugg", { text: hint })]));
  }

  // Set rows
  const setsWrap = el("div.sets");
  setsWrap.appendChild(el("div.set-row.set-header", {}, [
    el("span.set-col", { text: "Set" }),
    el("span.set-col", { text: units() }),
    el("span.set-col", { text: "Reps" }),
    el("span.set-col", { text: "✓" }),
  ]));
  // What to show as the weight placeholder: the progression suggestion if we
  // have history, otherwise a coached starting weight if one is defined.
  const startWeight = sugg ? sugg.weight : (exDef.start != null ? exDef.start : null);
  entry.sets.forEach((setData, si) => {
    setsWrap.appendChild(setRow(entry, setData, si, draft, startWeight));
  });
  card.appendChild(setsWrap);

  // Barbell plate helper: live breakdown of what to load, off a 45 lb bar.
  if (/barbell/i.test(displayName)) {
    const plateNote = el("div.plate-note");
    const draw = (w) => {
      const b = plateBreakdown(w, 45);
      plateNote.textContent = b ? `🏋️ ${Math.round(Number(w))} lb → ${b.text}` : "🏋️ enter a weight for the plate math";
    };
    const firstW = setsWrap.querySelector(".set-input");
    draw((firstW && firstW.value) ? firstW.value : startWeight);
    if (firstW) firstW.addEventListener("input", (e) => draw(e.target.value || startWeight));
    card.insertBefore(plateNote, setsWrap);
  }

  // add/remove set + pain toggle
  card.appendChild(el("div.set-tools", {}, [
    el("button.btn.ghost.small", { text: "+ set", onclick: () => {
      entry.sets.push({ weight: entry.sets.at(-1)?.weight ?? null, reps: null, done: false });
      store.saveDraft(draft); navigate("session");
    }}),
    entry.sets.length > 1 ? el("button.btn.ghost.small", { text: "– set", onclick: () => {
      entry.sets.pop(); store.saveDraft(draft); navigate("session");
    }}) : null,
    el("label.pain-toggle", {}, [
      el("input", { type: "checkbox", checked: entry.pain, onchange: (e) => { entry.pain = e.target.checked; store.saveDraft(draft); e.target.closest(".exercise").classList.toggle("has-pain", e.target.checked); } }),
      el("span", { text: "⚠︎ Pain / issue on this one" }),
    ]),
  ]));
  if (entry.pain) card.classList.add("has-pain");

  // per-exercise note
  const noteBox = el("input.input.note-input", {
    type: "text", placeholder: "note (optional)", value: entry.note || "",
    oninput: (e) => { entry.note = e.target.value; store.saveDraft(draft); },
  });
  card.appendChild(noteBox);

  return card;
}

function setRow(entry, setData, si, draft, phWeight) {
  const row = el("div.set-row");
  row.appendChild(el("span.set-col.set-num", { text: String(si + 1) }));
  const wInput = el("input.set-input", {
    type: "number", inputmode: "decimal", placeholder: phWeight != null ? String(phWeight) : "–", value: setData.weight ?? "",
    oninput: (e) => { setData.weight = e.target.value === "" ? null : Number(e.target.value); store.saveDraft(draft); },
  });
  const rInput = el("input.set-input", {
    type: "number", inputmode: "numeric", placeholder: "–", value: setData.reps ?? "",
    oninput: (e) => { setData.reps = e.target.value === "" ? null : Number(e.target.value); store.saveDraft(draft); },
  });
  row.appendChild(el("span.set-col", {}, [wInput]));
  row.appendChild(el("span.set-col", {}, [rInput]));
  const check = el("button.set-check", { html: setData.done ? "✓" : "", "aria-label": "mark set done" });
  if (setData.done) check.classList.add("on");
  check.addEventListener("click", () => {
    setData.done = !setData.done;
    check.classList.toggle("on", setData.done);
    check.innerHTML = setData.done ? "✓" : "";
    // autofill blanks from placeholder-ish previous set
    if (setData.done && setData.reps == null && si > 0) {
      const prev = entry.sets[si - 1];
      if (prev.reps != null) { setData.reps = prev.reps; rInput.value = prev.reps; }
      if (setData.weight == null && prev.weight != null) { setData.weight = prev.weight; wInput.value = prev.weight; }
    }
    store.saveDraft(draft);
    if (setData.done) startRest();
  });
  row.appendChild(el("span.set-col", {}, [check]));
  return row;
}

function warmItem(w) {
  return el("li.warm-item", {}, [
    el("span.warm-name", { text: w.name }),
    el("span.muted.small", { text: w.detail }),
  ]);
}

async function finishSession(draft, day) {
  const logged = draft.entries.some((e) => e.sets.some((s) => s.weight != null || s.reps != null || s.done));
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
    entries: draft.entries.map((e) => ({
      exerciseId: e.exerciseId, name: e.name, variant: e.variant || null, pain: e.pain, note: e.note,
      sets: e.sets.filter((s) => s.weight != null || s.reps != null),
    })),
    notes: draft.notes,
  };
  store.addSession(session);
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
  ]));
  view.appendChild(collapsible("🔥 Warm-up", day.warmup.map(warmItem), false));
  day.exercises.forEach((e, i) => view.appendChild(programExercise(e, i)));
  view.appendChild(collapsible("🧘 Cool-down", day.cooldown.map(warmItem), false));

  render(view);
});

function dayScheduleLabel(day) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `Scheduled: ${names[day.dow]} · ~60 min`;
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
  if (/barbell/i.test(e.name) && e.start != null) {
    const b = plateBreakdown(e.start, 45);
    if (b) card.appendChild(el("div.plate-note", { text: `🏋️ Start ${e.start} lb → ${b.text}` }));
  }
  if (e.flags && e.flags.length) card.appendChild(el("div.flags", {}, e.flags.map((f) => el("span.flag", { text: FLAG_LABELS[f] || f }))));
  if (e.alternatives && e.alternatives.length) card.appendChild(el("p.muted.small", { text: "Swaps: " + e.alternatives.join(" · ") }));
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

  // Progress explorer (pick an exercise)
  view.appendChild(sectionTitle("Exercise progress"));
  const allEx = [];
  const seen = new Set();
  PROGRAM.days.forEach((d) => d.exercises.forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); allEx.push(e); } }));
  const withData = allEx.filter((e) => store.exerciseHistory(e.id).length > 0);
  const progressCard = el("div.card");
  if (withData.length) {
    const select = el("select.input", {}, withData.map((e) => el("option", { value: e.id, text: e.name })));
    const chartHost = el("div.chart-host");
    const renderChart = () => {
      clear(chartHost);
      const hist = store.exerciseHistory(select.value);
      chartHost.appendChild(el("p.muted.small", { text: "Estimated 1-rep-max over time" }));
      chartHost.appendChild(lineChart(hist.map((h) => ({ date: h.date, value: h.e1rm })), { color: "var(--accent)" }));
      const latest = hist.at(-1), first = hist[0];
      if (latest && first) {
        const delta = latest.e1rm - first.e1rm;
        chartHost.appendChild(el("p.muted.small", { text: `${hist.length} data points · top set ${latest.topWeight}${units()} · est 1RM ${latest.e1rm}${units()} ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} since start` }));
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

function sessionSummaryCard(s, withDelete) {
  const totalSets = (s.entries || []).reduce((n, e) => n + (e.sets || []).length, 0);
  const vol = (s.entries || []).reduce((v, e) => v + (e.sets || []).reduce((vv, x) => vv + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0);
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
    det.appendChild(el("div.log-line", {}, [
      el("span", { text: (e.variant || e.name) + (e.pain ? " ⚠︎" : "") }),
      el("span.muted.small", { text: e.sets.map((x) => `${x.weight ?? "–"}×${x.reps ?? "–"}`).join(", ") }),
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
  view.appendChild(el("div.card", {}, [
    el("h3", { text: "Workout" }),
    el("label.field-label", { text: `Default rest timer: ${st.restTimerDefault}s` }),
    el("input.slider", { type: "range", min: 30, max: 180, step: 15, value: st.restTimerDefault,
      oninput: (e) => { store.setSettings({ restTimerDefault: Number(e.target.value) }); e.target.previousSibling.textContent = `Default rest timer: ${e.target.value}s`; } }),
    el("label.toggle", {}, [
      el("input", { type: "checkbox", checked: st.sound, onchange: (e) => store.setSettings({ sound: e.target.checked }) }),
      el("span", { text: "Rest-timer sound" }),
    ]),
  ]));

  // coaching bridge
  view.appendChild(el("div.card.coach-card", {}, [
    el("h3", { text: "🧑‍🏫 Coaching with Claude" }),
    el("p.muted.small", { text: "This app is your daily coach and logs everything. Every few weeks — or whenever a lift stalls or something hurts — send Claude your report to get an updated program. That's how the two connect." }),
    el("button.btn.primary", { text: "📋 Coach report", onclick: () => navigate("report") }),
  ]));

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
  view.appendChild(el("p.muted.tiny.center", { text: "gymtools · a personal training PWA · built for Tim" }));

  render(view);
});

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

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
// Plate math for a barbell total (standard 45 lb bar, symmetric loading).
function plateBreakdown(total, bar = 45) {
  const t = Number(total);
  if (!t || t <= 0) return null;
  if (t < bar) return { text: `lighter than the empty ${bar} lb bar` };
  if (t === bar) return { text: `just the empty ${bar} lb bar` };
  let rem = (t - bar) / 2;
  const plates = [45, 35, 25, 10, 5, 2.5];
  const used = [];
  for (const p of plates) {
    while (rem >= p - 1e-9) { used.push(p); rem = Math.round((rem - p) * 100) / 100; }
  }
  const sideStr = used.length ? used.join(" + ") : "0";
  const short = rem > 0.01 ? ` (+${rem} short — nearest below)` : "";
  return { text: `${bar} bar + ${sideStr} per side${short}` };
}

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

buildNav();
startRouter((path) => {
  highlightNav(path);
  // The rest timer lives outside #app, so make sure it never lingers on a
  // non-workout screen.
  if (path !== "session") {
    const bar = document.getElementById("rest-timer");
    if (bar) bar.classList.remove("active");
    clearInterval(restState.interval);
  }
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
