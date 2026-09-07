// The progress screen's data layer: one overall strength number, PRs, and the
// per-lift rows that replaced the single-chart dropdown.
import test from "node:test";
import assert from "node:assert/strict";

import { installBrowserGlobals } from "./helpers.js";
installBrowserGlobals();

const store = await import("../js/store.js");

const DAY = 86400000;
// Sessions are stored newest-first; build them from a plain description so a
// test reads as "he squatted 200 × 5, then 210 × 5, then 220 × 5".
function seed(spec, { end = Date.parse("2026-06-01T17:00:00.000Z") } = {}) {
  const sessions = spec.map((entries, i) => ({
    id: "t" + i,
    date: new Date(end - (spec.length - 1 - i) * 7 * DAY).toISOString(),
    dayId: "A",
    dayName: "Day A",
    entries: Object.entries(entries).map(([movementId, sets]) => ({
      movementId,
      exerciseId: "a1",
      sets: sets.map(([weight, reps]) => ({ weight, amount: reps, role: "work" })),
    })),
  })).reverse();
  store.importData({ version: store.DATA_VERSION, sessions, bodyweight: [], profile: { name: "T", units: "lb" } });
  return store;
}

test("the strength index rises with the lifts and holds still when nothing changes", () => {
  seed([
    { "barbell-box-squat": [[200, 5]], "barbell-bench-press": [[100, 5]] },
    { "barbell-box-squat": [[220, 5]], "barbell-bench-press": [[110, 5]] },
    { "barbell-box-squat": [[220, 5]], "barbell-bench-press": [[110, 5]] },
  ]);
  const idx = store.strengthIndex({ now: Date.parse("2026-06-02T00:00:00.000Z") });
  assert.equal(idx.enough, true);
  assert.equal(idx.points.length, 3);
  assert.equal(idx.points[0].value, 100);
  // Both lifts went up 10%, so the index does too — and then stops.
  // e1RM is stored rounded to the pound, so ~10%, not exactly 10%.
  assert.ok(Math.abs(idx.points[1].value - 110) < 0.5, `got ${idx.points[1].value}`);
  assert.equal(idx.points[2].value, idx.points[1].value);
  assert.ok(Math.abs(idx.deltaPct - 10) < 0.5);
  assert.equal(idx.tracked, 2);
});

test("a lift joining late doesn't dent the index", () => {
  seed([
    { "barbell-box-squat": [[200, 5]] },
    { "barbell-box-squat": [[220, 5]], "barbell-bench-press": [[100, 5]] },
  ]);
  const idx = store.strengthIndex({ now: Date.parse("2026-06-02T00:00:00.000Z") });
  // Averaging "current ÷ first" would have dragged this to 105 the moment the
  // bench entered at 1.00. Chain-linking only measures the squat's step.
  assert.ok(Math.abs(idx.points[1].value - 110) < 0.5, `got ${idx.points[1].value}`);
});

test("a lift that has gone stale stops counting toward the index", () => {
  seed([
    { "barbell-box-squat": [[200, 5]], "leg-press": [[300, 5]] },
    { "barbell-box-squat": [[220, 5]] },
  ], { end: Date.parse("2026-06-01T17:00:00.000Z") });
  const fresh = store.strengthIndex({ now: Date.parse("2026-06-02T00:00:00.000Z") });
  assert.equal(fresh.tracked, 2);
  const later = store.strengthIndex({ now: Date.parse("2026-10-01T00:00:00.000Z") });
  assert.equal(later.tracked, 0); // nothing trained in the last 60 days
});

test("movements with no honest 1RM stay out of the index", () => {
  seed([
    { "suitcase-carry": [[50, 40]] },
    { "suitcase-carry": [[60, 40]] },
  ]);
  const idx = store.strengthIndex({ now: Date.parse("2026-06-02T00:00:00.000Z") });
  assert.equal(idx.enough, false);
  assert.equal(idx.points.length, 0);
  // …but it still gets a trend row, charted in its own units.
  const row = store.movementTrends().find((t) => t.movementId === "suitcase-carry");
  assert.equal(row.key, "bestAmount");
});

test("personal records report the improvement, never the first session", () => {
  seed([
    { "barbell-box-squat": [[200, 5]] },
    { "barbell-box-squat": [[220, 5]] },
    { "barbell-box-squat": [[220, 5]] },
  ]);
  const prs = store.personalRecords();
  assert.equal(prs.length, 1);              // first session isn't a PR; the flat one isn't either
  assert.equal(prs[0].movementId, "barbell-box-squat");
  assert.equal(prs[0].kind, "e1rm");
  assert.ok(prs[0].value > prs[0].prev);
});

test("a set flagged as a typo can't set a record or move the index", () => {
  seed([
    { "barbell-box-squat": [[200, 5]] },
    { "barbell-box-squat": [[220, 5]] },
  ]);
  const sessions = store.getSessions();
  const newest = sessions[0];
  newest.entries[0].sets[0].suspect = { code: "load-jump" };
  store.updateSession(newest.id, { entries: newest.entries });
  assert.deepEqual(store.personalRecords(), []);
  assert.equal(store.strengthIndex({ now: Date.parse("2026-06-02T00:00:00.000Z") }).points.length, 1);
});

test("weekly training keeps the weeks he skipped", () => {
  seed([
    { "barbell-box-squat": [[200, 5]] },
    { "barbell-box-squat": [[210, 5]] },
  ], { end: Date.now() });
  const weeks = store.weeklyTraining(8);
  assert.ok(weeks.length >= 2);
  assert.equal(weeks[weeks.length - 1].sessions, 1);
  assert.ok(weeks.every((w) => typeof w.volume === "number"));
});

test("the summary counts back-to-back trained weeks", () => {
  const now = Date.now();
  seed([
    { "barbell-box-squat": [[200, 5]] },
    { "barbell-box-squat": [[210, 5]] },
    { "barbell-box-squat": [[220, 5]] },
  ], { end: now });
  const s = store.trainingSummary({ now });
  assert.equal(s.total, 3);
  assert.equal(s.last28, 3);
  assert.equal(s.streakWeeks, 3);
  assert.equal(s.daysSince, 0);
});

test("trend rows carry what the list has to draw", () => {
  seed([
    { "barbell-box-squat": [[200, 5]], "barbell-bench-press": [[100, 5]] },
    { "barbell-box-squat": [[220, 5]], "barbell-bench-press": [[100, 5]] },
  ]);
  const rows = store.movementTrends();
  const squat = rows.find((r) => r.movementId === "barbell-box-squat");
  assert.equal(squat.points.length, 2);
  assert.equal(squat.key, "e1rm");
  assert.ok(squat.deltaPct > 0);
  assert.equal(squat.topWeight, 220);
});
