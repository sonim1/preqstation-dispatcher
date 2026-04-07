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

## Hard rules (ordered by priority)

1. **Dispatcher only** — resolve paths, prepare worktree, render prompt, launch engine. Never plan, implement, or review code yourself.
2. **Worktree isolation** — all engine execution must happen in a resolved worktree. Never launch in `~/clawd/`, `~/.openclaw/`, or primary checkout paths.
3. **Verify before launch** — confirm `<cwd>` exists on disk and preflight checks pass (`command -v git`, `command -v <engine>`) before launching. If either fails, stop and report.
4. **No fallback dirs** — if worktree creation fails or launcher reports a fallback workdir, stop and report failure. Do not silently continue elsewhere.
5. **Prompt via file** — write full PREQ prompt to `<cwd>/.preqstation-prompt.txt`, launch engine with a short bootstrap that reads it. Never pass full prompt via argv/stdin.
6. **PTY + background by default** — always `pty:true background:true` unless user explicitly requests foreground.
7. **Sandbox-disable flags in worktrees only** — `dangerously-*` / `sandbox-disable` flags are permitted only inside resolved task worktrees.

## Input interpretation

Parse from user message:

1. engine — `claude-code` | `codex` | `gemini-cli`
2. task — first token matching <KEY>-<number> (e.g. PRJ-284); may be absent for branch-level QA
3. project_key — from task prefix when task exists, otherwise first standalone token matching <KEY>
4. branch_name — parse from branch_name=<value> or branch=<value>; normalize lowercase, replace whitespace with -; if missing project_key prefix with preqstation/<project_key>/
5. qa_run_id — parse from qa_run_id=<value> when present
6. qa_task_keys — parse from qa_task_keys=<csv> when present; preserve listed order and keep raw task keys
7. project_cwd — Read Project Path Resolution section
8. objective — user request as execution objective
9. cwd — worktree path: <worktree_root>/<project_key>/<branch_slug>
10. progress_mode — sparse (default) or live (if user says live/realtime/detailed)

## Project Path Resolution

- `MEMORY.md` is an example schema only — actual mappings live in OpenClaw agent memory.
- Infer project key from task prefix (e.g. `PROS-102` → `pros`, case-insensitive exact match)
- If mapping is missing, ask the user for the absolute path, then save to agent memory
- Format: `| <key> | <absolute-path-or-TBD> | <note> |` (lowercase kebab-case, one row per key)

## Worktree-first execution

1. Branch name: parsed branch_name → fallback preqstation/<project_key>. Reject unsafe names (.., leading /).
2. Candidate worktree path: <worktree_root>/<project_key>/<branch_slug> (slug = branch with / → -).
3. Inspect `git -C <project_cwd> worktree list --porcelain`. Reuse an existing auxiliary worktree only when the matching path is not `<project_cwd>`. Never reuse the primary checkout as `<cwd>`.
4. If `<branch_name>` is already checked out only in `<project_cwd>`, create a detached worktree instead: `git -C <project_cwd> worktree add --detach <cwd> <branch_name>`. This is the expected path for branch-level QA on `main` or other canonical branches.
5. If no reusable auxiliary worktree matches and `<branch_name>` is not active in `<project_cwd>`, create `<cwd>` normally with `git -C <project_cwd> worktree add -b <branch_name> <cwd> HEAD` (or without `-b` for an existing branch that is not active elsewhere).
6. Verify `<cwd>` exists on disk and is not equal to `<project_cwd>` before writing files or launching the engine. If either check fails, stop instead of launching.
7. For each local env file in `<project_cwd>` intended for runtime overrides (for example `.env`, `.env.local`, `.env.development.local`, `.env.test.local`), ensure `<cwd>/<name>` is a symlink to the primary checkout. Do not treat committed templates such as `.env.example`, `.env.sample`, or `.env.template` as symlink targets. This rule applies only inside an auxiliary worktree, never against `<project_cwd>` itself. If `<cwd>/<name>` already exists as a regular file for a required local env file, stop and report failure instead of overwriting it. If it is missing or already a symlink, refresh it with `ln -sfn`.
8. Always overwrite `<cwd>/.preqstation-prompt.txt` with a freshly rendered PREQ prompt for the current dispatch, even when reusing an existing worktree.
9. Launch the engine with `workdir:<cwd>` only after step 7 succeeds.

## Prompt template

Do not forward raw user text. Render this template into `<cwd>/.preqstation-prompt.txt` after the worktree is created.

**Hard rule (prompt transport):** Always write the full PREQ prompt to `<cwd>/.preqstation-prompt.txt`, then launch the CLI with a short bootstrap prompt that tells it to read `./.preqstation-prompt.txt` inside the current workspace. Do NOT pass the full PREQ prompt via argv or stdin.

````text
Task ID: <task or N/A>
Project Key: <project key or N/A>
Branch Name: <branch_name or N/A>
QA Run ID: <qa_run_id or N/A>
QA Task Keys: <comma-separated task keys or N/A>
Lifecycle Skill: preqstation (use preq_* MCP tools for task lifecycle)
User Objective: <objective>

Execution Requirements:
1) Work only inside <cwd>.
2) Use branch <branch_name> for commits/pushes when provided.
3) If Task ID is present, your first lifecycle action must be `preq_get_task("<task_id>")` before asking the user for task text, before planning, and before implementation. Use the fetched task as the source of truth for title, description, acceptance criteria, and status.
4) If the fetched task is active (`inbox`, `todo`, `hold`, or `ready`), call `preq_start_task("<task_id>", "<engine>")` immediately after `preq_get_task` and before any planning, implementation, or verification so PREQSTATION records `run_state=working`. Telegram/OpenClaw dispatch may already have set `run_state=queued`.
5) Treat workflow status and execution state separately. Valid workflow statuses are `inbox`, `todo`, `hold`, `ready`, `done`, and `archived`. Valid `run_state` values are `queued`, `working`, and `null`. Do not emit legacy workflow statuses like `in_progress` or `review`.
6) Must follow the Execution Flow in the PREQSTATION MCP skill.
7) Do not ask the user to paste the task card text or `preq_get_task` output when `preq_get_task("<task_id>")` is available. Ask only if the tool call itself fails or PREQ tools are unavailable.
8) Use the preqstation lifecycle skill as the single source of truth for PREQ task rules, status transitions, deploy handling, and preq_* tool usage. Do not restate or override that workflow here.
9) If User Objective starts with `plan`, do not run tests, build, lint, or other verification commands. Read local code only enough to produce the plan and stop after `preq_plan_task`.
10) If User Objective starts with `qa`, Task ID may be `N/A`. In that branch, use `QA Run ID` as the external reporting handle, update it through the PREQSTATION skill, and do not invent a task lifecycle transition.
11) If User Objective starts with `qa` and `QA Task Keys` is present, call `preq_get_task` for each listed task key before browser testing. Treat those tasks' titles, descriptions, and acceptance criteria as the QA scope. Limit QA to those scoped Ready tasks plus the minimal navigation and sanity checks needed to reach and verify them. Report unrelated findings only when they block scoped verification or prevent the app from starting.
12) If the current agent has access to the `dogfood` skill, use it as the default QA workflow for browser testing and report generation.
13) If `./.preqstation-prompt.txt` is missing in the current workspace, stop and report a dispatch failure instead of improvising from another directory.
14) Worktree cleanup after all work:
   git -C <project_cwd> worktree remove <cwd> --force
   git -C <project_cwd> worktree prune
15) When finished: openclaw system event --text "Done: <brief summary>" --mode now

## Engine commands

bash
# Bootstrap prompt (same idea for all engines):
# "Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work. If User Objective is qa, use QA Run ID and QA Task Keys from that file, scope QA to those Ready tasks, and report through the PREQSTATION skill."

---

## The Pattern: workdir + background + pty

For longer tasks, use background mode with PTY:

```bash
# Start agent in target directory (with PTY!)
bash pty:true workdir:~/project background:true command:"codex exec --full-auto 'Build a snake game'"
# Returns sessionId for tracking

# Monitor progress
process action:log sessionId:XXX

# Check if done
process action:poll sessionId:XXX

# Send input (if agent asks a question)
process action:write sessionId:XXX data:"y"

# Submit with Enter (like typing "yes" and pressing Enter)
process action:submit sessionId:XXX data:"yes"

# Kill if needed
process action:kill sessionId:XXX
````

**Why workdir matters:** Agent wakes up in a focused directory, doesn't wander off reading unrelated files (like your soul.md 😅).

---

## Progress Updates (Critical)

When you spawn coding agents in the background, keep the user in the loop.

- Send 1 short message when you start (what's running + where).
- Then only update again when something changes:
  - a milestone completes (build finished, tests passed)
  - the agent asks a question / needs input
  - you hit an error or need user action
  - the agent finishes (include what changed + where)
- If you kill a session, immediately say you killed it and why.

This prevents the user from seeing only "Agent failed before reply" and having no idea what happened.

---

## Auto-Notify on Completion

For long-running background tasks, append a wake trigger to your prompt so OpenClaw gets notified immediately when the agent finishes (instead of waiting for the next heartbeat):

```
... your task here.

When completely finished, run this command to notify me:
openclaw system event --text "Done: [brief summary of what was built]" --mode now
```

---

# Claude Code

bash pty:true workdir:<cwd> background:true command:"claude --dangerously-skip-permissions \"Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work. If User Objective is qa, use QA Run ID and QA Task Keys from that file, scope QA to those Ready tasks, and report through the PREQSTATION skill.\""

# Codex CLI

bash pty:true workdir:<cwd> background:true command:"codex exec --dangerously-bypass-approvals-and-sandbox \"Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work. If User Objective is qa, use QA Run ID and QA Task Keys from that file, scope QA to those Ready tasks, and report through the PREQSTATION skill.\""

# Gemini CLI

bash pty:true workdir:<cwd> background:true command:"GEMINI_SANDBOX=false gemini -p \"Read and execute instructions from ./.preqstation-prompt.txt in the current workspace. Treat that file as the source of truth. If that file is missing, stop. If a Task ID is present there, call preq_get_task first, then preq_start_task before substantive work. If User Objective is qa, use QA Run ID and QA Task Keys from that file, scope QA to those Ready tasks, and report through the PREQSTATION skill.\""

```

PR review: always in worktree, never primary checkout.

## Output

- Progress: update on state change only (start, milestone, error, completion). Live mode adds heartbeat.
- Success: `completed: <task or N/A> via <engine> at <cwd>`
- Failure: `failed: <task or N/A> via <engine> at <cwd or N/A> - <short reason>`
```
