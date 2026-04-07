# preqstation-openclaw

OpenClaw production dispatcher surface for PREQSTATION task execution.

Current surface version: `0.1.1` (see [`VERSION`](/Users/kendrick/projects/preqstation-openclaw/VERSION)).

This repository is intentionally OpenClaw-specific again. It should stay small and contain only:

- the OpenClaw-facing `preqstation-dispatch` skill
- the sample `MEMORY.md` schema for project path mappings

The Claude plugin, PREQ `/mcp` OAuth client helpers, and the experimental local Claude dispatch channel runtime now live in `preqstation-skill`.

## How to use

Just talk to OpenClaw in natural language.

You do not need to write fixed flags or a `preqstation:` prefix.

OpenClaw should use this skill when your request is about PREQSTATION task execution or running work in a mapped project.

If your message includes `preq` or `preqstation`, this skill should be prioritized.

Explicit command form:

- `/skill preqstation-dispatch ...`
- `!/skill preqstation-dispatch ...` for Telegram relays

## Execution mode

Worktree-first execution is the default.

- resolve `project_cwd` from user input or OpenClaw agent memory
- create a per-task git worktree and use it as execution `<cwd>`
- write the full PREQ prompt to `<cwd>/.preqstation-prompt.txt`
- launch the engine with a short bootstrap prompt that tells it to read `./.preqstation-prompt.txt`
- launch engine commands with `pty:true` and explicit `workdir:<cwd>`
- launch with `background:true` by default (foreground only when user explicitly asks for blocking/synchronous run)
- monitor background sessions with `process action:poll` and `process action:log`
- delegate PREQ lifecycle branching, status transitions, and `preq_*` tool usage to the core `preqstation` skill

## Progress mode

Status updates support two modes:

- `sparse` (default): start + state-change updates only. Primary goal is token/cost reduction.
- `live`: state-change updates + periodic working updates for close monitoring.

How users can mention this in a message:

- `Run PRJ-284 with progress live`
- `Start this in sparse updates mode`

## Context compaction

OpenClaw conversation context can accumulate tokens over long runs.

- Prefer `sparse` unless close monitoring is required.
- Send short milestone checkpoints instead of repeated logs.
- If the thread gets too long, post one compaction summary and continue in the same thread/session whenever possible.

## Natural language examples

1. `Start PRJ-284 in the example project using Claude Code.`
2. `Use Codex to fix README command examples in the example project.`
3. `Use Gemini CLI to draft notes for DOC-12 in the example project.`
4. `Update the example project path to /<absolute-path>/projects/example-project.`
5. `Implement API pagination and add tests in the example project.`
6. `What is currently running in OpenClaw sessions?`
7. `Show progress for session openclaw-claude-20260221-131240.`

Optional structured fields in the same message:

- `branch_name="<git-branch>"`
- `qa_run_id="<run-id>"`
- `qa_task_keys="<task-1,task-2,...>"`
- during QA dispatch, agents with the `dogfood` skill installed should use it as the default browser QA workflow

## Engine selection rules

- explicit engine in message: use it (`claude-code`, `codex`, `gemini-cli`)
- if omitted: default to `claude-code`

Execution uses separate concepts:

- workflow status: `inbox`, `todo`, `hold`, `ready`, `done`, `archived`
- execution state: `queued`, `working`, or `null`
- local CLI binary map: `claude-code -> claude`, `codex -> codex`, `gemini-cli -> gemini`

## Workspace path resolution

Execution needs two paths:

- `project_cwd`: primary checkout path
- `cwd`: per-task worktree path used for actual engine execution

Resolve in this order:

1. absolute path directly mentioned in message
2. project key from OpenClaw agent memory
3. task prefix key match in OpenClaw agent memory (when available)

Use [`MEMORY.md`](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md) in this repo only as a sample format reference.

If path cannot be resolved, ask the user for the absolute path, then save the confirmed mapping to OpenClaw agent memory.

After `project_cwd` is resolved, create task worktree `cwd`:

- default root: `${OPENCLAW_WORKTREE_ROOT:-/tmp/openclaw-worktrees}`
- branch naming priority:
  1. use message `branch_name` when provided
  2. fallback to `preqstation/<project_key>`
- if provided `branch_name` does not include project key, normalize to `preqstation/<project_key>/<branch_name>`
- QA dispatch may omit task id and use `project_key` + `qa_run_id` instead; keep both fields in `.preqstation-prompt.txt`
- when provided, keep `qa_task_keys` in `.preqstation-prompt.txt` as the ordered Ready-task QA scope
- worktree directory naming: `<worktree_root>/<project_key>/<branch_slug>` where `branch_slug` is `branch_name` with `/` replaced by `-`
- if the requested branch is already active only in the primary checkout, never reuse `project_cwd` as `cwd`; create a detached worktree from that branch instead, which is the expected path for QA on `main` or other canonical branches
- after worktree creation, symlink runtime local env files from `project_cwd` into `cwd` when they exist in the primary checkout, such as `.env`, `.env.local`, and `.env.*.local`; do not treat committed templates like `.env.example`, `.env.sample`, or `.env.template` as symlink targets; apply this only inside auxiliary worktrees, never against `project_cwd` itself; if the target path in `cwd` already exists as a regular file for a required local env file, stop and report failure instead of overwriting it
- run all coding-agent commands inside this worktree `cwd` (never in primary checkout)

## MEMORY.md usage

[`MEMORY.md`](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md) shows the sample schema for project path mappings. The user's real mappings should live in OpenClaw agent memory.

- keep keys short and stable
- use absolute paths only
- save confirmed mappings to agent memory when paths change

## Expected output

Success:

`completed: <task or N/A> via <engine> at <cwd>`

Failure:

`failed: <task or N/A> via <engine> at <cwd or N/A> - <short reason>`

## Background session controls

When using `background:true`, use process actions:

- `process action:list`
- `process action:poll sessionId:<id>`
- `process action:log sessionId:<id>`
- `process action:write sessionId:<id> data:"..."`
- `process action:submit sessionId:<id> data:"..."`
- `process action:kill sessionId:<id>` (only when required)

## Updates

For the OpenClaw production dispatcher surface, update this repository in place:

```bash
git pull origin main
```

If you need the Claude plugin, PREQ `/mcp` OAuth client, or experimental Claude dispatch runtime, update `preqstation-skill` instead.

## Responsibility boundary

- OpenClaw: messenger routing, permissions, webhook/channel integration
- This repo: OpenClaw dispatcher skill and prompt template
- `preqstation-skill`: Claude plugin, PREQ MCP/OAuth helpers, and experimental Claude dispatch channel runtime
