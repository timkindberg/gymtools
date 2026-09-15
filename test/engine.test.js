// The acceptance criteria of issues #7, #8 and #9 — the progression engine.
//
// Two kinds of test here:
//
//   1. The whole 2026-08-25 backup, run through the engine, with an expected
//      answer written down for all 20 movements. That table is the regression
//      net: any rule change that moves a number has to move it on purpose.
//   2. Synthetic histories for everything the backup can't show — a stall, a
//      deload, a pain flag, an assist stack — built as plain objects, because
//      the engine is pure and doesn't need the store to run.
import test from "node:test";
import assert from "node:assert/strict";

import { installBrowserGlobals, readFixture } from "./helpers.js";
installBrowserGlobals();

import {
  nextPrescription, loadStep, loadIncrement, progressionBand, stallState,
  summarize, beatsPrevious, capacityAt, trainingMax, symptomGate, MAX_JUMP,
} from "../js/engine.js";
import { getMovement } from "../js/movements.js";
import { repRange, timeRange, distanceRange } from "../js/measures.js";
import { applyInferredRoles } from "../js/sets.js";

const store = await import("../js/store.js");
const { findExercise } = await import("../js/program.js");

const fresh = () => { store.importData(readFixture("sessions-v1.json")); return store; };

// A session of this movement, as the engine reads history: roles inferred the
// way the app infers them when the set is logged.
const session = (movementId, date, sets, extra = {}) => {
  const mv = getMovement(movementId);
  const rows = sets.map(([weight, amount, rpe]) => {
    const s = { weight, amount };
    if (rpe != null) s.rpe = rpe;
    return s;
  });
  applyInferredRoles(rows, extra.prescription || null, mv);
  return { date, sets: rows, pain: !!extra.pain, deload: !!extra.deload };
};

const ask = (movementId, prescription, history, opts = {}) =>
  nextPrescription({ movement: getMovement(movementId), prescription, history, ...opts });

// ---- #7 the whole backup, with an answer for every movement -----------------

// slot → [action, load, target amount]. Every row is a judgement call about a
// real set of numbers; the comment says what makes it that call.
const EXPECTED = {
  // Ramped 105/145/145 to 165×8, topping a 5–8 range. Lower-body bar: 5–10%.
  a1: ["barbell-box-squat", "increase", 175, 5],
  // 135×8, 7, 6 — the range came apart set to set. Reps before load.
  a2: ["barbell-bench-press", "repeat", 135, 8],
  // 125×12 twice, top of 8–12. Upper-body bar: 2.5–5%, so +5 and not the old +10.
  a3: ["barbell-row", "increase", 130, 8],
  // 30×8, 8, 12 per hand. Two sets short of the range → reps, not the 35s yet.
  a4: ["db-reverse-lunge", "repeat", 30, 10],
  // 20, 20, 18 of a 15–20 range — one set short.
  a5: ["face-pull", "repeat", 40, 20],
  // Ramped to 37.5×12 against a flat 10. The rep range is spent, so the cable
  // takes its 2.5 lb step and the target resets to 10.
  a6: ["pallof-press-half-kneeling", "increase", 40, 10],
  // 140×12 twice (the 140×120 typo excluded), top of 8–12. Lower body: +10.
  c1: ["barbell-hip-thrust", "increase", 150, 8],
  // 25×8 per hand, flat 8. +5/hand is +20% — the reps stretch first (#7).
  c2: ["db-lateral-lunge", "repeat", 25, 10],
  c3: ["db-row-single-arm", "repeat", 55, 12],
  c4: ["single-leg-db-rdl", "repeat", 25, 10],
  // Opened at 30, failed, finished at 25. The settled weight is the working one.
  c5: ["incline-db-curl", "repeat", 25, 12],
  c6: ["db-skullcrusher", "repeat", 30, 15],
  // 45s and 45s at the top of 30–45. The old engine had nothing to say (#9).
  c7: ["side-plank", "increase", null, 55],
  b1: ["barbell-rdl", "increase", 175, 6],
  b2: ["lat-pulldown", "repeat", 160, 10],
  b3: ["barbell-incline-press", "repeat", 135, 10],
  b4: ["single-leg-leg-press", "repeat", 130, 12],
  b5: ["seated-leg-curl", "repeat", 150, 12],
  // THE headline bug: a flat +5 on a 12.5 lb cuff cable was +40%. Reps first.
  b6: ["cable-external-rotation", "repeat", 12.5, 17],
  // 60 lb for 30 yd then 40 yd. Distance before load, and never an est. 1RM (#9).
  b7: ["suitcase-carry", "repeat", 60, 40],
};

const suggestSlot = (slot, movementId, context = {}) => {
  const entry = store.getSessions().flatMap((s) => s.entries || []).find((e) => e.movementId === movementId);
  return store.suggestion(movementId, store.entryPrescription(entry), { exerciseId: slot, ...context });
};

test("every movement in the 2026-08-25 backup gets the answer it should", () => {
  fresh();
  for (const [slot, [movementId, action, weight, amount]] of Object.entries(EXPECTED)) {
    const sugg = suggestSlot(slot, movementId);
    assert.ok(sugg, `${slot} ${movementId}: no suggestion at all`);
    assert.equal(sugg.action, action, `${slot} ${movementId} action`);
    assert.equal(sugg.weight, weight, `${slot} ${movementId} load`);
    assert.equal(sugg.amount, amount, `${slot} ${movementId} target`);
  }
});

test("no suggestion adds more than 10% to the working load", () => {
  fresh();
  for (const [slot, [movementId]] of Object.entries(EXPECTED)) {
    const sugg = suggestSlot(slot, movementId);
    const from = store.movementSessions(movementId)[0];
    const prev = summarize(from, getMovement(movementId), store.entryPrescription(from.entry)).load;
    if (sugg.weight == null || prev == null || sugg.weight <= prev) continue;
    const jump = (sugg.weight - prev) / prev;
    if (jump <= MAX_JUMP) continue;
    // The one licensed exception: the implement's smallest step, paired with a
    // drop back to the bottom of the rep range so the session isn't harder.
    assert.ok(sugg.rebase, `${slot}: +${Math.round(jump * 100)}% without a rep reset`);
    assert.equal(sugg.weight - prev, loadIncrement(getMovement(movementId)));
  }
});

test("every suggestion says which sets it counted and why it picked the number", () => {
  fresh();
  for (const [slot, [movementId]] of Object.entries(EXPECTED)) {
    const sugg = suggestSlot(slot, movementId);
    assert.match(sugg.basis, /Counted \d+ working set/, slot);
    assert.ok(sugg.note.length > 20, `${slot} has no rationale`);
  }
});

// ---- #7 the increment table -------------------------------------------------

test("the increment is a percentage of the load, rounded to what the gym has", () => {
  const squat = getMovement("barbell-box-squat");
  assert.deepEqual(progressionBand(squat), { min: 0.05, max: 0.10 });
  assert.equal(loadStep(squat, 165).step, 10);        // 6% of 165
  assert.equal(loadStep(squat, 95).step, 5);          // 5% of 95 — one plate pair

  const bench = getMovement("barbell-bench-press");
  assert.deepEqual(progressionBand(bench), { min: 0.025, max: 0.05 });
  assert.equal(loadStep(bench, 135).step, 5);         // upper body moves slower

  const curl = getMovement("cable-curl");
  assert.equal(loadIncrement(curl), 2.5);             // his stack has 2.5s
  assert.equal(loadStep(curl, 60).step, 2.5);
});

test("when the smallest step in the gym is bigger than the target %, reps come first", () => {
  // The 12.5 lb cuff cable: even +2.5 is +20%. This is the rule that stops the
  // +40% jump without special-casing the rotator cuff.
  const cuff = loadStep(getMovement("cable-external-rotation"), 12.5);
  assert.equal(cuff.coarse, true);
  // And the same rule, unmodified, covers the dumbbell rack.
  assert.equal(loadStep(getMovement("db-reverse-lunge"), 30).coarse, true);
  // A 165 lb squat is nowhere near it.
  assert.equal(loadStep(getMovement("barbell-box-squat"), 165).coarse, false);
});

test("a bodyweight movement with no load has no load step", () => {
  assert.equal(loadIncrement(getMovement("side-plank")), null);
  assert.equal(loadIncrement(getMovement("band-face-pull")), null);
  assert.equal(loadStep(getMovement("side-plank"), 0), null);
});

test("the training max caps a lift that would run away from its own best set", () => {
  // One heavy single is not a licence to add 10% a week: 200×1 says ~200 for a
  // single, and nothing at all about 200 for eight.
  assert.equal(trainingMax(200), 180);          // 5/3/1's 90%
  assert.ok(capacityAt(200, 8) < 160);          // a 200 single is not 200 for eight

  const history = [
    session("barbell-bench-press", "2026-09-02T17:00:00Z", [[200, 3]], { prescription: repRange(3, 3) }),
  ];
  const sugg = ask("barbell-bench-press", repRange(3, 3), history);
  const ceiling = capacityAt(200 * (1 + 3 / 30), 3);
  assert.ok(sugg.weight <= ceiling + 5, `${sugg.weight} is past what 200×3 demonstrates`);
});

// ---- #7 pain and symptoms actually change the output ------------------------

test("pain flagged last session holds the load; twice suggests a swap", () => {
  const once = [
    session("barbell-bench-press", "2026-09-02T17:00:00Z", [[135, 8]], { prescription: repRange(5, 8), pain: true }),
    session("barbell-bench-press", "2026-08-31T17:00:00Z", [[135, 8]], { prescription: repRange(5, 8) }),
  ];
  const held = ask("barbell-bench-press", repRange(5, 8), once);
  assert.equal(held.action, "repeat");
  assert.equal(held.weight, 135);
  assert.equal(held.guard, "pain");
  assert.match(held.note, /pain/i);

  const swap = ask("barbell-bench-press", repRange(5, 8), [once[0], { ...once[1], pain: true }]);
  assert.equal(swap.action, "swap");
  assert.match(swap.note, /swap/i);
  assert.equal(swap.guard, "pain");
});

test("a flare on the joint a lift leans on holds the load for the day", () => {
  const history = [
    session("barbell-box-squat", "2026-09-02T17:00:00Z", [[165, 8]], { prescription: repRange(5, 8) }),
  ];
  const flare = ask("barbell-box-squat", repRange(5, 8), history, {
    flags: findExercise("a1").flags, symptoms: { knee: 6, tightness: 1, shoulder: 0, energy: 7, sleep: 7 },
  });
  assert.equal(flare.action, "repeat");
  assert.equal(flare.guard, "symptom");
  assert.match(flare.note, /knee/);

  // The same numbers on a good day top the range and add load.
  const fine = ask("barbell-box-squat", repRange(5, 8), history, {
    flags: findExercise("a1").flags, symptoms: { knee: 1, tightness: 1, shoulder: 0, energy: 7, sleep: 7 },
  });
  assert.equal(fine.action, "increase");

  // A cranky shoulder doesn't hold the squat — only the lifts flagged for it.
  assert.equal(symptomGate(["knee"], { shoulder: 8 }), null);
  assert.equal(symptomGate(["shoulder"], { shoulder: 8 }).symptom, "shoulder");
  // An empty tank holds everything.
  assert.equal(symptomGate([], { energy: 2 }).tank, true);
});

// ---- #8 stall detection and deload ------------------------------------------

const stuck = (rir = 1) => [
  session("barbell-box-squat", "2026-09-07T17:00:00Z", [[165, 6, 10 - rir]], { prescription: repRange(5, 8) }),
  session("barbell-box-squat", "2026-09-04T17:00:00Z", [[165, 6, 10 - rir]], { prescription: repRange(5, 8) }),
  session("barbell-box-squat", "2026-09-01T17:00:00Z", [[165, 6, 10 - rir]], { prescription: repRange(5, 8) }),
];

test("a stall is reps and load, not e1RM", () => {
  const p = repRange(5, 8);
  const mv = getMovement("barbell-box-squat");
  const summaries = stuck().map((h) => summarize(h, mv, p));
  const state = stallState(summaries, mv);
  assert.equal(state.consecutive, 2);
  assert.equal(state.deloadDue, true);

  // Beating the previous session on reps at the same load ends it…
  const better = [
    session("barbell-box-squat", "2026-09-10T17:00:00Z", [[165, 7, 9]], { prescription: p }),
    ...stuck(),
  ].map((h) => summarize(h, mv, p));
  assert.equal(stallState(better, mv).consecutive, 0);
  // …and so does more load at the same reps.
  assert.equal(beatsPrevious({ load: 170, best: 6 }, { load: 165, best: 6 }, mv), true);
  assert.equal(beatsPrevious({ load: 165, best: 6 }, { load: 165, best: 6 }, mv), false);
});

test("reps left in the tank is a light day, not a stall", () => {
  const mv = getMovement("barbell-box-squat"), p = repRange(5, 8);
  const easy = stuck(3).map((h) => summarize(h, mv, p));
  assert.equal(stallState(easy, mv).stalled, false);
});

test("two stalls deload ~10% and say why", () => {
  const sugg = ask("barbell-box-squat", repRange(5, 8), stuck());
  assert.equal(sugg.action, "deload");
  assert.equal(sugg.weight, 150);        // 90% of 165, on the 5 lb grid
  assert.equal(sugg.deload, true);
  assert.equal(sugg.reason, "stall");
  assert.match(sugg.note, /wall|stuck/i);
  assert.match(sugg.note, /165/, "and names the weight it expects to pass again");
});

test("there is an exit from repeat — the old engine had none", () => {
  // Three sessions of "repeat 165" is exactly what the previous engine did, for
  // ever. The engine now changes its mind on the third.
  const first = ask("barbell-box-squat", repRange(5, 8), stuck().slice(1));
  assert.equal(first.action, "repeat");
  assert.equal(ask("barbell-box-squat", repRange(5, 8), stuck()).action, "deload");
});

test("a deload already taken is not a stall, and the rebuild starts from it", () => {
  const history = [
    session("barbell-box-squat", "2026-09-10T17:00:00Z", [[150, 8]], { prescription: repRange(5, 8), deload: true }),
    ...stuck(),
  ];
  const mv = getMovement("barbell-box-squat");
  assert.equal(stallState(history.map((h) => summarize(h, mv, repRange(5, 8))), mv).consecutive, 0);
  const sugg = ask("barbell-box-squat", repRange(5, 8), history);
  assert.equal(sugg.action, "increase");
  assert.equal(sugg.weight, 160);
});

test("a scheduled deload week drops the load and a set", () => {
  const sugg = ask("barbell-box-squat", repRange(5, 8), [
    session("barbell-box-squat", "2026-09-07T17:00:00Z", [[165, 8]], { prescription: repRange(5, 8) }),
  ], { scheduledDeload: true });
  assert.equal(sugg.action, "deload");
  assert.equal(sugg.weight, 150);
  assert.equal(sugg.dropSet, true);
  assert.equal(sugg.reason, "scheduled");
});

test("the deload cadence counts trained weeks, and a week off resets it", () => {
  fresh();
  const status = store.deloadStatus();
  assert.equal(status.cadence, 4);
  assert.equal(status.streak, 2);       // the backup covers two weeks
  assert.equal(status.due, false);

  // Four consecutive trained weeks → due. A gap week is its own deload.
  const weeks = (dates) => ({
    version: 5, profile: { name: "Tim", units: "lb" }, bodyweight: [], settings: {},
    sessions: dates.map((d, i) => ({
      id: "w" + i, date: d, dayId: "A", dayName: "Day A",
      symptoms: { knee: 1, tightness: 2, shoulder: 1 },
      entries: [{
        exerciseId: "a1", movementId: "barbell-box-squat", name: "Barbell Box Squat",
        prescription: repRange(5, 8), measure: "reps", loadMode: "total",
        sets: [{ weight: 165, amount: 8, role: "work" }],
      }],
    })),
  });
  store.importData(weeks([
    "2026-08-03T17:00:00Z", "2026-08-10T17:00:00Z", "2026-08-17T17:00:00Z", "2026-08-24T17:00:00Z",
  ]));
  assert.equal(store.deloadStatus().streak, 4);
  assert.equal(store.deloadStatus().due, true);

  store.importData(weeks(["2026-08-03T17:00:00Z", "2026-08-17T17:00:00Z", "2026-08-24T17:00:00Z"]));
  assert.equal(store.deloadStatus().streak, 2, "the missed week was the rest");
  assert.equal(store.deloadStatus().due, false);

  store.importData(weeks([
    "2026-08-03T17:00:00Z", "2026-08-10T17:00:00Z", "2026-08-17T17:00:00Z", "2026-08-24T17:00:00Z",
  ]));
  store.setSettings({ deloadEveryWeeks: 0 });
  assert.equal(store.deloadStatus().due, false, "and it can be switched off");
});

test("a deload is recorded, so a chart and the report can tell it from a regression", () => {
  fresh();
  const data = JSON.parse(store.exportData());
  const squat = data.sessions.find((s) => s.entries.some((e) => e.movementId === "barbell-box-squat"))
    .entries.find((e) => e.movementId === "barbell-box-squat");
  squat.deload = true;
  store.importData(data);
  assert.equal(store.movementHistory("barbell-box-squat").at(-1).deload, true);
  assert.match(store.coachReport(), /planned reset, not a regression/);
});

test("the coach report and the engine share one stall definition", () => {
  fresh();
  const report = store.coachReport();
  // Nothing in the backup is stalled — every movement has a single session.
  assert.doesNotMatch(report, /STALLED/);
  assert.match(report, /## Deloads & stalls/);
  assert.match(report, /Cadence: deload after 4 consecutive trained weeks/);
  for (const id of store.loggedMovementIds()) {
    assert.equal(store.movementStall(id).stalled, false, id);
  }
});

// ---- #9 timed, bodyweight and carry work ------------------------------------

test("the side plank finally gets a suggestion", () => {
  const sugg = ask("side-plank", timeRange(30, 45, { perSide: true }), [
    session("side-plank", "2026-08-21T17:00:00Z", [[null, 45], [null, 45]], { prescription: timeRange(30, 45) }),
  ]);
  assert.equal(sugg.action, "increase");
  assert.equal(sugg.weight, null);
  assert.equal(sugg.amount, 55);
  assert.match(sugg.note, /dumbbell/, "or load it, which beats seconds eventually");
});

test("a carry progresses distance before load, and never reports a 1RM", () => {
  const short = ask("suitcase-carry", distanceRange(40, 40, { perSide: true }), [
    session("suitcase-carry", "2026-08-19T17:00:00Z", [[60, 30], [60, 40]], { prescription: distanceRange(40, 40) }),
  ]);
  assert.equal(short.action, "repeat");
  assert.equal(short.weight, 60);
  assert.equal(short.amount, 40);
  assert.match(short.note, /40 yd/);

  // Both trips at distance → stretch the walk, then the dumbbell.
  const done = ask("suitcase-carry", distanceRange(40, 40, { perSide: true }), [
    session("suitcase-carry", "2026-08-19T17:00:00Z", [[60, 40], [60, 40]], { prescription: distanceRange(40, 40) }),
  ]);
  assert.equal(done.amount, 45);
  const walked = ask("suitcase-carry", distanceRange(40, 40, { perSide: true }), [
    session("suitcase-carry", "2026-08-19T17:00:00Z", [[60, 45], [60, 45]], { prescription: distanceRange(40, 40) }),
  ]);
  assert.equal(walked.action, "increase");
  assert.equal(walked.weight, 65);
  assert.equal(walked.amount, 40, "and the walk goes back to the prescribed distance");
});

test("assistance comes DOWN, and the engine doesn't read that as a regression", () => {
  const mv = getMovement("assisted-pull-up");
  const p = repRange(6, 10);
  // 80 lb of assist for 10 reps: the work is to need less of it.
  const history = [
    session("assisted-pull-up", "2026-09-02T17:00:00Z", [[80, 10], [80, 10]], { prescription: p }),
  ];
  const sugg = ask("assisted-pull-up", p, history);
  assert.equal(sugg.action, "increase");
  assert.equal(sugg.weight, 75, "five pounds LESS help, not five pounds more");
  assert.match(sugg.note, /assistance/);

  // Less assist at the same reps is progress, not a drop.
  const better = [
    session("assisted-pull-up", "2026-09-05T17:00:00Z", [[70, 10]], { prescription: p }),
    ...history,
  ];
  const summaries = better.map((h) => summarize(h, mv, p));
  assert.equal(beatsPrevious(summaries[0], summaries[1], mv), true);
  assert.equal(stallState(summaries, mv).stalled, false);

  // And the hard set of a mixed session is the LIGHTEST one on an assist stack.
  const mixed = session("assisted-pull-up", "2026-09-09T17:00:00Z", [[100, 10], [80, 8], [80, 8]], { prescription: p });
  assert.equal(summarize(mixed, mv, p).load, 80);
  assert.equal(mixed.sets[0].role, "ramp");
});

test("a dead hang has somewhere to live now", () => {
  const slot = findExercise("c8");
  assert.equal(slot.movement, "dead-hang");
  assert.equal(slot.prescription.measure, "time");
  const sugg = ask("dead-hang", slot.prescription, [
    session("dead-hang", "2026-08-24T17:00:00Z", [[null, 25], [null, 25]], { prescription: slot.prescription }),
  ]);
  assert.equal(sugg.action, "repeat");        // 25s is short of the 45s ceiling
  assert.equal(sugg.amount, 45);
});

// ---- degrading gracefully ---------------------------------------------------

test("no history means no suggestion, not a guess", () => {
  assert.equal(ask("barbell-box-squat", repRange(5, 8), []), null);
  assert.equal(ask("barbell-box-squat", repRange(5, 8), [
    session("barbell-box-squat", "2026-09-02T17:00:00Z", [[null, null]], { prescription: repRange(5, 8) }),
  ]), null);
});

test("missing RPE degrades to the reps-only reading, never to something worse", () => {
  const p = repRange(5, 8);
  const quiet = ask("barbell-box-squat", p, [
    session("barbell-box-squat", "2026-09-02T17:00:00Z", [[165, 8]], { prescription: p }),
  ]);
  const told = ask("barbell-box-squat", p, [
    session("barbell-box-squat", "2026-09-02T17:00:00Z", [[165, 8, 8]], { prescription: p }),
  ]);
  assert.equal(quiet.action, "increase");
  assert.equal(quiet.weight, told.weight, "an RPE of 8 is what the engine already assumed");
  assert.doesNotMatch(quiet.basis, /RPE/);
});
