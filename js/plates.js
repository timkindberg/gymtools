// =============================================================================
// plates.js — what to actually put on the bar, and in what order.
//
// Two jobs:
//
//   1. Break a load down into plates per side (the old plate helper).
//   2. Build a warm-up ramp you can LOAD, not just one that hits nice
//      percentages. Those aren't the same thing. A ramp of 82.5 / 105 / 127.5
//      is arithmetically tidy and means stripping the bar twice on the way up.
//
// The rule that makes a ramp loadable: every step above the first is a PREFIX
// of the working set's plate stack. Load the big plates first and you only ever
// add from there — 45s go on and stay on, then the 5s, then the 2.5s. Where the
// jump from the empty bar to that first prefix is too big to be a warm-up, one
// bridge step gets built from smaller plates, and those come back off. That
// swap is real, so it's shown rather than hidden: it happens once, early, with
// the lightest plates in the ramp.
//
// Pure module: no DOM, no storage.
// =============================================================================

export const BAR = 45;

// What's on the rack at Blue Ash, heaviest first.
export const PLATES = [45, 35, 25, 10, 5, 2.5];

const round = (n) => Math.round(n * 100) / 100;

// Plates for ONE side, heaviest first. `short` is what the rack couldn't make.
export function plateStack(total, bar = BAR) {
  const t = Number(total);
  if (!(t > 0) || t < bar) return null;
  let rem = round((t - bar) / 2);
  const side = [];
  for (const p of PLATES) {
    while (rem >= p - 1e-9) { side.push(p); rem = round(rem - p); }
  }
  return { bar, side, short: rem > 0.01 ? rem : 0, load: round(bar + 2 * side.reduce((a, b) => a + b, 0)) };
}

// "45 bar + 45 + 5 + 2.5 per side"
export function stackText(total, bar = BAR) {
  const t = Number(total);
  if (!(t > 0)) return null;
  if (t < bar) return `lighter than the empty ${bar} lb bar`;
  if (t === bar) return `just the empty ${bar} lb bar`;
  const s = plateStack(t, bar);
  return `${bar} bar + ${s.side.length ? s.side.join(" + ") : "0"} per side` +
    (s.short ? ` (${s.short} short — nearest below)` : "");
}

// Multiset difference, so "what changes between these two steps" can be stated
// as plates on and plates off rather than as two lists to compare by eye.
export function stackDelta(from = [], to = []) {
  const pool = from.slice();
  const add = [];
  for (const p of to) {
    const i = pool.indexOf(p);
    if (i >= 0) pool.splice(i, 1);
    else add.push(p);
  }
  return { add, remove: pool };
}

const loadOf = (side, bar) => round(bar + 2 * side.reduce((a, b) => a + b, 0));

// A gap worth filling with another warm-up set, as a share of the top load.
const BIG_GAP = 0.32;

/**
 * The ramp to `top`, as loads you can build.
 *
 * Returns [{ load, side, add, remove, swap }] for the warm-up sets only — the
 * working set is the caller's. `add`/`remove` are per side, relative to the
 * step before, so the card can say "+ 25" or "swap 25 → 45".
 */
export function rampLadder(top, bar = BAR, { max = 4 } = {}) {
  const work = plateStack(top, bar);
  if (!work || !work.side.length) return [];

  // Every prefix of the working stack: the loads reachable by adding only.
  const steps = [{ load: bar, side: [] }];
  const running = [];
  for (const p of work.side) {
    running.push(p);
    const load = loadOf(running, bar);
    if (load >= work.load) break;   // that's the working set, not a warm-up
    steps.push({ load, side: running.slice() });
  }

  // Fill the biggest gap until the ramp is dense enough or full. A bridge
  // EXTENDS the step below it, so it's always pure addition to get onto it;
  // the plates it added come off at the next prefix, which the card shows.
  // A light bar doesn't need four warm-up sets to get to it.
  const room = work.load < 135 ? 3 : max;
  while (steps.length < Math.min(room, 4)) {
    let gapAt = -1, gapSize = 0;
    for (let i = 0; i < steps.length; i++) {
      const to = i + 1 < steps.length ? steps[i + 1].load : work.load;
      const size = to - steps[i].load;
      if (size > gapSize) { gapSize = size; gapAt = i; }
    }
    if (gapAt < 0 || gapSize <= work.load * BIG_GAP) break;
    const from = steps[gapAt];
    const to = gapAt + 1 < steps.length ? steps[gapAt + 1].load : work.load;
    const target = (from.load + to) / 2;
    let best = null;
    for (const p of PLATES) {
      const load = round(from.load + 2 * p);
      if (load <= from.load || load >= to) continue;
      const d = Math.abs(load - target);
      if (!best || d < best.d) best = { d, load, side: [...from.side, p] };
    }
    if (!best) break;
    steps.splice(gapAt + 1, 0, { load: best.load, side: best.side });
  }

  // What changes at each step, and whether anything has to come off.
  return steps.map((step, i) => {
    const delta = stackDelta(i ? steps[i - 1].side : [], step.side);
    return { ...step, add: delta.add, remove: delta.remove, swap: delta.remove.length > 0 };
  });
}
