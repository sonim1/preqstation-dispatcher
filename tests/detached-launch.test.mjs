import test from "node:test";
import assert from "node:assert/strict";

import { buildDetachedLaunchPlan } from "../src/detached-launch.mjs";
import { createBeforeDispatchHandler } from "../index.mjs";

test("builds a detached codex launch plan that reads the prompt file", () => {
  const plan = buildDetachedLaunchPlan({
    cwd: "/tmp/worktree/proj/task-proj-327-browser-notification-chuga",
    engine: "codex",
  });

  assert.equal(plan.command, "sh");
  assert.deepEqual(plan.logFile, "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.log");
  assert.deepEqual(plan.pidFile, "/tmp/worktree/proj/task-proj-327-browser-notification-chuga/.preqstation-dispatch/codex.pid");
  assert.match(plan.script, /codex exec --dangerously-bypass-approvals-and-sandbox/);
  assert.match(plan.script, /Read and execute instructions from \.\/\.preqstation-prompt\.txt/);
  assert.doesNotMatch(plan.script, /& &&/);
  assert.match(plan.script, /\( nohup .*echo \$! >/);
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
      rootDir: "/tmp/preqstation-openclaw",
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
      rootDir: "/tmp/preqstation-openclaw",
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
