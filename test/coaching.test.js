// Chunk 4 — the coaching model: seed ratios (#12), the warm-up ramp, and the
// weekly human-in-the-loop review (#11).
//
// The through-line of all three: a number the app didn't earn from this
// movement's own history has to be visibly marked as such, and must never
// become history.
import test from "node:test";
import assert from "node:assert/strict";

import { installBrowserGlobals, readFixture } from "./helpers.js";
installBrowserGlobals();

import { seedPrescription, warmupRamp, jumpPreview, progressionTerms, BAR_WEIGHT } from "../js/engine.js";
import { getMovement, seedSourcesFor, MOVEMENT_SLUGS } from "../js/movements.js";
import { repRange, timeRange } from "../js/measures.js";

const store = await import("../js/store.js");
const fresh = () => { store.importData(readFixture("sessions-v1.json")); return store; };

// ---- Seed ratios (#12) ------------------------------------------------------

test("every seed link registers in both directions with reciprocal ratios", () => {
  const forward = seedSourcesFor("barbell-row").find((s) => s.from === "db-row-single-arm");
  const back = seedSourcesFor("db-row-single-arm").find((s) => s.from === "barbell-row");
  assert.ok(forward && back);
  assert.ok(Math.abs(forward.ratio * back.ratio - 1) < 0.01);
});

test("seed links only ever point at movements that exist", () => {
  for (const slug of MOVEMENT_SLUGS) {
    for (const src of seedSourcesFor(slug)) assert.ok(getMovement(src.from), `${slug} ← ${src.from}`);
  }
});

test("a seed rounds DOWN to a real increment and says where it came from", () => {
  const seed = seedPrescription({
    movement: getMovement("barbell-row"),
    prescription: repRange(8, 12),
    sources: [{ from: "db-row-single-arm", name: "Single-Arm DB Row", load: 57, ratio: 2, date: "2026-08-21" }],
  });
  assert.equal(seed.weight, 110);        // 114 floored to the bar's 5 lb step
  assert.equal(seed.seeded, true);
  assert.equal(seed.source.movementId, "db-row-single-arm");
  assert.match(seed.note, /Single-Arm DB Row at 57/);
  assert.match(seed.basis, /not from this one's history/);
});

test("no seed for an assist stack, a bodyweight movement, or an empty source", () => {
  const args = { prescription: repRange(8, 12), sources: [{ from: "x", load: 100, ratio: 1 }] };
  assert.equal(seedPrescription({ ...args, movement: getMovement("assisted-pull-up") }), null);
  assert.equal(seedPrescription({ ...args, movement: getMovement("side-plank") }), null);
  assert.equal(seedPrescription({ movement: getMovement("barbell-row"), prescription: repRange(8, 12), sources: [] }), null);
});

test("the store seeds a first-time row from a logged cousin, and stops once it has its own history", () => {
  fresh();
  // The fixture rows 125 on the bar and 55/side one-armed, but has never done a
  // chest-supported row. Its best-ranked cousin is the barbell row.
  const seed = store.seedFor("chest-supported-db-row", repRange(8, 12));
  assert.ok(seed && seed.seeded);
  assert.equal(seed.source.movementId, "barbell-row");
  assert.equal(seed.weight, 55); // 125 / 2.2, floored to the rack's 5 lb step
  // A movement with real history is never seeded — the engine owns it.
  assert.equal(store.seedFor("barbell-row", repRange(8, 12)), null);
});

test("a seed never enters history, bests or the stall count", () => {
  fresh();
  const before = store.loggedMovementIds().slice();
  store.seedFor("chest-supported-db-row", repRange(8, 12));
  assert.deepEqual(store.loggedMovementIds(), before);
  assert.deepEqual(store.movementBests("chest-supported-db-row"), { maxLoad: 0, maxAmount: 0 });
  assert.equal(store.movementStall("chest-supported-db-row").stalled, false);
});

// ---- Warm-up ramp -----------------------------------------------------------

test("a heavy barbell lift ramps from the bar, in rising, well-spaced steps", () => {
  const ramp = warmupRamp(getMovement("barbell-box-squat"), 165);
  assert.equal(ramp[0].load, BAR_WEIGHT);
  assert.ok(ramp.length >= 3);
  for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i].load > ramp[i - 1].load);
  assert.ok(ramp.at(-1).load < 165);
  assert.ok(ramp.at(-1).amount < ramp[0].amount); // heavier ramps, fewer reps
});

test("nothing to ramp: isolation work, light loads, timed work, assist stacks", () => {
  assert.deepEqual(warmupRamp(getMovement("incline-db-curl"), 30), []);
  assert.deepEqual(warmupRamp(getMovement("cable-external-rotation"), 12.5), []);
  assert.deepEqual(warmupRamp(getMovement("barbell-bench-press"), 55), []);
  assert.deepEqual(warmupRamp(getMovement("side-plank"), 0, { measure: "time" }), []);
  assert.deepEqual(warmupRamp(getMovement("assisted-pull-up"), 80), []);
});

// ---- The weekly review loop (#11) -------------------------------------------

test("an override steers the next session and carries the engine's answer with it", () => {
  fresh();
  const engine = store.suggestion("barbell-box-squat", repRange(5, 8));
  assert.equal(engine.action, "increase");
  store.setOverride("barbell-box-squat", { weight: 155, amount: 8, note: "knee felt off" });
  const after = store.suggestion("barbell-box-squat", repRange(5, 8));
  assert.equal(after.action, "override");
  assert.equal(after.weight, 155);
  assert.equal(after.amount, 8);
  assert.equal(after.engine.weight, engine.weight);   // what was overruled, kept
  assert.match(after.note, /knee felt off/);
  assert.match(after.basis, /weekly review/);
});

test("an override retires itself once the movement has been trained again", () => {
  fresh();
  store.setOverride("barbell-box-squat", { weight: 155, date: "2026-08-20T00:00:00.000Z" });
  // The fixture's most recent box squat is 2026-08-24, i.e. after the override.
  assert.equal(store.overrideFor("barbell-box-squat"), null);
  assert.equal(store.suggestion("barbell-box-squat", repRange(5, 8)).action, "increase");
});

test("adjustment lines parse names, slugs, notes and clears — and report what they can't read", () => {
  fresh();
  const res = store.applyOverrideText([
    "Barbell Bench Press: 155 x 8 — you left 3 in the tank",
    "barbell-row: 130",
    "Squatting Machine 9000: 200",
    "not a line at all",
  ].join("\n"));
  assert.deepEqual(res.applied, ["Barbell Bench Press", "Barbell Row"]);
  assert.equal(res.errors.length, 2);
  assert.equal(store.overrideFor("barbell-bench-press").weight, 155);
  assert.equal(store.overrideFor("barbell-bench-press").amount, 8);
  assert.match(store.overrideFor("barbell-bench-press").note, /left 3 in the tank/);
  assert.equal(store.overrideFor("barbell-row").amount, null);

  const cleared = store.applyOverrideText("Barbell Row: clear");
  assert.deepEqual(cleared.cleared, ["Barbell Row"]);
  assert.equal(store.overrideFor("barbell-row"), null);
});

test("every override is logged against what the engine had proposed", () => {
  fresh();
  store.setOverride("barbell-box-squat", { weight: 200 });
  const [entry] = store.getOverrideLog();
  assert.equal(entry.movementId, "barbell-box-squat");
  assert.equal(entry.weight, 200);
  assert.equal(entry.engineWeight, 175);  // the engine's own answer, frozen
});

// ---- Coach report v2 (#11) --------------------------------------------------

test("the report carries next-session proposals for the movements the app will prescribe", () => {
  fresh();
  const names = store.nextSessionProposals().map((n) => n.name);
  assert.ok(names.includes("Barbell Box Squat"));
  const squat = store.nextSessionProposals().find((n) => n.name === "Barbell Box Squat");
  assert.equal(squat.slot, "a1");
  assert.equal(squat.weight, 175);
  assert.ok(squat.note && squat.basis);

  const report = store.coachReport();
  assert.match(report, /## Next session — what the app will prescribe/);
  assert.match(report, /\*\*Barbell Box Squat\*\* \(slot a1\) → \*\*175lb/);
});

test("the report shows every working set with its role, not just the best one", () => {
  fresh();
  const report = store.coachReport();
  // 2026-08-21: he failed the opener at 30 and backed off to 25. The v1 report
  // reported "top set 30" and hid the regression entirely.
  assert.match(report, /\*\*Incline DB Curl\*\*: 30×10 \[fail\], 25×10, 25×10/);
  assert.match(report, /\[ramp\]/);
});

test("the report carries the per-exercise notes the RPE signal lives in", () => {
  fresh();
  const report = store.coachReport();
  assert.match(report, /Could add 5 per hand/);
  assert.match(report, /3rd last couple were super hard/);
});

test("est 1RM is labelled as an estimate, and absent where it means nothing", () => {
  fresh();
  const report = store.coachReport();
  assert.match(report, /Epley estimate from reps, never tested/);
  assert.match(report, /Side Plank.*no est 1RM \(time-based\)/);
});

test("the report states which overrides are live and which way they've been going", () => {
  fresh();
  assert.match(store.coachReport(), /None in effect/);
  store.setOverride("barbell-box-squat", { weight: 200, note: "push it" });
  const report = store.coachReport();
  assert.match(report, /\*\*Barbell Box Squat\*\* → 200lb/);
  assert.match(report, /the app had 175lb/);
  assert.match(report, /push it/);
});

test("a flagged typo still never reaches a proposal", () => {
  fresh();
  const thrust = store.nextSessionProposals().find((n) => n.movementId === "barbell-hip-thrust");
  assert.ok(thrust.weight < 200); // 140 × 120 would have proposed something absurd
});

// ---- The prescription, as the redesigned card states it ---------------------
// The card leads with the load, so the range and the terms have to be stated
// explicitly: "×8" when the range is 8–12 reads as "stop at 8".

test("a suggestion carries a short headline and the range it was read against", () => {
  fresh();
  const sugg = store.suggestion("barbell-box-squat", repRange(5, 8));
  assert.equal(sugg.headline, "Load goes up");
  assert.deepEqual(sugg.range, { floor: 5, ceiling: 8 });
  assert.ok(sugg.note.length > sugg.headline.length); // the sentence still exists
});

test("jumpPreview says what topping the range earns", () => {
  const bar = jumpPreview(getMovement("barbell-hip-thrust"), 150, repRange(8, 12));
  assert.equal(bar.coarse, false);
  assert.equal(bar.at, 12);
  assert.equal(bar.load, 160);
  // A dumbbell rack whose smallest step is 20% of the load progresses by reps.
  const db = jumpPreview(getMovement("incline-db-curl"), 25, repRange(10, 12));
  assert.equal(db.coarse, true);
  assert.equal(db.at, 14);  // stretch past the ceiling first
  assert.equal(db.inc, 5);
  assert.equal(jumpPreview(getMovement("side-plank"), 0, timeRange(45, 60)), null);
});

test("the terms line states today's floor and what earns the next jump", () => {
  fresh();
  const mv = getMovement("barbell-hip-thrust");
  const prescription = repRange(8, 12);
  const sugg = store.suggestion("barbell-hip-thrust", prescription);
  assert.equal(sugg.weight, 150);
  assert.equal(sugg.amount, 8);   // the floor at the new load, not the ceiling
  assert.equal(
    progressionTerms(sugg, { movement: mv, prescription, units: "lb" }),
    "Clear 8 today. Every set at 12 takes you to 160 lb.",
  );
});

test("a hold states the ceiling, because that's what releases the load", () => {
  const mv = getMovement("barbell-bench-press");
  const prescription = repRange(5, 8);
  const held = { action: "repeat", weight: 135, amount: 8, range: { floor: 5, ceiling: 8 } };
  assert.equal(
    progressionTerms(held, { movement: mv, prescription, units: "lb" }),
    "Every set to 8 — that's what takes you to 140 lb.",
  );
});

test("a coarse rack is told to stretch the range, not to wait for a jump it can't take", () => {
  const mv = getMovement("incline-db-curl");
  const prescription = repRange(10, 12);
  const sugg = { action: "repeat", weight: 25, amount: 14, extend: true, range: { floor: 10, ceiling: 12 } };
  assert.equal(
    progressionTerms(sugg, { movement: mv, prescription, units: "lb" }),
    "Clear 14 on every set. 14 is what earns the 5 lb jump.",
  );
});

test("guarded and deloaded lifts are told to hold, with nothing dangled", () => {
  const mv = getMovement("barbell-box-squat");
  const prescription = repRange(5, 8);
  const opts = { movement: mv, prescription, units: "lb" };
  assert.match(progressionTerms({ action: "repeat", guard: "pain", weight: 165, amount: 8 }, opts), /pain was flagged/);
  assert.match(progressionTerms({ action: "repeat", guard: "symptom", weight: 165, amount: 8 }, opts), /still be there/);
  assert.match(
    progressionTerms({ action: "deload", weight: 150, amount: 5, from: 165 }, opts),
    /Deload: 5 at 150, then back to 165\./,
  );
  assert.equal(progressionTerms(null, opts), null);
});
