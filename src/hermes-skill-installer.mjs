import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@sonim1/preqstation-dispatcher";
const SKILL_NAME = "preq_dispatch";
const TARGET = "hermes";
const BUNDLED_SKILL_FILE = fileURLToPath(
  new URL("../hermes-skills/preqstation/preq_dispatch/SKILL.md", import.meta.url),
);
const PACKAGE_JSON_FILE = fileURLToPath(new URL("../package.json", import.meta.url));

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getHermesHome(env = process.env) {
  return env.PREQSTATION_HERMES_HOME || env.HERMES_HOME || path.join(os.homedir(), ".hermes");
}

function getSkillPaths(env = process.env) {
  const skillDir = path.join(
    getHermesHome(env),
    "skills",
    "preqstation",
    SKILL_NAME,
  );
  return {
    skillDir,
    skillFile: path.join(skillDir, "SKILL.md"),
    metadataFile: path.join(skillDir, ".preqstation-dispatcher.json"),
  };
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readPackageVersion() {
  const pkg = await readJsonFile(PACKAGE_JSON_FILE);
  return pkg.version;
}

async function readInstalledSkill(skillFile) {
  return fs.readFile(skillFile, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  });
}

async function readMetadata(metadataFile) {
  return readJsonFile(metadataFile).catch((error) => {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  });
}

function backupSuffix() {
  return new Date().toISOString().replace(/\D/gu, "").slice(0, 14);
}

async function writeSkillInstall({ skillDir, skillFile, metadataFile, content, metadata }) {
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(`${skillFile}.tmp`, content, "utf8");
  await fs.rename(`${skillFile}.tmp`, skillFile);
  await fs.writeFile(
    `${metadataFile}.tmp`,
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(`${metadataFile}.tmp`, metadataFile);
}

export async function getHermesSkillStatus({ env = process.env } = {}) {
  const { skillDir, skillFile, metadataFile } = getSkillPaths(env);
  const bundledContent = await fs.readFile(BUNDLED_SKILL_FILE, "utf8");
  const bundledSha = sha256(bundledContent);
  const installedContent = await readInstalledSkill(skillFile);

  if (installedContent === null) {
    return {
      ok: true,
      target: TARGET,
      installed: false,
      current: false,
      user_modified: false,
      skill_file: skillFile,
      metadata_file: metadataFile,
    };
  }

  const metadata = await readMetadata(metadataFile);
  const installedSha = sha256(installedContent);
  const userModified = Boolean(metadata?.sha256 && installedSha !== metadata.sha256);

  return {
    ok: true,
    target: TARGET,
    installed: true,
    current: installedSha === bundledSha,
    user_modified: userModified || (!metadata && installedSha !== bundledSha),
    skill_file: skillFile,
    metadata_file: metadataFile,
    installed_version: metadata?.version ?? null,
    installed_sha256: installedSha,
    bundled_sha256: bundledSha,
    skill_dir: skillDir,
  };
}

export async function syncHermesSkill({ env = process.env, force = false } = {}) {
  const { skillDir, skillFile, metadataFile } = getSkillPaths(env);
  const packageVersion = await readPackageVersion();
  const bundledContent = await fs.readFile(BUNDLED_SKILL_FILE, "utf8");
  const bundledSha = sha256(bundledContent);
  const installedContent = await readInstalledSkill(skillFile);
  const metadata = await readMetadata(metadataFile);
  const installedSha = installedContent === null ? null : sha256(installedContent);
  const userModified = Boolean(
    installedContent !== null &&
      ((metadata?.sha256 && installedSha !== metadata.sha256) ||
        (!metadata && installedSha !== bundledSha)),
  );

  if (installedContent !== null && installedSha === bundledSha && !userModified) {
    const nextMetadata = {
      package: PACKAGE_NAME,
      version: packageVersion,
      source: "bundled",
      skill: SKILL_NAME,
      sha256: bundledSha,
      installedAt: new Date().toISOString(),
    };
    await writeSkillInstall({
      skillDir,
      skillFile,
      metadataFile,
      content: bundledContent,
      metadata: nextMetadata,
    });
    return {
      ok: true,
      target: TARGET,
      action: "already_current",
      skill_file: skillFile,
      metadata_file: metadataFile,
      version: packageVersion,
      sha256: bundledSha,
    };
  }

  if (userModified && !force) {
    throw new Error(
      "Hermes skill has local changes. Run `preqstation-dispatcher sync hermes --force` to back up and replace it.",
    );
  }

  let backupFile = null;
  if (installedContent !== null && force) {
    backupFile = `${skillFile}.bak-${backupSuffix()}`;
    await fs.copyFile(skillFile, backupFile);
  }

  const metadataNext = {
    package: PACKAGE_NAME,
    version: packageVersion,
    source: "bundled",
    skill: SKILL_NAME,
    sha256: bundledSha,
    installedAt: new Date().toISOString(),
  };
  await writeSkillInstall({
    skillDir,
    skillFile,
    metadataFile,
    content: bundledContent,
    metadata: metadataNext,
  });

  return {
    ok: true,
    target: TARGET,
    action: installedContent === null ? "installed" : "updated",
    skill_file: skillFile,
    metadata_file: metadataFile,
    version: packageVersion,
    sha256: bundledSha,
    ...(backupFile ? { backup_file: backupFile } : {}),
  };
}
