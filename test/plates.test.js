// A warm-up ramp you can load. Percentages that look tidy on paper mean
// stripping the bar twice on the way up; these tests pin the property that
// matters — plates go on and stay on, and where one has to come back off, the
// ramp says so.
import test from "node:test";
import assert from "node:assert/strict";

import { plateStack, stackText, stackDelta, rampLadder, BAR } from "../js/plates.js";
import { warmupRamp } from "../js/engine.js";
import { getMovement } from "../js/movements.js";

const loads = (ladder) => ladder.map((s) => s.load);
const swaps = (ladder) => ladder.filter((s) => s.swap).length;

test("a load breaks down heaviest plate first, per side", () => {
  assert.deepEqual(plateStack(150).side, [45, 5, 2.5]);
  assert.deepEqual(plateStack(225).side, [45, 45]);
  assert.deepEqual(plateStack(45).side, []);
  assert.equal(plateStack(30), null);            // lighter than the bar
  assert.equal(stackText(150), "45 bar + 45 + 5 + 2.5 per side");
  assert.equal(stackText(45), "just the empty 45 lb bar");
  assert.match(stackText(30), /lighter than the empty 45 lb bar/);
});

test("a load the rack can't quite make says how far short it is", () => {
  const s = plateStack(151);
  assert.equal(s.short, 0.5);
  assert.match(stackText(151), /0\.5 short/);
});

test("the delta between two stacks is what goes on and what comes off", () => {
  assert.deepEqual(stackDelta([25], [45]), { add: [45], remove: [25] });
  assert.deepEqual(stackDelta([45], [45, 5]), { add: [5], remove: [] });
  assert.deepEqual(stackDelta([45, 5], [45, 5]), { add: [], remove: [] });
});

test("the ramp rises, starts at the bar, and stops below the working set", () => {
  for (const top of [95, 115, 135, 150, 165, 185, 225, 275, 315]) {
    const ladder = rampLadder(top);
    assert.equal(ladder[0].load, BAR, `${top} starts at the bar`);
    assert.ok(ladder.length <= 4, `${top} is at most 4 warm-up sets`);
    for (let i = 1; i < ladder.length; i++) {
      assert.ok(ladder[i].load > ladder[i - 1].load, `${top} rises at step ${i}`);
    }
    assert.ok(ladder.at(-1).load < top, `${top} stops below the working set`);
  }
});

test("every step is loadable from the one below, and the deltas say how", () => {
  const ladder = rampLadder(150);
  assert.deepEqual(loads(ladder), [45, 95, 135, 145]);
  assert.deepEqual(ladder[1], { load: 95, side: [25], add: [25], remove: [], swap: false });
  // The one swap: the 25s that bridged the gap come off for the 45s.
  assert.deepEqual(ladder[2], { load: 135, side: [45], add: [45], remove: [25], swap: true });
  assert.deepEqual(ladder[3], { load: 145, side: [45, 5], add: [5], remove: [], swap: false });
  // …and the working set is then pure addition.
  assert.deepEqual(stackDelta(ladder.at(-1).side, plateStack(150).side), { add: [2.5], remove: [] });
});

test("plates come off at most once on the way up", () => {
  for (const top of [135, 150, 165, 185, 225, 275, 315]) {
    assert.ok(swaps(rampLadder(top)) <= 1, `${top} strips the bar at most once`);
  }
});

test("nothing to ramp: an empty bar, or a load the bar can't hold", () => {
  assert.deepEqual(rampLadder(45), []);
  assert.deepEqual(rampLadder(30), []);
});

test("the engine hands the barbell ramp to the plate ladder, and dials the rest", () => {
  const bar = warmupRamp(getMovement("barbell-hip-thrust"), 150);
  assert.deepEqual(bar.map((s) => [s.load, s.amount]), [[45, 5], [95, 5], [135, 3], [145, 2]]);
  assert.equal(bar[2].swap, true);
  // A stack is dialled, not loaded — percentages are exactly right for it, and
  // there are no plates to talk about.
  const stack = warmupRamp(getMovement("leg-press"), 200);
  assert.deepEqual(stack.map((s) => s.load), [100, 140, 170]);
  assert.equal(stack[0].side, undefined);
  // Heavier ramp sets, fewer reps, however many steps there are.
  assert.deepEqual(stack.map((s) => s.amount), [5, 3, 2]);
});
