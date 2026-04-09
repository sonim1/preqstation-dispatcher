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

test("renders ask-specific note rewrite guidance", () => {
  const prompt = renderPrompt({
    taskKey: "PROJ-328",
    projectKey: "PROJ",
    branchName: "task/proj-328/edit-task-isyu",
    objective: "ask",
    engine: "codex",
    cwd: "/tmp/worktree/proj/task-proj-328-edit-task-isyu",
    projectCwd: "/tmp/project",
    askHint: "Acceptance criteria 중심으로 정리해줘",
  });

  assert.match(prompt, /User Objective: ask/);
  assert.match(prompt, /Ask Hint: Acceptance criteria 중심으로 정리해줘/);
  assert.match(prompt, /preq_update_task_note/);
  assert.match(prompt, /preq_update_task_status/);
  assert.match(prompt, /keep the workflow status unchanged/);
});
