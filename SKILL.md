---
name: preqstation-dispatch
description: "Dispatch PREQSTATION planning, coding, and review tasks from OpenClaw to Claude Code, Codex CLI, or Gemini CLI with PTY-safe execution (workdir + background + monitoring). Use when planning, building, refactoring, or reviewing code in mapped workspaces with engine keys like claude-code, codex, or gemini-cli. NOT for one-line edits or generic read-only inspection."
metadata:
  { "openclaw": { "requires": { "anyBins": ["claude", "codex", "gemini"] } } }
---

# preqstation-dispatch

Execute PREQSTATION tasks with local CLI engines.

## Trigger / NOT for

Trigger when message contains: /skill preqstation-dispatch, !/skill preqstation-dispatch, preqstation, preq

Note: Telegram channels use ! prefix instead of / (e.g. !/skill preqstation-dispatch implement PROJ-1). Treat !/skill identically to /skill.

Do NOT use for: one-line edits, generic read-only inspection, launches inside ~/clawd/ or ~/.openclaw/.

## Hard rules

1. Always pty:true + background:true (foreground only if user explicitly asks).
2. Respect requested engine key; default `claude-code`.
3. Never launch in ~/clawd/, ~/.openclaw/, or primary checkout paths.
4. Always create a git worktree before launching; scope execution to worktree only.
5. Worktree branch names must include the resolved project key.
6. Run preflight checks (command -v git, command -v <engine>) before launch.
7. Use dangerously-\* / sandbox-disable flags only in resolved task worktrees.
8. Planning requests still launch the requested engine in the resolved worktree. Only generic read-only inspection requests should skip engine launch.

## Input interpretation

Parse from user message:

1. engine — `claude-code` | `codex` | `gemini-cli` (default: `claude-code`)
2. task — first token matching <KEY>-<number> (e.g. PRJ-284)
3. branch_name — parse from branch_name=<value> or branch=<value>; normalize lowercase, replace whitespace with -; if missing project_key prefix with preqstation/<project_key>/
4. project_cwd — absolute path from message, or resolve from OpenClaw agent memory by project key. Use `MEMORY.md` in this repo only as a sample format reference. If unresolved, ask the user for the absolute path and save the confirmed mapping to agent memory.
5. objective — user request as execution objective
6. cwd — worktree path: <worktree_root>/<project_key>/<branch_slug>
7. progress_mode — sparse (default) or live (if user says live/realtime/detailed)

## MEMORY.md

- Treat `MEMORY.md` in this repo as an example schema, not the user's live registry.
- Use OpenClaw agent memory for actual project key -> cwd mappings.
- Match project keys by exact match only (case-insensitive).
- Task prefix = candidate key (e.g. PROS-102 → pros).
- If a mapping is missing or unresolved: ask the user for the absolute path. Once confirmed, save it to agent memory, then continue.
- Sample format: | <key> | <absolute-path-or-TBD> | <note> |, one row per key, lowercase kebab-case.

## Worktree-first execution

1. Branch name: parsed branch_name → fallback preqstation/<project_key>. Reject unsafe names (.., leading /).
2. Worktree path: <worktree_root>/<project_key>/<branch_slug> (slug = branch with / → -).
3. Create: git -C <project_cwd> worktree add -b <branch_name> <cwd> HEAD (or without -b for existing branch).
4. Render the full PREQ prompt into `<cwd>/.preqstation-prompt.txt` before launching the engine.

## Prompt template

Do not forward raw user text. Render this template into `<cwd>/.preqstation-prompt.txt` after the worktree is created.

**Hard rule (prompt transport):** Always write the full PREQ prompt to `<cwd>/.preqstation-prompt.txt`, then launch the CLI with a short bootstrap prompt that tells it to read `./.preqstation-prompt.txt` inside the current workspace. Do NOT pass the full PREQ prompt via argv or stdin.

`text
Task ID: <task or N/A>
Project Key: <project key or N/A>
Branch Name: <branch*name or N/A>
Lifecycle Skill: preqstation (use preq*\* MCP tools for task lifecycle)
User Objective: <objective>

Execution Requirements:

1. Work only inside <cwd>.
2. Use branch <branch_name> for commits/pushes when provided.
3. If Task ID is present, your first lifecycle action must be `preq_get_task("<task_id>")` before asking the user for task text, before planning, and before implementation. Use the fetched task as the source of truth for title, description, acceptance criteria, and status.
4. Must follow the Execution Flow in the PREQSTATION MCP skill.
5. Do not ask the user to paste the task card text or `preq_get_task` output when `preq_get_task("<task_id>")` is available. Ask only if the tool call itself fails or PREQ tools are unavailable.
6. Use the preqstation lifecycle skill as the single source of truth for PREQ task rules, status transitions, deploy handling, and preq\_\* tool usage. Do not restate or override that workflow here.
7. Worktree cleanup after all work:
   git -C <project_cwd> worktree remove <cwd> --force
   git -C <project_cwd> worktree prune
8. When finished: openclaw system event --text "Done: <brief summary>" --mode now

## Engine commands

bash

# Bootstrap prompt (same idea for all engines):

# "Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work."

# Claude Code

bash pty:true workdir:<cwd> background:true command:"claude --dangerously-skip-permissions \"Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work.\""

# Codex CLI

bash pty:true workdir:<cwd> background:true command:"codex exec --dangerously-bypass-approvals-and-sandbox \"Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work.\""

# Gemini CLI

bash pty:true workdir:<cwd> background:true command:"GEMINI_SANDBOX=false gemini -p \"Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work.\""
`

PR review: always in worktree, never primary checkout.

## Output

- Progress: update on state change only (start, milestone, error, completion). Live mode adds heartbeat.
- Success: `completed: <task or N/A> via <engine> at <cwd>`
- Failure: `failed: <task or N/A> via <engine> at <cwd or N/A> - <short reason>`

```

```
