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
  assert.match(prompt, /prototype-style asks may generate local artifacts/i);
  assert.match(prompt, /authenticated artifact provider/i);
  assert.match(prompt, /private-or-skip/i);
  assert.match(prompt, /HTML prototype|HTML mockup/i);
  assert.match(prompt, /screenshot/i);
  assert.match(prompt, /Artifacts:/i);
  assert.match(prompt, /7-day expiring reviewer links/i);
  assert.match(prompt, /access=quickshare/i);
  assert.match(prompt, /expires=\.\.\./i);
  assert.match(prompt, /non-expiring anyone-with-the-link URLs/i);
});

test("renders insight-specific task generation guidance", () => {
  const prompt = renderPrompt({
    taskKey: null,
    projectKey: "PROJ",
    branchName: "preqstation/proj",
    objective: "insight",
    engine: "codex",
    cwd: "/tmp/worktree/proj/preqstation-proj",
    projectCwd: "/tmp/project",
    insightPromptB64:
      "Q29ubmVjdGlvbnMg7Y6Y7J207KeAIOqwnO2OuCDsnpHsl4XsnYQg64KY64ig7KSYCuuqqOuwlOydvCDtnZDrpoTrj4Qg6rCZ7J20IOu0kOykmA==",
  });

  assert.match(prompt, /Task ID: N\/A/);
  assert.match(prompt, /User Objective: insight/);
  assert.match(prompt, /Insight Prompt: Connections 페이지 개편 작업을 나눠줘/);
  assert.match(prompt, /Task ID may be absent for project-level objectives/);
  assert.match(prompt, /preq_list_tasks\(projectKey=\.\.\., detail=full\)/);
  assert.match(prompt, /preq_create_task/);
});

test("renders qa run metadata for project-level qa dispatches", () => {
  const prompt = renderPrompt({
    taskKey: null,
    projectKey: "PROJ",
    branchName: "main",
    objective: "qa",
    engine: "claude-code",
    cwd: "/tmp/worktree/proj/main",
    projectCwd: "/tmp/project",
    qaRunId: "run-123",
    qaTaskKeys: ["PROJ-1", "PROJ-2"],
  });

  assert.match(prompt, /User Objective: qa/);
  assert.match(prompt, /QA Run ID: run-123/);
  assert.match(prompt, /QA Task Keys: PROJ-1, PROJ-2/);
  assert.match(prompt, /Task ID may be absent for project-level objectives/);
  assert.match(prompt, /use QA Run ID and QA Task Keys from this prompt/i);
});
