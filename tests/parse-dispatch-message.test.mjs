import test from "node:test";
import assert from "node:assert/strict";

import { parseDispatchMessage } from "../src/parse-dispatch-message.mjs";

test("parses telegram relay dispatch syntax", () => {
  const parsed = parseDispatchMessage(
    '!/skill preqstation-dispatch plan PROJ-327 using codex branch_name="task/proj-327/browser-notification-chuga"',
  );

  assert.deepEqual(parsed, {
    engine: "codex",
    taskKey: "PROJ-327",
    projectKey: "PROJ",
    objective: "plan",
    branchName: "task/proj-327/browser-notification-chuga",
    askHint: null,
    insightPromptB64: null,
    rawMessage:
      '!/skill preqstation-dispatch plan PROJ-327 using codex branch_name="task/proj-327/browser-notification-chuga"',
  });
});

test("parses plain-language preqstation dispatch text", () => {
  const parsed = parseDispatchMessage(
    "preqstation implement PROJ-12 with codex",
  );

  assert.deepEqual(parsed, {
    engine: "codex",
    taskKey: "PROJ-12",
    projectKey: "PROJ",
    objective: "implement",
    branchName: null,
    askHint: null,
    insightPromptB64: null,
    rawMessage: "preqstation implement PROJ-12 with codex",
  });
});

test("parses ask objective with ask_hint metadata", () => {
  const parsed = parseDispatchMessage(
    '!/skill preqstation-dispatch ask PROJ-328 using codex ask_hint="Acceptance criteria 중심으로 정리해줘"',
  );

  assert.deepEqual(parsed, {
    engine: "codex",
    taskKey: "PROJ-328",
    projectKey: "PROJ",
    objective: "ask",
    branchName: null,
    askHint: "Acceptance criteria 중심으로 정리해줘",
    insightPromptB64: null,
    rawMessage:
      '!/skill preqstation-dispatch ask PROJ-328 using codex ask_hint="Acceptance criteria 중심으로 정리해줘"',
  });
});

test("parses project-level insight commands without a task key", () => {
  const parsed = parseDispatchMessage(
    '!/skill preqstation-dispatch insight PROJ using codex insight_prompt_b64="cHJvbXB0LWJhc2U2NA=="',
  );

  assert.deepEqual(parsed, {
    engine: "codex",
    taskKey: null,
    projectKey: "PROJ",
    objective: "insight",
    branchName: null,
    askHint: null,
    insightPromptB64: "cHJvbXB0LWJhc2U2NA==",
    rawMessage:
      '!/skill preqstation-dispatch insight PROJ using codex insight_prompt_b64="cHJvbXB0LWJhc2U2NA=="',
  });
});

test("returns null for unrelated messages", () => {
  assert.equal(
    parseDispatchMessage("what is the current weather in toronto"),
    null,
  );
});
