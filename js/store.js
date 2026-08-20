// =============================================================================
// store.js — all persistence. Single localStorage key holding one JSON blob.
// Data lives on THIS device only, so export/import is how you back up & move.
// =============================================================================

const KEY = "gymtools.v1";
const DRAFT_KEY = "gymtools.draft.v1";

const DEFAULT_DATA = {
  version: 1,
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

function migrate(data) {
  // Fill in any missing top-level fields from defaults (forward-compatible).
  const merged = { ...clone(DEFAULT_DATA), ...data };
  merged.profile = { ...DEFAULT_DATA.profile, ...(data.profile || {}) };
  merged.settings = { ...DEFAULT_DATA.settings, ...(data.settings || {}) };
  merged.sessions = data.sessions || [];
  merged.bodyweight = data.bodyweight || [];
  return merged;
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

function sessionVolume(s) {
  return (s.entries || []).reduce((v, e) =>
    v + (e.sets || []).reduce((vv, x) => vv + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0), 0);
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
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

// ---- History helpers -------------------------------------------------------
// Return the most recent logged sets for a given exercise id (for "last time").
export function lastPerformance(exerciseId) {
  const sessions = getSessions();
  for (const s of sessions) {
    const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId);
    if (entry && entry.sets && entry.sets.some((x) => x.weight != null || x.reps != null)) {
      return { date: s.date, sets: entry.sets };
    }
  }
  return null;
}

// Full time series for an exercise: best set e1RM + total volume per session.
export function exerciseHistory(exerciseId) {
  const out = [];
  for (const s of getSessions().slice().reverse()) {
    const entry = (s.entries || []).find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    let vol = 0, bestE1rm = 0, topWeight = 0;
    for (const set of entry.sets || []) {
      const w = Number(set.weight) || 0;
      const r = Number(set.reps) || 0;
      if (w > 0 && r > 0) {
        vol += w * r;
        const e1 = epley(w, r);
        if (e1 > bestE1rm) bestE1rm = e1;
        if (w > topWeight) topWeight = w;
      }
    }
    if (vol > 0) out.push({ date: s.date, volume: vol, e1rm: Math.round(bestE1rm), topWeight });
  }
  return out;
}

// Estimated 1-rep-max (Epley). Purely informational; we never test true maxes.
export function epley(weight, reps) {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

// Suggest a target for next time via double progression.
// topRep = top of the exercise's rep range.
export function suggestion(exerciseId, topRep) {
  const last = lastPerformance(exerciseId);
  if (!last) return null;
  const working = last.sets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
  if (!working.length) return null;
  const allHitTop = working.every((s) => Number(s.reps) >= topRep);
  const weights = working.map((s) => Number(s.weight));
  const topWeight = Math.max(...weights);
  if (allHitTop) {
    const inc = topWeight >= 100 ? 10 : 5; // heuristic; user can override
    return { action: "increase", weight: topWeight + inc, note: `You hit the top of the range everywhere last time — try ${topWeight + inc}.` };
  }
  return { action: "repeat", weight: topWeight, note: `Aim to add reps at ${topWeight} before adding weight.` };
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

  // per-exercise progress
  const ids = [];
  const nameById = {};
  sessions.slice().reverse().forEach((s) => (s.entries || []).forEach((e) => {
    if (!(e.exerciseId in nameById)) ids.push(e.exerciseId);
    nameById[e.exerciseId] = e.variant || e.name;
  }));
  L.push("## Lift progress");
  let any = false;
  ids.forEach((id) => {
    const h = exerciseHistory(id);
    if (!h.length) return;
    any = true;
    const f = h[0], l = h[h.length - 1];
    let tag = "";
    if (h.length >= 3) {
      const prev = h[h.length - 3];
      tag = l.e1rm > prev.e1rm ? " — progressing ↑" : " — ⚠️ STALLED (no e1RM gain in 3 sessions)";
    }
    L.push(`- **${nameById[id]}**: top set ${f.topWeight}→${l.topWeight}${p.units}, est 1RM ${f.e1rm}→${l.e1rm} over ${h.length} sessions${tag}`);
  });
  if (!any) L.push("- (not enough logged sets yet)");
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
    if (e.pain) pains.push(`${nameById[e.exerciseId] || e.name} (${s.date.slice(0, 10)})${e.note ? ": " + e.note : ""}`);
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
  const incoming = typeof json === "string" ? JSON.parse(json) : json;
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
    cache = migrate(incoming);
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
