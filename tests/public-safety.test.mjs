import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function collectFiles(entry) {
  const stat = await fs.stat(entry);
  if (stat.isFile()) {
    return [entry];
  }

  const children = await fs.readdir(entry);
  const nested = await Promise.all(
    children.map((child) => collectFiles(path.join(entry, child))),
  );
  return nested.flat();
}

test("public package docs and metadata do not leak maintainer-local paths", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
  const checkedFiles = (
    await Promise.all(
      packageJson.files.map((entry) => collectFiles(path.join(repoRoot, entry))),
    )
  ).flat();

  for (const fullPath of checkedFiles) {
    const content = await fs.readFile(fullPath, "utf8");
    const relativePath = path.relative(repoRoot, fullPath);

    assert.doesNotMatch(content, /\/Users\/kendrick/u, relativePath);
    assert.doesNotMatch(content, /\/Users\//u, relativePath);
  }
});
