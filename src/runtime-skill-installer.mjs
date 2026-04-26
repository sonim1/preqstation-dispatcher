import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PREQSTATION_SKILL_NAME = "preqstation";
const PREQSTATION_SKILL_REPO = "sonim1/preqstation-skill";
const PREQSTATION_SKILL_GITHUB_URL = "https://github.com/sonim1/preqstation-skill";
const PREQSTATION_SKILL_PACKAGE_JSON_URL =
  "https://raw.githubusercontent.com/sonim1/preqstation-skill/main/package.json";

const RUNTIME_SKILL_TARGETS = {
  "claude-code": {
    type: "plugin",
    label: "Claude Code",
    claudePluginId: "preqstation@preqstation",
    marketplaceName: "preqstation",
  },
  codex: {
    type: "skill",
    label: "Codex",
    agentId: "codex",
    agentName: "Codex",
  },
  "gemini-cli": {
    type: "skill",
    label: "Gemini CLI",
    agentId: "gemini-cli",
    agentName: "Gemini CLI",
  },
};

export const SUPPORTED_RUNTIME_SKILL_TARGETS = Object.keys(RUNTIME_SKILL_TARGETS);

async function fetchLatestPreqstationSkillVersion({ fetchFn = globalThis.fetch } = {}) {
  if (typeof fetchFn !== "function") {
    return null;
  }

  const response = await fetchFn(PREQSTATION_SKILL_PACKAGE_JSON_URL);
  if (!response?.ok) {
    throw new Error(
      `Failed to fetch latest preqstation-skill version from ${PREQSTATION_SKILL_PACKAGE_JSON_URL}`,
    );
  }

  const pkg = await response.json();
  return typeof pkg?.version === "string" ? pkg.version : null;
}

async function listInstalledSkills({ env, exec }) {
  const result = await exec("npx", ["skills", "ls", "-g", "--json"], { env });
  const parsed = JSON.parse(result?.stdout ?? "[]");
  return Array.isArray(parsed) ? parsed : [];
}

async function readInstalledSkillVersion(skillPath, readFile = fs.readFile) {
  const packageJsonPath = `${skillPath}/package.json`;
  try {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
    return typeof pkg?.version === "string" ? pkg.version : null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseClaudePluginVersion(stdout) {
  const match = String(stdout || "").match(
    /❯\s+preqstation@preqstation\s*\n(?:.*\n)*?\s+Version:\s+([^\n]+)/u,
  );
  return match?.[1]?.trim() ?? null;
}

function isClaudePluginInstalled(stdout) {
  return /❯\s+preqstation@preqstation\b/u.test(String(stdout || ""));
}

function hasClaudeMarketplace(stdout) {
  return /❯\s+preqstation\b/u.test(String(stdout || ""));
}

async function ensureClaudePlugin({
  env,
  exec,
  latestVersion,
  installMissing,
}) {
  const pluginList = await exec("claude", ["plugin", "list"], { env });
  const pluginInstalled = isClaudePluginInstalled(pluginList?.stdout ?? "");
  const installedVersion = parseClaudePluginVersion(pluginList?.stdout ?? "");

  if (!pluginInstalled && !installMissing) {
    return {
      ok: true,
      target: "claude-code",
      action: "not_installed",
      installed_version: null,
      latest_version: latestVersion,
      marketplace_added: false,
    };
  }

  let marketplaceAdded = false;
  const marketplaceList = await exec("claude", ["plugin", "marketplace", "list"], { env });
  if (!hasClaudeMarketplace(marketplaceList?.stdout ?? "")) {
    await exec("claude", ["plugin", "marketplace", "add", PREQSTATION_SKILL_GITHUB_URL], {
      env,
    });
    marketplaceAdded = true;
  }

  if (!pluginInstalled) {
    await exec("claude", ["plugin", "install", "preqstation@preqstation"], { env });
    return {
      ok: true,
      target: "claude-code",
      action: "installed",
      installed_version: latestVersion,
      latest_version: latestVersion,
      marketplace_added: marketplaceAdded,
    };
  }

  if (latestVersion && installedVersion === latestVersion) {
    return {
      ok: true,
      target: "claude-code",
      action: "already_current",
      installed_version: installedVersion,
      latest_version: latestVersion,
      marketplace_added: marketplaceAdded,
    };
  }

  await exec("claude", ["plugin", "marketplace", "update", "preqstation"], { env });
  await exec("claude", ["plugin", "update", "preqstation@preqstation"], { env });
  return {
    ok: true,
    target: "claude-code",
    action: "updated",
    installed_version: installedVersion,
    latest_version: latestVersion,
    marketplace_added: marketplaceAdded,
  };
}

async function ensureAgentSkill({
  runtime,
  env,
  exec,
  readFile,
  latestVersion,
  installMissing,
}) {
  const runtimeConfig = RUNTIME_SKILL_TARGETS[runtime];
  const installedSkills = await listInstalledSkills({ env, exec });
  const entry = installedSkills.find((skill) => skill?.name === PREQSTATION_SKILL_NAME) ?? null;
  const configuredAgents = Array.isArray(entry?.agents)
    ? entry.agents.filter((agent) => typeof agent === "string" && agent.trim())
    : [];
  const agentInstalled = configuredAgents.includes(runtimeConfig.agentName);
  const installedVersion = entry?.path ? await readInstalledSkillVersion(entry.path, readFile) : null;

  if (!agentInstalled && !installMissing) {
    return {
      ok: true,
      target: runtime,
      action: entry?.path ? "not_enabled" : "not_installed",
      installed_version: installedVersion,
      latest_version: latestVersion,
      skill_path: entry?.path ?? null,
      configured_agents: configuredAgents,
    };
  }

  if (agentInstalled && latestVersion && installedVersion === latestVersion) {
    return {
      ok: true,
      target: runtime,
      action: "already_current",
      installed_version: installedVersion,
      latest_version: latestVersion,
      skill_path: entry.path,
    };
  }

  if (agentInstalled) {
    await exec("npx", ["skills", "update", PREQSTATION_SKILL_NAME, "-g", "-y"], { env });
    return {
      ok: true,
      target: runtime,
      action: "updated",
      installed_version: installedVersion,
      latest_version: latestVersion,
      skill_path: entry.path,
    };
  }

  await exec(
    "npx",
    ["skills", "add", PREQSTATION_SKILL_REPO, "-g", "-a", runtimeConfig.agentId, "-y"],
    { env },
  );
  return {
    ok: true,
    target: runtime,
    action: "installed",
    installed_version: null,
    latest_version: latestVersion,
  };
}

export async function installRuntimeWorkerSupport({
  runtimes,
  env = process.env,
  exec = execFileAsync,
  fetchFn = globalThis.fetch,
  readFile = fs.readFile,
  installMissing = true,
} = {}) {
  const runtimeTargets = Array.from(new Set((runtimes ?? []).filter(Boolean)));
  const latestVersion = await fetchLatestPreqstationSkillVersion({ fetchFn }).catch(() => null);
  const results = [];

  for (const runtime of runtimeTargets) {
    const runtimeConfig = RUNTIME_SKILL_TARGETS[runtime];
    if (!runtimeConfig) {
      throw new Error(
        `Unsupported runtime target: ${runtime}. Expected one of ${SUPPORTED_RUNTIME_SKILL_TARGETS.join(", ")}`,
      );
    }

    if (runtimeConfig.type === "plugin") {
      results.push(await ensureClaudePlugin({ env, exec, latestVersion, installMissing }));
      continue;
    }

    results.push(
      await ensureAgentSkill({
        runtime,
        env,
        exec,
        readFile,
        latestVersion,
        installMissing,
      }),
    );
  }

  return results;
}
