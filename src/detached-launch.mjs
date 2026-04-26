import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BOOTSTRAP_PROMPT =
  "Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop.";

export function resolveDetachedLocale(platform = process.platform) {
  return platform === "darwin" ? "en_US.UTF-8" : "C.UTF-8";
}

export function buildDetachedLocalePrefix(platform = process.platform) {
  const locale = resolveDetachedLocale(platform);
  return `env -u LC_ALL -u LANG -u LC_CTYPE LANG=${locale} LC_CTYPE=${locale}`;
}

export function buildDetachedProcessEnv(baseEnv = process.env, platform = process.platform) {
  const locale = resolveDetachedLocale(platform);
  const nextEnv = {
    ...baseEnv,
    LANG: locale,
    LC_CTYPE: locale,
  };
  delete nextEnv.LC_ALL;
  return nextEnv;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function buildEngineCommand(engine, platform = process.platform) {
  const envPrefix = buildDetachedLocalePrefix(platform);
  switch (engine) {
    case "claude-code":
      return `${envPrefix} claude --dangerously-skip-permissions ${shellQuote(BOOTSTRAP_PROMPT)}`;
    case "gemini-cli":
      return `${envPrefix} GEMINI_SANDBOX=false gemini -p ${shellQuote(BOOTSTRAP_PROMPT)}`;
    case "codex":
    default:
      return `${envPrefix} codex exec --dangerously-bypass-approvals-and-sandbox ${shellQuote(BOOTSTRAP_PROMPT)}`;
  }
}

export function buildDetachedLaunchPlan({ cwd, engine, platform = process.platform }) {
  const dispatchDir = path.join(cwd, ".preqstation-dispatch");
  const logFile = path.join(dispatchDir, `${engine}.log`);
  const pidFile = path.join(dispatchDir, `${engine}.pid`);
  const engineCommand = buildEngineCommand(engine, platform);
  const script = [
    `mkdir -p ${shellQuote(".preqstation-dispatch")}`,
    `( nohup ${engineCommand} > ${shellQuote(path.relative(cwd, logFile))} 2>&1 < /dev/null & echo $! > ${shellQuote(path.relative(cwd, pidFile))} )`,
  ].join(" && ");

  return {
    command: "sh",
    args: ["-lc", script],
    script,
    logFile,
    pidFile,
  };
}

export async function launchDetached({ cwd, engine }) {
  const plan = buildDetachedLaunchPlan({ cwd, engine });
  execFileSync(plan.command, plan.args, {
    cwd,
    env: buildDetachedProcessEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const pid = Number((await fs.readFile(plan.pidFile, "utf8")).trim());
  return {
    pid,
    pidFile: plan.pidFile,
    logFile: plan.logFile,
  };
}
