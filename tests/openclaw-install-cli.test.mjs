import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runDispatcherCli } from "../src/cli/preqstation-dispatcher.mjs";

test("install openclaw runs the OpenClaw plugin install command", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-openclaw-install-"));
  const binDir = path.join(tempDir, "bin");
  const logFile = path.join(tempDir, "openclaw-args.log");
  await fs.mkdir(binDir, { recursive: true });
  const openclawBin = path.join(binDir, "openclaw");
  await fs.writeFile(
    openclawBin,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${logFile}"`,
      'if [ "$1 $2 $3" = "plugins inspect preqstation-dispatcher" ]; then',
      '  echo "No plugin found with id preqstation-dispatcher" >&2',
      "  exit 1",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.chmod(openclawBin, 0o755);

  const stdout = [];
  const exitCode = await runDispatcherCli({
    argv: ["install", "openclaw"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    dispatchPreqRun: async () => {
      throw new Error("install must not dispatch");
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    (await fs.readFile(logFile, "utf8")).trim().split("\n"),
    [
      "plugins inspect preqstation-dispatcher",
      "plugins install @sonim1/preqstation-dispatcher --dangerously-force-unsafe-install",
    ],
  );
  assert.deepEqual(JSON.parse(stdout.join("")), {
    ok: true,
    target: "openclaw",
    action: "installed",
    package: "@sonim1/preqstation-dispatcher",
    plugin_id: "preqstation-dispatcher",
    restart_command: "openclaw gateway restart",
    package_version: "0.1.16",
  });
});

test("install openclaw updates the plugin when it already exists", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-openclaw-update-"));
  const binDir = path.join(tempDir, "bin");
  const logFile = path.join(tempDir, "openclaw-args.log");
  await fs.mkdir(binDir, { recursive: true });
  const openclawBin = path.join(binDir, "openclaw");
  await fs.writeFile(
    openclawBin,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${logFile}"`,
      'if [ "$1 $2 $3" = "plugins inspect preqstation-dispatcher" ]; then',
      '  cat <<\'EOF\'',
      "PREQSTATION OpenClaw Dispatch",
      "id: preqstation-dispatcher",
      "Version: 0.1.15",
      "Recorded version: 0.1.15",
      "EOF",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.chmod(openclawBin, 0o755);

  const stdout = [];
  const exitCode = await runDispatcherCli({
    argv: ["install", "openclaw"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    dispatchPreqRun: async () => {
      throw new Error("install must not dispatch");
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    (await fs.readFile(logFile, "utf8")).trim().split("\n"),
    [
      "plugins inspect preqstation-dispatcher",
      "plugins update preqstation-dispatcher",
    ],
  );
  assert.deepEqual(JSON.parse(stdout.join("")), {
    ok: true,
    target: "openclaw",
    action: "updated",
    package: "@sonim1/preqstation-dispatcher",
    plugin_id: "preqstation-dispatcher",
    restart_command: "openclaw gateway restart",
    installed_version: "0.1.15",
    package_version: "0.1.16",
  });
});

test("install openclaw reports already_current when the installed plugin version matches the package", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-openclaw-current-"));
  const binDir = path.join(tempDir, "bin");
  const logFile = path.join(tempDir, "openclaw-args.log");
  await fs.mkdir(binDir, { recursive: true });
  const openclawBin = path.join(binDir, "openclaw");
  await fs.writeFile(
    openclawBin,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${logFile}"`,
      'if [ "$1 $2 $3" = "plugins inspect preqstation-dispatcher" ]; then',
      '  cat <<\'EOF\'',
      "PREQSTATION OpenClaw Dispatch",
      "id: preqstation-dispatcher",
      "Version: 0.1.16",
      "Recorded version: 0.1.16",
      "EOF",
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.chmod(openclawBin, 0o755);

  const stdout = [];
  const exitCode = await runDispatcherCli({
    argv: ["install", "openclaw"],
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: () => {} },
    env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    dispatchPreqRun: async () => {
      throw new Error("install must not dispatch");
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    (await fs.readFile(logFile, "utf8")).trim().split("\n"),
    ["plugins inspect preqstation-dispatcher"],
  );
  assert.deepEqual(JSON.parse(stdout.join("")), {
    ok: true,
    target: "openclaw",
    action: "already_current",
    package: "@sonim1/preqstation-dispatcher",
    plugin_id: "preqstation-dispatcher",
    restart_command: "openclaw gateway restart",
    installed_version: "0.1.16",
    package_version: "0.1.16",
  });
});
