import test from "node:test";
import assert from "node:assert/strict";

import { MOVEMENTS, MOVEMENT_SLUGS, getMovement, resolveMovementId, loadLabel, swapGroup } from "../js/movements.js";
import { validateProgram, allExercises, alternativeNames, findExercise } from "../js/program.js";

test("every movement declares the facts the engine needs", () => {
  for (const slug of MOVEMENT_SLUGS) {
    const mv = MOVEMENTS[slug];
    assert.equal(mv.slug, slug);
    assert.ok(mv.name, `${slug} needs a display name`);
    assert.ok(["barbell", "dumbbell", "machine", "cable", "band", "bodyweight"].includes(mv.implement), `${slug} implement`);
    assert.ok(["total", "per-hand", "per-side", "none"].includes(mv.loadMode), `${slug} loadMode`);
    assert.ok(["reps", "time", "distance"].includes(mv.measure), `${slug} measure`);
  }
});

test("the program only references movements that exist", () => {
  assert.deepEqual(validateProgram(), []);
});

test("every 🎲 alternative trains what its slot is there to train", () => {
  // Tim's rule: an alternative has to work the same muscle group as the slot.
  // validateProgram() enforces it, so this asserts the rule has teeth rather
  // than only that the program currently happens to pass.
  for (const e of allExercises()) {
    const group = swapGroup(getMovement(e.movement));
    for (const slug of e.alternatives) {
      assert.equal(swapGroup(getMovement(slug)), group, `${e.id}: ${slug} does not belong in a ${group} slot`);
    }
  }
  // An incline press is a chest press, wherever it is convenient to put it.
  assert.equal(swapGroup(getMovement("db-incline-press-neutral")), "chest-press");
  assert.equal(swapGroup(getMovement("db-shoulder-press-seated")), "shoulder-press");
  assert.ok(!findExercise("b3").alternatives.includes("db-incline-press-neutral"));
  assert.ok(findExercise("a2").alternatives.includes("db-incline-press-neutral"));
});

test("unilateral leg work and lateral core still swap freely", () => {
  // The rule is about muscle group, not about my pattern labels: a split squat
  // can stand in for a single-leg press, and a side plank for a carry.
  assert.equal(swapGroup(getMovement("single-leg-leg-press")), swapGroup(getMovement("bulgarian-split-squat")));
  assert.equal(swapGroup(getMovement("suitcase-carry")), swapGroup(getMovement("side-plank")));
  assert.equal(swapGroup(getMovement("db-lateral-lunge")), swapGroup(getMovement("adductor-abductor-machine")));
});

test("every slot and alternative resolves to a movement", () => {
  for (const e of allExercises()) {
    assert.ok(getMovement(e.movement), `${e.id} → ${e.movement}`);
    assert.equal(alternativeNames(e).length, e.alternatives.length);
    alternativeNames(e).forEach((n) => assert.notEqual(n, undefined));
  }
});

test("legacy display names resolve to their movement", () => {
  // These are the strings sitting in Tim's existing backup.
  assert.equal(resolveMovementId("Barbell Incline Press"), "barbell-incline-press");
  assert.equal(resolveMovementId("Barbell Row"), "barbell-row");
  assert.equal(resolveMovementId("DB Skull-crusher"), "db-skullcrusher");
  assert.equal(resolveMovementId("Chest-Supported Row"), "chest-supported-db-row");
  assert.equal(resolveMovementId("Seated Cable Row"), "seated-cable-row");
  assert.equal(resolveMovementId("Suitcase Hold"), "suitcase-hold");
  assert.equal(resolveMovementId("Leg Press (limited ROM)"), "leg-press");
  assert.equal(resolveMovementId(null), null);
  assert.equal(resolveMovementId("Something Tim invented"), null);
});

test("a slug passed in is returned unchanged", () => {
  assert.equal(resolveMovementId("barbell-row"), "barbell-row");
});

test("the same movement in two slots is one identity", () => {
  // Single-Arm DB Row's alternative and Day A's row slot are the same lift.
  assert.equal(findExercise("a3").movement, "chest-supported-db-row");
  assert.ok(findExercise("c3").alternatives.includes("chest-supported-db-row"));
  // …and the two carry slots share their hold.
  assert.ok(findExercise("b7").alternatives.includes("suitcase-hold"));
  assert.ok(findExercise("c7").alternatives.includes("suitcase-hold"));
});

test("the weight column says what the number means", () => {
  assert.equal(loadLabel(getMovement("barbell-bench-press"), "lb"), "lb");
  assert.equal(loadLabel(getMovement("db-reverse-lunge"), "lb"), "lb/hand");
  assert.equal(loadLabel(getMovement("suitcase-carry"), "lb"), "lb/side");
  assert.equal(loadLabel(getMovement("assisted-pull-up"), "lb"), "lb assist");
  assert.equal(loadLabel(getMovement("weighted-pull-up"), "lb"), "+lb");
});
