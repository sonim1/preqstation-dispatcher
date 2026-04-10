---
name: preqstation-dispatch
description: "OpenClaw plugin companion guide for PREQSTATION dispatch. Use when the request is about dispatching PREQ work into a mapped project worktree with Claude Code, Codex CLI, or Gemini CLI. The native OpenClaw plugin owns interception and detached launch."
metadata:
  { "openclaw": { "requires": { "anyBins": ["claude", "codex", "gemini"] } } }
---

# preqstation-dispatch

This skill now documents the plugin-owned OpenClaw dispatch flow.

The native plugin in this repo intercepts PREQ dispatch messages through `before_dispatch`, so the normal path is:

1. plugin parses the dispatch request
2. plugin resolves the project path
3. plugin prepares the git worktree
4. plugin writes `.preqstation-prompt.txt`
5. plugin launches the engine as a detached process

## Trigger examples

- `/skill preqstation-dispatch plan PROJ-327 using codex`
- `/skill preqstation-dispatch ask PROJ-328 using codex ask_hint="Acceptance criteria 중심으로 정리해줘"`
- `!/skill preqstation-dispatch implement PROJ-327 using claude`
- `preqstation implement PROJ-327 with codex`

Setup command:

- `/preqsetup auto`
- `PROJ https://github.com/sonim1/projects-manager`
- `/preqsetup import`
- `/preqsetup set <PROJECT_KEY> <ABSOLUTE_PATH>`
- `/preqsetup set PROJ /Users/example/projects/projects-manager`
- `/preqsetup status`

Recommended setup flow:

- Use `/preqsetup auto` with `PROJECT_KEY REPO_URL` lines when OpenClaw should manage project-path mappings itself.
- `auto` scans `PREQSTATION_REPO_ROOTS` when set, otherwise `~/projects`, and matches local git `origin` URLs against the provided repo URLs.
- Use `/preqsetup import` only as a compatibility shortcut when Claude-side `/preqstation:setup` already populated `~/.preqstation-dispatch/projects.json`.

## Hard rules

1. Dispatcher only. Never implement the task inside the OpenClaw chat run.
2. Worktree isolation only. Never launch in the primary checkout.
3. Prompt via file only. Always write `.preqstation-prompt.txt` into the worktree first.
4. Detached launch only. Do not use `pty:true` / `background:true` for the coding run.
5. If dispatch fails after the message was clearly intended for PREQ, return a clear handled failure instead of falling back to a generic LLM reply.

## Current path resolution

The current plugin implementation resolves `project_cwd` in this order:

1. explicit absolute path mentioned in the message
2. plugin config mapping saved by `/preqsetup`
3. shared `~/.preqstation-dispatch/projects.json`
4. project mapping from [MEMORY.md](/Users/kendrick/projects/preqstation-openclaw/MEMORY.md) or configured `memoryPath`

This is intentionally narrower than the old skill docs. Agent-memory lookup can come later, but the current public contract should describe what the plugin actually does today.

## Prompt contract

The dispatched CLI reads `./.preqstation-prompt.txt` in the worktree and should:

1. call `preq_get_task("<task>")` first when a task key exists
2. call `preq_start_task("<task>", "<engine>")` before substantive work
3. if the objective is `ask`, update the task note, use `preq_update_task_note`, and clear `run_state` with `preq_update_task_status` while keeping workflow status unchanged; prototype-style asks may generate local artifacts and may publish them only through a safe private provider using a `private-or-skip` policy
4. work only inside the resolved worktree
5. notify OpenClaw on completion with `openclaw system event --text "Done: <brief summary>" --mode now`

## Runtime artifacts

Detached process artifacts live inside the worktree:

- `.preqstation-dispatch/<engine>.pid`
- `.preqstation-dispatch/<engine>.log`

This is the supported monitoring surface for now. The plugin no longer documents PTY session polling as the dispatch model.
