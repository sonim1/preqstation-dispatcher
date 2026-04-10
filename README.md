# preqstation-openclaw

OpenClaw plugin for PREQSTATION dispatch.

Current surface version: `0.1.8` (see [VERSION](/Users/kendrick/projects/preqstation-openclaw/VERSION)).

This repo now contains a real native OpenClaw plugin surface again:

- [openclaw.plugin.json](/Users/kendrick/projects/preqstation-openclaw/openclaw.plugin.json)
- [package.json](/Users/kendrick/projects/preqstation-openclaw/package.json)
- [index.mjs](/Users/kendrick/projects/preqstation-openclaw/index.mjs)
- [SKILL.md](/Users/kendrick/projects/preqstation-openclaw/SKILL.md)
- [MEMORY.md](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md)

`preqstation-skill` remains the Claude Code side. This repo is the OpenClaw side.

## What it does

The plugin intercepts PREQ dispatch messages with the OpenClaw `before_dispatch` hook and handles them before the normal chat run.

Current flow:

1. parse a PREQ dispatch message such as `!/skill preqstation-dispatch plan PROJ-327 using codex`
2. resolve `project_cwd` from an explicit absolute path, a saved plugin mapping, the shared `~/.preqstation-dispatch/projects.json` store, or [MEMORY.md](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md)
3. create or reuse an auxiliary git worktree under `~/.openclaw-preq-worktrees`
4. write `.preqstation-prompt.txt` into that worktree
5. create a managed Task Flow record and park it in waiting with detached process metadata
6. launch the selected CLI as a detached process

This is intentionally not the old PTY/background session model. The plugin does not rely on OpenClaw `background:true` exec or `process action:poll` / `process action:log` for the dispatched coding run.

## Why this exists

Telegram chat runs were creating the worktree and prompt correctly, then dying when late PTY output tried to re-enter a finished run. This plugin avoids that coupling by letting the plugin own dispatch and by launching the coding CLI outside the current chat run.

## Install

Default install from npm:

```bash
openclaw plugins install @sonim1/preqstation-openclaw --dangerously-force-unsafe-install
openclaw gateway restart
```

This plugin intentionally uses `child_process` to create git worktrees and launch detached coding CLIs, so current OpenClaw builds require `--dangerously-force-unsafe-install` even for the npm package.

Local linked install for active development:

```bash
openclaw plugins install --link --dangerously-force-unsafe-install /Users/kendrick/projects/preqstation-openclaw
openclaw gateway restart
```

If you are on a newer OpenClaw that blocks copied installs because this plugin uses detached local CLI launch, reinstall with:

```bash
openclaw plugins install --force --dangerously-force-unsafe-install /Users/kendrick/projects/preqstation-openclaw
openclaw gateway restart
```

Useful checks:

```bash
openclaw plugins inspect preqstation-openclaw
openclaw status --all
```

## Publishing

Pushes to `main` run `.github/workflows/publish.yml`, test the package, and publish to npm automatically.

Release behavior:

- if the current `package.json` version is not on npm yet, the workflow publishes it as-is
- if that version already exists on npm, the workflow automatically bumps a patch version, syncs [VERSION](/Users/kendrick/projects/preqstation-openclaw/VERSION), commits the bump back to `main`, and publishes the new version
- the follow-up run triggered by that bump commit is skipped because the actor is `github-actions[bot]`

One-time setup before the first release:

- add an `NPM_TOKEN` repository secret, or
- configure npm trusted publishing for `sonim1/preqstation-openclaw`

The workflow is ready for both: it grants `id-token: write` for trusted publishing and also passes `NODE_AUTH_TOKEN` when `NPM_TOKEN` is configured.

## Configuration

The plugin manifest exposes two optional config fields:

- `memoryPath`
- `projects`
- `worktreeRoot`

Example config snippet:

```json
{
  "plugins": {
    "entries": {
      "preqstation-openclaw": {
        "enabled": true,
        "config": {
          "memoryPath": "/Users/kendrick/projects/preqstation-openclaw/MEMORY.md",
          "worktreeRoot": "/Users/kendrick/.openclaw-preq-worktrees"
        }
      }
    }
  }
}
```

If `memoryPath` is omitted, the plugin reads repo-local [MEMORY.md](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md).

## Setup

After install, prefer the OpenClaw-native bulk setup command:

```text
/preqsetup auto PROJ=https://github.com/sonim1/projects-manager AGAL=https://github.com/sonim1/agalog
```

Useful setup commands:

```text
/preqsetup
/preqsetup auto
/preqsetup import
/preqsetup set <PROJECT_KEY> <ABSOLUTE_PATH>
/preqsetup status
/preqsetup unset PROJ
```

Example:

```text
/preqsetup auto PROJ=https://github.com/sonim1/projects-manager AGAL=https://github.com/sonim1/agalog
```

`/preqsetup auto` scans local git repos under `PREQSTATION_REPO_ROOTS` when set, otherwise under `~/projects`, matches each repo's `origin` remote against the provided repo URL, and stores successful matches in `plugins.entries.preqstation-openclaw.config.projects`.

If you already ran Claude-side `/preqstation:setup`, OpenClaw can still reuse the shared mapping file at `~/.preqstation-dispatch/projects.json`.

- `/preqsetup auto` is the recommended path when OpenClaw should own project-path management itself
- `/preqsetup import` validates every shared mapping it finds there and copies the valid ones into `plugins.entries.preqstation-openclaw.config.projects`
- `/preqsetup set ...` still lets you override or add one mapping manually

## Command shape

Supported trigger styles:

- `/skill preqstation-dispatch plan PROJ-327 using codex`
- `/skill preqstation-dispatch ask PROJ-328 using codex ask_hint="Acceptance criteria 중심으로 정리해줘"`
- `!/skill preqstation-dispatch implement PROJ-327 using claude branch_name="task/proj-327/browser-notification-chuga"`
- `preqstation implement PROJ-327 with codex`
- `preqstation implement PROJ-327 in /absolute/path/to/repo with codex`

Parsed fields:

- engine
- task key
- project key
- objective
- optional `branch_name=...`
- optional `ask_hint=...`

Project path resolution priority:

1. explicit absolute path in the dispatch message
2. `/preqsetup`-saved mapping in plugin config
3. shared `~/.preqstation-dispatch/projects.json`
4. fallback [MEMORY.md](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md)

## Detached runtime

The plugin writes `.preqstation-prompt.txt` and launches the engine with a short bootstrap prompt that tells it to read that file.

Detached process artifacts live inside the worktree:

- `.preqstation-dispatch/<engine>.pid`
- `.preqstation-dispatch/<engine>.log`

Current detached codex launch uses:

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop."
```

Claude Code and Gemini CLI use the same bootstrap idea with their own binaries.

Ask dispatch now follows the same contract as the worker skill: the run still updates the note, but prototype-style asks may generate local artifacts and may publish them only through a safe private provider using `private-or-skip`.

## Current limitations

- Completion emergence back into the original chat thread is not wired yet.
- The plugin currently resolves project mappings from explicit paths, plugin config, the shared `~/.preqstation-dispatch/projects.json`, or [MEMORY.md](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md), not from OpenClaw agent memory.
- Detached process logs are written to the worktree and are not streamed live into Telegram.

Those are deliberate tradeoffs for the first pass: stable dispatch first, richer emergence later.
