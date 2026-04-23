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
    outputStream: { write: () => {} },
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
  });

  assert.deepEqual(plan, {
    installTargets: ["openclaw", "hermes"],
    runtimeEngines: ["claude-code", "codex"],
    preqstationServerUrl: "https://preq.example.com",
    mcpUrl: "https://preq.example.com/mcp",
  });
  assert.match(checkboxCalls[0].config.message, /dispatcher hosts/i);
  assert.match(checkboxCalls[1].config.message, /worker runtimes/i);
  assert.match(inputCalls[0].config.message, /PREQSTATION server URL/i);
  assert.equal(typeof checkboxCalls[0].context.output.write, "function");
});

test("promptInstallPlan skips the PREQ URL when no runtimes are selected", async () => {
  let inputPromptCalled = false;

  const plan = await promptInstallPlan({
    checkboxPrompt: async (config) => {
      if (/dispatcher hosts/i.test(config.message)) {
        return ["hermes"];
      }
      return [];
    },
    inputPrompt: async () => {
      inputPromptCalled = true;
      return "https://preq.example.com";
    },
  });

  assert.deepEqual(plan, {
    installTargets: ["hermes"],
    runtimeEngines: [],
    preqstationServerUrl: null,
    mcpUrl: null,
  });
  assert.equal(inputPromptCalled, false);
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
    ["mcp", { PATH: process.env.PATH }, ["codex"], "https://preq.example.com"],
    ["mcp", { PATH: process.env.PATH }, ["gemini-cli"], "https://preq.example.com"],
  ]);
  assert.deepEqual(result.install_targets, ["openclaw", "hermes"]);
  assert.deepEqual(result.runtime_engines, ["codex", "gemini-cli"]);
  assert.equal(result.mcp_url, "https://preq.example.com/mcp");
  assert.equal(result.results.length, 4);
  assert.match(output.join(""), /Using PREQ MCP endpoint: https:\/\/preq\.example\.com\/mcp/);
  assert.match(output.join(""), /Installing OpenClaw/);
  assert.match(output.join(""), /Installing Hermes Agent/);
  assert.match(output.join(""), /Registering Codex MCP/);
  assert.match(output.join(""), /Registering Gemini CLI MCP/);
});
