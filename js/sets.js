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

import { setAmount, setLoad } from "./measures.js";

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
// alone. (RPE, when it lands in #5, is the sharper version of the same
// question — this reads what the reps already say.)
export function inferSetRoles(sets = [], prescription = null) {
  const idxs = loggedIndices(sets);
  const result = sets.map((_, index) => ({ index, role: "work", failed: false }));
  if (idxs.length < 2) return result;

  const loadAt = (i) => setLoad(sets[i]);
  const amountAt = (i) => setAmount(sets[i]);
  const top = Math.max(...idxs.map(loadAt));
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

  const failedTop = after.length > 0 && after.every((i) => loadAt(i) < top) &&
    (cameUpShort || retreatedFromOpener);

  if (failedTop) {
    const settled = Math.max(...after.map(loadAt));
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
export function applyInferredRoles(sets = [], prescription = null) {
  const inferred = inferSetRoles(sets, prescription);
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

// The load progression decisions are made against: the heaviest WORKING set.
export function topWorkingLoad(sets = []) {
  const loads = workingSets(sets).map(setLoad).filter((w) => w != null && w > 0);
  return loads.length ? Math.max(...loads) : null;
}
