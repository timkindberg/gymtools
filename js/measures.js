// =============================================================================
// measures.js — what the second column actually counts, and what the numbers
// are allowed to mean.
//
// The set row used to be "weight × reps" for everything, so a 40-yard suitcase
// carry and a 45-second side plank were both filed as "reps" and then run
// through Epley for a fictional 1RM (issue #4). A movement now declares its
// measure, prescriptions are stored structurally instead of scraped back out of
// "8–10/side", and every entered number goes past a sanity check.
//
// Pure module: no DOM, no storage. Safe to unit-test and to call from anywhere.
// =============================================================================

export const MEASURES = {
  reps: { key: "reps", label: "Reps", short: "reps", unit: "", inputmode: "numeric", step: 1 },
  time: { key: "time", label: "Time", short: "sec", unit: "s", inputmode: "numeric", step: 5 },
  distance: { key: "distance", label: "Distance", short: "yd", unit: "yd", inputmode: "numeric", step: 5 },
};

export function measureInfo(measure) {
  return MEASURES[measure] || MEASURES.reps;
}

// ---- Prescriptions ---------------------------------------------------------
// { measure, min, max, perSide } — built structurally in program.js. The display
// string ("8–10/side") is derived FROM this, never parsed back into it.

export function prescribe(measure, min, max = min, { perSide = false } = {}) {
  return { measure, min, max, perSide };
}
export const repRange = (min, max = min, opts) => prescribe("reps", min, max, opts);
export const timeRange = (min, max = min, opts) => prescribe("time", min, max, opts);
export const distanceRange = (min, max = min, opts) => prescribe("distance", min, max, opts);

export const DEFAULT_PRESCRIPTIONS = {
  reps: prescribe("reps", 8, 10),
  time: prescribe("time", 30, 45, { perSide: true }),
  distance: prescribe("distance", 40, 40, { perSide: true }),
};

export function formatPrescription(p) {
  if (!p) return "";
  const info = measureInfo(p.measure);
  const range = p.min === p.max ? String(p.min) : `${p.min}–${p.max}`;
  const unit = p.measure === "distance" ? " " + info.unit : info.unit;
  return `${range}${unit}${p.perSide ? "/side" : ""}`;
}

// A slot's prescription only applies while the slot's own movement is the one
// being performed. 🎲 into a Side Plank where a Suitcase Carry was programmed
// and the measure changes with it.
export function prescriptionFor(exDef, movement) {
  const slotPrescription = exDef && exDef.prescription;
  const measure = (movement && movement.measure) || (slotPrescription && slotPrescription.measure) || "reps";
  if (slotPrescription && slotPrescription.measure === measure) return slotPrescription;
  if (movement && movement.prescription) return movement.prescription;
  const fallback = DEFAULT_PRESCRIPTIONS[measure];
  return movement && movement.unilateral ? { ...fallback, perSide: true } : fallback;
}

// ---- Reading a set ---------------------------------------------------------
// `amount` is the typed value (reps, seconds, or yards). Sets logged before the
// rename still carry `reps`; read through here and both work.
export function setAmount(set) {
  if (!set) return null;
  const v = set.amount != null ? set.amount : set.reps;
  return v == null || v === "" ? null : Number(v);
}
export function setLoad(set) {
  if (!set || set.weight == null || set.weight === "") return null;
  return Number(set.weight);
}
export function isLogged(set) {
  return setAmount(set) != null || setLoad(set) != null;
}

// ---- Estimated 1RM ---------------------------------------------------------
// Epley is a rep-range approximation. Past ~15 reps it is fantasy, and applied
// to yards or seconds it is nonsense, so it is gated rather than clamped.
export const E1RM_REP_CEILING = 15;

export function epley(weight, reps) {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export function canEstimate1RM(movement, set) {
  if (!movement || movement.measure !== "reps") return false;
  if (movement.assisted || movement.addedLoad || movement.loadMode === "none") return false;
  const w = setLoad(set), r = setAmount(set);
  return w != null && w > 0 && r != null && r > 0 && r <= E1RM_REP_CEILING;
}

export function estimate1RM(movement, set) {
  return canEstimate1RM(movement, set) ? epley(setLoad(set), setAmount(set)) : null;
}

// What a set contributes to the "how much work was that" number. Only loaded
// rep work is weight × reps; time and distance are tracked in their own units
// and never mixed into a pounds total.
export function setVolume(movement, set) {
  const measure = (movement && movement.measure) || "reps";
  if (measure !== "reps") return 0;
  const w = setLoad(set) || 0, r = setAmount(set) || 0;
  if (movement && (movement.assisted || movement.loadMode === "none")) return 0;
  const perSideFactor = movement && movement.loadMode === "per-hand" ? 2 : 1;
  return w * r * perSideFactor;
}

// The headline number for a set, in the movement's own units.
export function formatSet(movement, set) {
  const measure = (movement && movement.measure) || "reps";
  const info = measureInfo(measure);
  const w = setLoad(set), a = setAmount(set);
  const amountStr = a == null ? "–" : measure === "distance" ? `${a}${info.unit}` : `${a}${info.unit}`;
  if (measure === "reps") return `${w == null ? "–" : w}×${a == null ? "–" : a}`;
  return w == null || w === 0 ? amountStr : `${w}×${amountStr}`;
}

// ---- Validation ------------------------------------------------------------
// A typo is permanent: 140 × 120 reps put a 700 lb estimated 1RM into the chart
// and the coach report. Everything here is a *warning* with a one-tap override,
// never a block — the athlete is the authority on what he just did.

export const LIMITS = {
  reps: 30,
  time: 600,       // seconds — 10 minutes in one set
  distance: 400,   // yards in one carry
  weight: 600,
  jumpFactor: 3,   // vs. this movement's own best
};

// history: { maxLoad, maxAmount } from previous sessions of the SAME movement.
export function validateSet(movement, set, history = {}) {
  const measure = (movement && movement.measure) || "reps";
  const info = measureInfo(measure);
  const out = [];
  const w = setLoad(set), a = setAmount(set);

  if (a != null && a > LIMITS[measure]) {
    out.push({
      code: "high-amount",
      message: `${a} ${info.short} in one set is past anything you've programmed — is that a typo?`,
    });
  }
  if (w != null && w > LIMITS.weight) {
    out.push({ code: "high-weight", message: `${w} lb is a big number — is that right?` });
  }
  const maxLoad = Number(history.maxLoad) || 0;
  if (w != null && maxLoad > 0 && w > maxLoad * LIMITS.jumpFactor) {
    out.push({
      code: "load-jump",
      message: `${w} lb is more than ${LIMITS.jumpFactor}× your best on this movement (${maxLoad} lb).`,
    });
  }
  const maxAmount = Number(history.maxAmount) || 0;
  if (a != null && maxAmount > 0 && a > maxAmount * LIMITS.jumpFactor) {
    out.push({
      code: "amount-jump",
      message: `${a} ${info.short} is more than ${LIMITS.jumpFactor}× your best on this movement (${maxAmount}).`,
    });
  }
  return out;
}

// The subset that is checkable without history — used when migrating old data,
// where "what did he know at the time" isn't recoverable.
export function staticWarnings(movement, set) {
  return validateSet(movement, set, {});
}
