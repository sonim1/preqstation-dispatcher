import test from "node:test";
import assert from "node:assert/strict";

import {
  createSetupCommandHandler,
  parseSetupArgs,
} from "../src/setup-command.mjs";

test("parses setup command arguments", () => {
  assert.deepEqual(
    parseSetupArgs('set PROJ /Users/kendrick/projects/projects-manager'),
    {
      action: "set",
      projectKey: "PROJ",
      projectCwd: "/Users/kendrick/projects/projects-manager",
    },
  );
});

test("setup command writes project mapping into plugin config", async () => {
  let writtenConfig = null;
  const api = {
    runtime: {
      config: {
        loadConfig() {
          return {
            plugins: {
              entries: {
                "preqstation-openclaw": {
                  enabled: true,
                  config: {
                    worktreeRoot: "/tmp/openclaw-worktrees",
                  },
                },
              },
            },
          };
        },
        async writeConfigFile(nextConfig) {
          writtenConfig = nextConfig;
        },
      },
    },
  };

  const handler = createSetupCommandHandler(api);
  const result = await handler({
    channel: "telegram",
    isAuthorizedSender: true,
    commandBody: "preqsetup set PROJ /Users/kendrick/projects/projects-manager",
    args: "set PROJ /Users/kendrick/projects/projects-manager",
    config: {},
  });

  assert.match(result.text, /Saved PREQ project mapping/);
  assert.equal(
    writtenConfig.plugins.entries["preqstation-openclaw"].config.projects.PROJ,
    "/Users/kendrick/projects/projects-manager",
  );
  assert.equal(
    writtenConfig.plugins.entries["preqstation-openclaw"].config.worktreeRoot,
    "/tmp/openclaw-worktrees",
  );
});

test("setup command shows current mappings when called without args", async () => {
  const api = {
    runtime: {
      config: {
        loadConfig() {
          return {
            plugins: {
              entries: {
                "preqstation-openclaw": {
                  enabled: true,
                  config: {
                    projects: {
                      PROJ: "/Users/kendrick/projects/projects-manager",
                    },
                  },
                },
              },
            },
          };
        },
      },
    },
  };

  const handler = createSetupCommandHandler(api);
  const result = await handler({
    channel: "telegram",
    isAuthorizedSender: true,
    commandBody: "preqsetup",
    args: "",
    config: {},
  });

  assert.match(result.text, /Usage: \/preqsetup set <PROJECT_KEY> <ABSOLUTE_PATH>/);
  assert.match(result.text, /PROJ -> \/Users\/kendrick\/projects\/projects-manager/);
});

test("setup command rejects missing project paths before saving", async () => {
  let writeCount = 0;
  const api = {
    runtime: {
      config: {
        loadConfig() {
          return {
            plugins: {
              entries: {
                "preqstation-openclaw": {
                  enabled: true,
                  config: {},
                },
              },
            },
          };
        },
        async writeConfigFile() {
          writeCount += 1;
        },
      },
    },
  };

  const handler = createSetupCommandHandler(api);
  await assert.rejects(
    handler({
      channel: "telegram",
      isAuthorizedSender: true,
      commandBody: "preqsetup set PROJ /tmp/preqstation-openclaw/does-not-exist",
      args: "set PROJ /tmp/preqstation-openclaw/does-not-exist",
      config: {},
    }),
    /Project path does not exist: \/tmp\/preqstation-openclaw\/does-not-exist/,
  );
  assert.equal(writeCount, 0);
});
