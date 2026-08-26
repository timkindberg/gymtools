import test from "node:test";
import assert from "node:assert/strict";

import { getMovement } from "../js/movements.js";
import {
  repRange, timeRange, distanceRange, formatPrescription, prescriptionFor,
  canEstimate1RM, estimate1RM, setVolume, formatSet, validateSet, setAmount, LIMITS,
} from "../js/measures.js";
import { findExercise } from "../js/program.js";

test("prescriptions render the way the program used to read", () => {
  assert.equal(formatPrescription(repRange(5, 8)), "5–8");
  assert.equal(formatPrescription(repRange(8, 10, { perSide: true })), "8–10/side");
  assert.equal(formatPrescription(repRange(10, 10, { perSide: true })), "10/side");
  assert.equal(formatPrescription(timeRange(30, 45, { perSide: true })), "30–45s/side");
  assert.equal(formatPrescription(distanceRange(40, 40, { perSide: true })), "40 yd/side");
});

test("the four units that used to be crammed into the reps column are typed", () => {
  assert.equal(findExercise("b7").prescription.measure, "distance"); // 40 yd/side
  assert.equal(findExercise("c7").prescription.measure, "time");     // 30–45s/side
  assert.equal(findExercise("c2").prescription.perSide, true);       // 8/side
  assert.equal(findExercise("a4").prescription.perSide, true);       // 8–10/side
});

test("swapping to a movement with another measure takes its prescription", () => {
  // b7 is a carry; 🎲 lands on the Side Plank, which is timed.
  const carry = prescriptionFor(findExercise("b7"), getMovement("suitcase-carry"));
  assert.equal(carry.measure, "distance");
  const plank = prescriptionFor(findExercise("b7"), getMovement("side-plank"));
  assert.equal(plank.measure, "time");
  assert.equal(plank.perSide, true);
});

test("est. 1RM is computed only where Epley means something", () => {
  const bench = getMovement("barbell-bench-press");
  assert.equal(canEstimate1RM(bench, { weight: 135, amount: 8 }), true);
  assert.equal(Math.round(estimate1RM(bench, { weight: 135, amount: 8 })), 171);

  // Suitcase Carry: 60 lb × 40 YARDS used to report a 140 lb 1RM.
  assert.equal(estimate1RM(getMovement("suitcase-carry"), { weight: 60, amount: 40 }), null);
  // Side Plank: seconds, and unloaded.
  assert.equal(estimate1RM(getMovement("side-plank"), { weight: null, amount: 45 }), null);
  // The 140 × 120 typo is past the rep ceiling, so no 700 lb 1RM.
  assert.equal(estimate1RM(getMovement("barbell-hip-thrust"), { weight: 140, amount: 120 }), null);
  // Assisted work: the load reduces the effort, so it isn't a 1RM input.
  assert.equal(estimate1RM(getMovement("assisted-pull-up"), { weight: 80, amount: 8 }), null);
});

test("volume is pounds of rep work only", () => {
  assert.equal(setVolume(getMovement("barbell-bench-press"), { weight: 135, amount: 8 }), 1080);
  // Per-hand loads move two dumbbells.
  assert.equal(setVolume(getMovement("db-reverse-lunge"), { weight: 30, amount: 8 }), 480);
  // Yards and seconds are not pounds.
  assert.equal(setVolume(getMovement("suitcase-carry"), { weight: 60, amount: 40 }), 0);
  assert.equal(setVolume(getMovement("side-plank"), { weight: null, amount: 45 }), 0);
});

test("sets read in their own units", () => {
  assert.equal(formatSet(getMovement("barbell-bench-press"), { weight: 135, amount: 8 }), "135×8");
  assert.equal(formatSet(getMovement("suitcase-carry"), { weight: 60, amount: 40 }), "60×40yd");
  assert.equal(formatSet(getMovement("side-plank"), { weight: null, amount: 45 }), "45s");
});

test("sets logged before the rename still read correctly", () => {
  assert.equal(setAmount({ weight: 135, reps: 8 }), 8);
  assert.equal(setAmount({ weight: 135, amount: 8 }), 8);
  assert.equal(setAmount({ weight: 135 }), null);
});

test("implausible numbers warn, plausible ones don't", () => {
  const hipThrust = getMovement("barbell-hip-thrust");
  const [warning] = validateSet(hipThrust, { weight: 140, amount: 120 });
  assert.equal(warning.code, "high-amount");
  assert.deepEqual(validateSet(hipThrust, { weight: 140, amount: 12 }), []);

  assert.equal(validateSet(hipThrust, { weight: 700, amount: 8 })[0].code, "high-weight");

  // A 3× jump on a movement's own history.
  const jump = validateSet(hipThrust, { weight: 500, amount: 8 }, { maxLoad: 140 });
  assert.equal(jump[0].code, "load-jump");
  assert.deepEqual(validateSet(hipThrust, { weight: 150, amount: 8 }, { maxLoad: 140 }), []);

  // A 40-yard carry is normal for a carry, and 45 seconds for a plank.
  assert.deepEqual(validateSet(getMovement("suitcase-carry"), { weight: 60, amount: 40 }), []);
  assert.deepEqual(validateSet(getMovement("side-plank"), { weight: null, amount: 45 }), []);
  assert.equal(LIMITS.reps, 30);
});
