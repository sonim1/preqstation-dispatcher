import fs from "node:fs/promises";

const TABLE_ROW_PATTERN =
  /^\|\s*([A-Za-z0-9_-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/u;
const ABSOLUTE_PATH_PATTERN = /(^|\s)(\/[^\s"']+)/u;

export async function loadProjectMappings(memoryPath) {
  const content = await fs.readFile(memoryPath, "utf8");
  const mappings = {};

  for (const line of content.split("\n")) {
    const match = line.match(TABLE_ROW_PATTERN);
    if (!match) {
      continue;
    }

    const [, key, cwd] = match;
    const trimmedCwd = cwd.trim();
    if (!trimmedCwd.startsWith("/") || trimmedCwd === "TBD") {
      continue;
    }

    mappings[key.toUpperCase()] = trimmedCwd;
  }

  return mappings;
}

export async function resolveProjectCwd({ rawMessage, projectKey, memoryPath }) {
  const explicitPath = rawMessage.match(ABSOLUTE_PATH_PATTERN)?.[2];
  if (explicitPath) {
    return explicitPath;
  }

  const mappings = await loadProjectMappings(memoryPath);
  const mapped = mappings[projectKey.toUpperCase()];
  if (!mapped) {
    throw new Error(`No project path mapping found for ${projectKey}`);
  }

  return mapped;
}

export async function resolveProjectCwdWithSources({
  rawMessage,
  projectKey,
  configuredProjects,
  memoryPath,
}) {
  const explicitPath = rawMessage.match(ABSOLUTE_PATH_PATTERN)?.[2];
  if (explicitPath) {
    return explicitPath;
  }

  const configured = configuredProjects?.[projectKey.toUpperCase()];
  if (configured) {
    return configured;
  }

  return resolveProjectCwd({ rawMessage, projectKey, memoryPath });
}
