import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDetachedLaunchPlan,
  buildDetachedProcessEnv,
} from "../src/detached-launch.mjs";
import { createBeforeDispatchHandler } from "../index.mjs";

test("builds a detached codex launch plan that reads the prompt file", () => {
  const plan = buildDetachedLaunchPlan({
    cwd: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga",
    engine: "codex",
    platform: "darwin",
  });

  assert.equal(plan.command, "sh");
  assert.deepEqual(plan.logFile, "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.log");
  assert.deepEqual(plan.pidFile, "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.pid");
  assert.match(plan.script, /env -u LC_ALL -u LANG -u LC_CTYPE LANG=en_US.UTF-8 LC_CTYPE=en_US.UTF-8 codex exec --dangerously-bypass-approvals-and-sandbox/);
  assert.match(plan.script, /Read and execute instructions from \.\/\.preqstation-prompt\.txt/);
  assert.doesNotMatch(plan.script, /C\.UTF-8/);
  assert.doesNotMatch(plan.script, /LC_CTYPE=UTF-8/);
  assert.doesNotMatch(plan.script, /& &&/);
  assert.match(plan.script, /\( nohup .*echo \$! >/);
});

test("sanitizes detached process locale for macOS", () => {
  const env = buildDetachedProcessEnv(
    {
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      LC_CTYPE: "UTF-8",
    },
    "darwin",
  );

  assert.equal(env.PATH, "/usr/bin:/bin");
  assert.equal(env.LANG, "en_US.UTF-8");
  assert.equal(env.LC_CTYPE, "en_US.UTF-8");
  assert.equal("LC_ALL" in env, false);
});

test("keeps C.UTF-8 as the detached locale on non-macOS hosts", () => {
  const plan = buildDetachedLaunchPlan({
    cwd: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga",
    engine: "codex",
    platform: "linux",
  });

  assert.match(plan.script, /env -u LC_ALL -u LANG -u LC_CTYPE LANG=C.UTF-8 LC_CTYPE=C.UTF-8 codex exec --dangerously-bypass-approvals-and-sandbox/);
});

test("before_dispatch handles matched preq messages and parks task flow in waiting", async () => {
  const calls = [];
  const taskFlow = {
    bindSession() {
      return {
        createManaged(params) {
          calls.push(["createManaged", params]);
          return { flowId: "flow-1", revision: 1 };
        },
        runTask(params) {
          calls.push(["runTask", params]);
          return { created: true, flow: { flowId: "flow-1", revision: 1 }, task: { taskId: "task-1" } };
        },
        setWaiting(params) {
          calls.push(["setWaiting", params]);
          return { applied: true, flow: { flowId: "flow-1", revision: 2 } };
        },
      };
    },
  };

  const handler = createBeforeDispatchHandler(
    {
      runtime: { taskFlow },
      pluginConfig: {},
      rootDir: "/tmp/preqstation-dispatcher",
      logger: { info() {}, error() {} },
    },
    {
      resolveProjectCwd: async () => "/tmp/project",
      prepareWorktree: async () => ({
        cwd: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga",
        branchName: "task/proj-327/browser-notification-chuga",
      }),
      writePromptFile: async () => {},
      launchDetached: async () => ({
        pid: 4242,
        pidFile: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.pid",
        logFile: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.log",
      }),
    },
  );

  const result = await handler(
    {
      content:
        '!/skill preqstation-dispatch plan PROJ-327 using codex branch_name="task/proj-327/browser-notification-chuga"',
      channel: "telegram",
      sessionKey: "agent:main",
    },
    {
      accountId: "telegram:default",
      conversationId: "chat-1",
      sessionKey: "agent:main",
      senderId: "user-1",
    },
  );

  assert.deepEqual(result, {
    handled: true,
    text: "dispatched PROJ-327 via codex at /tmp/worktree/proj/task-proj-327-browser-notification-chuga",
  });

  assert.equal(calls[0][0], "createManaged");
  assert.equal(calls[1][0], "runTask");
  assert.equal(calls[2][0], "setWaiting");
  assert.deepEqual(calls[2][1].waitJson, {
    kind: "preqstation_dispatch",
    engine: "codex",
    taskKey: "PROJ-327",
    pid: 4242,
    cwd: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga",
    logFile: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.log",
    pidFile: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.pid",
  });
});

test("before_dispatch ignores unrelated messages", async () => {
  const handler = createBeforeDispatchHandler(
    {
      runtime: {},
      pluginConfig: {},
      rootDir: "/tmp/preqstation-dispatcher",
      logger: { info() {}, error() {} },
    },
    {},
  );

  assert.equal(
    await handler(
      { content: "hello there", channel: "telegram" },
      { sessionKey: "agent:main" },
    ),
    undefined,
  );
});

test("before_dispatch returns an actionable Telegram reply when dispatch fails", async () => {
  const handler = createBeforeDispatchHandler(
    {
      runtime: {},
      pluginConfig: {},
      rootDir: "/tmp/preqstation-dispatcher",
      logger: { info() {}, error() {} },
    },
    {
      resolveProjectCwd: async () => "/tmp/project",
      prepareWorktree: async () => {
        throw new Error("GitHub access missing on the coding agent: run gh auth login before auto PR.");
      },
    },
  );

  const result = await handler(
    {
      content: "preqstation implement PROJ-327 using codex",
      channel: "telegram",
    },
    {
      sessionKey: "agent:main",
      accountId: "telegram:default",
      conversationId: "chat-1",
    },
  );

  assert.equal(result.handled, true);
  assert.match(result.text, /Reason: GitHub access missing on the coding agent/);
  assert.match(result.text, /gh auth login/);
  assert.match(result.text, /resend the PREQ dispatch/);
});
