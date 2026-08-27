// The acceptance criteria of issues #2–#6, run against a v1 backup.
import test from "node:test";
import assert from "node:assert/strict";

import { installBrowserGlobals, readFixture } from "./helpers.js";
installBrowserGlobals();

const store = await import("../js/store.js");
const { findExercise } = await import("../js/program.js");
const { getMovement } = await import("../js/movements.js");
const { harderSide, harderSideLabel } = await import("../js/effort.js");

const fixture = () => readFixture("sessions-v1.json");
const fresh = () => { store.importData(fixture()); return store; };

const suggestFor = (slotId, movementId) => {
  const slot = findExercise(slotId);
  return store.suggestion(movementId || slot.movement, slot.prescription);
};

// ---- #2 movement-keyed history ---------------------------------------------

test("a v1 backup imports with every entry attributed to a movement", () => {
  fresh();
  const data = store.load();
  assert.equal(data.version, store.DATA_VERSION);
  assert.equal(data.sessions.length, 3);
  for (const s of data.sessions) {
    for (const e of s.entries) {
      assert.ok(e.movementId, `${s.id}/${e.exerciseId} has no movementId`);
      assert.ok(getMovement(e.movementId), `${e.movementId} is not in the registry`);
      assert.ok(e.measure, `${e.exerciseId} has no measure`);
    }
  }
});

test("a 🎲 swap is attributed to the movement performed, not the slot", () => {
  fresh();
  const entry = (sessionId, slot) =>
    store.getSessions().find((s) => s.id === sessionId).entries.find((e) => e.exerciseId === slot);
  assert.equal(entry("s1", "b3").movementId, "barbell-incline-press"); // logged as Barbell Incline Press
  assert.equal(entry("s3", "a3").movementId, "barbell-row");           // logged as Barbell Row
  assert.equal(entry("s2", "c6").movementId, "db-skullcrusher");       // logged as DB Skull-crusher
});

test("logging an incline press in the shoulder-press slot never suggests a shoulder-press load", () => {
  fresh();
  // The exact bug: b3's next session used to be told to repeat 135 — a barbell
  // incline weight — for a per-dumbbell Seated DB Shoulder Press.
  assert.equal(store.lastPerformance("db-shoulder-press-seated"), null);
  assert.equal(suggestFor("b3"), null);
  // The incline press keeps its own history, under its own name.
  assert.equal(store.lastPerformance("barbell-incline-press").sets.length, 3);
});

test("the other two cross-implement slots are clean too", () => {
  fresh();
  assert.equal(suggestFor("a3"), null); // Chest-Supported DB Row — never logged
  assert.equal(suggestFor("c6"), null); // Triceps Rope Pushdown — never logged
  // …and the barbell row he actually did keeps its own, correct suggestion.
  assert.equal(store.suggestion("barbell-row", findExercise("a3").prescription).weight, 135);
});

test("the slot still remembers what happened in it — as context, not as a load", () => {
  fresh();
  const slot = store.lastPerformanceInSlot("b3");
  assert.equal(slot.movementId, "barbell-incline-press");
  assert.equal(slot.entry.exerciseId, "b3");
});

test("one movement performed in two slots is one history and one chart series", () => {
  const data = fixture();
  // Day A's row slot ran its default; Day C's row slot was swapped to it.
  data.sessions[2].entries[2] = {
    exerciseId: "a3", name: "Chest-Supported DB Row", variant: null, pain: false, note: "",
    sets: [{ weight: 50, reps: 12 }, { weight: 50, reps: 12 }],
  };
  data.sessions[1].entries[2] = {
    exerciseId: "c3", name: "Single-Arm DB Row", variant: "Chest-Supported Row", pain: false, note: "",
    sets: [{ weight: 45, reps: 12 }, { weight: 45, reps: 12 }],
  };
  store.importData(data);
  const hist = store.movementHistory("chest-supported-db-row");
  assert.equal(hist.length, 2, "both slots feed the same series");
  assert.deepEqual(hist.map((h) => h.topWeight), [45, 50]);
});

test("migrations are idempotent", () => {
  fresh();
  const once = JSON.parse(store.exportData());
  // Re-run every step over already-migrated data.
  store.importData({ ...once, version: 1 });
  const twice = JSON.parse(store.exportData());
  assert.deepEqual(twice.sessions, once.sessions);
});

// ---- #3 set roles -----------------------------------------------------------

test("ramp-up sets are classified on import and kept out of the working load", () => {
  fresh();
  const squat = store.lastPerformance("barbell-box-squat");
  assert.deepEqual(squat.sets.map((s) => s.role), ["ramp", "ramp", "ramp", "work"]);
  const hist = store.movementHistory("barbell-box-squat").at(-1);
  assert.equal(hist.sets, 1, "only the 165 counted");
  assert.equal(hist.volume, 165 * 8);
});

test("a ramp does not block a load increase", () => {
  fresh();
  // a1: 105/145/145 ramping to 165×8, top of a 5–8 range → add load.
  const sugg = suggestFor("a1");
  assert.equal(sugg.action, "increase");
  assert.equal(sugg.weight, 175);
  assert.match(sugg.basis, /ignored 3 ramp-up sets/);
});

test("a failed opener resolves to the settled weight, not the weight he failed", () => {
  fresh();
  // c5: 30 / 25 / 25. The old engine said "repeat 30".
  const sugg = suggestFor("c5");
  assert.equal(sugg.action, "repeat");
  assert.equal(sugg.weight, 25);
  assert.match(sugg.note, /opened at 30/);
  assert.match(sugg.basis, /failed set at 30/);
  const sets = store.lastPerformance("incline-db-curl").sets;
  assert.equal(sets[0].failed, true);
  assert.equal(sets[0].role, "backoff");
});

test("charts and e1RM read working sets only", () => {
  fresh();
  const rdl = store.movementHistory("barbell-rdl").at(-1);
  assert.equal(rdl.sets, 3);              // the 138 ramp is excluded
  assert.equal(rdl.volume, 165 * 8 * 3);
  assert.equal(rdl.e1rm, Math.round(165 * (1 + 8 / 30)));
});

test("every suggestion says which sets it counted", () => {
  fresh();
  for (const id of store.loggedMovementIds()) {
    const sugg = store.suggestion(id, { measure: "reps", min: 8, max: 10, perSide: false });
    if (sugg) assert.match(sugg.basis, /Counted \d+ working set/);
  }
});

test("a top set failed AFTER a ramp is caught too, not just a failed opener", () => {
  // The shape every barbell lift here is logged in: ramp, miss the range on the
  // top set, come back down. Reading the load sequence alone would call the 135
  // a working set and tell him to repeat it.
  const data = fixture();
  data.sessions[2].entries[1] = {
    exerciseId: "a2", name: "Barbell Bench Press", variant: null, pain: false, note: "",
    sets: [{ weight: 95, reps: 8 }, { weight: 135, reps: 3 }, { weight: 115, reps: 8 }, { weight: 115, reps: 8 }],
  };
  store.importData(data);
  const sets = store.lastPerformance("barbell-bench-press").sets;
  assert.deepEqual(sets.map((s) => s.role), ["ramp", "backoff", "work", "work"]);
  assert.equal(sets[1].failed, true);              // the 135, not the 95
  const sugg = suggestFor("a2");
  assert.equal(sugg.weight, 115);
  assert.match(sugg.note, /worked up to 135/);     // not "opened at"
});

test("a top set that finished its range is a back-off, not a failure", () => {
  // Same shape, but he hit the top of 5–8 on the 135 before dropping down.
  const data = fixture();
  data.sessions[2].entries[1] = {
    exerciseId: "a2", name: "Barbell Bench Press", variant: null, pain: false, note: "",
    sets: [{ weight: 135, reps: 8 }, { weight: 115, reps: 10 }, { weight: 115, reps: 10 }],
  };
  store.importData(data);
  const sets = store.lastPerformance("barbell-bench-press").sets;
  assert.deepEqual(sets.map((s) => s.role), ["work", "backoff", "backoff"]);
  assert.equal(sets.some((s) => s.failed), false);
  // The 135 topped a 5–8 range, so this is progress, not a retreat.
  const sugg = suggestFor("a2");
  assert.equal(sugg.action, "increase");
  assert.equal(sugg.weight, 145);
  assert.doesNotMatch(sugg.note, /come back|backed off/);
});

test("sessions record the range they were held to", () => {
  fresh();
  for (const s of store.load().sessions) {
    for (const e of s.entries) {
      assert.ok(e.prescription && e.prescription.measure, `${e.exerciseId} has no prescription`);
    }
  }
  const carry = store.getSessions().find((s) => s.id === "s1").entries.find((e) => e.exerciseId === "b7");
  assert.equal(carry.prescription.measure, "distance");
  assert.equal(carry.prescription.max, 40);
});

// ---- #4 typed measures + validation ----------------------------------------

test("the carry and the plank no longer report an estimated 1RM", () => {
  fresh();
  const carry = store.movementHistory("suitcase-carry").at(-1);
  assert.equal(carry.measure, "distance");
  assert.equal(carry.e1rm, null);
  assert.equal(carry.bestAmount, 40);   // yards
  assert.equal(carry.volume, 0);        // not 60 × 40 "pounds"

  const plank = store.movementHistory("side-plank").at(-1);
  assert.equal(plank.measure, "time");
  assert.equal(plank.e1rm, null);
  assert.equal(plank.bestAmount, 45);   // seconds
});

test("reps become amounts, in the movement's own unit", () => {
  fresh();
  for (const s of store.load().sessions) {
    for (const e of s.entries) {
      for (const set of e.sets) {
        assert.equal(set.reps, undefined, "the legacy reps key is gone");
        assert.ok(set.amount != null);
      }
    }
  }
});

test("the 140 × 120 typo is surfaced, not silently kept", () => {
  fresh();
  const flagged = store.suspectSets();
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].movementId, "barbell-hip-thrust");
  assert.equal(flagged[0].text, "140×120");
  assert.equal(flagged[0].code, "high-amount");

  // While flagged it stays out of the trend and out of the bests.
  const hist = store.movementHistory("barbell-hip-thrust").at(-1);
  assert.equal(hist.flagged, 1);
  assert.equal(hist.bestAmount, 12);
  assert.equal(hist.volume, 140 * 12 * 2);
  assert.equal(store.movementBests("barbell-hip-thrust").maxAmount, 12);
});

test("a flagged set can be corrected, and then it counts", () => {
  fresh();
  const [flag] = store.suspectSets();
  store.fixSuspectSet(flag.sessionId, flag.entryIndex, flag.setIndex, 12);
  assert.deepEqual(store.suspectSets(), []);
  const hist = store.movementHistory("barbell-hip-thrust").at(-1);
  assert.equal(hist.sets, 3);
  assert.equal(hist.volume, 140 * 12 * 3);
});

test("a flagged set can be confirmed instead, and stops asking", () => {
  fresh();
  const [flag] = store.suspectSets();
  store.confirmSuspectSet(flag.sessionId, flag.entryIndex, flag.setIndex);
  assert.deepEqual(store.suspectSets(), []);
  // Confirmed values survive a re-migration rather than being re-flagged.
  store.importData({ ...JSON.parse(store.exportData()), version: 1 });
  assert.deepEqual(store.suspectSets(), []);
});

test("session volume is pounds of rep work, not yards and seconds", () => {
  fresh();
  const dayB = store.getSessions().find((s) => s.id === "s1");
  const carry = dayB.entries.find((e) => e.exerciseId === "b7");
  assert.equal(carry.measure, "distance");
  // Tonnage counts every loaded rep set (ramps included — they still cost you),
  // and nothing that is measured in yards or seconds.
  const byHand = dayB.entries.reduce((v, e) => {
    if (e.measure !== "reps") return v;
    const perHand = getMovement(e.movementId).loadMode === "per-hand" ? 2 : 1;
    return v + e.sets.reduce((vv, s) => vv + s.weight * s.amount * perHand, 0);
  }, 0);
  assert.equal(store.sessionVolume(dayB), byHand);
  assert.ok(byHand > 0);

  // A set flagged as a typo doesn't get to swamp the session's tonnage either.
  const dayC = store.getSessions().find((s) => s.id === "s2");
  const withTypo = store.sessionVolume(dayC);
  const [flag] = store.suspectSets();
  store.confirmSuspectSet(flag.sessionId, flag.entryIndex, flag.setIndex);
  assert.ok(store.sessionVolume(store.getSessions().find((s) => s.id === "s2")) > withTypo);
});

test("the coach report keeps 1RM claims to the lifts that have one", () => {
  fresh();
  const report = store.coachReport();
  assert.match(report, /Suitcase Carry.*no est 1RM/);
  assert.match(report, /Side Plank.*no est 1RM/);
  assert.match(report, /Barbell Box Squat.*est 1RM/);
  assert.match(report, /flagged as a possible typo/);
  // Movements, not slot names: the incline press is reported as itself.
  assert.match(report, /Barbell Incline Press/);
});

test("merging an old export brings its sessions forward too", () => {
  fresh();
  store.wipe();
  store.importData(fixture(), { merge: true });
  const merged = store.load().sessions;
  assert.equal(merged.length, 3);
  for (const s of merged) for (const e of s.entries) assert.ok(e.movementId, `${e.exerciseId} unattributed`);
  assert.equal(store.suggestion("incline-db-curl", findExercise("c5").prescription).weight, 25);
});

test("a renamed slot keeps the movement its entries were logged under", () => {
  // b3 was "Neutral-Grip DB Incline Press" on 2026-08-19 and is a Seated DB
  // Shoulder Press today. A session logged under the old default must stay an
  // incline press — the name the entry recorded is what he actually did, and
  // the slot map is only a fallback for names that no longer resolve.
  const data = fixture();
  data.sessions[0].entries[2] = {
    exerciseId: "b3", name: "Neutral-Grip DB Incline Press", variant: null, pain: false, note: "",
    sets: [{ weight: 45, reps: 10 }, { weight: 45, reps: 10 }],
  };
  store.importData(data);
  const entry = store.getSessions().find((s) => s.id === "s1").entries.find((e) => e.exerciseId === "b3");
  assert.equal(entry.movementId, "db-incline-press-neutral");
  // …and the shoulder press slot still has no history to inherit from it.
  assert.equal(store.lastPerformance("db-shoulder-press-seated"), null);
  assert.equal(suggestFor("b3"), null);
});

// ---- #5 RPE / reps in reserve -----------------------------------------------
// Every case below is a row from the issue's evidence table: a note he actually
// wrote, and the suggestion the reps-only engine gave him for it.

// Put an RPE on the last working set of a slot's entry, the way one tap in the
// app would.
const withEffort = (sessionIndex, slot, rir, data = fixture()) => {
  const entry = data.sessions[sessionIndex].entries.find((e) => e.exerciseId === slot);
  entry.sets[entry.sets.length - 1].rpe = 10 - rir;
  store.importData(data);
  return entry;
};

test("an RPE survives the import and reads back on the set", () => {
  withEffort(2, "a4", 4);
  const sets = store.lastPerformance("db-reverse-lunge").sets;
  assert.equal(sets.at(-1).rpe, 6);
  assert.equal(store.movementHistory("db-reverse-lunge").at(-1).rpe, 6);
});

test("'could have done 5 more on each side' stops meaning 'repeat 30'", () => {
  // a4 DB Reverse Lunge 30×8 — the clearest miss in the issue: he wrote that he
  // could add 5 lb per hand and the app told him to do it all again.
  fresh();
  const before = suggestFor("a4");
  assert.equal(before.action, "repeat");
  assert.equal(before.weight, 30);

  withEffort(2, "a4", 4);
  const after = suggestFor("a4");
  assert.equal(after.action, "increase");
  assert.equal(after.weight, 35);
  assert.match(after.note, /40/, "and says where to go next if 35 is still easy");
  assert.match(after.basis, /RPE 6 · 4\+ left/);
});

test("'wouldn't have been able to do a 7th' stops meaning 'add reps'", () => {
  // b2 Lat Pulldown 160×8 of a 6–10 range, at failure. Today: "aim to add reps
  // at 160" — telling a man at his limit to grind two more.
  assert.match(suggestFor("b2").note, /Aim to add reps/);

  withEffort(0, "b2", 0);
  const after = suggestFor("b2");
  assert.equal(after.action, "repeat");
  assert.equal(after.weight, 160);
  assert.match(after.note, /already at failure/);
  assert.doesNotMatch(after.note, /Aim to add reps/);
});

test("topping the range at RPE 8 still adds load; at RPE 10 it holds", () => {
  // a1 Barbell Box Squat 165×8, top of a 5–8 range.
  withEffort(2, "a1", 2);
  const easy = suggestFor("a1");
  assert.equal(easy.action, "increase");
  assert.equal(easy.weight, 175);

  withEffort(2, "a1", 0);
  const maxed = suggestFor("a1");
  assert.equal(maxed.action, "repeat");
  assert.equal(maxed.weight, 165);
  assert.match(maxed.note, /to failure/);
});

test("topping the range with 4+ left is worth two increments", () => {
  withEffort(2, "a1", 4);
  assert.equal(suggestFor("a1").weight, 185);
});

test("an omitted RPE never produces a worse suggestion than before", () => {
  fresh();
  const plain = store.loggedMovementIds().map((id) => JSON.stringify(store.suggestion(id, findExercise("a1").prescription)));
  // Same data, re-imported: nothing about the effort work changes a suggestion
  // that has no effort logged.
  store.importData(fixture());
  const again = store.loggedMovementIds().map((id) => JSON.stringify(store.suggestion(id, findExercise("a1").prescription)));
  assert.deepEqual(again, plain);
  assert.doesNotMatch(suggestFor("a1").basis, /RPE/);
});

test("the coach report carries the effort of the last working set", () => {
  withEffort(2, "a1", 2);
  const report = store.coachReport();
  assert.match(report, /Barbell Box Squat.*RPE 8 \(2 left\)/);
});

// ---- #6 which side gave out first ------------------------------------------
// Deliberately qualitative. Per-side weights and reps would read identical
// every session (same dumbbell both sides, reps matched to the weaker one);
// which side was the hard one is the part that varies.

// c3's Single-Arm DB Row carries the note "Right side could have done more,
// left had a harder time". This is that note, as one tap.
const withHarderSide = (side, sessionIndex = 1, slot = "c3", data = fixture()) => {
  const entry = data.sessions[sessionIndex].entries.find((e) => e.exerciseId === slot);
  entry.harderSide = side;
  store.importData(data);
  return entry;
};

test("the harder side survives the import and reads back on the entry", () => {
  withHarderSide("L");
  const entry = store.getSessions().find((s) => s.id === "s2").entries.find((e) => e.exerciseId === "c3");
  assert.equal(entry.harderSide, "L");
  assert.equal(harderSide(entry), "L");
  assert.equal(harderSideLabel(harderSide(entry)), "left");
});

test("it never touches the numbers, so no suggestion changes because of it", () => {
  fresh();
  const before = JSON.stringify(suggestFor("c3"));
  withHarderSide("L");
  assert.equal(JSON.stringify(suggestFor("c3")), before);
});

test("the coach report counts how often each side is flagged", () => {
  withHarderSide("L");
  const report = store.coachReport();
  assert.match(report, /## Harder side/);
  assert.match(report, /Single-Arm DB Row.*left side harder in 1 of 1 session/);
  assert.match(report, /Qualitative, not load data/);
});

test("a side flagged on both sides over time is reported as mixed", () => {
  const data = fixture();
  data.sessions[1].entries.find((e) => e.exerciseId === "c3").harderSide = "L";
  // A second Day C session with the same movement, flagged the other way.
  const second = JSON.parse(JSON.stringify(data.sessions[1]));
  second.id = "s4";
  second.date = "2026-08-28T17:00:00.000Z";
  second.entries.find((e) => e.exerciseId === "c3").harderSide = "R";
  data.sessions.push(second);
  store.importData(data);

  const [row] = store.harderSideReport().filter((h) => h.movementId === "db-row-single-arm");
  assert.equal(row.total, 2);
  assert.equal(row.flagged, 1);
  assert.equal(row.mixed, true);
  assert.match(store.coachReport(), /mixed; the other side was flagged too/);
});

test("with nothing flagged the report says so rather than inventing a balance", () => {
  fresh();
  assert.deepEqual(store.harderSideReport(), []);
  assert.match(store.coachReport(), /Nothing flagged — on a unilateral lift/);
});

test("an unrecognisable entry name still lands on the slot's movement", () => {
  const data = fixture();
  data.sessions[0].entries[1] = {
    exerciseId: "b2", name: "Some Long-Retired Exercise Name", variant: null, pain: false, note: "",
    sets: [{ weight: 140, reps: 10 }],
  };
  store.importData(data);
  const entry = store.getSessions().find((s) => s.id === "s1").entries.find((e) => e.exerciseId === "b2");
  assert.equal(entry.movementId, "lat-pulldown");
});
