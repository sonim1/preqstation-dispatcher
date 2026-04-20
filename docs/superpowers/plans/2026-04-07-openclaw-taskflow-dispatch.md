# OpenClaw Task Flow Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old Telegram/chat-run `background:true pty:true` dispatch path with an OpenClaw plugin that intercepts PREQ dispatch messages, prepares a task worktree/prompt, and launches Codex in a detached way that does not depend on the current chat run staying active.

**Architecture:** Add a small native OpenClaw plugin to `preqstation-dispatcher` using `before_dispatch` and the installed OpenClaw plugin SDK. Keep the first pass intentionally narrow: handle PREQ dispatch command parsing, resolve a mapped project path from a local sample mapping file, create or reuse the task worktree, write `.preqstation-prompt.txt`, launch detached Codex, and return an immediate handled reply. Do not try to rebuild full Claude/Gemini parity or Task Flow completion emergence in the first patch.

**Tech Stack:** Node.js ESM, OpenClaw plugin SDK, `node:test`, git worktrees, Codex CLI

---

### Task 1: Add plugin package skeleton

**Files:**
- Create: `package.json`
- Create: `openclaw.plugin.json`
- Create: `index.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write the failing skeleton test**

Create a test that asserts the repo exports a native OpenClaw plugin entry and manifest metadata exists for install/discovery.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/plugin-entry.test.mjs`
Expected: FAIL because plugin files do not exist yet.

- [ ] **Step 3: Write minimal plugin skeleton**

Add `package.json`, `openclaw.plugin.json`, and `index.mjs` with `definePluginEntry(...)` and a no-op `before_dispatch` hook registration.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/plugin-entry.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json openclaw.plugin.json index.mjs tests/plugin-entry.test.mjs README.md
git commit -m "feat: add openclaw plugin skeleton"
```

### Task 2: Parse PREQ dispatch messages

**Files:**
- Create: `src/parse-dispatch-message.mjs`
- Create: `tests/parse-dispatch-message.test.mjs`
- Modify: `index.mjs`

- [ ] **Step 1: Write the failing parser tests**

Cover:
- `!/skill preqstation-dispatch plan PROJ-327 using codex branch_name="task/proj-327/browser-notification-chuga"`
- plain-language `preqstation implement PROJ-12 with codex`
- non-matching messages returning `null`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/parse-dispatch-message.test.mjs`
Expected: FAIL because parser module is missing.

- [ ] **Step 3: Write minimal parser**

Return normalized fields:
- `engine`
- `taskKey`
- `projectKey`
- `objective`
- `branchName`
- `rawMessage`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/parse-dispatch-message.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parse-dispatch-message.mjs tests/parse-dispatch-message.test.mjs index.mjs
git commit -m "feat: parse preq dispatch messages"
```

### Task 3: Prepare worktree and prompt file

**Files:**
- Create: `src/project-mapping.mjs`
- Create: `src/worktree-runtime.mjs`
- Create: `src/prompt-template.mjs`
- Create: `tests/prompt-template.test.mjs`
- Create: `tests/worktree-runtime.test.mjs`

- [ ] **Step 1: Write the failing prompt/worktree tests**

Cover:
- mapping resolution from local sample `MEMORY.md`
- branch normalization
- prompt content includes task/project/branch/objective
- detached launch plan writes `.preqstation-prompt.txt` in worktree

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/prompt-template.test.mjs tests/worktree-runtime.test.mjs`
Expected: FAIL because runtime modules do not exist yet.

- [ ] **Step 3: Write minimal runtime**

Implement:
- sample mapping parser from `MEMORY.md`
- worktree path calculation under `~/.openclaw-preq-worktrees`
- git worktree create/reuse logic
- prompt file write

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/prompt-template.test.mjs tests/worktree-runtime.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/project-mapping.mjs src/worktree-runtime.mjs src/prompt-template.mjs tests/prompt-template.test.mjs tests/worktree-runtime.test.mjs
git commit -m "feat: prepare preq dispatch worktrees"
```

### Task 4: Launch detached Codex from the plugin hook

**Files:**
- Create: `src/detached-launch.mjs`
- Create: `tests/detached-launch.test.mjs`
- Modify: `index.mjs`

- [ ] **Step 1: Write the failing detached launch tests**

Cover:
- Codex command string uses `.preqstation-prompt.txt`
- launch writes pid/log locations under worktree
- `before_dispatch` returns `{ handled: true, text: ... }` for matched PREQ dispatches

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/detached-launch.test.mjs tests/plugin-entry.test.mjs`
Expected: FAIL because launch/runtime plumbing is incomplete.

- [ ] **Step 3: Write minimal plugin dispatch flow**

Inside `before_dispatch`:
- parse message
- resolve project path
- prepare worktree + prompt
- launch detached Codex
- return a short handled acknowledgement

Leave future Task Flow state linkage as an explicit follow-up if host integration needs more runtime context than the hook currently exposes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/detached-launch.test.mjs tests/plugin-entry.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/detached-launch.mjs index.mjs tests/detached-launch.test.mjs tests/plugin-entry.test.mjs
git commit -m "feat: launch detached codex dispatches"
```

### Task 5: Update docs and verify install surface

**Files:**
- Modify: `README.md`
- Modify: `SKILL.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Write doc/install smoke tests**

Add smoke tests that assert:
- repo declares itself as an OpenClaw plugin
- docs no longer promise PTY background monitoring as the default runtime
- docs explain the detached Codex plugin flow

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/plugin-docs.test.mjs`
Expected: FAIL because docs still describe the old flow.

- [ ] **Step 3: Update docs minimally**

Document:
- plugin install shape
- detached dispatch behavior
- current MVP limitations

- [ ] **Step 4: Run final verification**

Run:
- `node --test`
- `node -e "import('./index.mjs').then(() => console.log('plugin ok'))"`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add README.md SKILL.md MEMORY.md tests/plugin-docs.test.mjs
git commit -m "docs: describe openclaw plugin dispatch flow"
```
