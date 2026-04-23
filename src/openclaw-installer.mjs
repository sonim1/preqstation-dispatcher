import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@sonim1/preqstation-dispatcher";
const PLUGIN_ID = "preqstation-dispatcher";

function isPluginAlreadyInstalledError(error) {
  const message =
    typeof error?.stderr === "string" && error.stderr
      ? error.stderr
      : error instanceof Error
        ? error.message
        : String(error);
  return /plugin already exists/i.test(message);
}

export async function installOpenClawPlugin({
  env = process.env,
  exec = execFileAsync,
} = {}) {
  try {
    await exec(
      "openclaw",
      [
        "plugins",
        "install",
        PACKAGE_NAME,
        "--dangerously-force-unsafe-install",
      ],
      { env },
    );

    return {
      ok: true,
      target: "openclaw",
      action: "installed",
      package: PACKAGE_NAME,
      plugin_id: PLUGIN_ID,
      restart_command: "openclaw gateway restart",
    };
  } catch (error) {
    if (!isPluginAlreadyInstalledError(error)) {
      throw error;
    }

    await exec("openclaw", ["plugins", "update", PLUGIN_ID], { env });
    return {
      ok: true,
      target: "openclaw",
      action: "updated",
      package: PACKAGE_NAME,
      plugin_id: PLUGIN_ID,
      restart_command: "openclaw gateway restart",
    };
  }
}
