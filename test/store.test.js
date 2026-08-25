// The acceptance criteria of issues #2, #3 and #4, run against a v1 backup.
import test from "node:test";
import assert from "node:assert/strict";

import { installBrowserGlobals, readFixture } from "./helpers.js";
installBrowserGlobals();

const store = await import("../js/store.js");
const { findExercise } = await import("../js/program.js");
const { getMovement } = await import("../js/movements.js");

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
  assert.match(sugg.basis, /failed opener at 30/);
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
