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
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logFile}"\n`,
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
  assert.equal(
    (await fs.readFile(logFile, "utf8")).trim(),
    "plugins install @sonim1/preqstation-dispatcher --dangerously-force-unsafe-install",
  );
  assert.deepEqual(JSON.parse(stdout.join("")), {
    ok: true,
    target: "openclaw",
    action: "installed",
    package: "@sonim1/preqstation-dispatcher",
    restart_command: "openclaw gateway restart",
  });
});
