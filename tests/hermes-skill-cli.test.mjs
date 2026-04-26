import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runDispatcherCli } from "../src/cli/preqstation-dispatcher.mjs";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

test("install hermes copies the bundled PREQ dispatch skill with provenance", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-hermes-install-"));
  const hermesHome = path.join(tempDir, ".hermes");
  const stdout = [];

  const exitCode = await runDispatcherCli({
    argv: ["install", "hermes"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env: { HERMES_HOME: hermesHome },
    dispatchPreqRun: async () => {
      throw new Error("install must not dispatch");
    },
  });

  const skillFile = path.join(
    hermesHome,
    "skills",
    "preqstation",
    "preq_dispatch",
    "SKILL.md",
  );
  const metadataFile = path.join(
    hermesHome,
    "skills",
    "preqstation",
    "preq_dispatch",
    ".preqstation-dispatcher.json",
  );

  assert.equal(exitCode, 0);
  assert.match(await fs.readFile(skillFile, "utf8"), /name: preq_dispatch/);
  assert.match(await fs.readFile(skillFile, "utf8"), /preqstation-dispatcher run/);

  const metadata = await readJson(metadataFile);
  assert.equal(metadata.package, "@sonim1/preqstation-dispatcher");
  assert.equal(metadata.source, "bundled");
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/u);

  const result = JSON.parse(stdout.join(""));
  assert.equal(result.ok, true);
  assert.equal(result.target, "hermes");
  assert.equal(result.action, "installed");
  assert.equal(result.skill_file, skillFile);
  assert.equal(result.metadata_file, metadataFile);
});

test("install runs the interactive wizard when no target is provided", async () => {
  const stdout = [];
  let called = false;

  const exitCode = await runDispatcherCli({
    argv: ["install"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    runInstallWizard: async () => {
      called = true;
      return {
        ok: true,
        action: "installed",
        interactive: true,
        install_targets: ["hermes"],
        runtime_engines: ["codex"],
        preqstation_server_url: "https://preq.example.com",
        mcp_url: "https://preq.example.com/mcp",
        results: [
          { ok: true, target: "hermes", action: "installed" },
          { ok: true, target: "codex", action: "mcp_installed" },
        ],
      };
    },
    dispatchPreqRun: async () => {
      throw new Error("install must not dispatch");
    },
  });

  const result = JSON.parse(stdout.join(""));

  assert.equal(exitCode, 0);
  assert.equal(called, true);
  assert.deepEqual(result.install_targets, ["hermes"]);
  assert.deepEqual(result.runtime_engines, ["codex"]);
  assert.equal(result.mcp_url, "https://preq.example.com/mcp");
});

test("install renders a friendly summary for interactive tty output", async () => {
  const stdout = [];

  const exitCode = await runDispatcherCli({
    argv: ["install"],
    stdout: { write: (value) => stdout.push(value), isTTY: true },
    stderr: { write: () => {} },
    runInstallWizard: async () => ({
      ok: true,
      action: "installed",
      interactive: true,
      install_targets: ["openclaw", "hermes"],
      runtime_engines: ["claude-code", "codex"],
      preqstation_server_url: "https://preq.example.com",
      mcp_url: "https://preq.example.com/mcp",
      results: [
        {
          ok: true,
          target: "openclaw",
          action: "updated",
          installed_version: "0.1.19",
          package_version: "0.1.20",
          restart_command: "openclaw gateway restart",
        },
        { ok: true, target: "hermes", action: "already_current", version: "0.1.20" },
        { ok: true, target: "claude-code", action: "already_current", installed_version: "0.1.37" },
        { ok: true, target: "claude-code", action: "mcp_already_configured" },
        { ok: true, target: "codex", action: "installed", latest_version: "0.1.37" },
      ],
    }),
    dispatchPreqRun: async () => {
      throw new Error("install must not dispatch");
    },
  });

  const rendered = stdout.join("");

  assert.equal(exitCode, 0);
  assert.match(rendered, /Install summary/);
  assert.match(rendered, /Dispatcher hosts: OpenClaw, Hermes Agent/);
  assert.match(rendered, /Worker runtimes: Claude Code, Codex/);
  assert.match(rendered, /PREQ MCP endpoint: https:\/\/preq\.example\.com\/mcp/);
  assert.match(rendered, /OpenClaw: updated \(0\.1\.19 -> 0\.1\.20, restart: openclaw gateway restart\)/);
  assert.match(rendered, /Hermes Agent: already current \(0\.1\.20\)/);
  assert.match(rendered, /Claude Code support: already current \(0\.1\.37\)/);
  assert.match(rendered, /Claude Code MCP: already configured/);
  assert.match(rendered, /Codex support: installed \(0\.1\.37\)/);
  assert.doesNotMatch(rendered, /^\{/m);
});

test("sync hermes refuses user-modified skills unless forced", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-hermes-sync-"));
  const hermesHome = path.join(tempDir, ".hermes");
  const env = { HERMES_HOME: hermesHome };
  const noopDispatch = async () => {
    throw new Error("skill install must not dispatch");
  };

  assert.equal(
    await runDispatcherCli({
      argv: ["install", "hermes"],
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      env,
      dispatchPreqRun: noopDispatch,
    }),
    0,
  );

  const skillFile = path.join(
    hermesHome,
    "skills",
    "preqstation",
    "preq_dispatch",
    "SKILL.md",
  );
  await fs.appendFile(skillFile, "\n# local note\n", "utf8");

  const stderr = [];
  const rejectedExitCode = await runDispatcherCli({
    argv: ["sync", "hermes"],
    stdout: { write: () => {} },
    stderr: { write: (value) => stderr.push(value) },
    env,
    dispatchPreqRun: noopDispatch,
  });

  assert.equal(rejectedExitCode, 1);
  assert.match(stderr.join(""), /Hermes skill has local changes/);

  const stdout = [];
  const forcedExitCode = await runDispatcherCli({
    argv: ["sync", "hermes", "--force"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env,
    dispatchPreqRun: noopDispatch,
  });

  const result = JSON.parse(stdout.join(""));
  assert.equal(forcedExitCode, 0);
  assert.equal(result.action, "updated");
  assert.match(result.backup_file, /SKILL\.md\.bak-/u);
  assert.match(await fs.readFile(skillFile, "utf8"), /name: preq_dispatch/);
  assert.doesNotMatch(await fs.readFile(skillFile, "utf8"), /# local note/);
});

test("status hermes reports whether the installed skill is current", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-hermes-status-"));
  const hermesHome = path.join(tempDir, ".hermes");
  const env = { HERMES_HOME: hermesHome };
  const stdout = [];

  const exitCode = await runDispatcherCli({
    argv: ["status", "hermes"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env,
    dispatchPreqRun: async () => {
      throw new Error("status must not dispatch");
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(stdout.join("")), {
    ok: true,
    target: "hermes",
    installed: false,
    current: false,
    user_modified: false,
    skill_file: path.join(
      hermesHome,
      "skills",
      "preqstation",
      "preq_dispatch",
      "SKILL.md",
    ),
    metadata_file: path.join(
      hermesHome,
      "skills",
      "preqstation",
      "preq_dispatch",
      ".preqstation-dispatcher.json",
    ),
  });
});
