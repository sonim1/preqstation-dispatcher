import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BOOTSTRAP_PROMPT =
  "Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop.";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function buildEngineCommand(engine) {
  switch (engine) {
    case "claude-code":
      return `claude --dangerously-skip-permissions ${shellQuote(BOOTSTRAP_PROMPT)}`;
    case "gemini-cli":
      return `GEMINI_SANDBOX=false gemini -p ${shellQuote(BOOTSTRAP_PROMPT)}`;
    case "codex":
    default:
      return `codex exec --dangerously-bypass-approvals-and-sandbox ${shellQuote(BOOTSTRAP_PROMPT)}`;
  }
}

export function buildDetachedLaunchPlan({ cwd, engine }) {
  const dispatchDir = path.join(cwd, ".preqstation-dispatch");
  const logFile = path.join(dispatchDir, `${engine}.log`);
  const pidFile = path.join(dispatchDir, `${engine}.pid`);
  const engineCommand = buildEngineCommand(engine);
  const script = [
    `mkdir -p ${shellQuote(".preqstation-dispatch")}`,
    `nohup ${engineCommand} > ${shellQuote(path.relative(cwd, logFile))} 2>&1 < /dev/null &`,
    `echo $! > ${shellQuote(path.relative(cwd, pidFile))}`,
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
    stdio: ["ignore", "pipe", "pipe"],
  });

  const pid = Number((await fs.readFile(plan.pidFile, "utf8")).trim());
  return {
    pid,
    pidFile: plan.pidFile,
    logFile: plan.logFile,
  };
}
