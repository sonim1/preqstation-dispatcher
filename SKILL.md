---
name: preqstation
description: "Delegate PREQSTATION coding tasks to Claude Code, Codex CLI, or Gemini CLI with PTY-safe execution (workdir + background + monitoring). Use when building, refactoring, or reviewing code in mapped workspaces. NOT for one-line edits or read-only inspection."
metadata: {"openclaw":{"requires":{"anyBins":["claude","codex","gemini"]}}}
---

# preqstation

Execute PREQSTATION tasks with local CLI engines.

## Trigger / NOT for

Trigger when message contains: `/skill preqstation`, `!/skill preqstation`, `preqstation`, `preq`

Note: Telegram channels use `!` prefix instead of `/` (e.g. `!/skill preqstation implement PROJ-1`). Treat `!/skill` identically to `/skill`.

Do NOT use for: one-line edits, read-only inspection, launches inside `~/clawd/` or `~/.openclaw/`.

## Hard rules

1. Always `pty:true` + `background:true` (foreground only if user explicitly asks).
2. Respect requested engine; default `claude`.
3. Never launch in `~/clawd/`, `~/.openclaw/`, or primary checkout paths.
4. Always create a git worktree before launching; scope execution to worktree only.
5. Worktree branch names must include the resolved project key.
6. Run preflight checks (`command -v git`, `command -v <engine>`) before launch.
7. Use `dangerously-*` / sandbox-disable flags only in resolved task worktrees.
8. Planning/read-only requests: do not launch engine commands.

## Input interpretation

Parse from user message:

1. `engine` — `claude` | `codex` | `gemini` (default: `claude`)
2. `task` — first token matching `<KEY>-<number>` (e.g. `PRJ-284`)
3. `branch_name` — parse from `branch_name=<value>` or `branch=<value>`; normalize lowercase, replace whitespace with `-`; if missing project_key prefix with `preqstation/<project_key>/`
4. `project_cwd` — absolute path from message, or resolve from `MEMORY.md` by project key; if unresolved, ask user
5. `objective` — user request as execution objective
6. `cwd` — worktree path: `<worktree_root>/<project_key>/<branch_slug>`
7. `progress_mode` — `sparse` (default) or `live` (if user says `live`/`realtime`/`detailed`)

## MEMORY.md

- Read `MEMORY.md` `Projects` table (`key | cwd | note`) from repo root.
- Match project keys by exact match only (case-insensitive).
- Task prefix = candidate key (e.g. `PROS-102` → `pros`).
- If cwd is `TBD` or missing: ask user for the absolute path, update `MEMORY.md`, then continue.
- Format: `| <key> | <absolute-path> | <note> |`, one row per key, lowercase kebab-case.

## Worktree-first execution

1. Branch name: parsed `branch_name` → fallback `preqstation/<project_key>`. Reject unsafe names (`..`, leading `/`).
2. Worktree path: `<worktree_root>/<project_key>/<branch_slug>` (slug = branch with `/` → `-`).
3. Create: `git -C <project_cwd> worktree add -b <branch_name> <cwd> HEAD` (or without `-b` for existing branch).

## Prompt template

Do not forward raw user text. Render this template with `<cwd>` as the worktree path:

```text
Task ID: <task or N/A>
Project Key: <project key or N/A>
Branch Name: <branch_name or N/A>
Skill: preqstation (use preq_* MCP tools for task lifecycle)
User Objective: <objective>

Execution Requirements:
1) Work only inside <cwd>.
2) Use branch <branch_name> for commits/pushes when provided.
3) Call preq_get_task("<task>") for task details and status.
4) Call preq_get_project_settings("<project_key>") for deploy strategy.
5) Follow task status workflow:
   - inbox → preq_plan_task (plan only, do not implement)
   - todo → preq_start_task → implement → deploy per strategy → preq_complete_task
   - in_progress → continue → deploy per strategy → preq_complete_task
   - review → verify (tests, build, lint) → preq_review_task
   - failure → preq_block_task with reason
6) Worktree cleanup after all work:
   git -C <project_cwd> worktree remove <cwd> --force
   git -C <project_cwd> worktree prune
7) When finished: openclaw system event --text "Done: <brief summary>" --mode now
```

## Engine commands

```bash
# Claude Code
bash pty:true workdir:<cwd> background:true command:"claude --dangerously-skip-permissions '<rendered_prompt>'"

# Codex CLI
bash pty:true workdir:<cwd> background:true command:"codex exec --dangerously-bypass-approvals-and-sandbox '<rendered_prompt>'"

# Gemini CLI
bash pty:true workdir:<cwd> background:true command:"GEMINI_SANDBOX=false gemini -p '<rendered_prompt>'"
```

PR review: always in worktree, never primary checkout.

## Output

- Progress: update on state change only (start, milestone, error, completion). Live mode adds heartbeat.
- Success: `completed: <task or N/A> via <engine> at <cwd>`
- Failure: `failed: <task or N/A> via <engine> at <cwd or N/A> - <short reason>`
