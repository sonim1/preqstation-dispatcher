import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPreqstationMcpUrl,
  installRuntimeMcpServers,
  normalizePreqstationServerUrl,
} from "../src/runtime-mcp-installer.mjs";

test("normalizePreqstationServerUrl trims trailing slashes and accepts localhost http", () => {
  assert.equal(
    normalizePreqstationServerUrl("https://preq.example.com///"),
    "https://preq.example.com",
  );
  assert.equal(
    normalizePreqstationServerUrl("http://localhost:3000/"),
    "http://localhost:3000",
  );
  assert.equal(
    buildPreqstationMcpUrl("https://preq.example.com/"),
    "https://preq.example.com/mcp",
  );
});

test("installRuntimeMcpServers registers the PREQ MCP endpoint for selected runtimes", async () => {
  const calls = [];

  const results = await installRuntimeMcpServers({
    runtimes: ["claude-code", "codex", "gemini-cli"],
    serverUrl: "https://preq.example.com/",
    env: { PATH: process.env.PATH },
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
    },
  });

  assert.deepEqual(calls, [
    {
      command: "claude",
      args: [
        "mcp",
        "add",
        "-s",
        "user",
        "--transport",
        "http",
        "preqstation",
        "https://preq.example.com/mcp",
      ],
      options: { env: { PATH: process.env.PATH } },
    },
    {
      command: "codex",
      args: [
        "mcp",
        "add",
        "preqstation",
        "--url",
        "https://preq.example.com/mcp",
      ],
      options: { env: { PATH: process.env.PATH } },
    },
    {
      command: "gemini",
      args: [
        "mcp",
        "add",
        "--scope",
        "user",
        "--transport",
        "http",
        "preqstation",
        "https://preq.example.com/mcp",
      ],
      options: { env: { PATH: process.env.PATH } },
    },
  ]);
  assert.deepEqual(
    results.map((result) => ({
      target: result.target,
      action: result.action,
      mcp_url: result.mcp_url,
    })),
    [
      {
        target: "claude-code",
        action: "mcp_installed",
        mcp_url: "https://preq.example.com/mcp",
      },
      {
        target: "codex",
        action: "mcp_installed",
        mcp_url: "https://preq.example.com/mcp",
      },
      {
        target: "gemini-cli",
        action: "mcp_installed",
        mcp_url: "https://preq.example.com/mcp",
      },
    ],
  );
});
