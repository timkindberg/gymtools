// Goals: where a target stands against the log, and when it lands at the
// recent pace. The arithmetic is pure (js/goals.js); the store only feeds it.
import test from "node:test";
import assert from "node:assert/strict";

import { installBrowserGlobals } from "./helpers.js";
installBrowserGlobals();

import { goalProgress, repEquivalents, weeksProgress, standingAt } from "../js/goals.js";
import { GOALS } from "../js/program.js";
import { getMovement } from "../js/movements.js";
const store = await import("../js/store.js");

const DAY = 86400000;
const NOW = Date.parse("2026-11-10T17:00:00.000Z");
const goal = { id: "g", kind: "e1rm", title: "315 deadlift", target: 315, set: "2026-11-10", by: "2027-02-28" };
// One point a week, ending today.
const weekly = (values, { end = NOW } = {}) => values.map((value, i) => ({
  date: new Date(end - (values.length - 1 - i) * 7 * DAY).toISOString(), value,
}));

test("a 1RM goal reads as a working set nobody has to max out for", () => {
  assert.deepEqual(repEquivalents(315), [{ reps: 5, weight: 270 }, { reps: 8, weight: 250 }]);
  assert.deepEqual(repEquivalents(225), [{ reps: 5, weight: 195 }, { reps: 8, weight: 180 }]);
});

test("a steady climb projects a landing date and calls it on pace", () => {
  // +5 a week from 245 to 260: 55 to go is 11 weeks, late January.
  const g = goalProgress(goal, weekly([245, 250, 255, 260]), { now: NOW });
  assert.equal(g.status, "on-track");
  assert.equal(g.current, 260);
  assert.equal(Math.round(g.perWeek), 5);
  assert.equal(g.eta.slice(0, 7), "2027-01");
  assert.equal(g.pct, 0, "progress is measured from where he stood when the goal was set");
});

test("the same climb at a fifth of the speed is behind", () => {
  const g = goalProgress(goal, weekly([257, 258, 259, 260]), { now: NOW });
  assert.equal(g.status, "behind");
  assert.ok(Date.parse(g.eta) > Date.parse(goal.by));
});

test("a flat or falling lift gets no date rather than a made-up one", () => {
  const g = goalProgress(goal, weekly([260, 260, 255, 260]), { now: NOW });
  assert.equal(g.status, "no-trend");
  assert.equal(g.eta, null);
});

test("two sessions are not a trend", () => {
  assert.equal(goalProgress(goal, weekly([250, 260]), { now: NOW }).status, "no-trend");
});

test("a deload week neither drops the standing nor bends the pace", () => {
  const pts = weekly([245, 250, 255, 260, 200]);
  pts[4].deload = true;
  assert.equal(standingAt(pts, NOW), 260);
  assert.equal(goalProgress(goal, pts, { now: NOW }).status, "on-track");
});

test("hitting the number once is done, and stays done", () => {
  const pts = weekly([300, 316, 290]);
  const g = goalProgress(goal, pts, { now: NOW });
  assert.equal(g.status, "done");
  assert.equal(g.achieved, pts[1].date);
  assert.equal(g.pct, 100);
});

test("a movement with no history shows its starting point and waits", () => {
  const reps = { id: "p", kind: "reps", title: "5 pull-ups", target: 5, from: 2, set: "2026-11-10", by: "2027-06-01" };
  const g = goalProgress(reps, [], { now: NOW });
  assert.equal(g.status, "untracked");
  assert.equal(g.current, 2);
  assert.equal(g.pct, 0);
});

test("past the date and not there is overdue", () => {
  const g = goalProgress(goal, weekly([280, 285, 290, 295], { end: Date.parse("2027-03-10T17:00:00Z") }), { now: Date.parse("2027-03-10T17:00:00Z") });
  assert.equal(g.status, "overdue");
});

test("attendance counts full weeks, and doesn't call Monday a miss", () => {
  const g = { id: "a", kind: "weeks", title: "Mon + Wed", target: 2 };
  assert.deepEqual(
    (({ hit, total, status }) => ({ hit, total, status }))(weeksProgress(g, [{ sessions: 3 }, { sessions: 1 }, { sessions: 1, current: true }])),
    { hit: 1, total: 2, status: "behind" });
  assert.equal(weeksProgress(g, [{ sessions: 2 }, { sessions: 2, current: true }]).hit, 2);
  assert.equal(weeksProgress(g, [{ sessions: 0, current: true }]).status, "untracked");
});

test("every goal in the program points at something the app can measure", () => {
  const ids = new Set(GOALS.map((g) => g.id));
  for (const g of GOALS) {
    assert.ok(Date.parse(g.set), `${g.id}: set date`);
    if (g.kind === "weeks") continue;
    const mv = getMovement(g.movement);
    assert.ok(mv, `${g.id}: unknown movement ${g.movement}`);
    assert.ok(Date.parse(g.by) > Date.parse(g.set), `${g.id}: by date`);
    if (g.kind === "reps") assert.equal(mv.loadMode, "none", `${g.id}: a reps goal needs an unloaded movement`);
    if (g.after) assert.ok(ids.has(g.after), `${g.id}: after "${g.after}"`);
  }
});

test("the store measures goals from the log and hides a follow-on until its turn", () => {
  const sets = (w, r) => [{ weight: w, amount: r, role: "work" }];
  const sessions = [205, 215, 225, 235].map((w, i) => ({
    id: "g" + i, date: new Date(NOW - (3 - i) * 7 * DAY).toISOString(), dayId: "B", dayName: "Day B",
    entries: [
      { movementId: "barbell-deadlift", exerciseId: "b1", sets: sets(w, 6) },
      { movementId: "pull-up", exerciseId: "b9", sets: [{ amount: 2 + (i > 1 ? 1 : 0), role: "work" }] },
    ],
  })).reverse();
  store.importData({ version: store.DATA_VERSION, sessions, bodyweight: [], profile: { name: "T", units: "lb" } });
  const rows = store.goalsProgress({ now: NOW + 3600000 });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));

  assert.equal(by["deadlift-315"].current, 282); // 235 × 6
  assert.equal(by["deadlift-315"].status, "on-track");
  assert.deepEqual(by["deadlift-315"].equivalents.map((e) => e.weight), [270, 250]);
  assert.equal(by["deadlift-405"], undefined, "405 waits for 315");
  assert.equal(by["pullup-wide-5"].current, 3, "a reps goal reads the best set, no load needed");
  assert.equal(by["pullup-neutral-10"].status, "untracked");
  assert.equal(by["bench-225"].status, "untracked");
  assert.equal(by.attendance.kind, "weeks");
  assert.match(store.coachReport(), /## Goals\n- \*\*Monday and Wednesday/);
});
