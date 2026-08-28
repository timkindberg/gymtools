// =============================================================================
// sets.js — set roles: ramp-up, working, back-off.
//
// The old engine treated every logged set as a working set (issue #3). Two ways
// that goes wrong:
//
//   1. Ramps count as work. The program tells him to ramp, so 105/145/145/165
//      on the box squat is one working set and three warm-ups. One ramp logged
//      short of the rep target used to block progression forever.
//   2. `Math.max` reads a failed opener as the working weight. On 30/25/25 he
//      opened too heavy and backed off — and was told to repeat 30.
//
// Inference is a default, not a verdict: every set carries `roleLocked` once the
// athlete taps the badge, and inference never overwrites a locked role.
//
// Pure module: no DOM, no storage.
// =============================================================================

import { setAmount, setLoad, isLogged } from "./measures.js";
import { invertLoad } from "./movements.js";

export const ROLES = ["ramp", "work", "backoff"];

export const ROLE_LABELS = { ramp: "ramp", work: "work", backoff: "back" };

// What the badge says. A failed opener is a back-off set with a story.
export function roleLabel(set) {
  if (!set) return ROLE_LABELS.work;
  if (set.failed) return "fail";
  return ROLE_LABELS[set.role] || ROLE_LABELS.work;
}

export function roleOf(set) {
  return (set && set.role) || "work";
}

export function nextRole(role) {
  const i = ROLES.indexOf(role);
  return ROLES[(i + 1) % ROLES.length];
}

// ---- Inference -------------------------------------------------------------

function loggedIndices(sets) {
  const out = [];
  sets.forEach((s, i) => {
    const w = setLoad(s), a = setAmount(s);
    if (w != null && w > 0 && a != null && a > 0) out.push(i);
  });
  return out;
}

// Returns [{ index, role, failed }] for the sets it can classify. Sets with no
// load (bodyweight, time work) are all "work" — there is no ramp to detect.
//
// `prescription` is optional. With it, we can tell a FAILED top set from a
// planned back-off by asking whether the top set made the bottom of its
// prescribed range; without it we fall back to the shape of the load sequence
// alone. (RPE — #5, effort.js — answers the sharper version of the same
// question, but it is optional and often absent; this reads what the reps
// already say, so classification never depends on it.)
//
// `movement` is optional and only changes one thing: on an ASSIST stack the
// heaviest set is the EASIEST one, so "which set was the top set" inverts (#9).
export function inferSetRoles(sets = [], prescription = null, movement = null) {
  const idxs = loggedIndices(sets);
  const result = sets.map((_, index) => ({ index, role: "work", failed: false }));
  if (idxs.length < 2) return result;

  const inverted = invertLoad(movement);
  const hardest = (loads) => (inverted ? Math.min(...loads) : Math.max(...loads));
  const isEasierThan = (a, b) => (inverted ? a > b : a < b);

  const loadAt = (i) => setLoad(sets[i]);
  const amountAt = (i) => setAmount(sets[i]);
  const top = hardest(idxs.map(loadAt));
  const topIdxs = idxs.filter((i) => loadAt(i) === top);
  const firstTop = topIdxs[0];
  const lastTop = topIdxs[topIdxs.length - 1];
  const after = idxs.filter((i) => i > lastTop);

  // Did the heaviest set do its job? Two independent readings, because they
  // catch different failures:
  const floor = prescription && Number(prescription.min) > 0 ? Number(prescription.min) : null;
  const ceiling = prescription && Number(prescription.max) > 0 ? Number(prescription.max) : null;
  const bestAtTop = Math.max(...topIdxs.map(amountAt));
  const cameUpShort = floor != null && bestAtTop < floor;   // missed the range outright
  const finishedTheJob = ceiling != null && bestAtTop >= ceiling; // topped the range

  //   1. The rep count: the top set missed the bottom of its prescribed range
  //      and he came down afterwards. This fires anywhere in the sequence —
  //      including after a ramp, which is how every barbell lift here is
  //      logged, and where reading the shape alone would miss it.
  //   2. The shape: he opened with his single heaviest set and spent the rest
  //      of the exercise underneath it. In range or not, that is a retreat —
  //      unless he actually topped the range on it, which makes dropping the
  //      weight afterwards look like a deliberate back-off instead.
  const retreatedFromOpener =
    firstTop === idxs[0] && firstTop === lastTop && after.length >= 2 && !finishedTheJob;

  const failedTop = after.length > 0 && after.every((i) => isEasierThan(loadAt(i), top)) &&
    (cameUpShort || retreatedFromOpener);

  if (failedTop) {
    const settled = hardest(after.map(loadAt));
    for (const i of idxs) {
      if (i < firstTop) result[i] = { index: i, role: "ramp", failed: false };
      else if (loadAt(i) === top) result[i] = { index: i, role: "backoff", failed: true };
      else result[i] = { index: i, role: loadAt(i) === settled ? "work" : "backoff", failed: false };
    }
    return result;
  }

  for (const i of idxs) {
    const w = loadAt(i);
    if (w === top) result[i] = { index: i, role: "work", failed: false };
    else if (i < firstTop) result[i] = { index: i, role: "ramp", failed: false };
    else result[i] = { index: i, role: "backoff", failed: false };
  }
  return result;
}

// Fill in roles in place, leaving anything the athlete set by hand alone.
// Returns the same array so it composes.
export function applyInferredRoles(sets = [], prescription = null, movement = null) {
  const inferred = inferSetRoles(sets, prescription, movement);
  sets.forEach((s, i) => {
    if (!s || s.roleLocked) return;
    s.role = inferred[i].role;
    if (inferred[i].failed) s.failed = true;
    else delete s.failed;
  });
  return sets;
}

// ---- Reading the roles back ------------------------------------------------

export function workingSets(sets = []) {
  return sets.filter((s) => roleOf(s) === "work");
}
export function rampSets(sets = []) {
  return sets.filter((s) => roleOf(s) === "ramp");
}
export function backoffSets(sets = []) {
  return sets.filter((s) => roleOf(s) === "backoff");
}
export function failedSets(sets = []) {
  return sets.filter((s) => s && s.failed);
}

// Where the RPE question goes (#5). The last working set is the one that
// carries the signal — a ramp-up's effort tells you nothing, and asking on
// every set costs too many taps in a 50-minute session. It has to be a set with
// something IN it: a blank row waiting at the bottom of the exercise is not a
// set you can rate, and an RPE parked there would be dropped on save.
export function lastWorkingIndex(sets = []) {
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i] && roleOf(sets[i]) === "work" && isLogged(sets[i])) return i;
  }
  return -1;
}

// The load progression decisions are made against: the hardest WORKING set.
// Heaviest, except on an assist stack where the hardest set is the lightest (#9).
export function topWorkingLoad(sets = [], movement = null) {
  const loads = workingSets(sets).map(setLoad).filter((w) => w != null && w > 0);
  if (!loads.length) return null;
  return invertLoad(movement) ? Math.min(...loads) : Math.max(...loads);
}
