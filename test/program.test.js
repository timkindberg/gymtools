import test from "node:test";
import assert from "node:assert/strict";

import { restSeconds, allExercises } from "../js/program.js";

test("rest strings become seconds the timer can count", () => {
  assert.equal(restSeconds("45s"), 45);
  assert.equal(restSeconds("90s"), 90);
  assert.equal(restSeconds("2 min"), 120);
  assert.equal(restSeconds("3 minutes"), 180);
  assert.equal(restSeconds(75), 75);
});

test("a range rests for its low end — that's when the window opens", () => {
  assert.equal(restSeconds("2–3 min"), 120);
  assert.equal(restSeconds("60-90s"), 60);
  assert.equal(restSeconds("1 to 2 min"), 60);
});

test("anything unparseable falls back to the setting, not a wrong number", () => {
  assert.equal(restSeconds(undefined), null);
  assert.equal(restSeconds(""), null);
  assert.equal(restSeconds("as needed"), null);
  assert.equal(restSeconds("0s"), null);
});

test("every prescribed rest in the program parses", () => {
  for (const e of allExercises()) {
    assert.ok(restSeconds(e.rest) > 0, `${e.id} (${e.name}): unparseable rest "${e.rest}"`);
  }
});
