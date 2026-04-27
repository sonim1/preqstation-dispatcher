import test from "node:test";
import assert from "node:assert/strict";

import {
  promptInstallPlan,
  runInstallWizard,
} from "../src/install-wizard.mjs";

test("promptInstallPlan collects host and runtime selections before requesting the PREQ URL", async () => {
  const checkboxCalls = [];
  const inputCalls = [];

  const plan = await promptInstallPlan({
    inputStream: { isTTY: true },
    outputStream: { write: () => {}, isTTY: true },
    env: { FORCE_COLOR: "1" },
    checkboxPrompt: async (config, context) => {
      checkboxCalls.push({ config, context });
      if (checkboxCalls.length === 1) {
        return ["openclaw", "hermes"];
      }
      return ["claude-code", "codex"];
    },
    inputPrompt: async (config, context) => {
      inputCalls.push({ config, context });
      return "https://preq.example.com/";
    },
    resolveDefaultPreqstationServerUrlFn: async () => "https://saved-preq.example.com",
  });

  assert.deepEqual(plan, {
    installTargets: ["openclaw", "hermes"],
    runtimeEngines: ["claude-code", "codex"],
    preqstationServerUrl: "https://preq.example.com",
    mcpUrl: "https://preq.example.com/mcp",
  });
  assert.match(checkboxCalls[0].config.message, /dispatcher hosts/i);
  assert.match(checkboxCalls[0].config.message, /enter toggles items; Submit continues/i);
  assert.match(checkboxCalls[1].config.message, /worker runtimes to set up/i);
  assert.match(checkboxCalls[1].config.message, /enter toggles items; Submit continues/i);
  assert.match(checkboxCalls[0].config.theme.style.keysHelpTip(), /\u001B\[33m\[up\/down\]/);
  assert.match(checkboxCalls[0].config.theme.style.keysHelpTip(), /\u001B\[36m\[space\]/);
  assert.match(checkboxCalls[0].config.theme.style.keysHelpTip(), /\u001B\[32m\[enter\]/);
  assert.equal(
    checkboxCalls[0].config.validate([]),
    "Select at least one dispatcher host before continuing.",
  );
  assert.equal(
    checkboxCalls[1].config.validate([]),
    "Select at least one worker runtime before continuing.",
  );
  assert.equal(checkboxCalls[0].config.validate(["openclaw"]), true);
  assert.equal(checkboxCalls[1].config.validate(["codex"]), true);
  assert.match(inputCalls[0].config.message, /PREQSTATION server URL/i);
  assert.equal(inputCalls[0].config.default, "https://saved-preq.example.com");
  assert.equal(typeof checkboxCalls[0].context.output.write, "function");
});

test("promptInstallPlan leaves help text uncolored when stdout is not a TTY", async () => {
  const checkboxCalls = [];

  await promptInstallPlan({
    outputStream: { write: () => {} },
    checkboxPrompt: async (config) => {
      checkboxCalls.push(config);
      return checkboxCalls.length === 1 ? ["openclaw"] : ["codex"];
    },
    inputPrompt: async () => "https://preq.example.com",
  });

  assert.equal(
    checkboxCalls[0].theme.style.keysHelpTip(),
    "Controls:  [up/down] move  [space] toggle  [enter] toggle / submit",
  );
});

test("promptInstallPlan falls back to the placeholder URL when no prior PREQ server URL is known", async () => {
  const inputCalls = [];

  await promptInstallPlan({
    outputStream: { write: () => {}, isTTY: true },
    checkboxPrompt: async (_config, _context) => ["codex"],
    inputPrompt: async (config) => {
      inputCalls.push(config);
      return "https://preq.example.com";
    },
    resolveDefaultPreqstationServerUrlFn: async () => null,
  });

  assert.equal(
    inputCalls[0].default,
    "https://your-preqstation-domain.vercel.app",
  );
});

test("runInstallWizard executes selected host installs and runtime MCP setup", async () => {
  const calls = [];
  const output = [];

  const result = await runInstallWizard({
    env: { PATH: process.env.PATH },
    force: true,
    outputStream: { write: (value) => output.push(value) },
    promptInstallPlanFn: async () => ({
      installTargets: ["openclaw", "hermes"],
      runtimeEngines: ["codex", "gemini-cli"],
      preqstationServerUrl: "https://preq.example.com",
      mcpUrl: "https://preq.example.com/mcp",
    }),
    installOpenClawPluginFn: async ({ env }) => {
      calls.push(["openclaw", env]);
      return { ok: true, target: "openclaw", action: "installed" };
    },
    syncHermesSkillFn: async ({ env, force }) => {
      calls.push(["hermes", env, force]);
      return { ok: true, target: "hermes", action: "installed" };
    },
    installRuntimeWorkerSupportFn: async ({ env, runtimes }) => {
      calls.push(["support", env, runtimes]);
      return runtimes.map((runtime) => ({
        ok: true,
        target: runtime,
        action: "installed",
      }));
    },
    installRuntimeMcpServersFn: async ({ env, runtimes, serverUrl }) => {
      calls.push(["mcp", env, runtimes, serverUrl]);
      return runtimes.map((runtime) => ({
        ok: true,
        target: runtime,
        action: "mcp_installed",
      }));
    },
  });

  assert.deepEqual(calls, [
    ["openclaw", { PATH: process.env.PATH }],
    ["hermes", { PATH: process.env.PATH }, true],
    ["support", { PATH: process.env.PATH }, ["codex"]],
    ["mcp", { PATH: process.env.PATH }, ["codex"], "https://preq.example.com"],
    ["support", { PATH: process.env.PATH }, ["gemini-cli"]],
    ["mcp", { PATH: process.env.PATH }, ["gemini-cli"], "https://preq.example.com"],
  ]);
  assert.deepEqual(result.install_targets, ["openclaw", "hermes"]);
  assert.deepEqual(result.runtime_engines, ["codex", "gemini-cli"]);
  assert.equal(result.mcp_url, "https://preq.example.com/mcp");
  assert.equal(result.results.length, 6);
  assert.match(output.join(""), /PREQ MCP endpoint/);
  assert.match(output.join(""), /https:\/\/preq\.example\.com\/mcp/);
  assert.match(output.join(""), /Dispatcher hosts/);
  assert.match(output.join(""), /OpenClaw\s+installed/);
  assert.match(output.join(""), /Hermes Agent\s+installed/);
  assert.match(output.join(""), /Worker runtimes/);
  assert.match(output.join(""), /Codex skill\s+installed/);
  assert.match(output.join(""), /Codex MCP\s+registered/);
  assert.match(output.join(""), /Gemini CLI skill\s+installed/);
  assert.match(output.join(""), /Gemini CLI MCP\s+registered/);
});

test("runInstallWizard reports when an MCP runtime is already configured", async () => {
  const output = [];

  await runInstallWizard({
    env: { PATH: process.env.PATH },
    outputStream: { write: (value) => output.push(value) },
    promptInstallPlanFn: async () => ({
      installTargets: [],
      runtimeEngines: ["claude-code"],
      preqstationServerUrl: "https://preq.example.com",
      mcpUrl: "https://preq.example.com/mcp",
    }),
    installRuntimeWorkerSupportFn: async () => [
      {
        ok: true,
        target: "claude-code",
        action: "already_current",
      },
    ],
    installRuntimeMcpServersFn: async () => [
      {
        ok: true,
        target: "claude-code",
        action: "mcp_already_configured",
      },
    ],
  });

  assert.match(output.join(""), /Claude Code plugin\s+current/);
  assert.match(output.join(""), /Claude Code MCP\s+current/);
});

test("runInstallWizard reports already current host installs without pretending they were reinstalled", async () => {
  const output = [];

  await runInstallWizard({
    env: { PATH: process.env.PATH },
    outputStream: { write: (value) => output.push(value) },
    promptInstallPlanFn: async () => ({
      installTargets: ["openclaw", "hermes"],
      runtimeEngines: [],
      preqstationServerUrl: null,
      mcpUrl: null,
    }),
    installOpenClawPluginFn: async () => ({
      ok: true,
      target: "openclaw",
      action: "already_current",
    }),
    syncHermesSkillFn: async () => ({
      ok: true,
      target: "hermes",
      action: "already_current",
    }),
  });

  assert.match(output.join(""), /OpenClaw\s+current/);
  assert.match(output.join(""), /Hermes Agent\s+current/);
});

test("runInstallWizard reports failure when runtime support post-check does not stick", async () => {
  const output = [];

  const result = await runInstallWizard({
    env: { PATH: process.env.PATH },
    outputStream: { write: (value) => output.push(value) },
    promptInstallPlanFn: async () => ({
      installTargets: [],
      runtimeEngines: ["codex"],
      preqstationServerUrl: "https://preq.example.com",
      mcpUrl: "https://preq.example.com/mcp",
    }),
    installRuntimeWorkerSupportFn: async () => [
      {
        ok: false,
        target: "codex",
        action: "failed",
        error: "preqstation skill did not become enabled for Codex after install",
      },
    ],
    installRuntimeMcpServersFn: async () => [
      {
        ok: true,
        target: "codex",
        action: "mcp_already_configured",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(output.join(""), /Codex skill\s+failed/);
});
