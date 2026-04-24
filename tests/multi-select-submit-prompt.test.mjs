import test from "node:test";
import assert from "node:assert/strict";

import {
  createMultiSelectState,
  formatChoiceLine,
  formatSubmitLine,
  moveActiveIndex,
  submitOrToggleActiveItem,
  toggleActiveItem,
} from "../src/prompts/multi-select-submit-prompt.mjs";

const CHOICES = [
  { name: "OpenClaw", value: "openclaw" },
  { name: "Hermes Agent", value: "hermes" },
];

test("enter toggles the active choice when a real option is focused", async () => {
  const state = createMultiSelectState({ choices: CHOICES });

  const result = await submitOrToggleActiveItem(state, {
    validate: () => true,
  });

  assert.equal(result.done, false);
  assert.deepEqual(result.state.selectedValues, ["openclaw"]);
  assert.equal(result.state.errorMessage, null);
});

test("space also toggles the active choice", () => {
  const state = createMultiSelectState({ choices: CHOICES });

  const next = toggleActiveItem(state);

  assert.deepEqual(next.selectedValues, ["openclaw"]);
  assert.equal(next.errorMessage, null);
});

test("submit on an empty selection stays in place and shows the validation error", async () => {
  let state = createMultiSelectState({ choices: CHOICES });
  state = moveActiveIndex(state, 1);
  state = moveActiveIndex(state, 1);

  const result = await submitOrToggleActiveItem(state, {
    validate: () => "Select at least one dispatcher host before continuing.",
  });

  assert.equal(result.done, false);
  assert.equal(result.state.activeIndex, 2);
  assert.equal(
    result.state.errorMessage,
    "Select at least one dispatcher host before continuing.",
  );
});

test("submit returns the selected values when validation passes", async () => {
  let state = createMultiSelectState({ choices: CHOICES });
  state = toggleActiveItem(state);
  state = moveActiveIndex(state, 1);
  state = moveActiveIndex(state, 1);

  const result = await submitOrToggleActiveItem(state, {
    validate: () => true,
  });

  assert.equal(result.done, true);
  assert.deepEqual(result.value, ["openclaw"]);
});

test("choice lines render circular selection indicators", () => {
  assert.equal(
    formatChoiceLine({ name: "OpenClaw", checkedName: "OpenClaw", checked: false }, true),
    "> ◯ OpenClaw",
  );
  assert.equal(
    formatChoiceLine({ name: "OpenClaw", checkedName: "OpenClaw", checked: true }, false),
    "  ◉ OpenClaw",
  );
});

test("submit line renders without the placeholder marker", () => {
  assert.equal(formatSubmitLine(true), "> Submit");
  assert.equal(formatSubmitLine(false), "  Submit");
});
