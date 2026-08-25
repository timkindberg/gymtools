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
export function inferSetRoles(sets = []) {
  const idxs = loggedIndices(sets);
  const result = sets.map((_, index) => ({ index, role: "work", failed: false }));
  if (idxs.length < 2) return result;

  const loadAt = (i) => setLoad(sets[i]);
  const loads = idxs.map(loadAt);
  const top = Math.max(...loads);
  const firstTop = idxs.find((i) => loadAt(i) === top);
  const lastTop = idxs.filter((i) => loadAt(i) === top).pop();

  // Failed opener: he led with the heaviest set, then everything after it was
  // lighter. That is a regression, not a ramp and not a planned back-off — the
  // opener was too heavy, and the weight he settled at is the working weight.
  const after = idxs.filter((i) => i > firstTop);
  const openerFailed =
    firstTop === idxs[0] && firstTop === lastTop && after.length >= 2 && after.every((i) => loadAt(i) < top);

  if (openerFailed) {
    const settled = Math.max(...after.map(loadAt));
    result[firstTop] = { index: firstTop, role: "backoff", failed: true };
    for (const i of after) {
      result[i] = { index: i, role: loadAt(i) === settled ? "work" : "backoff", failed: false };
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
export function applyInferredRoles(sets = []) {
  const inferred = inferSetRoles(sets);
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
