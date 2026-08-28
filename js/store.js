// =============================================================================
// store.js — all persistence. Single localStorage key holding one JSON blob.
// Data lives on THIS device only, so export/import is how you back up & move.
// =============================================================================

import { getMovement, resolveMovementId, movementName, seedSourcesFor } from "./movements.js";
import {
  setAmount, setLoad, isLogged, estimate1RM, setVolume,
  formatSet, staticWarnings, measureInfo, prescriptionFor,
} from "./measures.js";
import { applyInferredRoles, workingSets, roleLabel, topWorkingLoad } from "./sets.js";
import { workingEffort, rirFromRpe, harderSideLabel } from "./effort.js";
import { nextPrescription, seedPrescription, summarize, stallState, warmupRamp } from "./engine.js";
import { allExercises, findExercise } from "./program.js";

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
  // Per-movement corrections from the weekly review (#11). Keyed by movement
  // slug; each one overrides the engine for that movement's NEXT session only.
  overrides: {},
  // Every correction ever applied, with what the engine had proposed at the
  // time. This is the learning signal: a movement the review keeps pushing up
  // is a movement the engine is consistently undershooting.
  overrideLog: [],
  settings: {
    restTimerDefault: 90, // seconds
    sound: true,
    // How many CONSECUTIVE trained weeks before a deload week (#8). Counted in
    // weeks he actually trained, so skipping a week is its own rest rather than
    // something that pushes the deload further away. 0 turns it off.
    deloadEveryWeeks: 4,
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
      applyInferredRoles(entry.sets || [], entryPrescription(entry), getMovement(entry.movementId));
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
      applyInferredRoles(entry.sets || [], entry.prescription, getMovement(entry.movementId));
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
    applyInferredRoles(entry.sets || [], entry.prescription, getMovement(entry.movementId));
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
    let vol = 0, bestE1rm = 0, topWeight = 0, bestAmount = 0, sets = 0, flagged = 0, deload = false;
    const counted = [];
    for (const entry of entriesFor(s, movementId)) {
      if (entry.deload) deload = true;
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
    if (!sets) { if (flagged) out.push({ date: s.date, sets: 0, flagged, deload, volume: 0, topWeight: 0, bestAmount: 0, e1rm: null, rpe: null, measure: (mv && mv.measure) || "reps" }); continue; }
    // How hard it was (#5) — optional, and null until he logs it.
    const effort = workingEffort(counted);
    out.push({
      date: s.date,
      sets,
      flagged,
      // A deload is a step DOWN taken on purpose. Charts and the report read
      // this so a planned reset never looks like a lift falling apart (#8).
      deload,
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
    applyInferredRoles(entry.sets || [], entryPrescription(entry), getMovement(entry.movementId));
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
// The store's job here is only to assemble history and hand it to the engine
// (js/engine.js, issues #7–#9), which owns every decision and is pure enough to
// unit-test against a fixture. Nothing below reasons about loads.

// Every performance of this movement, newest first, in the shape the engine
// wants: logged sets only, typo-flagged sets excluded, pain and deload carried
// through. A set flagged as implausible would otherwise decide the next load.
export function movementSessions(movementId, limit = 12) {
  if (!movementId) return [];
  const movement = getMovement(movementId);
  const out = [];
  for (const s of getSessions()) {
    for (const entry of entriesFor(s, movementId)) {
      const logged = loggedSets(entry.sets);
      const kept = logged.filter((x) => !x.suspect);
      if (!kept.length) continue;
      // Roles were inferred against the WHOLE set list, flagged set included.
      // Pull a bogus top set out from under them and the roles it implied have
      // to go too: 150, 155 and a mistyped 1550 classify as ramp, ramp, work,
      // and dropping the 1550 leaves two ramps and no working set at all. The
      // engine then reads the session as empty and the card calls a lift you
      // did on Friday a first-timer. Re-infer on what's actually left — on a
      // copy, so nothing the athlete logged is rewritten behind their back.
      const sets = kept.length === logged.length
        ? kept
        : applyInferredRoles(kept.map((x) => ({ ...x })), entryPrescription(entry), movement);
      out.push({ date: s.date, sets, pain: !!entry.pain, deload: !!entry.deload, entry });
      break; // one entry per session is the movement's performance that day
    }
    if (out.length >= limit) break;
  }
  return out;
}

// History exists but the engine got nothing out of it. Distinct from "never
// performed", and the card has to say which — one is a first session, the other
// is a set that needs its role fixed or its typo confirmed.
export function unreadableHistory(movementId) {
  const last = lastPerformance(movementId);
  if (!last) return null;
  const sessions = movementSessions(movementId);
  const movement = getMovement(movementId);
  const readable = sessions.some((h) => workingSets(h.sets).length > 0);
  if (readable) return null;
  const logged = loggedSets(last.entry.sets);
  return {
    date: last.date,
    flagged: logged.filter((x) => x.suspect).length,
    load: logged.reduce((m, x) => Math.max(m, setLoad(x) || 0), 0) || null,
    text: logged.map((x) => formatSet(movement, x)).join(", "),
  };
}

// What today should ask for. `context` carries the things only the live session
// knows: today's check-in, the slot's injury flags, and whether the deload
// cadence has come round.
export function suggestion(movementId, prescription, context = {}) {
  const movement = getMovement(movementId);
  const slot = context.exerciseId ? findExercise(context.exerciseId) : null;
  const sugg = nextPrescription({
    movement,
    prescription: prescription || (movement && movement.prescription) || null,
    history: movementSessions(movementId),
    symptoms: context.symptoms || null,
    flags: context.flags || (slot && slot.flags) || [],
    scheduledDeload: !!context.scheduledDeload,
    units: getProfile().units,
  });
  // The review gets the last word — but only where it actually left one, and
  // never silently: the engine's own answer travels along in `engine` so both
  // the card and the next report can show what was corrected (#11).
  return applyOverride(movementId, sugg);
}

// A first-time movement's estimate, from a cousin with history (#12). Kept
// separate from suggestion() on purpose: a seed is a guess about a movement
// with no history, and nothing downstream — stalls, charts, training maxes —
// may ever read it as one.
export function seedFor(movementId, prescription) {
  const movement = getMovement(movementId);
  if (!movement) return null;
  if (movementSessions(movementId, 1).length) return null; // it has real history
  const sources = [];
  for (const link of seedSourcesFor(movementId)) {
    const srcMv = getMovement(link.from);
    const perf = movementSessions(link.from, 1)[0];
    if (!srcMv || !perf) continue;
    const load = topWorkingLoad(workingSets(perf.sets), srcMv);
    if (!(load > 0)) continue;
    sources.push({ ...link, name: movementName(link.from, link.from), load, date: perf.date });
  }
  return seedPrescription({
    movement,
    prescription: prescription || (movement && movement.prescription) || null,
    sources,
    units: getProfile().units,
  });
}

// The sets to do on the way to today's top set (engine.js). Purely advisory —
// they're marked `ramp` when logged and the engine ignores them.
export function rampFor(movementId, workLoad, measure) {
  return warmupRamp(getMovement(movementId), workLoad, { measure });
}

// ---- Coach overrides (#11) --------------------------------------------------
// The weekly loop: the engine proposes week to week, the review corrects it.
// An override lands on ONE movement's next session and then retires itself —
// once that movement has been trained again, the engine has fresh evidence and
// a week-old correction has no business still steering it.

export function getOverrides() {
  const d = load();
  const out = {};
  for (const [id, ov] of Object.entries(d.overrides || {})) {
    const last = lastPerformance(id);
    // Trained since the correction was written → the correction is spent.
    if (last && ov.date && last.date > ov.date) continue;
    out[id] = ov;
  }
  return out;
}

export function overrideFor(movementId) {
  return (movementId && getOverrides()[movementId]) || null;
}

export function setOverride(movementId, patch = {}) {
  const id = resolveMovementId(movementId) || movementId;
  if (!getMovement(id)) return null;
  const d = load();
  // What the engine wanted, read against the rep range the movement is actually
  // programmed at — the same number the report showed the reviewer.
  const engine = nextPrescription({
    movement: getMovement(id),
    prescription: prescriptionFor(slotFor(id), getMovement(id)),
    history: movementSessions(id),
    units: d.profile.units,
  });
  const ov = {
    movementId: id,
    weight: patch.weight == null ? null : Number(patch.weight),
    amount: patch.amount == null ? null : Number(patch.amount),
    note: patch.note || "",
    date: patch.date || new Date().toISOString(),
    source: patch.source || "review",
    // What the engine wanted, frozen at the moment it was overruled.
    engineWeight: engine ? engine.weight : null,
    engineAmount: engine ? engine.amount : null,
  };
  d.overrides = { ...(d.overrides || {}), [id]: ov };
  d.overrideLog = [...(d.overrideLog || []), ov].slice(-100);
  save();
  return ov;
}

export function clearOverride(movementId) {
  const d = load();
  if (!d.overrides || !d.overrides[movementId]) return false;
  delete d.overrides[movementId];
  save();
  return true;
}

export function getOverrideLog() { return (load().overrideLog || []).slice().reverse(); }

// Merge a live override into an engine suggestion. Never mutates the engine's
// answer — it rides along under `engine` so the difference stays visible.
function applyOverride(movementId, sugg) {
  const ov = overrideFor(movementId);
  if (!ov) return sugg;
  const units = getProfile().units;
  const weight = ov.weight == null ? (sugg && sugg.weight) : ov.weight;
  const amount = ov.amount == null ? (sugg && sugg.amount) : ov.amount;
  const engineSaid = sugg && sugg.weight != null ? `The app had ${sugg.weight} ${units}. ` : "";
  return {
    ...(sugg || {}),
    action: "override",
    weight,
    amount,
    override: true,
    engine: sugg ? { action: sugg.action, weight: sugg.weight, amount: sugg.amount, note: sugg.note } : null,
    note: `Coach's call for today: ${weight == null ? "see the note" : weight + " " + units}` +
      (amount == null ? "" : ` × ${amount}`) + (ov.note ? ` — ${ov.note}` : "") + ".",
    basis: `${engineSaid}Set in the weekly review${ov.date ? " on " + ov.date.slice(0, 10) : ""}; ` +
      `it applies to this session only, then the engine takes it from here.`,
  };
}

// Parse the lines a review hands back. One movement per line:
//
//   Barbell Bench Press: 155 x 8 — you left three in the tank, take the jump
//   barbell-row: 130
//   Incline DB Curl: clear
//
// Names or slugs both work; anything unrecognised comes back as an error
// rather than being silently dropped.
export function applyOverrideText(text) {
  const applied = [], cleared = [], errors = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*]\s*/, "");
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.+?)\s*:\s*(.*)$/);
    if (!m) { errors.push(`${line} — expected "movement: weight × reps — note"`); continue; }
    const id = resolveMovementId(m[1].trim());
    if (!id) { errors.push(`${m[1].trim()} — no movement by that name`); continue; }
    const rest = m[2].trim();
    if (/^(clear|none|off|remove)$/i.test(rest)) {
      clearOverride(id);
      cleared.push(movementName(id, id));
      continue;
    }
    const nums = rest.match(/^([\d.]+)\s*(?:[x×]\s*([\d.]+))?/);
    if (!nums) { errors.push(`${line} — no weight in that line`); continue; }
    const note = rest.slice(nums[0].length).replace(/^\s*[—–-]+\s*/, "").trim();
    setOverride(id, { weight: Number(nums[1]), amount: nums[2] == null ? null : Number(nums[2]), note });
    applied.push(movementName(id, id));
  }
  return { applied, cleared, errors };
}

// One stall definition, shared by the engine and the coach report (#8) — reps
// and load, never e1RM, which is unreliable above ~10 reps and meaningless for
// a carry or a plank.
export function movementStall(movementId) {
  const mv = getMovement(movementId);
  const sessions = movementSessions(movementId);
  const summaries = sessions
    .map((h) => summarize(h, mv, entryPrescription(h.entry)))
    .filter((s) => s.work.length > 0);
  return stallState(summaries, mv);
}

// ---- Deload cadence (#8) ----------------------------------------------------
// Counted in weeks he actually trained. Friday is explicitly skippable and whole
// weeks go missing, so a calendar count would either never fire or fire on a
// week he'd already taken off. A gap week resets the streak — that week WAS the
// deload — and so does a logged deload.

const WEEK_MS = 7 * 86400000;
function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

// Mean of the three joint/tightness trackers across a week's sessions — the
// rolling trigger for a deload that the calendar hasn't reached yet.
const SYMPTOM_LOAD = ["knee", "tightness", "shoulder"];
export const SYMPTOM_DELOAD_AT = 5;

function weekSymptomLoad(sessions) {
  const vals = [];
  for (const s of sessions) {
    for (const id of SYMPTOM_LOAD) {
      const v = s.symptoms && s.symptoms[id];
      if (v != null) vals.push(Number(v));
    }
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function deloadStatus() {
  const cadence = Number(getSettings().deloadEveryWeeks) || 0;
  const weeks = [];
  for (const s of getSessions()) { // newest first
    const key = weekStart(s.date);
    let w = weeks.find((x) => x.key === key);
    if (!w) { w = { key, sessions: [], deload: false }; weeks.push(w); }
    w.sessions.push(s);
    if ((s.entries || []).some((e) => e.deload)) w.deload = true;
  }
  if (!weeks.length) return { due: false, cadence, streak: 0, reason: "none" };

  // A deload already under way stays under way: the rest of this week's
  // sessions are part of it, not the start of the next block.
  if (weeks[0].deload && weeks[0].key === weekStart(Date.now())) {
    return { due: true, cadence, streak: 0, symptomLoad: null, reason: "in-progress" };
  }

  let streak = 0;
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].deload) break;                                   // last reset
    if (i > 0 && weeks[i - 1].key - weeks[i].key > WEEK_MS) break; // a week off
    streak++;
  }
  const symptomLoad = weekSymptomLoad(weeks[0].sessions);
  const flared = symptomLoad != null && symptomLoad >= SYMPTOM_DELOAD_AT && streak >= 2;
  const scheduled = cadence > 0 && streak >= cadence;
  return {
    due: scheduled || flared,
    cadence, streak,
    symptomLoad: symptomLoad == null ? null : Math.round(symptomLoad * 10) / 10,
    reason: scheduled ? "scheduled" : flared ? "symptoms" : "none",
  };
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

// ---- Next-session proposals (#11) -------------------------------------------
// What the app will actually put on the card next time this movement comes
// round — the thing a review has to be able to correct BEFORE he trains. The
// check-in can't be known in advance, so these are the un-gated numbers: a
// flare day will hold the load below whatever is printed here.

// Where a movement is programmed, so its proposal is read against the right rep
// range. A movement can sit in a slot as the default or as a 🎲 alternative.
function slotFor(movementId) {
  const all = allExercises();
  return all.find((e) => e.movement === movementId) ||
    all.find((e) => (e.alternatives || []).includes(movementId)) || null;
}

export function nextSessionProposals() {
  return loggedMovementIds().map((id) => {
    const mv = getMovement(id);
    const slot = slotFor(id);
    const prescription = prescriptionFor(slot, mv);
    const sugg = suggestion(id, prescription, { scheduledDeload: deloadStatus().due });
    if (!sugg) return null;
    return {
      movementId: id,
      name: movementName(id, id),
      slot: slot ? slot.id : null,
      prescription,
      measure: prescription.measure,
      ...sugg,
    };
  }).filter(Boolean);
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

  // What the app will put on the card next time — the section the weekly review
  // exists to correct (#11). Printed before the history detail on purpose: this
  // is the only part that can still be changed before he trains.
  L.push("## Next session — what the app will prescribe");
  L.push("_These are the un-gated numbers. The day's check-in can still hold a load below what's printed here._");
  const proposals = nextSessionProposals();
  if (proposals.length) {
    proposals.forEach((n) => {
      const info = measureInfo(n.measure);
      const load = n.weight == null ? "" : `${n.weight}${p.units} × `;
      const amount = n.amount == null ? "—" : `${n.amount}${n.measure === "reps" ? " reps" : info.unit}`;
      L.push(`- **${n.name}**${n.slot ? ` (slot ${n.slot})` : ""} → **${load}${amount}** · ${n.action}` +
        (n.override ? " · ⚑ coach override in effect" : ""));
      L.push(`  - ${n.note}`);
      if (n.basis) L.push(`  - _${n.basis}_`);
    });
  } else {
    L.push("- (nothing with enough history to prescribe from yet)");
  }
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
    // One stall definition, the engine's (#8): consecutive sessions with no gain
    // in reps or load at a real effort. The old tag read e1RM, which drifts on
    // high-rep work and doesn't exist at all for a carry or a plank — so the
    // report and the app could disagree about whether a lift was stuck.
    const stall = movementStall(id);
    const deloads = h.filter((x) => x.deload);
    const tag = stall.deloadDue
      ? ` — ⚠️ STALLED ${stall.consecutive} sessions, deload suggested`
      : stall.stalled ? ` — ⚠️ no gain last session (reps or load, at RPE 9+)`
      : h.length >= 2 ? " — progressing ↑" : "";
    const deloadTag = deloads.length
      ? ` · deloaded ${deloads.length === 1 ? "on " + deloads[0].date.slice(0, 10) : deloads.length + "×"} (planned reset, not a regression)`
      : "";
    if (l.e1rm != null && f.e1rm != null) {
      L.push(`- **${label}**: top working set ${f.topWeight}→${l.topWeight}${p.units}, est 1RM ${f.e1rm}→${l.e1rm} (Epley estimate from reps, never tested) over ${sessionCount(h)}${effortTag}${deloadTag}${tag}`);
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

  // The sets themselves. The old report kept only the best set per movement, so
  // a back-off after a failed top set — the exact thing a coach needs to see —
  // was invisible. Roles, effort and the per-exercise notes all travel now.
  L.push("## Session detail (last 3)");
  sessions.slice(0, 3).forEach((s) => {
    L.push(`### ${s.date.slice(0, 10)}${s.day ? " · day " + s.day : ""}`);
    (s.entries || []).forEach((e) => {
      const logged = loggedSets(e.sets);
      if (!logged.length) return;
      const mv = getMovement(e.movementId);
      const sets = logged.map((x) => {
        const role = roleLabel(x);
        const rpe = x.rpe != null ? ` @RPE${x.rpe}` : "";
        return `${formatSet(mv, x)}${rpe}${role === "work" ? "" : ` [${role}]`}${x.suspect ? " [⚠️ flagged]" : ""}`;
      });
      L.push(`- **${entryName(e)}**: ${sets.join(", ")}` +
        (e.harderSide ? ` · ⇄ ${harderSideLabel(e.harderSide)} side harder` : "") +
        (e.deload ? " · deload" : "") + (e.pain ? " · ⚠️ pain" : ""));
      if (e.note && e.note.trim()) L.push(`  - _"${e.note.trim()}"_`);
    });
    if (s.notes && s.notes.trim()) L.push(`- Session note: _"${s.notes.trim()}"_`);
    L.push("");
  });

  // Where the engine is holding back, and why (#8). A coach reading this should
  // never have to guess whether a step down was a decision or a bad day.
  L.push("## Deloads & stalls");
  const dl = deloadStatus();
  L.push(dl.cadence
    ? `- Cadence: deload after ${dl.cadence} consecutive trained weeks · currently ${dl.streak} week${dl.streak === 1 ? "" : "s"} in` +
      (dl.due ? ` — **deload due now** (${dl.reason})` : "")
    : "- Scheduled deloads are switched off.");
  const stalled = loggedMovementIds()
    .map((id) => ({ id, name: movementName(id, id), stall: movementStall(id) }))
    .filter((x) => x.stall.stalled);
  if (stalled.length) {
    stalled.forEach((x) => L.push(`- **${x.name}**: ${x.stall.consecutive} session${x.stall.consecutive === 1 ? "" : "s"} without a gain in reps or load` +
      (x.stall.deloadDue ? " — the app is prescribing a deload" : "")));
  } else {
    L.push("- Nothing stalled: every lift beat its last session, topped its range, or was left with reps in the tank.");
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

  // The other half of the loop: what the last review changed, and whether the
  // engine has been consistently wrong in one direction (#11).
  L.push("## Coach adjustments");
  const live = getOverrides();
  const liveIds = Object.keys(live);
  if (liveIds.length) {
    liveIds.forEach((id) => {
      const ov = live[id];
      L.push(`- **${movementName(id, id)}** → ${ov.weight == null ? "—" : ov.weight + p.units}` +
        (ov.amount == null ? "" : ` × ${ov.amount}`) +
        ` (set ${ov.date.slice(0, 10)}; the app had ${ov.engineWeight == null ? "no number" : ov.engineWeight + p.units})` +
        (ov.note ? ` — ${ov.note}` : ""));
    });
    L.push("- These apply to each movement's next session only, then the engine takes over again.");
  } else {
    L.push("- None in effect — every number above is the engine's own.");
  }
  const log = getOverrideLog().filter((ov) => ov.engineWeight != null && ov.weight != null);
  if (log.length >= 2) {
    const up = log.filter((ov) => ov.weight > ov.engineWeight).length;
    const down = log.filter((ov) => ov.weight < ov.engineWeight).length;
    L.push(`- Correction history: ${log.length} overrides — ${up} up, ${down} down.` +
      (up >= 3 && down === 0 ? " The engine is undershooting; consider a bigger increment band." :
       down >= 3 && up === 0 ? " The engine is overshooting; consider a smaller increment band." : ""));
  }
  L.push("");

  L.push("## Coach, please");
  L.push("Review the numbers, progress what's working, and fix anything stalled or flagged for pain. Follow my current injury guardrails and preferences — the up-to-date source is coach/PROFILE.md in the repo, not this report. Give me updated loads/reps and any swaps for the next block.");
  L.push("");
  L.push("If you want to change what the app prescribes next session, end your reply with a fenced block of adjustment lines — one movement per line, `weight × reps — why`, or `clear` to drop an existing one. I paste it straight into Settings → Coach adjustments:");
  L.push("");
  L.push("```");
  L.push("Barbell Bench Press: 155 x 8 — you left 3 in the tank, take the jump");
  L.push("Incline DB Curl: clear");
  L.push("```");
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
