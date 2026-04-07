import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  normalizeBranchName,
  prepareWorktree,
} from "../src/worktree-runtime.mjs";

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

async function createRepo() {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "preqstation-openclaw-repo-"),
  );
  git(["init", "-b", "main"], tempDir);
  git(["config", "user.name", "Codex"], tempDir);
  git(["config", "user.email", "codex@example.com"], tempDir);
  await fs.writeFile(path.join(tempDir, "README.md"), "# repo\n");
  git(["add", "."], tempDir);
  git(["commit", "-m", "init"], tempDir);
  await fs.writeFile(path.join(tempDir, ".env.local"), "HELLO=world\n");
  return tempDir;
}

test("normalizes missing branch names to a project-scoped task branch", () => {
  assert.equal(
    normalizeBranchName({ projectKey: "PROJ", taskKey: "PROJ-327", branchName: null }),
    "preqstation/proj/task-proj-327",
  );
});

test("creates an auxiliary worktree and symlinks runtime env files", async () => {
  const repoDir = await createRepo();
  const worktreeRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "preqstation-openclaw-worktrees-"),
  );

  const prepared = await prepareWorktree({
    projectCwd: repoDir,
    projectKey: "PROJ",
    branchName: "task/proj-327/browser-notification-chuga",
    worktreeRoot,
  });

  assert.notEqual(prepared.cwd, repoDir);
  assert.equal(
    prepared.cwd,
    path.join(
      worktreeRoot,
      "PROJ",
      "task-proj-327-browser-notification-chuga",
    ),
  );

  const envStat = await fs.lstat(path.join(prepared.cwd, ".env.local"));
  assert.equal(envStat.isSymbolicLink(), true);
  assert.equal(
    await fs.readlink(path.join(prepared.cwd, ".env.local")),
    path.join(repoDir, ".env.local"),
  );
});

test("fails with a clear error when the mapped project path does not exist", async () => {
  const worktreeRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "preqstation-openclaw-worktrees-"),
  );

  await assert.rejects(
    prepareWorktree({
      projectCwd: "/tmp/preqstation-openclaw/does-not-exist",
      projectKey: "PROJ",
      branchName: "task/proj-328/edit-task-isyu",
      worktreeRoot,
    }),
    /Project path does not exist: \/tmp\/preqstation-openclaw\/does-not-exist/,
  );
});
