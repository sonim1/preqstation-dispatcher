import test from "node:test";
import assert from "node:assert/strict";

import { parseHermesDispatchPayload } from "../src/adapters/hermes/payload.mjs";

test("parses a Hermes task dispatch payload into a dispatcher request", () => {
  const parsed = parseHermesDispatchPayload({
    event_type: "preq.dispatch.requested",
    event_id: "dispatch_request:req-123",
    dispatch: {
      request_id: "req-123",
      objective: "implement",
      project_key: "proj",
      task_key: "proj-123",
      engine: "codex",
      branch_name: "task/proj-123-example",
      ask_hint: "",
    },
  });

  assert.deepEqual(parsed, {
    engine: "codex",
    taskKey: "PROJ-123",
    projectKey: "PROJ",
    objective: "implement",
    branchName: "task/proj-123-example",
    askHint: null,
    insightPromptB64: null,
    rawMessage:
      'preqstation implement PROJ-123 using codex branch_name="task/proj-123-example"',
  });
});

test("parses a Hermes project insight payload without a task key", () => {
  const parsed = parseHermesDispatchPayload({
    event_type: "preq.dispatch.requested",
    dispatch: {
      objective: "insight",
      project_key: "PROJ",
      engine: "gemini-cli",
      insight_prompt_b64: "cHJvbXB0",
    },
  });

  assert.deepEqual(parsed, {
    engine: "gemini-cli",
    taskKey: null,
    projectKey: "PROJ",
    objective: "insight",
    branchName: null,
    askHint: null,
    insightPromptB64: "cHJvbXB0",
    rawMessage:
      'preqstation insight PROJ using gemini-cli insight_prompt_b64="cHJvbXB0"',
  });
});

test("rejects hermes-agent as an engine because Hermes is a dispatch host", () => {
  assert.throws(
    () =>
      parseHermesDispatchPayload({
        event_type: "preq.dispatch.requested",
        dispatch: {
          objective: "implement",
          project_key: "PROJ",
          task_key: "PROJ-123",
          engine: "hermes-agent",
        },
      }),
    /Unsupported dispatch engine: hermes-agent/,
  );
});

test("rejects task objectives without a task key", () => {
  assert.throws(
    () =>
      parseHermesDispatchPayload({
        event_type: "preq.dispatch.requested",
        dispatch: {
          objective: "implement",
          project_key: "PROJ",
          engine: "codex",
        },
      }),
    /Task key is required for implement dispatch/,
  );
});
