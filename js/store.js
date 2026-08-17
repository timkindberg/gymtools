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

export function save() {
  if (!cache) return;
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
