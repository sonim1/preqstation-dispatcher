import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

test("native OpenClaw plugin manifest exists", async () => {
  const manifestPath = path.join(repoRoot, "openclaw.plugin.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  assert.equal(manifest.id, "preqstation-openclaw");
  assert.equal(typeof manifest.name, "string");
  assert.equal(typeof manifest.description, "string");
  assert.deepEqual(manifest.configSchema.properties, {
    memoryPath: { type: "string" },
    projects: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    worktreeRoot: { type: "string" },
  });
});

test("plugin entry exports a native plugin definition", async () => {
  const moduleUrl = pathToFileURL(path.join(repoRoot, "index.mjs")).href;
  const mod = await import(moduleUrl);
  const plugin = mod.default;

  assert.equal(plugin.id, "preqstation-openclaw");
  assert.equal(typeof plugin.register, "function");
});
