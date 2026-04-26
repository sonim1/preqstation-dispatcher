import { input } from "@inquirer/prompts";

import { syncHermesSkill } from "./hermes-skill-installer.mjs";
import { installOpenClawPlugin } from "./openclaw-installer.mjs";
import multiSelectSubmitPrompt from "./prompts/multi-select-submit-prompt.mjs";
import { installRuntimeWorkerSupport } from "./runtime-skill-installer.mjs";
import {
  buildPreqstationMcpUrl,
  installRuntimeMcpServers,
  normalizePreqstationServerUrl,
  resolveDefaultPreqstationServerUrl,
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
    description: "Install the PREQ Claude plugin and register the remote MCP endpoint",
  },
  {
    name: "Codex",
    value: "codex",
    description: "Install the PREQ worker skill and register the remote MCP endpoint",
  },
  {
    name: "Gemini CLI",
    value: "gemini-cli",
    description: "Install the PREQ worker skill and register the remote MCP endpoint",
  },
];

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
};

function supportsColor({ outputStream, env = process.env }) {
  if (!outputStream?.isTTY) {
    return false;
  }
  if (env.NO_COLOR) {
    return false;
  }
  if (env.FORCE_COLOR === "0") {
    return false;
  }
  return true;
}

function paint(text, styles, enabled) {
  if (!enabled) {
    return text;
  }
  return `${styles.join("")}${text}${ANSI.reset}`;
}

function createCheckboxTheme({ outputStream, env = process.env }) {
  const color = supportsColor({ outputStream, env });
  const key = (text, tone) => paint(`[${text}]`, [ANSI.bold, tone], color);
  const label = (text) => paint(text, [ANSI.dim], color);

  return {
    style: {
      keysHelpTip() {
        return [
          label("Controls:"),
          `${key("up/down", ANSI.yellow)} move`,
          `${key("space", ANSI.cyan)} toggle`,
          `${key("enter", ANSI.green)} toggle / submit`,
        ].join("  ");
      },
    },
  };
}

function requireSelection(label) {
  return (selectedValues) =>
    selectedValues.length > 0 ? true : `Select at least one ${label} before continuing.`;
}

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

function padCell(value, width) {
  return String(value || "").padEnd(width, " ");
}

function writeSection(outputStream, title) {
  writeProgress(outputStream, title);
}

function writeIndentedLine(outputStream, value) {
  writeProgress(outputStream, `  ${value}`);
}

function writeStatusRow(outputStream, label, status) {
  writeProgress(outputStream, `  ${padCell(label, 20)} ${status}`);
}

function describeInstallAction(action) {
  if (action === "updated") {
    return "updated";
  }
  if (action === "already_current") {
    return "current";
  }
  return "installed";
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
    return "Claude Code";
  }
  if (runtime === "codex") {
    return "Codex";
  }
  if (runtime === "gemini-cli") {
    return "Gemini CLI";
  }
  return runtime;
}

function describeRuntimeSupportAction(action, runtime) {
  if (runtime === "claude-code") {
    if (action === "already_current") {
      return "current";
    }
    if (action === "updated") {
      return "updated";
    }
    return "installed";
  }

  if (action === "already_current") {
    return "current";
  }
  if (action === "updated") {
    return "updated";
  }
  return "installed";
}

export async function promptInstallPlan({
  inputStream = process.stdin,
  outputStream = process.stdout,
  env = process.env,
  checkboxPrompt = multiSelectSubmitPrompt,
  inputPrompt = input,
  resolveDefaultPreqstationServerUrlFn = resolveDefaultPreqstationServerUrl,
} = {}) {
  const context = createPromptContext({ inputStream, outputStream });
  const checkboxTheme = createCheckboxTheme({ outputStream, env });
  const installTargets = await checkboxPrompt(
    {
      message: "Choose dispatcher hosts to install (enter toggles items; Submit continues)",
      choices: INSTALL_TARGET_CHOICES,
      validate: requireSelection("dispatcher host"),
      theme: checkboxTheme,
    },
    context,
  );

  const runtimeEngines = await checkboxPrompt(
    {
      message: "Choose worker runtimes to set up (enter toggles items; Submit continues)",
      choices: RUNTIME_CHOICES,
      validate: requireSelection("worker runtime"),
      theme: checkboxTheme,
    },
    context,
  );

  let preqstationServerUrl = null;
  if (runtimeEngines.length > 0) {
    const defaultPreqstationServerUrl =
      (await resolveDefaultPreqstationServerUrlFn({
        runtimes: runtimeEngines,
        env,
      })) || "https://your-preqstation-domain.vercel.app";
    preqstationServerUrl = normalizePreqstationServerUrl(
      await inputPrompt(
        {
          message: "PREQSTATION server URL",
          default: defaultPreqstationServerUrl,
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
  installRuntimeWorkerSupportFn = installRuntimeWorkerSupport,
  installRuntimeMcpServersFn = installRuntimeMcpServers,
} = {}) {
  const plan = await promptInstallPlanFn({
    inputStream,
    outputStream,
    env,
  });
  const results = [];

  if (plan.runtimeEngines.length > 0) {
    writeSection(outputStream, "PREQ MCP endpoint");
    writeIndentedLine(outputStream, plan.mcpUrl);
  }

  if (plan.installTargets.length > 0) {
    if (plan.runtimeEngines.length > 0) {
      writeProgress(outputStream, "");
    }
    writeSection(outputStream, "Dispatcher hosts");
  }

  for (const target of plan.installTargets) {
    if (target === "hermes") {
      const result = await syncHermesSkillFn({
        env,
        force,
      });
      results.push(result);
      writeStatusRow(outputStream, describeTarget(target), describeInstallAction(result.action));
      continue;
    }

    if (target === "openclaw") {
      const result = await installOpenClawPluginFn({ env });
      results.push(result);
      writeStatusRow(outputStream, describeTarget(target), describeInstallAction(result.action));
      continue;
    }

    throw new Error(`Unsupported install target: ${target}`);
  }

  if (plan.runtimeEngines.length > 0) {
    if (plan.installTargets.length > 0) {
      writeProgress(outputStream, "");
    }
    writeSection(outputStream, "Worker runtimes");
    for (const runtime of plan.runtimeEngines) {
      const runtimeSupportResults = await installRuntimeWorkerSupportFn({
        env,
        runtimes: [runtime],
      });
      results.push(...runtimeSupportResults);
      const runtimeSupportAction = runtimeSupportResults[0]?.action;
      writeStatusRow(
        outputStream,
        `${describeRuntime(runtime)} ${runtime === "claude-code" ? "plugin" : "skill"}`,
        describeRuntimeSupportAction(runtimeSupportAction, runtime),
      );

      const runtimeResults = await installRuntimeMcpServersFn({
        env,
        runtimes: [runtime],
        serverUrl: plan.preqstationServerUrl,
      });
      results.push(...runtimeResults);
      const runtimeAction = runtimeResults[0]?.action;
      writeStatusRow(
        outputStream,
        `${describeRuntime(runtime)} MCP`,
        runtimeAction === "mcp_already_configured" ? "current" : "registered",
      );
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
