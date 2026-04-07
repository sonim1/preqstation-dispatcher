import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadProjectMappings,
  resolveProjectCwd,
} from "../src/project-mapping.mjs";

test("loads project mappings from MEMORY markdown table", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "preqstation-openclaw-memory-"),
  );
  const memoryPath = path.join(tempDir, "MEMORY.md");

  await fs.writeFile(
    memoryPath,
    [
      "# MEMORY",
      "",
      "| key  | cwd                | note |",
      "| ---- | ------------------ | ---- |",
      "| PROJ | /tmp/example-proj | App  |",
      "| DOCS | TBD                | Docs |",
      "",
    ].join("\n"),
  );

  const mappings = await loadProjectMappings(memoryPath);

  assert.deepEqual(mappings, {
    PROJ: "/tmp/example-proj",
  });
});

test("resolves explicit absolute path before mapping lookup", async () => {
  const cwd = await resolveProjectCwd({
    rawMessage: "preqstation implement PROJ-12 in /tmp/direct-project with codex",
    projectKey: "PROJ",
    memoryPath: "/does/not/matter",
  });

  assert.equal(cwd, "/tmp/direct-project");
});
