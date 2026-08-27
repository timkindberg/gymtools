// Issue #5: RPE / reps-in-reserve — the scale, and what it means for next time.
import test from "node:test";
import assert from "node:assert/strict";

import {
  rpeFromRir, rirFromRpe, setRpe, setRir, hasEffort, recordEffort,
  effortLabel, effortGlyph, targetRir, workingEffort, effortVerdict,
  RIR_CHOICES, RIR_CAP,
} from "../js/effort.js";

test("the scale is Zourdos: 10 = failure, 9 = one left, 8 = two left", () => {
  assert.equal(rpeFromRir(0), 10);
  assert.equal(rpeFromRir(1), 9);
  assert.equal(rpeFromRir(2), 8);
  assert.equal(rpeFromRir(3), 7);
  assert.equal(rirFromRpe(10), 0);
  assert.equal(rirFromRpe(8), 2);
});

test("'4+ left' is the bottom of the chip row — past that it was a warm-up", () => {
  assert.deepEqual(RIR_CHOICES, [0, 1, 2, 3, 4]);
  assert.equal(rpeFromRir(4), 6);
  assert.equal(rpeFromRir(9), 6, "clamped, not extrapolated");
  assert.equal(rirFromRpe(5), RIR_CAP);
});

test("a set carries its RPE, and one more tap takes it away", () => {
  const set = { weight: 165, amount: 8 };
  assert.equal(hasEffort(set), false);
  assert.equal(setRir(set), null);

  recordEffort(set, 2);
  assert.equal(set.rpe, 8);
  assert.equal(setRpe(set), 8);
  assert.equal(setRir(set), 2);
  assert.equal(effortLabel(set), "RPE 8 · 2 left");
  assert.equal(effortGlyph(set), " @8");

  recordEffort(set, null);
  assert.equal("rpe" in set, false, "clearing removes the key rather than storing a null");
  assert.equal(effortGlyph(set), "");
});

test("the programmed RPE reads back in the language the chips speak", () => {
  assert.equal(targetRir("8"), 2);   // every top set in the program
  assert.equal(targetRir("10"), 0);  // accessories taken to failure
  assert.equal(targetRir(""), null);
  assert.equal(targetRir(undefined), null);
});

test("the effort that counts is the last working set to carry one", () => {
  const sets = [{ rpe: 7 }, { rpe: 9 }, {}];
  assert.equal(workingEffort(sets).rpe, 9);
  assert.equal(workingEffort([{}, {}]), null);
  assert.equal(workingEffort([]), null);
});

// ---- What it means for the next session ------------------------------------

const verdict = (rir, hitTarget) => effortVerdict({ rir, hitTarget });

test("no RPE degrades to exactly the reps-only behaviour", () => {
  assert.deepEqual(verdict(null, true), { code: "reps-only", steps: 1, rir: null, hitTarget: true });
  assert.deepEqual(verdict(null, false), { code: "reps-only", steps: 0, rir: null, hitTarget: false });
});

test("four or more in the tank means the load was the limiter, not the reps", () => {
  // a4 Reverse Lunge 30×8, "could maybe handle 5 more on each side": the reps
  // stopped short of the range and the app still has to add weight.
  assert.equal(verdict(4, false).code, "too-light");
  assert.equal(verdict(4, false).steps, 1);
  // …and topping the range that easy is worth two increments.
  assert.equal(verdict(4, true).steps, 2);
});

test("at failure, the answer is hold — whether or not the range was topped", () => {
  // b2 Lat Pulldown 160×8 of 6–10, "7/8th were not complete reps": today the
  // app says "aim to add reps at 160". You cannot add reps to a set you already
  // failed on.
  assert.equal(verdict(0, false).code, "at-failure");
  assert.equal(verdict(0, false).steps, 0);
  assert.equal(verdict(0, true).steps, 0);
});

test("one left adds load only once the range is topped", () => {
  assert.equal(verdict(1, true).steps, 1);
  assert.equal(verdict(1, false).steps, 0);
});

test("two or three left is textbook double progression", () => {
  assert.equal(verdict(2, true).steps, 1);
  assert.equal(verdict(3, true).steps, 1);
  assert.equal(verdict(2, false).steps, 0);
});
