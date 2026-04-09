import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchDetached } from "./src/detached-launch.mjs";
import { parseDispatchMessage } from "./src/parse-dispatch-message.mjs";
import {
  DEFAULT_SHARED_MAPPING_PATH,
  resolveProjectCwdWithSources,
} from "./src/project-mapping.mjs";
import { renderPrompt } from "./src/prompt-template.mjs";
import { createSetupCommandHandler } from "./src/setup-command.mjs";
import { prepareWorktree } from "./src/worktree-runtime.mjs";

function resolveTaskFlowApi(runtime) {
  return runtime?.tasks?.flow ?? runtime?.taskFlow ?? null;
}

function resolveMemoryPath(api) {
  const configured = api.pluginConfig?.memoryPath;
  if (typeof configured === "string" && configured.length > 0) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(api.rootDir ?? process.cwd(), configured);
  }
  return path.join(api.rootDir ?? process.cwd(), "MEMORY.md");
}

function resolveWorktreeRoot(api) {
  const configured = api.pluginConfig?.worktreeRoot;
  if (typeof configured === "string" && configured.length > 0) {
    return configured;
  }
  return process.env.OPENCLAW_WORKTREE_ROOT
    ? process.env.OPENCLAW_WORKTREE_ROOT
    : path.join(os.homedir(), ".openclaw-preq-worktrees");
}

async function writePromptFile({ cwd, prompt }) {
  await fs.writeFile(path.join(cwd, ".preqstation-prompt.txt"), prompt, "utf8");
}

function trackDetachedDispatch({ api, event, ctx, parsed, prepared, launch }) {
  const taskFlowApi = resolveTaskFlowApi(api.runtime);
  if (!taskFlowApi || !ctx.sessionKey) {
    return;
  }

  const bound = taskFlowApi.bindSession({
    sessionKey: ctx.sessionKey,
    requesterOrigin: {
      channel: event.channel,
      accountId: ctx.accountId,
      to: ctx.conversationId,
    },
  });

  const created = bound.createManaged({
    controllerId: "preqstation-openclaw/dispatch",
    goal: `Dispatch ${parsed.taskKey ?? parsed.projectKey} via ${parsed.engine}`,
    status: "running",
    currentStep: "launch_detached_engine",
    stateJson: {
      taskKey: parsed.taskKey,
      projectKey: parsed.projectKey,
      engine: parsed.engine,
      cwd: prepared.cwd,
      branchName: prepared.branchName,
    },
  });

  const child = bound.runTask({
    flowId: created.flowId,
    runtime: "cli",
    runId: `preqstation-openclaw:${parsed.taskKey ?? parsed.projectKey}:${Date.now()}`,
    task: `Dispatch ${parsed.taskKey ?? parsed.projectKey} via ${parsed.engine}`,
    status: "running",
    startedAt: Date.now(),
    lastEventAt: Date.now(),
    progressSummary: `Launched ${parsed.engine} in ${prepared.cwd}`,
  });

  const expectedRevision = child.created ? child.flow.revision : created.revision;

  bound.setWaiting({
    flowId: created.flowId,
    expectedRevision,
    currentStep: "await_detached_completion",
    stateJson: {
      taskKey: parsed.taskKey,
      projectKey: parsed.projectKey,
      engine: parsed.engine,
      cwd: prepared.cwd,
      branchName: prepared.branchName,
    },
    waitJson: {
      kind: "preqstation_dispatch",
      engine: parsed.engine,
      taskKey: parsed.taskKey,
      pid: launch.pid,
      cwd: prepared.cwd,
      logFile: launch.logFile,
      pidFile: launch.pidFile,
    },
  });
}

export function createBeforeDispatchHandler(api, overrides = {}) {
  const dependencies = {
    resolveProjectCwd: resolveProjectCwdWithSources,
    prepareWorktree,
    writePromptFile,
    launchDetached,
    ...overrides,
  };

  return async function beforeDispatch(event, ctx) {
    const parsed = parseDispatchMessage(event.content);
    if (!parsed) {
      return undefined;
    }

    try {
      const projectCwd = await dependencies.resolveProjectCwd({
        rawMessage: parsed.rawMessage,
        projectKey: parsed.projectKey,
        configuredProjects: api.pluginConfig?.projects,
        sharedMappingPath: DEFAULT_SHARED_MAPPING_PATH,
        memoryPath: resolveMemoryPath(api),
      });

      const prepared = await dependencies.prepareWorktree({
        projectCwd,
        projectKey: parsed.projectKey,
        taskKey: parsed.taskKey,
        branchName: parsed.branchName,
        worktreeRoot: resolveWorktreeRoot(api),
      });

      const prompt = renderPrompt({
        taskKey: parsed.taskKey,
        projectKey: parsed.projectKey,
        branchName: prepared.branchName,
        objective: parsed.objective,
        engine: parsed.engine,
        cwd: prepared.cwd,
        projectCwd,
        askHint: parsed.askHint,
        insightPromptB64: parsed.insightPromptB64,
      });

      await dependencies.writePromptFile({ cwd: prepared.cwd, prompt });
      const launch = await dependencies.launchDetached({
        cwd: prepared.cwd,
        engine: parsed.engine,
      });

      trackDetachedDispatch({
        api,
        event,
        ctx,
        parsed,
        prepared,
        launch,
      });

      return {
        handled: true,
        text: `dispatched ${parsed.taskKey ?? parsed.projectKey} via ${parsed.engine} at ${prepared.cwd}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      api.logger?.error?.("Failed to dispatch PREQ task", {
        error: message,
        message: parsed.rawMessage,
      });
      return {
        handled: true,
        text: `failed to dispatch ${parsed.taskKey ?? parsed.projectKey} via ${parsed.engine} - ${message}`,
      };
    }
  };
}

const plugin = {
  id: "preqstation-openclaw",
  name: "PREQSTATION OpenClaw Dispatch",
  description:
    "Intercept PREQSTATION dispatch messages and launch detached local coding runs for mapped projects.",
  register(api) {
    api.on("before_dispatch", createBeforeDispatchHandler(api));
    api.registerCommand({
      name: "preqsetup",
      description: "Configure PREQ project path mappings for preqstation-openclaw.",
      acceptsArgs: true,
      handler: createSetupCommandHandler(api),
    });
  },
};

export default plugin;
