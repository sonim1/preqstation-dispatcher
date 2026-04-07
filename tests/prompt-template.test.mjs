import test from "node:test";
import assert from "node:assert/strict";

import { renderPrompt } from "../src/prompt-template.mjs";

test("renders preq dispatch prompt with task and workspace details", () => {
  const prompt = renderPrompt({
    taskKey: "PROJ-327",
    projectKey: "PROJ",
    branchName: "task/proj-327/browser-notification-chuga",
    objective: "plan",
    engine: "codex",
    cwd: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga",
    projectCwd: "/tmp/project",
  });

  assert.match(prompt, /Task ID: PROJ-327/);
  assert.match(prompt, /Project Key: PROJ/);
  assert.match(prompt, /Branch Name: task\/proj-327\/browser-notification-chuga/);
  assert.match(prompt, /User Objective: plan/);
  assert.match(prompt, /Work only inside \/tmp\/worktree\/proj\/task-proj-327-browser-notification-chuga/);
  assert.match(prompt, /preq_start_task\("PROJ-327", "codex"\)/);
});
