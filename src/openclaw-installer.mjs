import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@sonim1/preqstation-dispatcher";

export async function installOpenClawPlugin({ env = process.env } = {}) {
  await execFileAsync(
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
    restart_command: "openclaw gateway restart",
  };
}
