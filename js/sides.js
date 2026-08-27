// =============================================================================
// sides.js — left and right, tracked separately (issue #6).
//
// The leg-length discrepancy and the progressive right-side tightening are THE
// priority of this program, and eight slots carry the `leglength` flag. Yet a
// set stored one weight and one rep count with no side, so the app could not
// measure the asymmetry it exists to fix. The signal was going into notes:
//
//   c3 Single-Arm DB Row — "Right side could have done more, left had a harder time"
//
// SHAPE. A set keeps its own `weight`/`amount` — the roll-up — and gains an
// optional `sides: { L, R }` when the two sides are logged apart. Splitting
// mirrors the numbers you already typed, so the common symmetric case is still
// one entry and no extra taps.
//
// THE ROLL-UP IS THE WEAKER SIDE. That single decision is what makes
// "progression follows the weaker side" true everywhere at once: e1RM, charts,
// bests, `topWorkingLoad()` and the suggestion engine all read `weight`/`amount`
// and none of them had to learn about sides. The stronger side never drags the
// prescription up and widens the gap.
//
// WHICH MOVEMENTS. `loadMode: "per-side"` says the number is one side's load,
// but what makes L/R meaningful is `unilateral` — you work one limb at a time,
// so the reps (or seconds) can differ even when the load is identical. A
// single-leg leg press is `total` load and still has two very different legs.
//
// Pure module: no DOM, no storage.
// =============================================================================

import { setAmount, setLoad, formatSet } from "./measures.js";

export const SIDES = ["L", "R"];
export const SIDE_LABELS = { L: "left", R: "right" };

// Inside this much, the two sides are the same and the difference is noise.
export const BALANCED_WITHIN_PCT = 5;

export function tracksSides(movement) {
  return !!(movement && movement.unilateral);
}

export function isSplit(set) {
  return !!(set && set.sides && (set.sides.L || set.sides.R));
}

// One side's numbers. A side with nothing of its own MIRRORS the set — that is
// what "log it once when both sides match" means when read back.
export function sideValues(set, side) {
  const base = { weight: setLoad(set), amount: setAmount(set) };
  if (!isSplit(set)) return base;
  const s = set.sides[side];
  if (!s) return base;
  const num = (v, fallback) => (v == null || v === "" ? fallback : Number(v));
  return { weight: num(s.weight, base.weight), amount: num(s.amount, base.amount) };
}

// Start logging this set by side: both sides begin as copies of what's there.
export function splitSet(set) {
  if (!set) return set;
  const base = { weight: setLoad(set), amount: setAmount(set) };
  const existing = set.sides || {};
  set.sides = {
    L: { ...(existing.L || base) },
    R: { ...(existing.R || base) },
  };
  return set;
}

// Back to a single entry. The roll-up stays — you don't lose the set by
// deciding you no longer care which side did what.
export function mergeSet(set) {
  if (set) delete set.sides;
  return set;
}

export function writeSide(set, side, patch) {
  if (!set) return set;
  splitSet(set);
  Object.assign(set.sides[side], patch);
  return rollUp(set);
}

// How much work one side did. Loaded rep work is weight × amount; unloaded work
// (planks, bodyweight) is the amount itself, which is all there is to compare.
export function sideWork(vals) {
  if (!vals || vals.amount == null) return null;
  return vals.weight != null && vals.weight > 0 ? vals.weight * vals.amount : vals.amount;
}

export function weakerSide(set) {
  if (!isSplit(set)) return null;
  const l = sideWork(sideValues(set, "L")), r = sideWork(sideValues(set, "R"));
  if (l == null || r == null || l === r) return null;
  return l < r ? "L" : "R";
}

// Keep `weight`/`amount` pointing at the weaker side, so every reader that
// doesn't know about sides still reads the conservative number.
export function rollUp(set) {
  if (!isSplit(set)) return set;
  const l = sideValues(set, "L"), r = sideValues(set, "R");
  const lw = sideWork(l), rw = sideWork(r);
  const pick = lw == null ? r : rw == null ? l : (lw <= rw ? l : r);
  set.weight = pick.weight == null ? null : pick.weight;
  set.amount = pick.amount == null ? null : pick.amount;
  return set;
}

// ---- Asymmetry --------------------------------------------------------------
// The index is right ÷ left, over whatever sets were actually logged by side.
// 1.0 is level; above 1 the right side is doing more work than the left.

export function sideTotals(sets = []) {
  let left = 0, right = 0, n = 0;
  for (const set of sets) {
    if (!isSplit(set)) continue;
    const l = sideWork(sideValues(set, "L")), r = sideWork(sideValues(set, "R"));
    if (l == null || r == null) continue;
    left += l; right += r; n++;
  }
  if (!n || left <= 0) return null;
  return { left, right, sets: n, index: right / left };
}

// How far off level, in percent. +10 = the right side did 10% more work.
export function asymmetryPercent(index) {
  if (index == null || !Number.isFinite(index)) return null;
  return Math.round((index - 1) * 1000) / 10;
}

export function isBalanced(index) {
  const pct = asymmetryPercent(index);
  return pct != null && Math.abs(pct) < BALANCED_WITHIN_PCT;
}

export function asymmetryLabel(index) {
  const pct = asymmetryPercent(index);
  if (pct == null) return "";
  if (isBalanced(index)) return "sides level";
  return pct > 0 ? `right ${Math.abs(pct)}% ahead` : `left ${Math.abs(pct)}% ahead`;
}

// "L 50×10 · R 55×10", in the movement's own units.
export function formatSides(movement, set) {
  if (!isSplit(set)) return formatSet(movement, set);
  return SIDES.map((s) => `${s} ${formatSet(movement, sideValues(set, s))}`).join(" · ");
}
