import { checkbox, input } from "@inquirer/prompts";

import { syncHermesSkill } from "./hermes-skill-installer.mjs";
import { installOpenClawPlugin } from "./openclaw-installer.mjs";
import {
  buildPreqstationMcpUrl,
  installRuntimeMcpServers,
  normalizePreqstationServerUrl,
} from "./runtime-mcp-installer.mjs";

const INSTALL_TARGET_CHOICES = [
  {
    name: "OpenClaw",
    value: "openclaw",
    description: "Install the OpenClaw plugin package",
  },
  {
    name: "Hermes Agent",
    value: "hermes",
    description: "Install the bundled Hermes preq_dispatch skill",
  },
];

const RUNTIME_CHOICES = [
  {
    name: "Claude Code",
    value: "claude-code",
    description: "Register the PREQ remote MCP endpoint in Claude Code",
  },
  {
    name: "Codex",
    value: "codex",
    description: "Register the PREQ remote MCP endpoint in Codex",
  },
  {
    name: "Gemini CLI",
    value: "gemini-cli",
    description: "Register the PREQ remote MCP endpoint in Gemini CLI",
  },
];

function createPromptContext({ inputStream, outputStream }) {
  return {
    input: inputStream,
    output: outputStream,
    clearPromptOnDone: false,
  };
}

function writeProgress(outputStream, message) {
  outputStream.write(`${message}\n`);
}

function describeTarget(target) {
  if (target === "openclaw") {
    return "OpenClaw";
  }
  if (target === "hermes") {
    return "Hermes Agent";
  }
  return target;
}

function describeRuntime(runtime) {
  if (runtime === "claude-code") {
    return "Claude Code MCP";
  }
  if (runtime === "codex") {
    return "Codex MCP";
  }
  if (runtime === "gemini-cli") {
    return "Gemini CLI MCP";
  }
  return runtime;
}

export async function promptInstallPlan({
  inputStream = process.stdin,
  outputStream = process.stdout,
  checkboxPrompt = checkbox,
  inputPrompt = input,
} = {}) {
  const context = createPromptContext({ inputStream, outputStream });
  const installTargets = await checkboxPrompt(
    {
      message: "Choose dispatcher hosts to install",
      choices: INSTALL_TARGET_CHOICES,
    },
    context,
  );

  const runtimeEngines = await checkboxPrompt(
    {
      message: "Choose worker runtimes for PREQ MCP setup",
      choices: RUNTIME_CHOICES,
    },
    context,
  );

  if (installTargets.length === 0 && runtimeEngines.length === 0) {
    throw new Error("Select at least one dispatcher host or worker runtime.");
  }

  let preqstationServerUrl = null;
  if (runtimeEngines.length > 0) {
    preqstationServerUrl = normalizePreqstationServerUrl(
      await inputPrompt(
        {
          message: "PREQSTATION server URL",
          default: "https://your-preqstation-domain.vercel.app",
        },
        context,
      ),
    );
  }

  return {
    installTargets,
    runtimeEngines,
    preqstationServerUrl,
    mcpUrl: preqstationServerUrl
      ? buildPreqstationMcpUrl(preqstationServerUrl)
      : null,
  };
}

export async function runInstallWizard({
  inputStream = process.stdin,
  outputStream = process.stdout,
  env = process.env,
  force = false,
  promptInstallPlanFn = promptInstallPlan,
  syncHermesSkillFn = syncHermesSkill,
  installOpenClawPluginFn = installOpenClawPlugin,
  installRuntimeMcpServersFn = installRuntimeMcpServers,
} = {}) {
  const plan = await promptInstallPlanFn({
    inputStream,
    outputStream,
  });
  const results = [];

  if (plan.runtimeEngines.length > 0) {
    writeProgress(outputStream, `Using PREQ MCP endpoint: ${plan.mcpUrl}`);
  }

  for (const target of plan.installTargets) {
    writeProgress(outputStream, `Installing ${describeTarget(target)}...`);
    if (target === "hermes") {
      const result = await syncHermesSkillFn({
        env,
        force,
      });
      results.push(result);
      writeProgress(
        outputStream,
        `✔ ${describeTarget(target)} ${result.action === "updated" ? "updated" : "installed"}.`,
      );
      continue;
    }

    if (target === "openclaw") {
      const result = await installOpenClawPluginFn({ env });
      results.push(result);
      writeProgress(
        outputStream,
        `✔ ${describeTarget(target)} ${result.action === "updated" ? "updated" : "installed"}.`,
      );
      continue;
    }

    throw new Error(`Unsupported install target: ${target}`);
  }

  if (plan.runtimeEngines.length > 0) {
    for (const runtime of plan.runtimeEngines) {
      writeProgress(outputStream, `Registering ${describeRuntime(runtime)}...`);
      const runtimeResults = await installRuntimeMcpServersFn({
        env,
        runtimes: [runtime],
        serverUrl: plan.preqstationServerUrl,
      });
      results.push(...runtimeResults);
      writeProgress(outputStream, `✔ ${describeRuntime(runtime)} registered.`);
    }
  }

  return {
    ok: true,
    action: "installed",
    interactive: true,
    install_targets: plan.installTargets,
    runtime_engines: plan.runtimeEngines,
    preqstation_server_url: plan.preqstationServerUrl,
    mcp_url: plan.mcpUrl,
    results,
  };
}
