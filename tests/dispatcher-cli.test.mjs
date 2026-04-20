import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runDispatcherCli } from "../src/cli/preqstation-dispatcher.mjs";

test("run-json dispatches a Hermes payload through the shared runtime", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-dispatcher-cli-"));
  const payloadPath = path.join(tempDir, "payload.json");
  await fs.writeFile(
    payloadPath,
    JSON.stringify({
      event_type: "preq.dispatch.requested",
      dispatch: {
        objective: "implement",
        project_key: "PROJ",
        task_key: "PROJ-123",
        engine: "codex",
      },
    }),
  );

  const stdout = [];
  const calls = [];
  const exitCode = await runDispatcherCli({
    argv: ["run-json", "--payload", payloadPath],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env: {
      PREQSTATION_PROJECTS_FILE: path.join(tempDir, "projects.json"),
      PREQSTATION_WORKTREE_ROOT: path.join(tempDir, "worktrees"),
    },
    dispatchPreqRun: async (params) => {
      calls.push(params);
      return {
        prepared: { cwd: "/tmp/worktree", branchName: "preqstation/proj/task-proj-123" },
        launch: { pid: 4242, pidFile: "/tmp/worktree/pid", logFile: "/tmp/worktree/log" },
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parsed.taskKey, "PROJ-123");
  assert.equal(calls[0].parsed.engine, "codex");
  assert.equal(calls[0].sharedMappingPath, path.join(tempDir, "projects.json"));
  assert.equal(calls[0].worktreeRoot, path.join(tempDir, "worktrees"));
  assert.deepEqual(JSON.parse(stdout.join("")), {
    ok: true,
    project_key: "PROJ",
    task_key: "PROJ-123",
    engine: "codex",
    cwd: "/tmp/worktree",
    branch_name: "preqstation/proj/task-proj-123",
    pid: 4242,
    log_file: "/tmp/worktree/log",
    pid_file: "/tmp/worktree/pid",
  });
});

test("setup set writes a public shared mapping file without platform-specific config", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-dispatcher-setup-"));
  const mappingPath = path.join(tempDir, "projects.json");
  const projectPath = path.join(tempDir, "project");
  await fs.mkdir(projectPath);

  const exitCode = await runDispatcherCli({
    argv: ["setup", "set", "proj", projectPath],
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    env: { PREQSTATION_PROJECTS_FILE: mappingPath },
    dispatchPreqRun: async () => {
      throw new Error("setup must not dispatch");
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(mappingPath, "utf8")), {
    projects: {
      PROJ: projectPath,
    },
  });
});

test("run rejects missing task keys for task objectives before dispatching", async () => {
  const stderr = [];
  const exitCode = await runDispatcherCli({
    argv: ["run", "--project-key", "PROJ", "--objective", "implement", "--engine", "codex"],
    stdout: { write: () => {} },
    stderr: { write: (value) => stderr.push(value) },
    dispatchPreqRun: async () => {
      throw new Error("should not dispatch");
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /Task key is required for implement dispatch/);
});
