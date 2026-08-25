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
