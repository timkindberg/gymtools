// =============================================================================
// effort.js — how hard the set actually was (issue #5).
//
// Every exercise in the program prescribes an RPE, and until now the app never
// collected it. `suggestion()` saw weight and reps only, so it could not tell a
// set left with three reps in the tank from one that needed a spotter — and the
// difference was sitting right there in the free-text notes:
//
//   a4 Reverse Lunge 30×8  "could maybe handle 5 more on each side" → repeat 30
//   b2 Lat Pulldown 160×8  "7/8th were not complete reps"           → add reps
//
// Both of those are wrong, and the same number fixes both.
//
// SCALE. RIR-based RPE (Zourdos et al. 2016): 10 = failure, 9 = 1 rep left,
// 8 = 2 left, 7 = 3 left. We store the RPE (`rpe` on the set, the same scale the
// program prescribes in) and we ASK in reps left, because "how many more could
// you have done" is a question you can answer honestly between sets.
//
// Optional, always. No RPE means the engine falls back to exactly the reps-only
// behaviour it had before, never something worse.
//
// Pure module: no DOM, no storage.
// =============================================================================

export const RPE_MIN = 6;   // "4+ left" — below this the number stops meaning much
export const RPE_MAX = 10;  // failure

// What the chips offer. 4 is really "4 or more": past that the set was a warm-up.
export const RIR_CAP = 4;
export const RIR_CHOICES = [0, 1, 2, 3, 4];

export const RIR_LABELS = { 0: "0", 1: "1", 2: "2", 3: "3", 4: "4+" };
export const RIR_HINTS = {
  0: "Nothing left — failure, or a rep you needed help with.",
  1: "One more, maybe. RPE 9.",
  2: "Two in the tank. RPE 8 — where a top set wants to live.",
  3: "Three left. RPE 7.",
  4: "Four or more left — that was too light.",
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function rpeFromRir(rir) { return clamp(RPE_MAX - Number(rir), RPE_MIN, RPE_MAX); }
export function rirFromRpe(rpe) { return clamp(RPE_MAX - Number(rpe), 0, RIR_CAP); }

// ---- Reading a set ---------------------------------------------------------

export function setRpe(set) {
  if (!set || set.rpe == null || set.rpe === "") return null;
  const n = Number(set.rpe);
  return Number.isFinite(n) ? clamp(n, 1, RPE_MAX) : null;
}
export function setRir(set) {
  const rpe = setRpe(set);
  return rpe == null ? null : rirFromRpe(rpe);
}
export function hasEffort(set) { return setRpe(set) != null; }

// One tap writes it, the same tap again clears it. Never blocks anything.
export function recordEffort(set, rir) {
  if (!set) return set;
  if (rir == null) delete set.rpe;
  else set.rpe = rpeFromRir(rir);
  return set;
}

export function effortLabel(set) {
  const rpe = setRpe(set), rir = setRir(set);
  if (rpe == null) return "";
  return `RPE ${rpe} · ${rir >= RIR_CAP ? RIR_LABELS[RIR_CAP] : rir} left`;
}

// Compact form for a set list: 165×8 @8.
export function effortGlyph(set) {
  const rpe = setRpe(set);
  return rpe == null ? "" : ` @${rpe}`;
}

// The program prescribes RPE as a string ("8", "9", "10"). What that asks for in
// the language the chips speak.
export function targetRir(rpe) {
  const n = Number(String(rpe == null ? "" : rpe).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? rirFromRpe(n) : null;
}

// The last working set is where the signal is — asking on every set costs too
// many taps in a 50-minute session, and a ramp-up's RPE tells you nothing.
export function workingEffort(workSets = []) {
  for (let i = workSets.length - 1; i >= 0; i--) {
    if (hasEffort(workSets[i])) return { set: workSets[i], rpe: setRpe(workSets[i]), rir: setRir(workSets[i]) };
  }
  return null;
}

// ---- What the effort means for next time -----------------------------------
// One step is one load increment; the caller owns how big an increment is for
// the implement in hand. `hitTarget` is the reps-only reading the engine already
// had — whether every working set topped its prescribed range.
//
//   reps-only     no RPE logged → exactly what the app did before
//   too-light     4+ left — the load was the limiter, not the reps
//   on-target     2–3 left — textbook double progression
//   near-failure  1 left — add load only once the range is topped
//   at-failure    0 left — hold. More reps at this weight aren't coming from
//                 grinding; they come from getting stronger at it first.
export function effortVerdict({ rir = null, hitTarget = false } = {}) {
  if (rir == null) return { code: "reps-only", steps: hitTarget ? 1 : 0, rir: null, hitTarget };
  if (rir >= RIR_CAP) return { code: "too-light", steps: hitTarget ? 2 : 1, rir, hitTarget };
  if (rir === 0) return { code: "at-failure", steps: 0, rir, hitTarget };
  if (rir === 1) return { code: "near-failure", steps: hitTarget ? 1 : 0, rir, hitTarget };
  return { code: "on-target", steps: hitTarget ? 1 : 0, rir, hitTarget };
}
