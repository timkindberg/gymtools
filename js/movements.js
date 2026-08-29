// =============================================================================
// movements.js — the movement registry.
//
// A *slot* (a1, b3, …) is what the program schedules today. A *movement* is the
// actual exercise you performed. They are not the same thing: hit 🎲 on the b3
// slot and you might do a Barbell Incline Press instead of a Seated DB Shoulder
// Press. History, charts, and load suggestions key on the MOVEMENT, so a swap
// can never hand one implement's weight to another (see issue #2).
//
// Each movement carries the facts the progression engine needs:
//   implement  barbell | dumbbell | machine | cable | band | bodyweight
//   loadMode   how the logged weight maps to reality:
//                total     one number, the whole load (bar + plates, stack pin)
//                per-hand  the number is ONE dumbbell; both hands are loaded
//                per-side  the number is what one side carries, sides in turn
//                none      unloaded (bodyweight only)
//   measure    reps | time | distance — what the second input column counts
//   pattern    movement pattern, for balance checks and ratio work later
//   unilateral true when the prescription is naturally "per side"
//   assisted   the load *reduces* effort (assist stack) — never an e1RM input
//   addedLoad  the number is weight ADDED to bodyweight, not the total moved
//   increment  smallest load step this movement can actually take, when it
//              differs from what its implement usually offers (engine.js)
// =============================================================================

export const IMPLEMENTS = ["barbell", "dumbbell", "machine", "cable", "band", "bodyweight"];
export const LOAD_MODES = ["total", "per-hand", "per-side", "none"];

const m = (slug, name, o = {}) => ({
  slug, name,
  implement: "machine",
  loadMode: "total",
  measure: "reps",
  pattern: "other",
  unilateral: false,
  assisted: false,
  addedLoad: false,
  ...o,
});

const LIST = [
  // ---- Squat / knee-dominant -----------------------------------------------
  m("barbell-box-squat", "Barbell Box Squat", { implement: "barbell", pattern: "squat" }),
  m("safety-bar-box-squat", "Safety-Bar Box Squat", { implement: "barbell", pattern: "squat" }),
  m("goblet-box-squat", "Goblet Box Squat", { implement: "dumbbell", pattern: "squat" }),
  m("leg-press", "Leg Press (limited ROM)", { pattern: "squat" }),
  m("hack-squat", "Hack Squat (partial)", { pattern: "squat" }),
  m("single-leg-leg-press", "Single-Leg Leg Press (limited ROM)", { pattern: "squat", unilateral: true }),

  // ---- Lunge / split -------------------------------------------------------
  m("db-reverse-lunge", "DB Reverse Lunge", { implement: "dumbbell", loadMode: "per-hand", pattern: "lunge", unilateral: true }),
  m("bulgarian-split-squat", "Bulgarian Split Squat", { implement: "dumbbell", loadMode: "per-hand", pattern: "lunge", unilateral: true }),
  m("split-squat-to-box", "Split Squat to box", { implement: "dumbbell", loadMode: "per-hand", pattern: "lunge", unilateral: true }),
  m("db-step-up", "DB Step-up (low box)", { implement: "dumbbell", loadMode: "per-hand", pattern: "lunge", unilateral: true }),
  m("walking-lunge", "Walking Lunge", { implement: "dumbbell", loadMode: "per-hand", pattern: "lunge", unilateral: true }),
  m("db-lateral-lunge", "DB Lateral Lunge", { implement: "dumbbell", loadMode: "per-hand", pattern: "lunge-frontal", unilateral: true }),
  m("cossack-squat", "Cossack Squat (shallow)", { implement: "bodyweight", loadMode: "none", pattern: "lunge-frontal", unilateral: true }),
  m("adductor-abductor-machine", "Adductor Machine + Hip Abduction Machine", { pattern: "adduction" }),

  // ---- Hinge ---------------------------------------------------------------
  m("barbell-rdl", "Barbell Romanian Deadlift", { implement: "barbell", pattern: "hinge" }),
  m("db-rdl", "DB Romanian Deadlift", { implement: "dumbbell", loadMode: "per-hand", pattern: "hinge" }),
  m("single-leg-db-rdl", "Single-Leg DB RDL", { implement: "dumbbell", loadMode: "per-hand", pattern: "hinge", unilateral: true }),
  m("b-stance-rdl", "B-Stance RDL", { implement: "dumbbell", loadMode: "per-hand", pattern: "hinge", unilateral: true }),
  m("back-extension-45", "45° Back Extension", { implement: "bodyweight", loadMode: "none", pattern: "hinge" }),
  m("cable-pull-through", "Cable Pull-Through", { implement: "cable", pattern: "hinge" }),
  // Added 2026-08-29: he pulled these mid-session with nowhere to log them.
  // The trap bar is listed first on purpose — see the b1 alternatives.
  m("trap-bar-deadlift", "Trap-Bar Deadlift", { implement: "barbell", pattern: "hinge" }),
  m("barbell-deadlift", "Barbell Deadlift", { implement: "barbell", pattern: "hinge" }),

  // ---- Hip extension -------------------------------------------------------
  m("barbell-hip-thrust", "Barbell Hip Thrust", { implement: "barbell", pattern: "hip-extension" }),
  m("machine-hip-thrust", "Machine Hip Thrust", { pattern: "hip-extension" }),
  m("db-hip-thrust", "DB Hip Thrust", { implement: "dumbbell", pattern: "hip-extension" }),
  m("glute-bridge", "Glute Bridge", { implement: "bodyweight", loadMode: "none", pattern: "hip-extension" }),

  // ---- Knee flexion --------------------------------------------------------
  m("seated-leg-curl", "Seated Leg Curl", { pattern: "knee-flexion" }),
  m("lying-leg-curl", "Lying Leg Curl", { pattern: "knee-flexion" }),
  m("nordic-curl", "Nordic Curl (negatives)", { implement: "bodyweight", loadMode: "none", pattern: "knee-flexion" }),

  // ---- Horizontal push -----------------------------------------------------
  m("barbell-bench-press", "Barbell Bench Press", { implement: "barbell", pattern: "horizontal-push" }),
  m("db-bench-press-neutral", "Neutral-Grip DB Bench Press", { implement: "dumbbell", loadMode: "per-hand", pattern: "horizontal-push" }),
  m("machine-chest-press", "Machine Chest Press", { pattern: "horizontal-push" }),
  m("floor-press", "Floor Press", { implement: "barbell", pattern: "horizontal-push" }),

  // ---- Vertical / incline push --------------------------------------------
  m("db-shoulder-press-seated", "Seated DB Shoulder Press", { implement: "dumbbell", loadMode: "per-hand", pattern: "vertical-push" }),
  m("machine-shoulder-press", "Machine Shoulder Press", { pattern: "vertical-push" }),
  m("barbell-overhead-press", "Barbell Overhead Press", { implement: "barbell", pattern: "vertical-push" }),
  m("db-incline-press-neutral", "Neutral-Grip DB Incline Press", { implement: "dumbbell", loadMode: "per-hand", pattern: "incline-push" }),
  // Not currently programmed, but logged on 2026-08-19 as a 🎲 swap in the b3
  // slot — the registry has to know it so that history stays attributable.
  m("barbell-incline-press", "Barbell Incline Press", { implement: "barbell", pattern: "incline-push" }),

  // ---- Horizontal pull -----------------------------------------------------
  m("chest-supported-db-row", "Chest-Supported DB Row", { implement: "dumbbell", loadMode: "per-hand", pattern: "horizontal-pull" }),
  m("barbell-row", "Barbell Row", { implement: "barbell", pattern: "horizontal-pull" }),
  m("seated-cable-row", "Seated Cable Row (neutral)", { implement: "cable", pattern: "horizontal-pull" }),
  m("machine-row", "Machine Row", { pattern: "horizontal-pull" }),
  m("db-row-single-arm", "Single-Arm DB Row", { implement: "dumbbell", loadMode: "per-side", pattern: "horizontal-pull", unilateral: true }),

  // ---- Vertical pull -------------------------------------------------------
  m("lat-pulldown", "Lat Pulldown", { implement: "cable", pattern: "vertical-pull" }),
  m("lat-pulldown-neutral", "Neutral-Grip Lat Pulldown", { implement: "cable", pattern: "vertical-pull" }),
  m("assisted-pull-up", "Assisted Pull-up", { pattern: "vertical-pull", assisted: true }),
  m("weighted-pull-up", "Weighted Pull-up", { implement: "bodyweight", pattern: "vertical-pull", addedLoad: true }),

  // ---- Shoulder health / rear delt ----------------------------------------
  m("face-pull", "Face Pull", { implement: "cable", pattern: "rear-delt" }),
  m("band-face-pull", "Band Face Pull", { implement: "band", loadMode: "none", pattern: "rear-delt" }),
  m("reverse-pec-deck", "Reverse Pec-Deck", { pattern: "rear-delt" }),
  m("cable-external-rotation", "Cable External Rotation", { implement: "cable", loadMode: "per-side", pattern: "shoulder-external-rotation", unilateral: true }),
  m("db-external-rotation-side-lying", "Side-Lying DB External Rotation", { implement: "dumbbell", loadMode: "per-side", pattern: "shoulder-external-rotation", unilateral: true }),
  m("band-external-rotation", "Band External Rotation", { implement: "band", loadMode: "none", pattern: "shoulder-external-rotation", unilateral: true }),

  // ---- Arms ----------------------------------------------------------------
  m("incline-db-curl", "Incline DB Curl", { implement: "dumbbell", loadMode: "per-hand", pattern: "elbow-flexion" }),
  m("cable-curl", "Cable Curl", { implement: "cable", pattern: "elbow-flexion" }),
  m("hammer-curl", "Hammer Curl", { implement: "dumbbell", loadMode: "per-hand", pattern: "elbow-flexion" }),
  m("barbell-curl", "Barbell Curl", { implement: "barbell", pattern: "elbow-flexion" }),
  m("triceps-rope-pushdown", "Triceps Rope Pushdown", { implement: "cable", pattern: "elbow-extension" }),
  m("db-skullcrusher", "DB Skull-crusher", { implement: "dumbbell", loadMode: "per-hand", pattern: "elbow-extension" }),
  m("overhead-rope-extension", "Overhead Rope (if pain-free)", { implement: "cable", pattern: "elbow-extension" }),
  m("dips-assisted", "Dips (assisted)", { pattern: "horizontal-push", assisted: true }),

  // ---- Core / carries ------------------------------------------------------
  m("pallof-press-half-kneeling", "Half-Kneeling Pallof Press", { implement: "cable", pattern: "anti-rotation", unilateral: true }),
  m("pallof-press-standing", "Standing Pallof", { implement: "cable", pattern: "anti-rotation", unilateral: true }),
  m("cable-chop", "Cable Chop", { implement: "cable", pattern: "anti-rotation", unilateral: true }),
  m("bird-dog", "Bird Dog", { implement: "bodyweight", loadMode: "none", pattern: "anti-rotation", unilateral: true }),
  m("suitcase-carry", "Suitcase Carry", { implement: "dumbbell", loadMode: "per-side", measure: "distance", pattern: "carry", unilateral: true }),
  m("suitcase-hold", "Suitcase Hold (isometric)", { implement: "dumbbell", loadMode: "per-side", measure: "time", pattern: "carry", unilateral: true }),
  m("side-plank", "Side Plank", { implement: "bodyweight", loadMode: "none", measure: "time", pattern: "anti-lateral-flexion", unilateral: true }),
  m("copenhagen-plank", "Copenhagen Plank", { implement: "bodyweight", loadMode: "none", measure: "time", pattern: "anti-lateral-flexion", unilateral: true }),

  // ---- Grip / hang ---------------------------------------------------------
  // He was already doing these off-program ("Dead hang for 25 seconds. I need
  // more callouses.", 2026-08-24) with nowhere to log them — issue #9.
  m("dead-hang", "Dead Hang", { implement: "bodyweight", loadMode: "none", measure: "time", pattern: "grip" }),
  m("weighted-dead-hang", "Weighted Dead Hang", { implement: "bodyweight", measure: "time", pattern: "grip", addedLoad: true }),
];

export const MOVEMENTS = Object.freeze(
  LIST.reduce((acc, mv) => { acc[mv.slug] = Object.freeze(mv); return acc; }, {})
);

export const MOVEMENT_SLUGS = Object.keys(MOVEMENTS);

// ---- Swap groups ------------------------------------------------------------
// `pattern` describes the mechanics, which the progression engine will want at
// full resolution (a hip thrust and an RDL are not the same lift). A SWAP is a
// coarser question — "does this train the same thing?" — because an alternative
// has to be able to fill the slot's job for the week.
//
// Tim's rule, 2026-08-26: every alternative in a slot works the same muscle
// group as the slot. An incline press is a chest press and does not belong in
// a shoulder-press slot, however conveniently it sits next to one.
const SWAP_GROUPS = {
  squat: "knee-dominant",
  lunge: "knee-dominant",
  "lunge-frontal": "frontal-plane-hips",
  adduction: "frontal-plane-hips",
  hinge: "posterior-chain",
  "hip-extension": "posterior-chain",
  "knee-flexion": "hamstrings",
  "horizontal-push": "chest-press",
  "incline-push": "chest-press",
  "vertical-push": "shoulder-press",
  "horizontal-pull": "horizontal-pull",
  "vertical-pull": "vertical-pull",
  "rear-delt": "rear-delt",
  "shoulder-external-rotation": "rotator-cuff",
  "elbow-flexion": "biceps",
  "elbow-extension": "triceps",
  "anti-rotation": "anti-rotation",
  "anti-lateral-flexion": "lateral-core",
  carry: "lateral-core",
  grip: "grip",
};

// What a movement can stand in for. Two movements are swappable when they
// share this.
export function swapGroup(movement) {
  if (!movement) return null;
  return SWAP_GROUPS[movement.pattern] || movement.pattern;
}

// ---- Cross-implement seed ratios (#12) --------------------------------------
// A movement performed for the first time has no history, so the engine has
// nothing to suggest. It does, however, usually have a cousin with history: a
// barbell row and a single-arm DB row are the same job with a different handle.
//
// One link means "load(a) is about `ratio` × load(b)", each side expressed in
// the units that movement is LOGGED in — per-hand for dumbbells, total for a
// bar. Every link registers in both directions, reciprocal ratio.
//
// These are gym heuristics, not science. They vary with limb length, grip and
// stability demand, and for a 6'3" lifter especially. A seeded number is a
// starting guess to be overwritten by the first real set — it never enters
// history, never feeds a training max, never counts as a data point. That is
// enforced in the engine, and it is the reason machines are almost absent from
// this table: a lever arm can make the number on the stack mean anything.
const LINKS = [
  // Rowing: 60/hand single-arm ≈ 125 on the bar in his own log (issue #12).
  ["barbell-row", "db-row-single-arm", 2.0, "one arm at a time carries about the same total load as the bar"],
  ["barbell-row", "chest-supported-db-row", 2.2, "the bench takes the low back out, so per hand goes down a little"],
  ["chest-supported-db-row", "db-row-single-arm", 0.9, "both hands at once, chest supported"],
  // Pressing: a pair of dumbbells is a little less than the same bar weight,
  // and unstable, so the per-hand number lands under half the bar.
  ["barbell-bench-press", "db-bench-press-neutral", 1.8, "two dumbbells cost stability the bar doesn't"],
  ["barbell-incline-press", "db-incline-press-neutral", 1.8, "same trade on an incline"],
  ["barbell-bench-press", "barbell-incline-press", 1.2, "flat is the stronger angle"],
  ["barbell-overhead-press", "db-shoulder-press-seated", 1.7, "seated dumbbells press less than the standing bar"],
  // Hinge: grip, not the hamstrings, caps a dumbbell RDL.
  ["barbell-rdl", "db-rdl", 2.0, "the bar isn't grip-limited the way two dumbbells are"],
  ["barbell-deadlift", "barbell-rdl", 1.25, "off the floor you get the legs; an RDL is hamstrings only"],
  ["barbell-deadlift", "trap-bar-deadlift", 0.95, "the trap bar sits you more upright, so it usually pulls a touch heavier"],
  ["db-rdl", "single-leg-db-rdl", 1.6, "one leg at a time is a balance lift before it's a load lift"],
  // Squat pattern: the safety bar sits a touch below the straight bar.
  ["barbell-box-squat", "safety-bar-box-squat", 1.1, "the yoke shifts the load forward"],
  ["barbell-box-squat", "goblet-box-squat", 3.0, "a goblet is capped by what you can hold at the chest"],
  ["db-reverse-lunge", "bulgarian-split-squat", 1.25, "the rear foot elevated is the harder split"],
  ["db-reverse-lunge", "split-squat-to-box", 1.1, "same split, less range"],
  ["db-reverse-lunge", "db-step-up", 1.1, "stepping up is the same leg with less deceleration"],
  // Arms and cuff work — small loads, tight relationships.
  ["hammer-curl", "incline-db-curl", 1.15, "the incline stretches the biceps and costs load"],
  ["triceps-rope-pushdown", "overhead-rope-extension", 1.4, "overhead is the weaker position"],
  ["cable-external-rotation", "db-external-rotation-side-lying", 1.0, "same cuff, same tiny numbers"],
  ["lat-pulldown", "lat-pulldown-neutral", 1.0, "same stack, different handle"],
  ["suitcase-carry", "suitcase-hold", 1.0, "carrying it and holding it are the same load"],
];

const SEEDS = (() => {
  const idx = {};
  const add = (to, from, ratio, why) => {
    if (!MOVEMENTS[to] || !MOVEMENTS[from]) return;
    (idx[to] = idx[to] || []).push({ from, ratio: Math.round(ratio * 1000) / 1000, why });
  };
  for (const [a, b, ratio, why] of LINKS) {
    add(a, b, ratio, why);
    add(b, a, 1 / ratio, why);
  }
  return idx;
})();

// Related movements whose history could seed a first-time load here, best
// first. Never more than a guess — see the note above.
export function seedSourcesFor(slug) {
  return (SEEDS[slug] || []).slice();
}

// ---- Lookup ----------------------------------------------------------------

// Display names logged before the registry existed, plus the shorthand the
// program uses in a couple of `alternatives` lists. Frozen on purpose: this is
// how old data finds its way home, so entries here must never be re-pointed.
const ALIASES = {
  "chest supported row": "chest-supported-db-row",
  "seated cable row": "seated-cable-row",
  "suitcase hold": "suitcase-hold",
  "pull up lat pulldown": "lat-pulldown",
  "pull-up / lat pulldown": "lat-pulldown",
  "db skullcrusher": "db-skullcrusher",
  "db skull crusher": "db-skullcrusher",
  "overhead rope": "overhead-rope-extension",
  "dips": "dips-assisted",
  "leg press": "leg-press",
  "hack squat": "hack-squat",
  "standing pallof press": "pallof-press-standing",
  "single leg leg press": "single-leg-leg-press",
  "45 back extension": "back-extension-45",
};

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[()/,.]/g, " ")
    .replace(/[^a-z0-9+° ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_NAME = (() => {
  const idx = {};
  for (const mv of LIST) idx[normalizeName(mv.name)] = mv.slug;
  for (const [alias, slug] of Object.entries(ALIASES)) idx[normalizeName(alias)] = slug;
  return idx;
})();

export function getMovement(slug) {
  return (slug && MOVEMENTS[slug]) || null;
}

// Accepts a slug OR a human display name (current or legacy). Returns a slug.
export function resolveMovementId(value) {
  if (!value) return null;
  if (MOVEMENTS[value]) return value;
  return BY_NAME[normalizeName(value)] || null;
}

export function movementName(slug, fallback = null) {
  const mv = getMovement(slug);
  return mv ? mv.name : fallback;
}

// The one place that answers "what did I actually do in this slot?".
export function movementIdFor(exDef, variant) {
  return resolveMovementId(variant) || (exDef && (exDef.movement || resolveMovementId(exDef.name))) || null;
}

// Assist stacks run backwards: MORE weight on the pin is LESS work, so every
// "which set was the hard one" and "did that go up?" comparison flips (#9).
export function invertLoad(movement) {
  return !!(movement && movement.assisted);
}

// Label for the weight column: a dumbbell number means something different from
// a stack number, and the header is where we say so.
export function loadLabel(movement, units = "lb") {
  if (!movement) return units;
  if (movement.assisted) return `${units} assist`;
  if (movement.addedLoad) return `+${units}`;
  if (movement.loadMode === "per-hand") return `${units}/hand`;
  if (movement.loadMode === "per-side") return `${units}/side`;
  if (movement.loadMode === "none") return `${units} (opt)`;
  return units;
}
