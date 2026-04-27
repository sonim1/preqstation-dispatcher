import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installRuntimeWorkerSupport } from "../src/runtime-skill-installer.mjs";

function createFetchVersion(version) {
  return async () => ({
    ok: true,
    async json() {
      return { version };
    },
  });
}

test("installRuntimeWorkerSupport reports Codex already_current when the installed skill matches the latest version", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-skill-codex-current-"));
  const skillDir = path.join(tempDir, "preqstation");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({ name: "preqstation-skill", version: "0.1.35" }),
    "utf8",
  );

  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["codex"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "npx" && args.join(" ") === "skills ls -g --json") {
        return {
          stdout: JSON.stringify([
            {
              name: "preqstation",
              path: skillDir,
              scope: "global",
              agents: ["Codex"],
            },
          ]),
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [{ command: "npx", args: ["skills", "ls", "-g", "--json"] }],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "codex",
      action: "already_current",
      installed_version: "0.1.35",
      latest_version: "0.1.35",
      skill_path: skillDir,
    },
  ]);
});

test("installRuntimeWorkerSupport updates Gemini when the skill is installed for the agent but outdated", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-skill-gemini-update-"));
  const skillDir = path.join(tempDir, "preqstation");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({ name: "preqstation-skill", version: "0.1.20" }),
    "utf8",
  );

  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["gemini-cli"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "npx" && args.join(" ") === "skills ls -g --json") {
        return {
          stdout: JSON.stringify([
            {
              name: "preqstation",
              path: skillDir,
              scope: "global",
              agents: ["Gemini CLI"],
            },
          ]),
          stderr: "",
        };
      }
      if (command === "npx" && args.join(" ") === "skills update preqstation -g -y") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      { command: "npx", args: ["skills", "ls", "-g", "--json"] },
      { command: "npx", args: ["skills", "update", "preqstation", "-g", "-y"] },
      { command: "npx", args: ["skills", "ls", "-g", "--json"] },
    ],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "gemini-cli",
      action: "updated",
      installed_version: "0.1.20",
      latest_version: "0.1.35",
      skill_path: skillDir,
    },
  ]);
});

test("installRuntimeWorkerSupport installs the Codex skill when it is missing for that agent", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-skill-codex-install-"));
  const skillDir = path.join(tempDir, "preqstation");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({ name: "preqstation-skill", version: "0.1.35" }),
    "utf8",
  );

  const calls = [];
  let listCallCount = 0;
  const results = await installRuntimeWorkerSupport({
    runtimes: ["codex"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "npx" && args.join(" ") === "skills ls -g --json") {
        listCallCount += 1;
        return {
          stdout: JSON.stringify([
            {
              name: "preqstation",
              path: skillDir,
              scope: "global",
              agents: listCallCount === 1 ? ["Claude Code"] : ["Claude Code", "Codex"],
            },
          ]),
          stderr: "",
        };
      }
      if (
        command === "npx" &&
        args.join(" ") === "skills add sonim1/preqstation-skill -g -a codex -y"
      ) {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      { command: "npx", args: ["skills", "ls", "-g", "--json"] },
      { command: "npx", args: ["skills", "add", "sonim1/preqstation-skill", "-g", "-a", "codex", "-y"] },
      { command: "npx", args: ["skills", "ls", "-g", "--json"] },
    ],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "codex",
      action: "installed",
      installed_version: "0.1.35",
      latest_version: "0.1.35",
      skill_path: skillDir,
    },
  ]);
});

test("installRuntimeWorkerSupport fails when Codex still is not enabled after install", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-skill-codex-install-fail-"));
  const skillDir = path.join(tempDir, "preqstation");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({ name: "preqstation-skill", version: "0.1.35" }),
    "utf8",
  );

  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["codex"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "npx" && args.join(" ") === "skills ls -g --json") {
        return {
          stdout: JSON.stringify([
            {
              name: "preqstation",
              path: skillDir,
              scope: "global",
              agents: ["Claude Code"],
            },
          ]),
          stderr: "",
        };
      }
      if (
        command === "npx" &&
        args.join(" ") === "skills add sonim1/preqstation-skill -g -a codex -y"
      ) {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      { command: "npx", args: ["skills", "ls", "-g", "--json"] },
      { command: "npx", args: ["skills", "add", "sonim1/preqstation-skill", "-g", "-a", "codex", "-y"] },
      { command: "npx", args: ["skills", "ls", "-g", "--json"] },
    ],
  );
  assert.deepEqual(results, [
    {
      ok: false,
      target: "codex",
      action: "failed",
      installed_version: "0.1.35",
      latest_version: "0.1.35",
      skill_path: skillDir,
      configured_agents: ["Claude Code"],
      error: "preqstation skill did not become enabled for Codex after install",
    },
  ]);
});

test("installRuntimeWorkerSupport reports Codex not_enabled during update-only runs when the skill exists for other agents", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preqstation-skill-codex-skip-"));
  const skillDir = path.join(tempDir, "preqstation");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({ name: "preqstation-skill", version: "0.1.35" }),
    "utf8",
  );

  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["codex"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    installMissing: false,
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "npx" && args.join(" ") === "skills ls -g --json") {
        return {
          stdout: JSON.stringify([
            {
              name: "preqstation",
              path: skillDir,
              scope: "global",
              agents: ["Claude Code"],
            },
          ]),
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [{ command: "npx", args: ["skills", "ls", "-g", "--json"] }],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "codex",
      action: "not_enabled",
      installed_version: "0.1.35",
      latest_version: "0.1.35",
      skill_path: skillDir,
      configured_agents: ["Claude Code"],
    },
  ]);
});

test("installRuntimeWorkerSupport installs the Claude plugin from the PREQ marketplace when missing", async () => {
  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["claude-code"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "claude" && args.join(" ") === "plugin list") {
        return { stdout: "Installed plugins:\n", stderr: "" };
      }
      if (command === "claude" && args.join(" ") === "plugin marketplace list") {
        return { stdout: "Configured marketplaces:\n", stderr: "" };
      }
      if (
        command === "claude" &&
        args.join(" ") === "plugin marketplace add https://github.com/sonim1/preqstation-skill"
      ) {
        return { stdout: "", stderr: "" };
      }
      if (command === "claude" && args.join(" ") === "plugin install preqstation@preqstation") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      { command: "claude", args: ["plugin", "list"] },
      { command: "claude", args: ["plugin", "marketplace", "list"] },
      {
        command: "claude",
        args: ["plugin", "marketplace", "add", "https://github.com/sonim1/preqstation-skill"],
      },
      { command: "claude", args: ["plugin", "install", "preqstation@preqstation"] },
    ],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "claude-code",
      action: "installed",
      installed_version: "0.1.35",
      latest_version: "0.1.35",
      marketplace_added: true,
    },
  ]);
});

test("installRuntimeWorkerSupport reports Claude not_installed during update-only runs", async () => {
  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["claude-code"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    installMissing: false,
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "claude" && args.join(" ") === "plugin list") {
        return { stdout: "Installed plugins:\n", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [{ command: "claude", args: ["plugin", "list"] }],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "claude-code",
      action: "not_installed",
      installed_version: null,
      latest_version: "0.1.35",
      marketplace_added: false,
    },
  ]);
});

test("installRuntimeWorkerSupport reports Claude already_current when the installed plugin matches the latest version", async () => {
  const calls = [];
  const results = await installRuntimeWorkerSupport({
    runtimes: ["claude-code"],
    env: { PATH: process.env.PATH },
    fetchFn: createFetchVersion("0.1.35"),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "claude" && args.join(" ") === "plugin list") {
        return {
          stdout: [
            "Installed plugins:",
            "",
            "  ❯ preqstation@preqstation",
            "    Version: 0.1.35",
            "    Scope: user",
            "    Status: ✔ enabled",
          ].join("\n"),
          stderr: "",
        };
      }
      if (command === "claude" && args.join(" ") === "plugin marketplace list") {
        return {
          stdout: [
            "Configured marketplaces:",
            "",
            "  ❯ preqstation",
            "    Source: Git (https://github.com/sonim1/preqstation-skill.git)",
          ].join("\n"),
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      { command: "claude", args: ["plugin", "list"] },
      { command: "claude", args: ["plugin", "marketplace", "list"] },
    ],
  );
  assert.deepEqual(results, [
    {
      ok: true,
      target: "claude-code",
      action: "already_current",
      installed_version: "0.1.35",
      latest_version: "0.1.35",
      marketplace_added: false,
    },
  ]);
});
