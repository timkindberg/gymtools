import test from "node:test";
import assert from "node:assert/strict";

import { applyInferredRoles, inferSetRoles, workingSets, topWorkingLoad, roleLabel, nextRole } from "../js/sets.js";

const sets = (pairs) => pairs.map(([weight, amount]) => ({ weight, amount }));
const roles = (pairs) => inferSetRoles(sets(pairs)).map((r) => (r.failed ? "failed" : r.role));

test("ramp-up sets are the ones below the top set that come before it", () => {
  // a1 Barbell Box Squat, 2026-08-24 — the program explicitly asks for a ramp.
  assert.deepEqual(roles([[105, 8], [145, 8], [145, 8], [165, 8]]), ["ramp", "ramp", "ramp", "work"]);
  // b1 Barbell RDL — one ramp, three working sets at the same load.
  assert.deepEqual(roles([[138, 8], [165, 8], [165, 8], [165, 8]]), ["ramp", "work", "work", "work"]);
  // a6 Pallof — a ramp all the way up.
  assert.deepEqual(roles([[22.5, 12], [32.5, 12], [37.5, 12]]), ["ramp", "ramp", "work"]);
});

test("a ramp set logged short of the rep target does not become a working set", () => {
  const s = sets([[105, 3], [165, 8]]);
  applyInferredRoles(s);
  assert.deepEqual(workingSets(s).map((x) => x.weight), [165]);
});

test("straight sets are all working sets", () => {
  assert.deepEqual(roles([[30, 15], [30, 15], [30, 8]]), ["work", "work", "work"]);
});

test("a failed opener is flagged, and the settled weight is the working weight", () => {
  // c5 Incline DB Curl — opened at 30, "3rd last couple were super hard",
  // dropped to 25 for the rest. The old engine suggested repeating 30.
  const s = sets([[30, 10], [25, 10], [25, 10]]);
  applyInferredRoles(s);
  assert.deepEqual(s.map((x) => x.role), ["backoff", "work", "work"]);
  assert.equal(s[0].failed, true);
  assert.equal(roleLabel(s[0]), "fail");
  assert.equal(topWorkingLoad(s), 25);
});

const BENCH = { measure: "reps", min: 5, max: 8 };

test("a top set that misses its rep range and is followed by lighter ones is a failure", () => {
  // Ramp first — which is how the program tells him to lift — then fail. The
  // opener shape can't see this one; the rep count can.
  const s = sets([[95, 8], [135, 3], [115, 8], [115, 8]]);
  applyInferredRoles(s, BENCH);
  assert.deepEqual(s.map((x) => x.role), ["ramp", "backoff", "work", "work"]);
  assert.equal(s[1].failed, true);
  assert.equal(topWorkingLoad(s), 115);
});

test("one lighter set is enough when the top set missed the range outright", () => {
  const s = sets([[95, 8], [135, 3], [115, 8]]);
  applyInferredRoles(s, BENCH);
  assert.equal(s[1].failed, true);
  assert.equal(topWorkingLoad(s), 115);
});

test("a top set that finished its range is a planned back-off, not a failure", () => {
  const s = sets([[135, 8], [115, 10], [115, 10]]);
  applyInferredRoles(s, BENCH);
  assert.deepEqual(s.map((x) => x.role), ["work", "backoff", "backoff"]);
  assert.equal(s.some((x) => x.failed), false);
  assert.equal(topWorkingLoad(s), 135);
});

test("in-range but retreating from the opener still reads as a failure", () => {
  // c5's curl: 30×10 is inside a 10–12 range, but he spent the rest of the
  // exercise underneath it. With no prescription at all, same answer.
  const curl = { measure: "reps", min: 10, max: 12 };
  const withRange = sets([[30, 10], [25, 10], [25, 10]]);
  applyInferredRoles(withRange, curl);
  assert.equal(withRange[0].failed, true);
  assert.equal(topWorkingLoad(withRange), 25);

  const without = sets([[30, 10], [25, 10], [25, 10]]);
  applyInferredRoles(without);
  assert.equal(without[0].failed, true);
});

test("a clean ramp to a top set is never a failure", () => {
  const s = sets([[105, 8], [145, 8], [145, 8], [165, 8]]);
  applyInferredRoles(s, BENCH);
  assert.equal(s.some((x) => x.failed), false);
  assert.equal(topWorkingLoad(s), 165);
});

test("reps collapsing at one weight is three working sets, not a failure", () => {
  // Nothing was backed off from, so there's no lighter working weight to find.
  // The suggestion handles it by refusing to add load.
  const s = sets([[135, 8], [135, 3], [135, 2]]);
  applyInferredRoles(s, BENCH);
  assert.deepEqual(s.map((x) => x.role), ["work", "work", "work"]);
  assert.equal(s.some((x) => x.failed), false);
});

test("a single lighter set after the top set is an ordinary back-off", () => {
  assert.deepEqual(roles([[30, 10], [25, 10]]), ["work", "backoff"]);
  assert.deepEqual(roles([[25, 10], [30, 10], [25, 10]]), ["ramp", "work", "backoff"]);
});

test("unloaded work is all working sets — there is no ramp to detect", () => {
  assert.deepEqual(roles([[null, 45], [null, 45]]), ["work", "work"]);
});

test("a role the athlete set by hand is never overwritten", () => {
  const s = sets([[105, 8], [145, 8], [165, 8]]);
  s[0].role = "work";
  s[0].roleLocked = true;
  applyInferredRoles(s);
  assert.equal(s[0].role, "work");
  assert.equal(s[1].role, "ramp");
});

test("tapping the badge cycles through the three roles", () => {
  assert.equal(nextRole("ramp"), "work");
  assert.equal(nextRole("work"), "backoff");
  assert.equal(nextRole("backoff"), "ramp");
});
