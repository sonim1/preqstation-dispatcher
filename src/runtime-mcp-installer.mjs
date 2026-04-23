import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
      "preqstation",
      mcpUrl,
    ],
  },
  codex: {
    command: "codex",
    args: (mcpUrl) => ["mcp", "add", "preqstation", "--url", mcpUrl],
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
      "preqstation",
      mcpUrl,
    ],
  },
};

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
