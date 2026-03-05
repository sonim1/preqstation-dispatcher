---
name: preqstation
description: "Delegate PREQSTATION coding tasks to Claude Code, Codex CLI, or Gemini CLI with PTY-safe execution (workdir + background + monitoring). Use when building, refactoring, or reviewing code in mapped workspaces. NOT for one-line edits or read-only inspection."
metadata: {"openclaw":{"requires":{"anyBins":["claude","codex","gemini"]}}}
---

# preqstation

Use this skill for natural-language requests to execute PREQSTATION-related work with local CLI engines.

## Trigger / NOT for

Trigger this skill with highest priority when the message contains any of:

- `/skill preqstation`
- `/skills preqstation`
- `preqstation`
- `preq`

Do NOT use this skill for:

- simple one-line manual edits that can be handled directly
- read-only file inspection or explanation without execution
- any coding-agent launch inside `~/clawd/` or `~/.openclaw/`

## Quick trigger examples

- `/skill preqstation: implement the PROJ-1`
- `preqstation: plan PROJ-76 using Claude Code`
- `preq: implement PROJ-1`

## Hard rules

1. Always run coding agents with `pty:true` and `background:true` by default (foreground only when user explicitly asks).
2. Respect the engine the user requested. If unspecified, default to `claude`.
3. Do not kill sessions only because they are slow; poll/log first.
4. Never launch coding agents in `~/clawd/`, `~/.openclaw/`, or primary checkout paths.
5. Always create a git worktree before launching any coding agent; keep execution scoped to worktree `<cwd>` only.
6. Worktree branch names must include the resolved project key.
7. PR review must run in a temp clone or git worktree, never in a live primary checkout.
8. Run preflight checks (`command -v git`, `command -v <engine>`) before any engine command.
9. Use `dangerously-*` / sandbox-disable flags only in resolved task worktrees after passing safety gates.
10. For planning/read-only requests, do not launch engine commands.

## Runtime prerequisites

- `git` and at least one engine binary (`claude`, `codex`, or `gemini`) on `PATH`.
- `OPENCLAW_WORKTREE_ROOT` (optional, default `/tmp/openclaw-worktrees`).
- This skill reads and updates `MEMORY.md` project mappings with absolute paths.

## Input interpretation

Parse from user message:

1. `engine` — `claude` | `codex` | `gemini` (default: `claude`)

2. `task` — first token matching `<KEY>-<number>` (example: `PRJ-284`), optional

3. `branch_name` (optional)
- parse: `branch_name=<value>`, `branch_name: <value>`, or `branch=<value>`
- strip quotes, normalize to lowercase, replace whitespace with `-`
- if missing resolved `project_key`, prefix with `preqstation/<project_key>/`

4. `project_cwd` (required to prepare execution)
- if absolute path provided, use it
- else resolve by project key from `MEMORY.md`
- else if task prefix key matches a `MEMORY.md` project key, use that path
- if unresolved, ask for project key/path, update `MEMORY.md`, then continue

5. `objective` — use the user request as the execution objective

6. `cwd` — per-task git worktree path derived from `project_cwd`; create worktree before launching

7. `progress_mode` — `sparse` (default) or `live` (if user says `live`/`realtime`/`frequent`/`detailed`)

8. `context_compaction` — compact status updates in current session; avoid replaying full logs; start new session only when user requests or platform limits force it

## MEMORY.md resolution

- Read `MEMORY.md` from this repository root.
- Use the `Projects` table (`key | cwd | note`).
- Match project keys by exact key only (case-insensitive, no fuzzy/partial matching).
- If exact project key is missing, ask the user for the correct key/path before continuing.
- If user asks to add/update project path mapping, update `MEMORY.md` first, then confirm.
- If task id exists, treat the prefix as candidate project key (example: `PROS-102` -> `pros`).

## MEMORY.md update rules

- Keep mappings in the `Projects` table only.
- Add or update using this row format: `| <key> | <absolute-path> | <note> |`.
- Use one row per key. If a key already exists, replace that row.
- Always store absolute paths (no relative paths).
- Normalize key to lowercase kebab-case before writing.
- If user provides project name, store it in `note`; otherwise use `workspace`.

## Missing project mapping flow

When `project_cwd` cannot be resolved:

1. Ask one short question: project key, absolute workspace path, optional project name.
2. Validate path is absolute.
3. Update `MEMORY.md` row immediately.
4. Confirm mapping in one short line.
5. Continue the original task: resolve `project_cwd`, create worktree `cwd`, execute.

## Branch naming convention

Priority: parsed `branch_name` from user message → fallback `preqstation/<project_key>`.

Rules:
- `<project_key>` = resolved key from `MEMORY.md`, lowercase kebab-case.
- Branch must include `project_key`; if missing, prefix with `preqstation/<project_key>/`.
- Reject unsafe names (`..`, leading `/`, empty) and ask user for a valid name.

## Worktree-first execution

After resolving `project_cwd` and `project_key`:

1. Build branch name per convention above.
2. Build worktree path: `<worktree_root>/<project_key>/<branch_slug>` (`branch_slug` = `branch_name` with `/` → `-`).
3. Create worktree:
   - new branch: `git -C <project_cwd> worktree add -b <branch_name> <cwd> HEAD`
   - existing branch: `git -C <project_cwd> worktree add <cwd> <branch_name>`
4. Use this worktree path as `<cwd>` for prompt rendering and engine execution.

## Prompt rendering (required template)

Do not forward raw user text directly. `<cwd>` must be the task worktree path.

```text
Task ID: <task or N/A>
Project Key: <project key or N/A>
Branch Name: <branch_name or N/A>
Skill: preqstation (use preq_* MCP tools for task lifecycle)
User Objective: <objective>

Execution Requirements:
1) Work only inside <cwd>.
2) Use branch <branch_name> for commits/pushes when provided.
3) Follow the PREQSTATION Workflow below to completion.

PREQSTATION Workflow (required — use preq_* MCP tools):
4) preq_get_task("<task>") — fetch task details, current status, and acceptance criteria.
5) preq_get_project_settings("<project_key>") — get deploy strategy
   (strategy, default_branch, auto_pr, commit_on_review).
6) Based on current task status from step 4:

   If inbox:
     → preq_plan_task("<task>", plan) — write implementation plan, move to todo.
     → Stop here. Do not implement.

   If todo:
     → preq_start_task("<task>")
     → Implement code changes and run tests.
     → Follow deploy strategy from step 5.
     → preq_complete_task("<task>", summary, branch, pr_url)

   If in_progress:
     → Continue implementation and run tests.
     → Follow deploy strategy from step 5.
     → preq_complete_task("<task>", summary, branch, pr_url)

   If review:
     → Run verification (tests, build, lint).
     → preq_review_task("<task>") on success.

   On any failure: preq_block_task("<task>", reason)

Worktree Cleanup (required — run after all work is done):
7) Remove this worktree before exiting:
    git -C <project_cwd> worktree remove <cwd> --force
    git -C <project_cwd> worktree prune

When completely finished, run:
openclaw system event --text "Done: <brief summary>" --mode now
```

## Engine commands

All engine commands: `pty:true`, explicit `workdir:<cwd>`, `background:true`.

```bash
# Claude Code
bash pty:true workdir:<cwd> background:true command:"claude --dangerously-skip-permissions '<rendered_prompt>'"

# Codex CLI
bash pty:true workdir:<cwd> background:true command:"codex exec --dangerously-bypass-approvals-and-sandbox '<rendered_prompt>'"

# Gemini CLI
bash pty:true workdir:<cwd> background:true command:"GEMINI_SANDBOX=false gemini -p '<rendered_prompt>'"
```

One-shot example (worktree + launch):

```bash
git -C <project_cwd> worktree add -b <branch_name> /tmp/openclaw-worktrees/<project_key>/<branch_slug> HEAD
bash pty:true workdir:/tmp/openclaw-worktrees/<project_key>/<branch_slug> background:true command:"codex exec --dangerously-bypass-approvals-and-sandbox '<rendered_prompt>'"
```

PR review (worktree only, never in primary checkout):

```bash
git worktree add -b <branch_name> /tmp/<project_key>-review <base_branch>
bash pty:true workdir:/tmp/<project_key>-review command:"codex review --base <base_branch>"
```

## Progress updates

- **sparse** (default): update only on state change — start, milestone, error, input needed, completion.
- **live**: same as sparse + periodic heartbeat every 1-2 minutes.
- If you kill a session, immediately say why.
- Keep updates short: current state, what changed, next step, blocker (if any).
- Avoid replaying full logs; use checkpoint summaries.

## Output policy

Success: `completed: <task or N/A> via <engine> at <cwd>`
Failure: `failed: <task or N/A> via <engine> at <cwd or N/A> - <short reason>`

Do not dump raw stdout/stderr unless user explicitly asks.
