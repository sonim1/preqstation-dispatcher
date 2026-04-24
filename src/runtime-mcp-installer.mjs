import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PREQSTATION_MCP_NAME = "preqstation";

export const SUPPORTED_RUNTIME_TARGETS = [
  "claude-code",
  "codex",
  "gemini-cli",
];

const RUNTIME_MCP_INSTALLERS = {
  "claude-code": {
    command: "claude",
    args: (mcpUrl) => [
      "mcp",
      "add",
      "-s",
      "user",
      "--transport",
      "http",
      PREQSTATION_MCP_NAME,
      mcpUrl,
    ],
    inspectArgs: () => ["mcp", "get", PREQSTATION_MCP_NAME],
    parseExistingConfig(stdout) {
      const match = String(stdout || "").match(/URL:\s+(\S+)/u);
      return {
        exists: true,
        url: match?.[1] ?? null,
      };
    },
    isMissingConfigError(error) {
      return /No MCP server found with name:/iu.test(String(error?.stderr || error?.message || error));
    },
  },
  codex: {
    command: "codex",
    args: (mcpUrl) => ["mcp", "add", PREQSTATION_MCP_NAME, "--url", mcpUrl],
    inspectArgs: () => ["mcp", "get", PREQSTATION_MCP_NAME],
    parseExistingConfig(stdout) {
      const match = String(stdout || "").match(/url:\s+(\S+)/iu);
      return {
        exists: true,
        url: match?.[1] ?? null,
      };
    },
    isMissingConfigError(error) {
      return /No MCP server named .* found\./iu.test(String(error?.stderr || error?.message || error));
    },
  },
  "gemini-cli": {
    command: "gemini",
    args: (mcpUrl) => [
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "http",
      PREQSTATION_MCP_NAME,
      mcpUrl,
    ],
    inspectArgs: () => ["mcp", "list"],
    parseExistingConfig(stdout) {
      const text = String(stdout || "");
      return {
        exists: new RegExp(`^${PREQSTATION_MCP_NAME}\\b`, "mu").test(text),
        url: null,
      };
    },
    isMissingConfigError() {
      return false;
    },
  },
};

async function inspectRuntimeMcpServer({ installer, env, exec }) {
  if (!installer.inspectArgs || !installer.parseExistingConfig) {
    return {
      exists: false,
      url: null,
    };
  }

  try {
    const result = await exec(installer.command, installer.inspectArgs(), { env });
    return installer.parseExistingConfig(result?.stdout ?? "");
  } catch (error) {
    if (installer.isMissingConfigError?.(error)) {
      return {
        exists: false,
        url: null,
      };
    }
    throw error;
  }
}

function isLocalhostHttp(url) {
  return /^http:\/\/localhost(?::\d+)?(?:\/.*)?$/iu.test(url);
}

export function normalizePreqstationServerUrl(value) {
  const serverUrl = String(value || "").trim().replace(/\/+$/u, "");
  if (!serverUrl) {
    throw new Error("PREQSTATION server URL is required");
  }
  if (!/^https:\/\//iu.test(serverUrl) && !isLocalhostHttp(serverUrl)) {
    throw new Error(
      "PREQSTATION server URL must use https:// (or http://localhost for local development).",
    );
  }
  return serverUrl;
}

export function buildPreqstationMcpUrl(serverUrl) {
  return `${normalizePreqstationServerUrl(serverUrl)}/mcp`;
}

export async function installRuntimeMcpServers({
  runtimes,
  serverUrl,
  env = process.env,
  exec = execFileAsync,
} = {}) {
  const runtimeTargets = Array.from(new Set((runtimes ?? []).filter(Boolean)));
  const mcpUrl = buildPreqstationMcpUrl(serverUrl);
  const normalizedServerUrl = normalizePreqstationServerUrl(serverUrl);
  const results = [];

  for (const runtime of runtimeTargets) {
    const installer = RUNTIME_MCP_INSTALLERS[runtime];
    if (!installer) {
      throw new Error(
        `Unsupported runtime target: ${runtime}. Expected one of ${SUPPORTED_RUNTIME_TARGETS.join(", ")}`,
      );
    }

    const args = installer.args(mcpUrl);
    const existingConfig = await inspectRuntimeMcpServer({
      installer,
      env,
      exec,
    });
    if (existingConfig.exists && existingConfig.url === mcpUrl) {
      results.push({
        ok: true,
        target: runtime,
        action: "mcp_already_configured",
        server_url: normalizedServerUrl,
        mcp_url: mcpUrl,
        command: installer.command,
        args: installer.inspectArgs?.() ?? [],
      });
      continue;
    }
    if (existingConfig.exists) {
      throw new Error(
        `MCP server ${PREQSTATION_MCP_NAME} already exists for ${runtime}. Remove it manually and rerun install if you want to change its configuration.`,
      );
    }

    await exec(installer.command, args, { env });
    results.push({
      ok: true,
      target: runtime,
      action: "mcp_installed",
      server_url: normalizedServerUrl,
      mcp_url: mcpUrl,
      command: installer.command,
      args,
    });
  }

  return results;
}
