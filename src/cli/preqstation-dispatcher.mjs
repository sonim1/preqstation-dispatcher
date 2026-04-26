import fs from "node:fs/promises";
import path from "node:path";

import { dispatchPreqRun as defaultDispatchPreqRun } from "../core/dispatch-runtime.mjs";
import { parseHermesDispatchPayload } from "../adapters/hermes/payload.mjs";
import { runInstallWizard as defaultRunInstallWizard } from "../install-wizard.mjs";
import { parseDispatchMessage } from "../parse-dispatch-message.mjs";
import {
  getDefaultRepoRoots,
  getDefaultSharedMappingPath,
  resolveDefaultUserHome,
  matchProjectsToRepoRoots,
  readRepoRoots,
} from "../project-mapping.mjs";
import { parseAutoMappings } from "../setup-command.mjs";
import {
  getHermesSkillStatus,
  syncHermesSkill,
} from "../hermes-skill-installer.mjs";
import { installOpenClawPlugin } from "../openclaw-installer.mjs";

function getDispatchHome(env) {
  return (
    env.PREQSTATION_DISPATCH_HOME ||
    path.join(resolveDefaultUserHome(env), ".preqstation-dispatch")
  );
}

function getProjectsFile(env) {
  return env.PREQSTATION_PROJECTS_FILE || getDefaultSharedMappingPath(env);
}

function getRepoRoots(env) {
  return readRepoRoots(env.PREQSTATION_REPO_ROOTS || getDefaultRepoRoots(env));
}

function getWorktreeRoot(env) {
  return env.PREQSTATION_WORKTREE_ROOT || path.join(getDispatchHome(env), "worktrees");
}

function getMemoryPath(env) {
  return env.PREQSTATION_MEMORY_PATH || null;
}

function parseOptions(argv) {
  const options = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { options, positional };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required option: --${name}`);
  }
  return value.trim();
}

function normalizeProjectKey(value) {
  const projectKey = String(value || "").trim().toUpperCase();
  if (!projectKey) {
    throw new Error("Project key is required");
  }
  return projectKey;
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readProjectMappings(mappingPath) {
  const content = await fs.readFile(mappingPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  if (!content) {
    return { projects: {} };
  }

  const parsed = JSON.parse(content);
  return {
    projects:
      parsed?.projects && typeof parsed.projects === "object" ? parsed.projects : {},
  };
}

async function writeProjectMapping({ mappingPath, projectKey, projectPath }) {
  if (!path.isAbsolute(projectPath)) {
    throw new Error("Project path must be absolute");
  }

  const stat = await fs.stat(projectPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  const mappings = await readProjectMappings(mappingPath);
  mappings.projects[normalizeProjectKey(projectKey)] = projectPath;
  await writeProjectMappings({ mappingPath, projects: mappings.projects });
}

async function writeProjectMappings({ mappingPath, projects }) {
  await fs.mkdir(path.dirname(mappingPath), { recursive: true });
  const mappings = { projects };
  await fs.writeFile(`${mappingPath}.tmp`, `${JSON.stringify(mappings, null, 2)}\n`, "utf8");
  await fs.rename(`${mappingPath}.tmp`, mappingPath);
}

function parseRunFlags(options) {
  return parseHermesDispatchPayload({
    event_type: "preq.dispatch.requested",
    dispatch: {
      project_key: options["project-key"],
      task_key: options["task-key"],
      objective: options.objective,
      engine: options.engine,
      branch_name: options["branch-name"],
      ask_hint: options["ask-hint"],
      insight_prompt_b64: options["insight-prompt-b64"],
    },
  });
}

async function parseDispatchFromCommand(command, args) {
  const { options } = parseOptions(args);

  if (command === "run-json") {
    const payload = await readJsonFile(requireOption(options, "payload"));
    return parseHermesDispatchPayload(payload);
  }

  if (command === "run-message") {
    const parsed = parseDispatchMessage(requireOption(options, "message"));
    if (!parsed) {
      throw new Error("Message does not contain a PREQSTATION dispatch request");
    }
    return parsed;
  }

  if (command === "run") {
    return parseRunFlags(options);
  }

  throw new Error(`Unsupported command: ${command}`);
}

function printUsage(stdout) {
  stdout.write(
    [
      "Usage:",
      "  preqstation-dispatcher run --project-key PROJ --task-key PROJ-123 --objective implement --engine codex [--branch-name BRANCH]",
      "  preqstation-dispatcher run-json --payload /path/to/payload.json",
      "  preqstation-dispatcher run-message --message 'preqstation implement PROJ-123 using codex'",
      "  preqstation-dispatcher setup set PROJ /absolute/path/to/project",
      "  preqstation-dispatcher setup auto PROJ=https://github.com/example/project",
      "  preqstation-dispatcher setup status",
      "  preqstation-dispatcher install [hermes|openclaw]",
      "  preqstation-dispatcher install",
      "  preqstation-dispatcher sync hermes [--force]",
      "  preqstation-dispatcher status hermes",
      "",
    ].join("\n"),
  );
}

async function handleSetup({ args, stdout, env }) {
  const [action, projectKey, projectPath] = args;
  const mappingPath = getProjectsFile(env);

  if (action === "set") {
    if (!projectKey || !projectPath) {
      throw new Error("Usage: preqstation-dispatcher setup set PROJECT_KEY /absolute/path");
    }
    await writeProjectMapping({ mappingPath, projectKey, projectPath });
    stdout.write(
      `${JSON.stringify({ ok: true, project_key: normalizeProjectKey(projectKey), mapping_file: mappingPath })}\n`,
    );
    return;
  }

  if (action === "auto") {
    const { entries, invalid } = parseAutoMappings(args.slice(1).join(" "));
    if (entries.length === 0) {
      throw new Error(
        "Usage: preqstation-dispatcher setup auto PROJ=https://github.com/example/project",
      );
    }

    const mappings = await readProjectMappings(mappingPath);
    const discovered = await matchProjectsToRepoRoots(entries, getRepoRoots(env));
    const nextProjects = {
      ...mappings.projects,
      ...discovered.matched,
    };

    if (Object.keys(discovered.matched).length > 0) {
      await writeProjectMappings({ mappingPath, projects: nextProjects });
    }

    stdout.write(
      `${JSON.stringify({
        ok: true,
        mapping_file: mappingPath,
        matched: discovered.matched,
        unmatched: discovered.unmatched,
        invalid,
        projects: nextProjects,
        repo_roots: discovered.repoRoots,
      })}\n`,
    );
    return;
  }

  if (action === "status") {
    const mappings = await readProjectMappings(mappingPath);
    stdout.write(`${JSON.stringify({ ok: true, mapping_file: mappingPath, ...mappings })}\n`);
    return;
  }

  throw new Error("Usage: preqstation-dispatcher setup set PROJECT_KEY /absolute/path");
}

async function handleInstallCommand({
  args,
  stdin,
  stdout,
  env,
  runInstallWizard = defaultRunInstallWizard,
}) {
  const { options, positional } = parseOptions(args);
  const [target] = positional;

  if (!target) {
    stdout.write(
      `${JSON.stringify(
        await runInstallWizard({
          inputStream: stdin,
          outputStream: stdout,
          env,
          force: options.force === "true",
        }),
      )}\n`,
    );
    return;
  }

  if (target === "hermes") {
    const result = await syncHermesSkill({
      env,
      force: options.force === "true",
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (target === "openclaw") {
    stdout.write(`${JSON.stringify(await installOpenClawPlugin({ env }))}\n`);
    return;
  }

  throw new Error("Usage: preqstation-dispatcher install [hermes|openclaw]");
}

async function handlePlatformCommand({ command, args, stdout, env }) {
  const { options, positional } = parseOptions(args);
  const [target] = positional;

  if (command === "status" && target === "hermes") {
    stdout.write(`${JSON.stringify(await getHermesSkillStatus({ env }))}\n`);
    return;
  }

  if (target !== "hermes") {
    throw new Error(`Usage: preqstation-dispatcher ${command} hermes`);
  }

  const result = await syncHermesSkill({
    env,
    force: options.force === "true",
  });
  stdout.write(`${JSON.stringify(result)}\n`);
}

function writeDispatchResult({ stdout, parsed, result }) {
  stdout.write(
    `${JSON.stringify({
      ok: true,
      project_key: parsed.projectKey,
      task_key: parsed.taskKey,
      engine: parsed.engine,
      cwd: result.prepared.cwd,
      branch_name: result.prepared.branchName,
      pid: result.launch.pid,
      log_file: result.launch.logFile,
      pid_file: result.launch.pidFile,
    })}\n`,
  );
}

export async function runDispatcherCli({
  argv,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env,
  dispatchPreqRun = defaultDispatchPreqRun,
  runInstallWizard = defaultRunInstallWizard,
}) {
  const [command, ...args] = argv;

  try {
    if (!command || command === "--help" || command === "help") {
      printUsage(stdout);
      return 0;
    }

    if (command === "setup") {
      await handleSetup({ args, stdout, env });
      return 0;
    }

    if (command === "install") {
      await handleInstallCommand({ args, stdin, stdout, env, runInstallWizard });
      return 0;
    }

    if (command === "sync" || command === "status") {
      await handlePlatformCommand({ command, args, stdout, env });
      return 0;
    }

    const parsed = await parseDispatchFromCommand(command, args);
    const result = await dispatchPreqRun({
      rawMessage: parsed.rawMessage,
      parsed,
      configuredProjects: null,
      sharedMappingPath: getProjectsFile(env),
      memoryPath: getMemoryPath(env),
      worktreeRoot: getWorktreeRoot(env),
    });

    writeDispatchResult({ stdout, parsed, result });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`error: ${message}\n`);
    return 1;
  }
}
