// =============================================================================
// engine.js — the progression engine (issues #7, #8, #9).
//
// What it replaces, in full:
//
//   allHitTop ? topWeight + (topWeight >= 100 ? 10 : 5) : topWeight
//
// One session of lookback, a flat increment gated on a single 100 lb threshold,
// and no awareness of RPE, pain, implement, or stall history. It told a 12.5 lb
// rotator-cuff cable to jump 40%, and had no exit from "repeat" — a load too
// heavy to move would be prescribed forever.
//
// The rules, in the order they fire:
//
//   1. Pain flagged on this movement last time      → hold. Twice → swap it out.
//   2. Today's check-in flares a flag this lift has → hold. Not a day to load.
//   3. A deload is due (stalled twice, or the       → drop ~10% and rebuild.
//      scheduled cadence came round)
//   4. He failed out of the top set                 → repeat the settled weight.
//   5. Topped the rep range on every working set    → add load, RPE permitting.
//   6. Anything else                                → hold load, chase reps.
//
// The size of "add load" is a PERCENTAGE of the working load, rounded to the
// smallest increment that movement can actually take, and capped. When the
// smallest increment the rack has is bigger than the percentage — a 5 lb jump on
// a 12.5 lb cuff cable, or on a 30 lb dumbbell — reps come first, and the load
// step waits until the rep range is exhausted. That one rule is what kills the
// +40% cuff jump without special-casing anything.
//
// Pure module: no DOM, no storage. Everything it knows arrives as arguments, so
// it can be unit-tested against checked-in session fixtures.
// =============================================================================

import { invertLoad } from "./movements.js";
import { setAmount, setLoad, isLogged, measureInfo, estimate1RM } from "./measures.js";
import { workingSets, rampSets, failedSets, topWorkingLoad } from "./sets.js";
import { workingEffort, effortVerdict, effortLabel } from "./effort.js";

// ---- Increments -------------------------------------------------------------
// The smallest step this movement can actually take at Blue Ash. A dumbbell rack
// jumps 5 lb per hand whether you like it or not; the cable stack has 2.5 lb
// add-ons (12.5, 22.5, 32.5, 37.5, 42.5 and 47.5 all appear in his log).
export const INCREMENT_BY_IMPLEMENT = {
  barbell: 5,     // a pair of 2.5s
  dumbbell: 5,    // per hand — the rack's step
  machine: 5,
  cable: 2.5,
  band: null,     // bands change tension, not weight
  bodyweight: 5,  // only meaningful with addedLoad
};

// Target percentage per session. Big lower-body lifts tolerate a real jump;
// small isolation work does not.
export const BANDS = {
  heavy: { min: 0.05, max: 0.10 },  // lower-body barbell / machine
  light: { min: 0.025, max: 0.05 }, // everything upper-body, dumbbell, cable
};

// No suggestion may add more than this to the previous working load, ever —
// except one notch on an implement whose minimum step is bigger than the cap,
// and only alongside a reset to the bottom of the rep range (see graduate()).
export const MAX_JUMP = 0.10;

// Rounds off floating-point crumbs from 12.5 + 2.5 arithmetic.
const round = (n) => Math.round(n * 100) / 100;

const LOWER_BODY = new Set([
  "squat", "lunge", "lunge-frontal", "hinge", "hip-extension", "knee-flexion", "adduction",
]);

export function loadIncrement(movement) {
  if (!movement) return null;
  if (movement.increment) return movement.increment;
  if (movement.loadMode === "none") return null; // unloaded — nothing to step
  const inc = INCREMENT_BY_IMPLEMENT[movement.implement];
  return inc == null ? 5 : inc;
}

export function progressionBand(movement) {
  if (!movement) return BANDS.light;
  const heavy = LOWER_BODY.has(movement.pattern) &&
    (movement.implement === "barbell" || movement.implement === "machine");
  return heavy ? BANDS.heavy : BANDS.light;
}

// One session's worth of load progression for this movement at this load.
//
// `coarse` is the interesting case: the smallest increment available overshoots
// the target percentage, so adding load is the WRONG move — the reps have to
// carry the progression until the range is used up.
export function loadStep(movement, load) {
  const inc = loadIncrement(movement);
  if (!inc || !(load > 0)) return null;
  const band = progressionBand(movement);
  const hi = load * band.max, lo = load * band.min;
  // An assist stack is never coarse: the number on the pin isn't the load, it's
  // the discount. Taking 5 lb off 80 lb of assistance is a couple of percent of
  // what a 235 lb man is actually pulling, not the 6% it looks like here (#9).
  if (inc > hi && !invertLoad(movement)) return { inc, step: inc, coarse: true, pct: inc / load };
  const notches = Math.min(
    Math.max(1, Math.floor(hi / inc)),
    Math.max(1, Math.ceil(lo / inc))
  );
  return { inc, step: round(notches * inc), coarse: false, pct: (notches * inc) / load };
}

// Where the load lands after `steps` of progression, capped at MAX_JUMP. On an
// assist stack this SUBTRACTS: less assistance is more work (#9).
function advance(movement, load, step, steps = 1) {
  const cap = Math.floor((load * MAX_JUMP) / step.inc) * step.inc;
  const delta = Math.min(step.step * Math.max(1, steps), Math.max(step.inc, cap));
  const next = invertLoad(movement) ? Math.max(0, load - delta) : load + delta;
  return { load: round(next), delta: round(delta), capped: delta < step.step * Math.max(1, steps) };
}

// ---- Training max -----------------------------------------------------------
// 5/3/1's idea, used as a ceiling rather than a prescription: keep a per-movement
// estimate of what the lift can actually carry, and never ask for a load he'd
// have to set a PR to complete for the prescribed reps. Without it, a lift he
// only ever ramps to one top set can run away from him one +10% at a time.
export const TRAINING_MAX_PCT = 0.9;

export function trainingMax(bestE1rm) {
  return bestE1rm ? round(bestE1rm * TRAINING_MAX_PCT) : null;
}

// The load his best estimated 1RM says he can carry for `reps`, by Epley.
export function capacityAt(bestE1rm, reps) {
  if (!bestE1rm || !(reps > 0)) return null;
  return round(bestE1rm / (1 + reps / 30));
}

// ---- Reading a session ------------------------------------------------------
// A session summary is everything the engine needs from one performance of one
// movement. `sets` arrives already filtered to logged, non-suspect sets.

export function summarize(session, movement, prescription) {
  // Blank rows are not sets. The store filters these out, but the engine is
  // called with raw drafts too and a row waiting to be filled in must never
  // count as a working set.
  const sets = (session.sets || []).filter(isLogged);
  const work = workingSets(sets);
  const ceiling = prescription && prescription.max > 0 ? Number(prescription.max) : null;
  const floor = prescription && prescription.min > 0 ? Number(prescription.min) : ceiling;
  const amounts = work.map((s) => setAmount(s) || 0);
  const load = topWorkingLoad(work, movement);
  const atLoad = work.filter((s) => setLoad(s) === load).map((s) => setAmount(s) || 0);
  const effort = workingEffort(work);
  let bestE1rm = 0;
  for (const s of work) {
    const e = estimate1RM(movement, s);
    if (e && e > bestE1rm) bestE1rm = e;
  }
  return {
    date: session.date,
    sets, work,
    ramps: rampSets(sets).length,
    failed: failedSets(sets),
    load,
    best: amounts.length ? Math.max(...amounts) : 0,
    bestAtLoad: atLoad.length ? Math.max(...atLoad) : 0,
    hitTarget: work.length > 0 && ceiling != null && amounts.every((a) => a >= ceiling),
    missedFloor: work.length > 0 && floor != null && amounts.some((a) => a < floor),
    rir: effort ? effort.rir : null,
    effortSet: effort ? effort.set : null,
    bestE1rm: bestE1rm || null,
    pain: !!session.pain,
    deload: !!session.deload,
  };
}

// Did `cur` beat `prev`? Reps and load only — never e1RM, which is unreliable
// above ~10 reps and meaningless for a carry or a plank (#8).
export function beatsPrevious(cur, prev, movement) {
  if (!prev) return true;
  const inverted = invertLoad(movement);
  const harder = (a, b) => (inverted ? a < b : a > b);
  if (cur.load != null && prev.load != null && cur.load !== prev.load) {
    return harder(cur.load, prev.load);
  }
  // Same load (or no load at all): more reps, seconds or yards is the win.
  return cur.best > prev.best;
}

// ---- Stall detection (#8) ---------------------------------------------------
// Per movement, working sets only: consecutive sessions that failed to beat the
// one before at a real effort. Topping the prescribed range is never a stall —
// that's a completed range waiting on load, and the engine gives it load. Nor is
// a session he finished with reps in the tank: that was a light day, not a wall.
export const STALL_DELOAD_AT = 2;

export function stallState(summaries = [], movement = null) {
  let consecutive = 0;
  const sessions = [];
  for (let i = 0; i < summaries.length; i++) {
    const cur = summaries[i], prev = summaries[i + 1];
    if (!prev) break;
    if (cur.deload) break;                       // a deliberate reset, not a stall
    if (cur.hitTarget) break;                    // topped the range → load is next
    if (cur.rir != null && cur.rir >= 2) break;  // he wasn't near his limit
    if (beatsPrevious(cur, prev, movement)) break;
    consecutive++;
    sessions.push(cur.date);
  }
  return {
    consecutive,
    sessions,
    stalled: consecutive > 0,
    deloadDue: consecutive >= STALL_DELOAD_AT,
  };
}

// ---- Symptom gating ---------------------------------------------------------
// An exercise's `flags` say which body parts it leans on; the check-in says how
// those parts feel today. Over threshold, the lift holds its load — a flare day
// is for keeping the pattern, not for a PR. `entry.pain` is the sharper signal
// and is read first (it was stored and never read at all before this).
export const SYMPTOM_GATES = {
  knee: { symptom: "knee", at: 4, label: "right knee" },
  shoulder: { symptom: "shoulder", at: 4, label: "right shoulder" },
  neck: { symptom: "neck", at: 5, label: "neck" },
  leglength: { symptom: "tightness", at: 5, label: "right-side tightness" },
  hamstring: { symptom: "tightness", at: 5, label: "right-side tightness" },
};
export const TANK_FLOOR = 3; // energy or sleep at or below this → hold the load

export function symptomGate(flags = [], symptoms = null) {
  if (!symptoms) return null;
  for (const flag of flags) {
    const gate = SYMPTOM_GATES[flag];
    if (!gate) continue;
    const score = Number(symptoms[gate.symptom]);
    if (Number.isFinite(score) && score >= gate.at) {
      return { ...gate, score };
    }
  }
  for (const id of ["energy", "sleep"]) {
    const score = Number(symptoms[id]);
    if (Number.isFinite(score) && score <= TANK_FLOOR) {
      return { symptom: id, at: TANK_FLOOR, score, label: id, tank: true };
    }
  }
  return null;
}

// How many sessions in a row carried a pain flag, most recent first.
function painRun(summaries) {
  let n = 0;
  for (const s of summaries) { if (!s.pain) break; n++; }
  return n;
}

// ---- Extending the range ----------------------------------------------------
// Double progression normally lives inside the prescribed range. When the
// implement can't take a sensible load step, the range itself has to stretch —
// and once it's stretched this far, the jump is earned and the reps reset.
export const RANGE_EXTENSION = { reps: 2, time: 10, distance: 5 };

const amountStep = (measure) => RANGE_EXTENSION[measure] || 1;

// ---- The suggestion ---------------------------------------------------------

const pluralSets = (n) => `${n} working set${n === 1 ? "" : "s"}`;

function amountText(amount, measure, info) {
  if (measure === "reps") return `${amount} reps`;
  if (measure === "distance") return `${amount} ${info.unit}`;
  return `${amount}${info.unit}`;
}

// Which sets the number came from — the sentence the old engine never had.
function basisFor(cur, units) {
  const missed = cur.failed.length
    ? `, and skipped a failed set at ${Math.max(...cur.failed.map((x) => setLoad(x) || 0))} ${units}`
    : "";
  return `Counted ${pluralSets(cur.work.length)}` +
    (cur.ramps ? `, ignored ${cur.ramps} ramp-up set${cur.ramps === 1 ? "" : "s"}` : "") +
    missed + "." +
    (cur.effortSet ? ` Last working set at ${effortLabel(cur.effortSet)}.` : "");
}

/**
 * The whole engine. Pure: no DOM, no storage, no clock.
 *
 * @param movement     registry entry for the movement actually being performed
 * @param prescription { measure, min, max, perSide } — what today asks for
 * @param history      [{ date, sets, pain, deload }] for THIS movement, newest
 *                     first, sets already filtered to logged & non-suspect
 * @param symptoms     today's check-in scores, or null
 * @param flags        the slot's injury flags (["knee", "shoulder", …])
 * @param scheduledDeload  the cadence says this week is a deload week
 * @param units        "lb" | "kg", for the rationale text
 */
export function nextPrescription({
  movement = null,
  prescription = null,
  history = [],
  symptoms = null,
  flags = [],
  scheduledDeload = false,
  units = "lb",
} = {}) {
  const measure = (prescription && prescription.measure) || (movement && movement.measure) || "reps";
  const info = measureInfo(measure);
  const ceiling = prescription && prescription.max > 0 ? Number(prescription.max) : null;
  const floor = prescription && prescription.min > 0 ? Number(prescription.min) : ceiling;

  const summaries = history
    .map((h) => summarize(h, movement, prescription))
    .filter((s) => s.work.length > 0);
  const cur = summaries[0];
  if (!cur) return null;

  const basis = basisFor(cur, units);
  const stall = stallState(summaries, movement);
  const step = cur.load != null ? loadStep(movement, cur.load) : null;
  const canLoad = !!step;
  const inverted = invertLoad(movement);
  const say = (amount) => amountText(amount, measure, info);

  const out = (action, weight, amount, note, extra = {}) => ({
    action, weight, amount, note, basis,
    stall: stall.consecutive,
    ...extra,
  });

  // 1. Pain, which the app has been storing and never reading.
  const pains = painRun(summaries);
  if (pains >= 2) {
    return out("swap", cur.load, ceiling,
      `Pain flagged here ${pains} sessions running. Don't load it again — 🎲 swap this slot for an ` +
      `alternative that trains the same thing, and tell your coach it keeps hurting.`,
      { guard: "pain" });
  }
  if (pains === 1) {
    return out("repeat", cur.load, ceiling,
      `You flagged pain here last time. Hold ${cur.load == null ? "what you did" : cur.load} and see how it ` +
      `moves today — no added load until a session goes through clean.`,
      { guard: "pain" });
  }

  // 2. Today's check-in, against this slot's flags.
  const gate = symptomGate(flags, symptoms);
  if (gate) {
    const why = gate.tank
      ? `Your ${gate.label} is at ${gate.score}/10`
      : `Your ${gate.label} is at ${gate.score}/10 and this lift leans on it`;
    return out("repeat", cur.load, ceiling,
      `${why} — hold ${cur.load == null ? "last session's work" : cur.load} today. Keep the pattern, ` +
      `skip the PR; the load will still be there when it settles.`,
      { guard: "symptom" });
  }

  // 3. A deload, scheduled or earned. ~10% off and rebuild — 5/3/1's reset,
  //    sized to how fast he adds weight, and logged as a decision so the chart
  //    reads it as a step back taken on purpose rather than a regression.
  if (canLoad && (scheduledDeload || stall.deloadDue)) {
    const target = cur.load * (inverted ? 1 / TRAINING_MAX_PCT : TRAINING_MAX_PCT);
    const dropped = round(Math.round(target / step.inc) * step.inc);
    const load = dropped === cur.load
      ? round(inverted ? cur.load + step.inc : cur.load - step.inc)
      : dropped;
    const note = scheduledDeload
      ? `Deload week: ${load} for ${say(floor ?? ceiling)}, and cut a set. Consecutive hard weeks are where ` +
        `44-year-old knees and shoulders start collecting interest — take it, and come back at ${cur.load}.`
      : `${stall.consecutive} sessions stuck at ${cur.load} with nothing left in the tank. That's a wall, not a ` +
        `bad day — drop to ${load}, rebuild to ${say(ceiling)}, and you'll pass ${cur.load} on the way back up.`;
    return out("deload", load, floor ?? ceiling, note, {
      deload: true,
      reason: scheduledDeload ? "scheduled" : "stall",
      dropSet: !!scheduledDeload,
      from: cur.load,
    });
  }

  // 4. A top set he failed out of. The settled weight is the working weight —
  //    Math.max used to read the opener he missed as the number to repeat.
  if (cur.failed.length && cur.load != null) {
    const missed = Math.max(...cur.failed.map((s) => setLoad(s) || 0));
    const onTheOpener = cur.sets.indexOf(cur.failed[0]) === 0;
    return out("repeat", cur.load, ceiling,
      (onTheOpener
        ? `You opened at ${missed} last time and backed off to ${cur.load}`
        : `You worked up to ${missed} last time and had to come back to ${cur.load}`) +
      ` — repeat ${cur.load} and own all ${say(ceiling)}.`);
  }

  // 5/6. Double progression, gated on how hard the last working set was.
  const verdict = effortVerdict({ rir: cur.rir, hitTarget: cur.hitTarget });
  const stallNote = stall.stalled
    ? ` Second look: that's ${stall.consecutive} session${stall.consecutive === 1 ? "" : "s"} without a gain in ` +
      `reps or load — check the setup, the sleep and the food before you blame the weight.`
    : "";

  // Unloaded work: seconds and reps are the only currency there is (#9).
  if (!canLoad) {
    const extendTo = Math.max(cur.best + amountStep(measure), (ceiling || 0) + amountStep(measure));
    if (cur.hitTarget && verdict.steps > 0) {
      // Bands change tension rather than weight; everything else here can be
      // done holding a dumbbell, which past about a minute beats more seconds.
      const loadable = movement && movement.implement !== "band";
      const alt = !loadable ? ""
        : measure === "time" && extendTo >= 60
          ? `, or — better past a minute — stay at ${say(cur.best)} and hold a dumbbell`
          : `, or add a dumbbell and stay at ${say(cur.best)}`;
      return out("increase", null, extendTo,
        `You held ${say(cur.best)} everywhere last time — take it to ${say(extendTo)}${alt}.${stallNote}`);
    }
    if (verdict.code === "at-failure") {
      return out("repeat", null, ceiling,
        `You went to failure at ${say(cur.best)} — hold there until it stops being a fight.${stallNote}`);
    }
    return out("repeat", null, ceiling,
      `Work back up to ${say(ceiling)} on every set before adding anything.${stallNote}`);
  }

  // Loaded work. `coarse` means the smallest step this rack has is bigger than
  // the percentage this lift should be adding — reps first, load later.
  // "Add 10 — 6% — for 5 reps at 175", or its mirror image on an assist stack,
  // where progress is a smaller number on the pin.
  const move = (delta, load) => {
    const pct = Math.round((delta / cur.load) * 100);
    return inverted
      ? `Take ${delta} off the assistance — ${pct}% less help — for ${say(floor ?? ceiling)} at ${load}`
      : `Add ${delta} — ${pct}% — for ${say(floor ?? ceiling)} at ${load}`;
  };

  // The rep range is spent: take the one jump the rack has, and drop the reps
  // back to the bottom of the range to absorb it. This is the ONLY place a
  // suggestion is allowed past MAX_JUMP, and only because the target goes down
  // with the load — 30×12 to 35×8 is not a 17% overload, it's the same work
  // rearranged. Anywhere else, the cap holds.
  const graduate = () => {
    const { load, delta } = advance(movement, cur.load, step, 1);
    const pct = Math.round((delta / cur.load) * 100);
    const direction = inverted ? `down to ${load} of assistance` : `up to ${load}`;
    const tank = verdict.code === "too-light"
      ? ` You had ${verdict.rir}+ left at ${cur.load}, so expect this to move — and if ${load} still leaves ` +
        `${verdict.rir} in the tank, ${round(load + delta)} is next.`
      : "";
    return out("increase", load, floor ?? ceiling,
      `${say(cur.best)} at ${cur.load} is the end of the road for this weight. The smallest jump this ` +
      `${implementWord(movement)} has is ${delta} — ${pct}% — so go ${direction} and drop back to ` +
      `${say(floor ?? ceiling)} while you absorb it.${tank}`,
      { rebase: true });
  };

  if (cur.hitTarget) {
    if (verdict.steps === 0) {
      // Topped the range, but the last set was to failure. More load now buys a
      // missed range next session.
      return out("repeat", cur.load, ceiling,
        `You topped the range, but that last set was to failure — repeat ${cur.load} and let it feel like ` +
        `an 8 before adding.${stallNote}`);
    }
    if (!step.coarse) {
      const { load, delta, capped } = advance(movement, cur.load, step, verdict.steps);
      const ceilingLoad = loadCeiling(summaries, movement, floor ?? ceiling, step);
      if (ceilingLoad != null && load > ceilingLoad && ceilingLoad > cur.load) {
        return out("increase", ceilingLoad, floor ?? ceiling,
          `Top of the range at ${cur.load} — up to ${ceilingLoad}. Held there by your training max: ` +
          `anything more is a load you've never carried for ${say(floor ?? ceiling)}.`, { capped: true });
      }
      if (ceilingLoad != null && ceilingLoad <= cur.load) {
        return out("repeat", cur.load, ceiling,
          `Top of the range at ${cur.load}, but that's already everything your best sets say this lift has. ` +
          `Repeat it and make ${say(ceiling)} feel easy before you ask for more.`, { capped: true });
      }
      const lead = verdict.code === "too-light"
        ? `You topped the range with ${verdict.rir}+ ${info.short} still in the tank — that was too light.`
        : verdict.code === "near-failure"
          ? `You topped the range with one left — a clean step up.`
          : verdict.rir != null
            ? `You hit the top of the range at RPE ${10 - verdict.rir}.`
            : `You hit the top of the range on every working set.`;
      return out("increase", load, floor ?? ceiling,
        `${lead} ${move(delta, load)}${capped ? ", the most this lift should take in one jump" : ""}.`);
    }
    // Coarse implement: stretch the range, and only graduate once it's spent —
    // unless he finished the range with 4+ left, which says the load, not the
    // rep count, is what's holding this lift back.
    const extendTo = (ceiling || 0) + amountStep(measure);
    if (cur.best >= extendTo || verdict.code === "too-light") return graduate();
    return out("repeat", cur.load, extendTo,
      `Top of the range at ${cur.load}, but the smallest step this ${implementWord(movement)} has is ` +
      `${step.inc} — ${Math.round(step.pct * 100)}%, too big a bite for one session. Stay at ${cur.load} and take it ` +
      `to ${say(extendTo)}; the jump comes when that's easy.${stallNote}`, { extend: true });
  }

  // Short of the top of the range.
  //
  // "Could maybe handle 5 more on each side" — 30×8, 30×8, 30×12 with four reps
  // still in the tank. Two of the three sets missed the top of the range, but
  // one cleared it and he was nowhere near his limit: the dumbbells are the
  // limiter, not the reps, and waiting three sessions to say so is coaching him
  // backwards.
  if (step.coarse && verdict.code === "too-light" && ceiling != null && cur.best >= ceiling) {
    return graduate();
  }
  if (verdict.steps > 0 && !step.coarse) {
    // 4+ left in the tank and still short of the range: the load was the
    // limiter, not the reps.
    const { load, delta } = advance(movement, cur.load, step, verdict.steps);
    return out("increase", load, floor ?? ceiling,
      `You stopped short of the range with ${verdict.rir}+ ${info.short} in the tank — the load wasn't the ` +
      `thing holding you back. ${move(delta, load)}.`);
  }
  if (verdict.code === "at-failure") {
    return out("repeat", cur.load, ceiling,
      `You were already at failure short of ${say(ceiling)} — repeat ${cur.load}. The extra ${info.short} ` +
      `come from getting stronger at this weight, not from grinding.${stallNote}`);
  }
  if (cur.missedFloor && floor != null && cur.best < floor) {
    return out("repeat", cur.load, floor,
      `${cur.load} didn't make the bottom of the range last time — stay there until all ` +
      `${pluralSets(cur.work.length)} clear ${say(floor)}.${stallNote}`);
  }
  const tank = verdict.code === "too-light"
    ? ` You had ${verdict.rir}+ left, so this should move fast — and when every set holds ${say(ceiling)}, ` +
      `the next ${step.inc} is waiting.`
    : "";
  return out("repeat", cur.load, ceiling,
    `Stay at ${cur.load} and get every working set to ${say(ceiling)} before adding weight.${tank}${stallNote}`);
}

function implementWord(movement) {
  if (!movement) return "implement";
  if (movement.implement === "dumbbell") return "dumbbell rack";
  if (movement.implement === "cable") return "cable stack";
  if (movement.implement === "machine") return "stack";
  if (movement.implement === "barbell") return "bar";
  return "implement";
}

// The most load to ask for at `reps`, from the best estimated 1RM this movement
// has ever shown, plus a single increment of headroom. Only meaningful where
// Epley is (loaded rep work) — a carry or an assist stack has no 1RM to reason
// from, and gets no ceiling.
function loadCeiling(summaries, movement, reps, step) {
  if (invertLoad(movement)) return null;
  const best = summaries.reduce((m, s) => Math.max(m, s.bestE1rm || 0), 0);
  const capacity = capacityAt(best, reps);
  if (!capacity) return null;
  return round(Math.floor((capacity + step.inc) / step.inc) * step.inc);
}
