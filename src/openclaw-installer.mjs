import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@sonim1/preqstation-dispatcher";
const PLUGIN_ID = "preqstation-dispatcher";
const PACKAGE_JSON_FILE = fileURLToPath(new URL("../package.json", import.meta.url));

function isPluginAlreadyInstalledError(error) {
  const message =
    typeof error?.stderr === "string" && error.stderr
      ? error.stderr
      : error instanceof Error
        ? error.message
        : String(error);
  return /plugin already exists/i.test(message);
}

function isPluginNotInstalledError(error) {
  const message =
    typeof error?.stderr === "string" && error.stderr
      ? error.stderr
      : error instanceof Error
        ? error.message
        : String(error);
  return /not found|no plugin|unknown plugin/i.test(message);
}

async function readPackageVersion() {
  const pkg = JSON.parse(await fs.readFile(PACKAGE_JSON_FILE, "utf8"));
  return pkg.version;
}

function parsePublishedPackageVersion(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" && parsed.trim() ? parsed.trim() : null;
  } catch {
    return text.split(/\r?\n/u)[0]?.trim() || null;
  }
}

async function readPublishedPackageVersion({
  env = process.env,
  exec = execFileAsync,
} = {}) {
  try {
    const result = await exec("npm", ["view", PACKAGE_NAME, "version", "--json"], { env });
    return parsePublishedPackageVersion(result?.stdout ?? "");
  } catch {
    return null;
  }
}

function parseInstalledPluginVersion(stdout) {
  const text = String(stdout || "");
  const recordedMatch = text.match(/Recorded version:\s+(\S+)/iu);
  if (recordedMatch) {
    return recordedMatch[1];
  }
  const versionMatch = text.match(/Version:\s+(\S+)/iu);
  if (versionMatch) {
    return versionMatch[1];
  }
  return null;
}

export async function installOpenClawPlugin({
  env = process.env,
  exec = execFileAsync,
  updateOnly = false,
} = {}) {
  const localPackageVersion = await readPackageVersion();
  const packageVersion =
    (await readPublishedPackageVersion({
      env,
      exec,
    })) || localPackageVersion;
  const localVersionDetails =
    localPackageVersion !== packageVersion
      ? { local_package_version: localPackageVersion }
      : {};
  try {
    const inspectResult = await exec("openclaw", ["plugins", "inspect", PLUGIN_ID], { env });
    const installedVersion = parseInstalledPluginVersion(inspectResult?.stdout ?? "");
    if (installedVersion && installedVersion === packageVersion) {
      return {
        ok: true,
        target: "openclaw",
        action: "already_current",
        package: PACKAGE_NAME,
        plugin_id: PLUGIN_ID,
        restart_command: "openclaw gateway restart",
        installed_version: installedVersion,
        package_version: packageVersion,
        ...localVersionDetails,
      };
    }

    await exec("openclaw", ["plugins", "update", PLUGIN_ID], { env });
    return {
      ok: true,
      target: "openclaw",
      action: "updated",
      package: PACKAGE_NAME,
      plugin_id: PLUGIN_ID,
      restart_command: "openclaw gateway restart",
      installed_version: installedVersion,
      package_version: packageVersion,
      ...localVersionDetails,
    };
  } catch (inspectError) {
    if (!isPluginNotInstalledError(inspectError)) {
      throw inspectError;
    }
    if (updateOnly) {
      return {
        ok: true,
        target: "openclaw",
        action: "not_installed",
        package: PACKAGE_NAME,
        plugin_id: PLUGIN_ID,
        restart_command: "openclaw gateway restart",
        package_version: packageVersion,
        ...localVersionDetails,
      };
    }
  }

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
      package_version: packageVersion,
      ...localVersionDetails,
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
      package_version: packageVersion,
      ...localVersionDetails,
    };
  }
}
