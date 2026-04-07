import { ensureProjectCheckout } from "./worktree-runtime.mjs";

function readPluginConfig(config) {
  return config?.plugins?.entries?.["preqstation-openclaw"]?.config ?? {};
}

function formatMappings(projects) {
  const entries = Object.entries(projects ?? {});
  if (entries.length === 0) {
    return "Current mappings: none";
  }

  return [
    "Current mappings:",
    ...entries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, cwd]) => `- ${key} -> ${cwd}`),
  ].join("\n");
}

function formatUsage(projects) {
  return [
    "Usage: /preqsetup set <PROJECT_KEY> <ABSOLUTE_PATH>",
    "Usage: /preqsetup unset <PROJECT_KEY>",
    "Usage: /preqsetup status",
    "",
    formatMappings(projects),
  ].join("\n");
}

export function parseSetupArgs(args) {
  const tokens = (args ?? "").trim().split(/\s+/u).filter(Boolean);
  const action = (tokens[0] ?? "status").toLowerCase();

  if (action === "set") {
    return {
      action,
      projectKey: (tokens[1] ?? "").toUpperCase(),
      projectCwd: tokens.slice(2).join(" "),
    };
  }

  if (action === "unset") {
    return {
      action,
      projectKey: (tokens[1] ?? "").toUpperCase(),
      projectCwd: null,
    };
  }

  return {
    action: "status",
    projectKey: null,
    projectCwd: null,
  };
}

function updatePluginProjects(config, nextProjects) {
  return {
    ...config,
    plugins: {
      ...(config.plugins ?? {}),
      entries: {
        ...(config.plugins?.entries ?? {}),
        "preqstation-openclaw": {
          ...(config.plugins?.entries?.["preqstation-openclaw"] ?? {}),
          enabled: true,
          config: {
            ...readPluginConfig(config),
            projects: nextProjects,
          },
        },
      },
    },
  };
}

export function createSetupCommandHandler(api) {
  return async function handleSetupCommand(ctx) {
    const currentConfig = api.runtime.config.loadConfig();
    const pluginConfig = readPluginConfig(currentConfig);
    const projects = { ...(pluginConfig.projects ?? {}) };
    const parsed = parseSetupArgs(ctx.args);

    if (parsed.action === "status" || !parsed.projectKey) {
      return { text: formatUsage(projects) };
    }

    if (parsed.action === "unset") {
      delete projects[parsed.projectKey];
      const nextConfig = updatePluginProjects(currentConfig, projects);
      await api.runtime.config.writeConfigFile(nextConfig);
      return {
        text: [
          `Removed PREQ project mapping for ${parsed.projectKey}.`,
          "",
          formatMappings(projects),
        ].join("\n"),
      };
    }

    if (!parsed.projectCwd || !parsed.projectCwd.startsWith("/")) {
      return {
        text: [
          "Path must be an absolute path.",
          "",
          formatUsage(projects),
        ].join("\n"),
      };
    }

    await ensureProjectCheckout(parsed.projectCwd);
    projects[parsed.projectKey] = parsed.projectCwd;
    const nextConfig = updatePluginProjects(currentConfig, projects);
    await api.runtime.config.writeConfigFile(nextConfig);

    return {
      text: [
        `Saved PREQ project mapping: ${parsed.projectKey} -> ${parsed.projectCwd}`,
        "",
        formatMappings(projects),
      ].join("\n"),
    };
  };
}
