// Issue #6: per-side logging and the asymmetry index.
import test from "node:test";
import assert from "node:assert/strict";

import {
  tracksSides, isSplit, splitSet, mergeSet, writeSide, sideValues, weakerSide,
  rollUp, sideWork, sideTotals, asymmetryPercent, asymmetryLabel, isBalanced,
  formatSides,
} from "../js/sides.js";
import { getMovement } from "../js/movements.js";

const row = getMovement("db-row-single-arm");   // per-side load, unilateral
const legPress = getMovement("single-leg-leg-press"); // total load, unilateral
const plank = getMovement("side-plank");        // unloaded, timed, unilateral
const bench = getMovement("barbell-bench-press");

test("sides are for movements you work one limb at a time, whatever the load mode", () => {
  assert.equal(tracksSides(row), true);
  assert.equal(tracksSides(legPress), true, "one leg at a time, even though the number is the whole stack");
  assert.equal(tracksSides(plank), true);
  assert.equal(tracksSides(bench), false);
  assert.equal(tracksSides(null), false);
});

test("splitting mirrors what's already there — the symmetric case stays one entry", () => {
  const set = { weight: 55, amount: 10 };
  assert.equal(isSplit(set), false);
  assert.deepEqual(sideValues(set, "L"), { weight: 55, amount: 10 });

  splitSet(set);
  assert.equal(isSplit(set), true);
  assert.deepEqual(sideValues(set, "R"), { weight: 55, amount: 10 });
  assert.equal(weakerSide(set), null, "mirrored sides have no weaker half");
});

test("the set's own numbers follow the WEAKER side", () => {
  // c3 Single-Arm DB Row — "Right side could have done more, left had a harder
  // time." Everything that doesn't know about sides (e1RM, charts, bests, the
  // load suggestion) reads weight/amount, so the weaker side is what drives
  // the next prescription.
  const set = { weight: 55, amount: 10 };
  writeSide(set, "R", { amount: 12 });
  assert.equal(weakerSide(set), "L");
  assert.equal(set.weight, 55);
  assert.equal(set.amount, 10, "not the right side's 12");

  writeSide(set, "L", { weight: 50 });
  assert.equal(set.weight, 50);
  assert.equal(set.amount, 10);
});

test("unloaded work compares the amount itself", () => {
  const set = { weight: null, amount: 45 };
  writeSide(set, "R", { amount: 30 });
  assert.equal(sideWork(sideValues(set, "L")), 45);
  assert.equal(sideWork(sideValues(set, "R")), 30);
  assert.equal(weakerSide(set), "R");
  assert.equal(set.amount, 30, "the plank is only as good as the side that quits first");
});

test("a side left blank mirrors the set rather than reading as zero", () => {
  const set = { weight: 100, amount: 12, sides: { R: { weight: 100, amount: 10 } } };
  assert.deepEqual(sideValues(set, "L"), { weight: 100, amount: 12 });
  rollUp(set);
  assert.equal(set.amount, 10);
});

test("merging drops the sides and keeps the roll-up", () => {
  const set = { weight: 55, amount: 10 };
  writeSide(set, "R", { weight: 60 });
  mergeSet(set);
  assert.equal(isSplit(set), false);
  assert.equal(set.weight, 55);
});

test("the asymmetry index is right work ÷ left work over the sets logged by side", () => {
  const sets = [
    { weight: 50, amount: 10, sides: { L: { weight: 50, amount: 10 }, R: { weight: 55, amount: 10 } } },
    { weight: 50, amount: 10, sides: { L: { weight: 50, amount: 10 }, R: { weight: 55, amount: 10 } } },
    { weight: 50, amount: 10 }, // not logged by side — no opinion, so it sits out
  ];
  const totals = sideTotals(sets);
  assert.equal(totals.sets, 2);
  assert.equal(totals.left, 1000);
  assert.equal(totals.right, 1100);
  assert.equal(totals.index, 1.1);
  assert.equal(asymmetryPercent(totals.index), 10);
  assert.equal(asymmetryLabel(totals.index), "right 10% ahead");
});

test("nothing logged by side means no index at all, not a fake 1.0", () => {
  assert.equal(sideTotals([{ weight: 50, amount: 10 }]), null);
  assert.equal(sideTotals([]), null);
});

test("a few percent apart is level — that's rep-to-rep noise, not an asymmetry", () => {
  assert.equal(isBalanced(1.02), true);
  assert.equal(asymmetryLabel(1.02), "sides level");
  assert.equal(asymmetryLabel(0.88), "left 12% ahead");
});

test("a split set reads back with both sides, in the movement's own units", () => {
  const set = { weight: 50, amount: 10, sides: { L: { weight: 50, amount: 10 }, R: { weight: 55, amount: 10 } } };
  assert.equal(formatSides(row, set), "L 50×10 · R 55×10");
  assert.equal(formatSides(row, { weight: 55, amount: 10 }), "55×10", "unsplit sets read as they always did");

  const held = { weight: null, amount: 45, sides: { L: { amount: 45 }, R: { amount: 30 } } };
  assert.equal(formatSides(plank, held), "L 45s · R 30s");
});
