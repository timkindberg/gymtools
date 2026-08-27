// =============================================================================
// store.js — all persistence. Single localStorage key holding one JSON blob.
// Data lives on THIS device only, so export/import is how you back up & move.
// =============================================================================

import { getMovement, resolveMovementId, movementName } from "./movements.js";
import {
  setAmount, setLoad, isLogged, estimate1RM, setVolume,
  formatSet, staticWarnings, measureInfo, prescriptionFor,
} from "./measures.js";
import { applyInferredRoles, workingSets, rampSets, topWorkingLoad, failedSets } from "./sets.js";
import { workingEffort, effortVerdict, effortLabel, rirFromRpe, harderSideLabel } from "./effort.js";
import { allExercises } from "./program.js";

const KEY = "gymtools.v1";
const DRAFT_KEY = "gymtools.draft.v1";

// Bump when the shape of a stored session changes, and add a step to
// MIGRATIONS. Steps run in order, are idempotent, and never drop data.
export const DATA_VERSION = 5;

const DEFAULT_DATA = {
  version: DATA_VERSION,
  profile: {
    name: "Tim",
    units: "lb", // "lb" | "kg"
    createdAt: new Date().toISOString(),
  },
  sessions: [],      // completed workout sessions
  bodyweight: [],    // { date, weight }
  settings: {
    restTimerDefault: 90, // seconds
    sound: true,
  },
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? migrate(JSON.parse(raw)) : clone(DEFAULT_DATA);
  } catch (e) {
    console.error("Failed to load data, starting fresh", e);
    cache = clone(DEFAULT_DATA);
  }
  return cache;
}

// The (exerciseId → movement slug) mapping as it stood when history was first
// attributed. FROZEN: the program's slots get re-pointed at new movements over
// time, and old sessions must keep the movement they were actually performed
// with. Never edit an existing line here — only append new slots.
const LEGACY_SLOT_MOVEMENTS = Object.freeze({
  a1: "barbell-box-squat",
  a2: "barbell-bench-press",
  a3: "chest-supported-db-row",
  a4: "db-reverse-lunge",
  a5: "face-pull",
  a6: "pallof-press-half-kneeling",
  b1: "barbell-rdl",
  b2: "lat-pulldown",
  b3: "db-shoulder-press-seated",
  b4: "single-leg-leg-press",
  b5: "seated-leg-curl",
  b6: "cable-external-rotation",
  b7: "suitcase-carry",
  c1: "barbell-hip-thrust",
  c2: "db-lateral-lunge",
  c3: "db-row-single-arm",
  c4: "single-leg-db-rdl",
  c5: "incline-db-curl",
  c6: "triceps-rope-pushdown",
  c7: "side-plank",
});

// v1 → v2: give every entry a movement identity.
// Until now history keyed on the program SLOT, so a 🎲 swap handed the next
// session another implement's weight (issue #2). The swapped movement was
// always in the data as a display string — we just never read it.
function migrateEntriesToMovements(data) {
  for (const session of data.sessions || []) {
    for (const entry of session.entries || []) {
      if (entry.movementId) continue;
      // Order matters. An explicit swap wins; after that the name the entry
      // recorded beats the slot map, because THAT is what the app showed him on
      // the day. Slots get re-pointed at new movements over time — b3 has been
      // an incline press and a shoulder press — so the map is only the last
      // resort, for entries whose recorded name no longer resolves.
      const fromVariant = resolveMovementId(entry.variant);
      const slug = fromVariant || resolveMovementId(entry.name) || LEGACY_SLOT_MOVEMENTS[entry.exerciseId];
      entry.movementId = slug || null;
      // `variant` becomes a slug too. Anything we can't place keeps its
      // original text in variantName so nothing is silently lost.
      if (entry.variant) {
        if (fromVariant) entry.variant = fromVariant;
        else { entry.variantName = entry.variant; entry.variant = null; }
      }
      stampEntryMeasure(entry);
    }
  }
}

// What was asked of this entry. Sessions record their own prescription from
// here on; older ones fall back to what the slot prescribes today, which is the
// best available reading of a range nobody wrote down at the time.
export function entryPrescription(entry) {
  if (entry && entry.prescription && entry.prescription.measure) return entry.prescription;
  const slot = allExercises().find((e) => e.id === (entry && entry.exerciseId)) || null;
  return prescriptionFor(slot, getMovement(entry && entry.movementId));
}

// v2 → v3: classify each logged set as ramp-up / working / back-off (issue #3).
function migrateSetRoles(data) {
  for (const session of data.sessions || []) {
    for (const entry of session.entries || []) {
      applyInferredRoles(entry.sets || [], entryPrescription(entry));
    }
  }
}

// v3 → v4: typed measures (issue #4). The second column stops being "reps" for
// everything and becomes `amount`, read in the movement's own unit. Anything
// implausible is flagged for review rather than quietly kept — the 140 × 120
// hip-thrust typo put a 700 lb estimated 1RM in the chart.
function migrateTypedMeasures(data) {
  for (const session of data.sessions || []) {
    for (const entry of session.entries || []) {
      stampEntryMeasure(entry);
      const mv = getMovement(entry.movementId);
      for (const set of entry.sets || []) {
        if (set.amount == null && set.reps != null) set.amount = Number(set.reps);
        delete set.reps;
        if (set.confirmed || set.suspect) continue;
        const warn = staticWarnings(mv, set)[0];
        if (warn) set.suspect = warn.code;
      }
    }
  }
}

// v4 → v5: record what was prescribed, and re-read the set roles with it.
// Knowing the rep range is what separates a top set he FAILED out of from one
// he finished before deliberately dropping the weight — a distinction the load
// sequence alone can't make once there's a ramp in front of it.
function migrateStampPrescriptions(data) {
  for (const session of data.sessions || []) {
    for (const entry of session.entries || []) {
      entry.prescription = entryPrescription(entry);
      applyInferredRoles(entry.sets || [], entry.prescription);
    }
  }
}

const MIGRATIONS = [
  migrateEntriesToMovements, // → 2
  migrateSetRoles,           // → 3
  migrateTypedMeasures,      // → 4
  migrateStampPrescriptions, // → 5
];

// Denormalize how the entry was measured onto the entry itself, so a session
// logged years ago still reads correctly if the registry later changes.
function stampEntryMeasure(entry) {
  const mv = getMovement(entry.movementId);
  if (!mv) return entry;
  if (!entry.measure) entry.measure = mv.measure;
  if (!entry.loadMode) entry.loadMode = mv.loadMode;
  return entry;
}

function migrate(data) {
  // Fill in any missing top-level fields from defaults (forward-compatible).
  const merged = { ...clone(DEFAULT_DATA), ...data };
  merged.profile = { ...DEFAULT_DATA.profile, ...(data.profile || {}) };
  merged.settings = { ...DEFAULT_DATA.settings, ...(data.settings || {}) };
  merged.sessions = data.sessions || [];
  merged.bodyweight = data.bodyweight || [];

  // Run every step this blob hasn't seen yet. Steps are idempotent, so a blob
  // arriving from cloud sync at an unknown version is safe to re-run.
  const from = Number(data.version) || 1;
  for (let v = from; v < DATA_VERSION; v++) {
    const step = MIGRATIONS[v - 1];
    if (step) step(merged);
  }
  merged.version = DATA_VERSION;
  return merged;
}

// Drafts predate the current shape too — a workout can be in progress across an
// app update. Same treatment, minus the frozen slot map: a draft is from today,
// so the live program is the right source for its movement identities.
function migrateDraft(draft, program) {
  if (!draft || !draft.entries) return draft;
  for (const entry of draft.entries) {
    if (!entry.movementId) {
      const slot = program && program.find((e) => e.id === entry.exerciseId);
      entry.movementId = resolveMovementId(entry.variant) || (slot && slot.movement) || resolveMovementId(entry.name) || null;
      if (entry.variant) {
        const slug = resolveMovementId(entry.variant);
        if (slug) entry.variant = slug;
        else { entry.variantName = entry.variant; entry.variant = null; }
      }
    }
    stampEntryMeasure(entry);
    for (const set of entry.sets || []) {
      if (set.amount == null && set.reps != null) set.amount = Number(set.reps);
      delete set.reps;
    }
    if (!entry.prescription) {
      const slot = program && program.find((e) => e.id === entry.exerciseId);
      entry.prescription = prescriptionFor(slot || null, getMovement(entry.movementId));
    }
    applyInferredRoles(entry.sets || [], entry.prescription);
  }
  return draft;
}

let saveHook = null;
// Register a callback fired after every local save (used by cloud sync to push).
export function onSave(fn) { saveHook = fn; }

export function save() {
  if (!cache) return;
  cache.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(cache));
  if (saveHook) { try { saveHook(); } catch (e) { /* ignore */ } }
}

export function getUpdatedAt() { return load().updatedAt || null; }

// Overwrite local data with a remote snapshot WITHOUT bumping the timestamp or
// firing the save hook (so pulling doesn't echo back as a push).
export function applyRemote(data) {
  cache = migrate(data);
  localStorage.setItem(KEY, JSON.stringify(cache));
}

export function getProfile() { return load().profile; }
export function setProfile(patch) {
  const d = load();
  d.profile = { ...d.profile, ...patch };
  save();
}
export function getSettings() { return load().settings; }
export function setSettings(patch) {
  const d = load();
  d.settings = { ...d.settings, ...patch };
  save();
}

export function getSessions() {
  return load().sessions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function addSession(session) {
  const d = load();
  session.id = session.id || cryptoId();
  d.sessions.push(session);
  save();
  clearDraft();
  return session;
}

export function deleteSession(id) {
  const d = load();
  d.sessions = d.sessions.filter((s) => s.id !== id);
  save();
}

export function updateSession(id, patch) {
  const d = load();
  const s = d.sessions.find((x) => x.id === id);
  if (s) { Object.assign(s, patch); save(); }
  return s;
}

// The most recent completed session (used for the "migraine after last?" prompt).
export function lastSession() {
  return getSessions()[0] || null;
}

// Tonnage for a session — every set that moved a load, ramp-ups included, since
// this is "how taxing was that session" rather than a progression signal. Only
// loaded rep work counts: seconds and yards have no business being summed into
// a pounds total, and a set flagged as a typo would swamp the number (issue #4).
export function sessionVolume(s) {
  return (s.entries || []).reduce((v, e) => {
    const mv = getMovement(e.movementId);
    return v + (e.sets || []).reduce((vv, x) => vv + (x.suspect ? 0 : setVolume(mv, x)), 0);
  }, 0);
}

// Compare training load of sessions that triggered a migraine vs. those that
// didn't — surfaces Tim's personal "too taxing" threshold once there's data.
export function migraineInsight() {
  const rated = getSessions().filter((s) => s.causedMigraine === true || s.causedMigraine === false);
  const hit = rated.filter((s) => s.causedMigraine === true);
  const ok = rated.filter((s) => s.causedMigraine === false);
  if (hit.length === 0 || ok.length === 0) {
    return { enough: false, migraineCount: hit.length, ratedCount: rated.length };
  }
  const avg = (arr) => Math.round(arr.reduce((a, s) => a + sessionVolume(s), 0) / arr.length);
  return {
    enough: true,
    migraineCount: hit.length,
    ratedCount: rated.length,
    avgVolMigraine: avg(hit),
    avgVolOk: avg(ok),
  };
}

// ---- Bodyweight ------------------------------------------------------------
export function getBodyweight() {
  return load().bodyweight.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
}
export function addBodyweight(weight, date) {
  const d = load();
  const day = (date || new Date().toISOString()).slice(0, 10);
  d.bodyweight = d.bodyweight.filter((b) => b.date.slice(0, 10) !== day);
  d.bodyweight.push({ date: date || new Date().toISOString(), weight: Number(weight) });
  save();
}

// ---- Draft (in-progress session, survives refresh) -------------------------
export function saveDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* ignore */ }
}
export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return migrateDraft(JSON.parse(raw), allExercises());
  } catch (e) { return null; }
}
export function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

// ---- History helpers -------------------------------------------------------
// Everything here keys on the MOVEMENT, not the program slot. Log a Barbell
// Incline Press in the shoulder-press slot and it builds incline-press history;
// the slot only decides what's programmed today (issue #2).

function entriesFor(session, movementId) {
  return (session.entries || []).filter((e) => e.movementId === movementId);
}

export function entryMovement(entry) {
  return getMovement(entry && entry.movementId);
}

// What to call an entry on screen: the movement it actually was, falling back
// to whatever text the entry was saved with.
export function entryName(entry) {
  if (!entry) return "";
  return movementName(entry.movementId, entry.variantName || entry.name || entry.movementId || "");
}

// Sets with something actually written in them. Takes the array, not the entry.
export function loggedSets(sets) {
  return (sets || []).filter(isLogged);
}

// Most recent session in which this movement was performed.
export function lastPerformance(movementId) {
  if (!movementId) return null;
  for (const s of getSessions()) {
    for (const entry of entriesFor(s, movementId)) {
      if (loggedSets(entry.sets).length) return { date: s.date, sets: entry.sets, entry };
    }
  }
  return null;
}

// What was last done in this SLOT, whatever movement that was. Used only for
// context ("last Wednesday you did Barbell Incline Press here"), never to
// suggest a load.
export function lastPerformanceInSlot(exerciseId) {
  for (const s of getSessions()) {
    for (const entry of s.entries || []) {
      if (entry.exerciseId === exerciseId && loggedSets(entry.sets).length) {
        return { date: s.date, sets: entry.sets, entry, movementId: entry.movementId };
      }
    }
  }
  return null;
}

// Time series for one movement, working sets only. e1rm is null whenever Epley
// doesn't apply (carries, planks, assisted work, 15+ rep sets) — those chart
// their volume or their best time/distance instead.
export function movementHistory(movementId) {
  const mv = getMovement(movementId);
  const out = [];
  for (const s of getSessions().slice().reverse()) {
    let vol = 0, bestE1rm = 0, topWeight = 0, bestAmount = 0, sets = 0, flagged = 0;
    const counted = [];
    for (const entry of entriesFor(s, movementId)) {
      for (const set of workingSets(loggedSets(entry.sets))) {
        // A set flagged as a probable typo stays out of the trend until it is
        // either corrected or confirmed — one 140 × 120 ruins the whole line.
        if (set.suspect) { flagged++; continue; }
        sets++;
        counted.push(set);
        vol += setVolume(mv, set);
        const w = setLoad(set) || 0, a = setAmount(set) || 0;
        if (w > topWeight) topWeight = w;
        if (a > bestAmount) bestAmount = a;
        const e1 = estimate1RM(mv, set);
        if (e1 && e1 > bestE1rm) bestE1rm = e1;
      }
    }
    if (!sets) { if (flagged) out.push({ date: s.date, sets: 0, flagged, volume: 0, topWeight: 0, bestAmount: 0, e1rm: null, rpe: null, measure: (mv && mv.measure) || "reps" }); continue; }
    // How hard it was (#5) — optional, and null until he logs it.
    const effort = workingEffort(counted);
    out.push({
      date: s.date,
      sets,
      flagged,
      volume: Math.round(vol),
      topWeight,
      bestAmount,
      e1rm: bestE1rm ? Math.round(bestE1rm) : null,
      rpe: effort ? effort.rpe : null,
      measure: (mv && mv.measure) || "reps",
    });
  }
  return out;
}

// ---- Harder side (#6) -------------------------------------------------------
// One tap per exercise: which side gave out first. Per movement, how often each
// side was flagged and out of how many sessions — a side flagged once is a bad
// day, a side flagged every time is the asymmetry the program exists to fix.
export function harderSideReport() {
  const out = [];
  for (const id of loggedMovementIds()) {
    let L = 0, R = 0, total = 0, date = null;
    for (const s of getSessions().slice().reverse()) {
      for (const entry of entriesFor(s, id)) {
        if (!loggedSets(entry.sets).length) continue;
        total++;
        if (entry.harderSide === "L") { L++; date = s.date; }
        else if (entry.harderSide === "R") { R++; date = s.date; }
      }
    }
    if (!L && !R) continue;
    const side = L >= R ? "L" : "R";
    out.push({
      movementId: id, name: movementName(id, id), side,
      flagged: Math.max(L, R), total, date, mixed: L > 0 && R > 0,
    });
  }
  return out;
}

// Every movement with logged history, newest activity first.
export function loggedMovementIds() {
  const seen = [];
  for (const s of getSessions()) {
    for (const entry of s.entries || []) {
      if (entry.movementId && !seen.includes(entry.movementId) && loggedSets(entry.sets).length) {
        seen.push(entry.movementId);
      }
    }
  }
  return seen;
}

// Personal bests, used to sanity-check a freshly typed number against what this
// movement has ever actually seen.
export function movementBests(movementId) {
  let maxLoad = 0, maxAmount = 0;
  for (const s of getSessions()) {
    for (const entry of entriesFor(s, movementId)) {
      for (const set of loggedSets(entry.sets)) {
        if (set.suspect) continue; // don't let a typo raise the bar
        maxLoad = Math.max(maxLoad, setLoad(set) || 0);
        maxAmount = Math.max(maxAmount, setAmount(set) || 0);
      }
    }
  }
  return { maxLoad, maxAmount };
}

// Estimated 1-rep-max (Epley). Purely informational; we never test true maxes.
export { epley, canEstimate1RM } from "./measures.js";

// ---- Sets flagged for review ------------------------------------------------
// A number that can't be right shouldn't quietly become history. These surface
// in the app with a one-tap fix or "no, that's right" (issue #4).

export function suspectSets() {
  const out = [];
  for (const s of getSessions()) {
    (s.entries || []).forEach((entry, entryIndex) => {
      (entry.sets || []).forEach((set, setIndex) => {
        if (!set.suspect) return;
        out.push({
          sessionId: s.id, date: s.date, entryIndex, setIndex,
          movementId: entry.movementId, name: entryName(entry),
          measure: entry.measure || "reps", code: set.suspect,
          text: formatSet(getMovement(entry.movementId), set),
        });
      });
    });
  }
  return out;
}

function withSuspectSet(sessionId, entryIndex, setIndex, fn) {
  const d = load();
  const session = d.sessions.find((x) => x.id === sessionId);
  const entry = session && (session.entries || [])[entryIndex];
  const set = entry && (entry.sets || [])[setIndex];
  if (!set) return null;
  fn(set, entry);
  save();
  return set;
}

// Correct a flagged value (the 140 × 120 that should have been 140 × 12).
export function fixSuspectSet(sessionId, entryIndex, setIndex, amount) {
  return withSuspectSet(sessionId, entryIndex, setIndex, (set, entry) => {
    set.amount = Number(amount);
    delete set.suspect;
    applyInferredRoles(entry.sets || [], entryPrescription(entry));
  });
}

// "Yes, that really happened" — keep the value, stop asking.
export function confirmSuspectSet(sessionId, entryIndex, setIndex) {
  return withSuspectSet(sessionId, entryIndex, setIndex, (set) => {
    set.confirmed = true;
    delete set.suspect;
  });
}

// ---- Suggestion -------------------------------------------------------------
// Double progression, reading only the sets that were actually work, and now
// reading how hard they were (#5) and which side did them (#6).
// This is still the interim heuristic — the real engine (implement-aware
// increments, stalls, deloads) is issue #7. What it no longer does is count
// ramp-up sets as work, read a failed opener as the working weight, tell you to
// repeat a load you had five reps left in, or tell you to grind out more reps at
// a weight you already took to failure.
export function suggestion(movementId, prescription) {
  const last = lastPerformance(movementId);
  if (!last) return null;
  const mv = getMovement(movementId);
  const measure = (prescription && prescription.measure) || (mv && mv.measure) || "reps";
  const info = measureInfo(measure);
  const logged = loggedSets(last.sets);
  const work = workingSets(logged);
  if (!work.length) return null;

  const target = (prescription && prescription.max) || 10;
  const ramps = rampSets(logged).length;
  const failed = failedSets(logged);
  const hitTarget = work.every((s) => (setAmount(s) || 0) >= target);

  // How hard the last working set was, if he said. Absent → reps-only, exactly
  // as before (#5: an omitted RPE never produces a worse suggestion).
  const effort = workingEffort(work);
  const verdict = effortVerdict({ rir: effort ? effort.rir : null, hitTarget });

  const basis = `Counted ${work.length} working set${work.length === 1 ? "" : "s"}` +
    (ramps ? `, ignored ${ramps} ramp-up set${ramps === 1 ? "" : "s"}` : "") +
    (failed.length ? `, and skipped a failed set at ${Math.max(...failed.map((x) => setLoad(x) || 0))} ${getProfile().units}` : "") + "." +
    (effort ? ` Last working set at ${effortLabel(effort.set)}.` : "");

  const topWeight = topWorkingLoad(logged);

  // Unloaded work (planks, bodyweight) progresses on the measure itself.
  if (topWeight == null) {
    const best = Math.max(...work.map((s) => setAmount(s) || 0));
    const step = (measure === "reps" ? 1 : 5) * Math.max(1, verdict.steps);
    if (verdict.steps > 0) {
      return {
        action: "increase", weight: null, amount: best + step, basis,
        note: verdict.code === "too-light"
          ? `You held ${best}${info.unit} with ${verdict.rir}+ left in the tank — go for ${best + step}${info.unit}.`
          : `You held ${best}${info.unit} everywhere last time — push for ${best + step}${info.unit}.`,
      };
    }
    return {
      action: "repeat", weight: null, amount: target, basis,
      note: verdict.code === "at-failure"
        ? `You went to failure at ${best}${info.unit} — hold there until it stops being a fight.`
        : `Work back up to ${target}${info.unit} before adding anything.`,
    };
  }

  if (failed.length) {
    const missed = Math.max(...failed.map((s) => setLoad(s) || 0));
    const onTheOpener = logged.indexOf(failed[0]) === 0;
    return {
      action: "repeat", weight: topWeight, amount: target, basis,
      note: onTheOpener
        ? `You opened at ${missed} last time and backed off to ${topWeight} — repeat ${topWeight} and own all ${target} ${info.short}.`
        : `You worked up to ${missed} last time and had to come back to ${topWeight} — repeat ${topWeight} and own all ${target} ${info.short}.`,
    };
  }

  // TODO(#7): implement-aware increments. A flat +5 is 40% on a 12.5 lb cable.
  const inc = topWeight >= 100 ? 10 : 5;
  const next = topWeight + inc * verdict.steps;

  if (verdict.steps > 0) {
    return {
      action: "increase", weight: next, amount: target, basis,
      note: suggestionNote(verdict, { topWeight, next, inc, target, info, measure }),
    };
  }
  return {
    action: "repeat", weight: topWeight, amount: target, basis,
    note: suggestionNote(verdict, { topWeight, next, inc, target, info, measure }),
  };
}

// The sentence attached to the number. Effort is what makes these different
// from each other — same reps, same weight, opposite advice.
function suggestionNote(verdict, { topWeight, next, inc, target, info, measure }) {
  const holdForReps = measure === "reps"
    ? `Aim to add reps at ${topWeight} before adding weight.`
    : `Stay at ${topWeight} and build to ${target}${info.unit} before adding weight.`;

  switch (verdict.code) {
    case "too-light":
      return verdict.hitTarget
        ? `You topped the range with ${verdict.rir}+ ${info.short} still in the tank — that was too light. Go to ${next}.`
        : `You stopped short of the range with ${verdict.rir}+ ${info.short} still in the tank — the load was the limiter, ` +
          `not the ${info.short}. Try ${next}, and ${next + inc} if that still leaves ${verdict.rir}+ in the tank.`;
    case "near-failure":
      return verdict.hitTarget
        ? `You topped the range with one left — a clean step up to ${next}.`
        : holdForReps;
    case "at-failure":
      return verdict.hitTarget
        ? `You topped the range, but that last set was to failure — repeat ${topWeight} and let it feel like an 8 before adding.`
        : `You were already at failure short of ${target} ${info.short} — repeat ${topWeight}. The extra ${info.short} come from ` +
          `getting stronger at this weight, not from grinding.`;
    case "on-target":
      return verdict.hitTarget
        ? `You hit the top of the range at RPE ${10 - verdict.rir} — try ${next}.`
        : holdForReps;
    default: // reps-only — the pre-RPE behaviour, unchanged
      return verdict.hitTarget
        ? `You hit the top of the range on every working set — try ${next}.`
        : holdForReps;
  }
}

// ---- Symptom trend ---------------------------------------------------------
export function symptomHistory(symptomId) {
  return getSessions().slice().reverse()
    .filter((s) => s.symptoms && s.symptoms[symptomId] != null)
    .map((s) => ({ date: s.date, value: Number(s.symptoms[symptomId]) }));
}

// ---- Watch / cardio metric trend -------------------------------------------
export function metricHistory(metricId) {
  return getSessions().slice().reverse()
    .filter((s) => s.metrics && s.metrics[metricId] != null && s.metrics[metricId] !== "")
    .map((s) => ({ date: s.date, value: Number(s.metrics[metricId]) }));
}

// ---- Coach report ----------------------------------------------------------
// A compact, human-readable Markdown summary of recent training that Tim pastes
// into a Claude conversation to get the program reviewed and updated. This is
// the bridge between the on-device data and his (async) coach.
const sessionCount = (h) => `${h.length} session${h.length === 1 ? "" : "s"}`;

export function coachReport() {
  const d = load();
  const p = d.profile;
  const sessions = getSessions(); // newest first
  const L = [];
  L.push("# gymtools training report");
  L.push("");
  L.push('_Paste this into a Claude chat and say: "Review my training and update my program."_');
  L.push("");
  if (!sessions.length) { L.push("No sessions logged yet — nothing to review."); return L.join("\n"); }

  const dates = sessions.map((s) => s.date).slice().sort();
  const first = dates[0].slice(0, 10);
  const last = dates[dates.length - 1].slice(0, 10);
  const last28 = sessions.filter((s) => Date.now() - new Date(s.date) <= 28 * 86400000).length;
  L.push(`**Athlete:** ${p.name || "—"} · units ${p.units}`);
  L.push(`**Range:** ${first} → ${last} · ${sessions.length} sessions total · ${last28} in the last 4 weeks`);
  const bw = getBodyweight();
  if (bw.length) L.push(`**Bodyweight:** ${bw[0].weight} → ${bw[bw.length - 1].weight} ${p.units} (${bw.length} entries)`);
  L.push("");

  // per-movement progress (working sets only; a ramp-up is not a data point)
  L.push("## Lift progress");
  let any = false;
  loggedMovementIds().slice().reverse().forEach((id) => {
    const h = movementHistory(id);
    if (!h.length) return;
    any = true;
    const mv = getMovement(id);
    const label = movementName(id, id);
    const f = h[0], l = h[h.length - 1];
    // What the last top set actually cost him (#5). Without this a stall and a
    // set left with three reps in the tank look identical on paper.
    const effortTag = l.rpe != null
      ? ` · last working set RPE ${l.rpe} (${rirFromRpe(l.rpe)} left)`
      : "";
    if (l.e1rm != null && f.e1rm != null) {
      let tag = "";
      if (h.length >= 3) {
        const prev = h[h.length - 3];
        tag = l.e1rm > prev.e1rm ? " — progressing ↑" : " — ⚠️ STALLED (no e1RM gain in 3 sessions)";
      }
      L.push(`- **${label}**: top working set ${f.topWeight}→${l.topWeight}${p.units}, est 1RM ${f.e1rm}→${l.e1rm} over ${sessionCount(h)}${effortTag}${tag}`);
    } else {
      // No meaningful e1RM here — report what the movement actually measures,
      // and say why there's no 1RM so the coach doesn't go looking for one.
      const info = measureInfo(l.measure);
      const reason = l.measure !== "reps" ? `${info.label.toLowerCase()}-based`
        : mv && mv.assisted ? "assisted"
        : mv && (mv.loadMode === "none" || !l.topWeight) ? "bodyweight"
        : "high-rep work";
      const load = l.topWeight ? `${l.topWeight}${p.units} × ` : "";
      const was = f.topWeight ? `${f.topWeight}${p.units} × ` : "";
      L.push(`- **${label}**: best working set ${load}${l.bestAmount}${info.unit} (was ${was}${f.bestAmount}${info.unit}) over ${sessionCount(h)} — no est 1RM (${reason})${effortTag}`);
    }
  });
  if (!any) L.push("- (not enough logged sets yet)");
  const flagged = suspectSets();
  if (flagged.length) {
    L.push(`- ⚠️ ${flagged.length} logged set${flagged.length === 1 ? "" : "s"} flagged as a possible typo and excluded from bests: ` +
      flagged.map((f) => `${f.name} ${f.text} (${f.date.slice(0, 10)})`).join("; "));
  }
  L.push("");

  // Which side gave out first (#6). Deliberately qualitative: he uses the same
  // dumbbell on both sides and matches reps to the weaker one, so per-side
  // numbers would read identical forever. What he DOES notice — "right side
  // could have done more, left had a harder time" — is one tap, and it's the
  // only left/right signal in here that can actually change.
  L.push("## Harder side");
  const harder = harderSideReport();
  if (harder.length) {
    harder.forEach((h) => {
      L.push(`- **${h.name}**: ${harderSideLabel(h.side)} side harder in ${h.flagged} of ${h.total} session${h.total === 1 ? "" : "s"}` +
        ` (latest ${h.date.slice(0, 10)})${h.mixed ? " — mixed; the other side was flagged too" : ""}`);
    });
    L.push("- Qualitative, not load data: it says which side gave out first, not how much weaker it is.");
  } else {
    L.push("- Nothing flagged — on a unilateral lift, tap L or R when one side gives out first.");
  }
  L.push("");

  // symptoms / recovery
  L.push("## Symptoms & recovery");
  const latest = sessions[0];
  if (latest.symptoms) {
    const s = latest.symptoms;
    L.push(`- Latest check-in — knee ${s.knee ?? "—"}, right-side tightness ${s.tightness ?? "—"}, shoulder ${s.shoulder ?? "—"}, neck/head ${s.neck ?? "—"}, energy ${s.energy ?? "—"}, sleep ${s.sleep ?? "—"} (0=none/10=worst; energy & sleep 10=best)`);
  }
  const avg = (id) => {
    const vals = sessions.map((s) => s.symptoms && s.symptoms[id]).filter((v) => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 10) / 10 : null;
  };
  const at = avg("tightness");
  if (at != null) L.push(`- Right-side tightness averaging ${at}/10 across all sessions`);
  const migCount = sessions.filter((s) => s.causedMigraine === true).length;
  const rated = sessions.filter((s) => s.causedMigraine === true || s.causedMigraine === false).length;
  if (rated) L.push(`- Migraines: ${migCount} of ${rated} rated sessions triggered one (logged as data, program not adjusted for it)`);
  const pains = [];
  sessions.slice(0, 12).forEach((s) => (s.entries || []).forEach((e) => {
    if (e.pain) pains.push(`${entryName(e)} (${s.date.slice(0, 10)})${e.note ? ": " + e.note : ""}`);
  }));
  if (pains.length) L.push(`- ⚠️ Pain flagged on: ${pains.slice(0, 6).join("; ")}`);
  L.push("");

  // recent notes
  const notes = sessions.filter((s) => s.notes && s.notes.trim()).slice(0, 4);
  if (notes.length) {
    L.push("## Recent notes");
    notes.forEach((s) => L.push(`- _${s.date.slice(0, 10)}_: ${s.notes.trim()}`));
    L.push("");
  }

  L.push("## Coach, please");
  L.push("Review the numbers, progress what's working, and fix anything stalled or flagged for pain. Follow my current injury guardrails and preferences — the up-to-date source is coach/PROFILE.md in the repo, not this report. Give me updated loads/reps and any swaps for the next block.");
  return L.join("\n");
}

// ---- Export / Import -------------------------------------------------------
export function exportData() {
  return JSON.stringify(load(), null, 2);
}
export function importData(json, { merge = false } = {}) {
  // Migrate the incoming blob BEFORE anything else looks at it — a merge pushes
  // its sessions straight into the store, so they have to arrive in the current
  // shape or they'd sit there unattributed.
  const incoming = migrate(typeof json === "string" ? JSON.parse(json) : json);
  if (merge) {
    const d = load();
    const seen = new Set(d.sessions.map((s) => s.id));
    for (const s of incoming.sessions || []) {
      if (!seen.has(s.id)) d.sessions.push(s);
    }
    // merge bodyweight by day
    for (const b of incoming.bodyweight || []) addBodyweight(b.weight, b.date);
    save();
  } else {
    cache = incoming;
    save();
  }
  return load();
}

export function wipe() {
  cache = clone(DEFAULT_DATA);
  save();
  clearDraft();
}

function cryptoId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
