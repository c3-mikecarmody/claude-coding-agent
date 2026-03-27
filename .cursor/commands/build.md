---
name: build
description: Run the full Planner → Executor → Evaluator pipeline on a coding task using manual subagent invocation.
---

Run an autonomous coding pipeline for the following task: $ARGUMENTS

**Pipeline rules:**
- Max 3 iterations (plan once, retry executor up to 3x)
- All agent communication goes through `.agent/artifacts/`
- Never skip the evaluator — always get a verdict before accepting
- Manual subagent invocation using `/planner`, `/decomposer`, `/executor`, `/evaluator`

---

**Step 0 — Preflight**

**0a. GitHub auth check**

Run:

```bash
gh auth status
```

If not authenticated, print:

```
GitHub CLI is not authenticated. Run `gh auth login` to continue, then re-run this command.
```

Stop. Do not proceed until auth passes.

**0b. Repo check**

Run:

```bash
git rev-parse --show-toplevel 2>/dev/null
```

If this succeeds, you're inside a git repo. Print the repo root path and continue to Step 1.

If it fails, ask the user:

```
You don't appear to be inside a git repo. How would you like to proceed?
  1. I don't have the repo yet — provide a GitHub URL or owner/repo and I'll clone it
  2. I have it locally — tell me the path and I'll navigate there
```

Wait for the user's response:

- **Option 1 (clone):** Ask for the repo URL or `owner/repo`. Run:
  ```bash
  gh repo clone <owner/repo>
  cd <repo-name>
  ```
  Confirm you're now inside the repo root, then continue to Step 1.

- **Option 2 (navigate):** Take the path they provide. Run:
  ```bash
  cd <path>
  git rev-parse --show-toplevel
  ```
  If that fails, tell the user the path doesn't appear to be a git repo and ask them to check it. Do not proceed until confirmed.

---

**Step 1 — Setup**

Create directories and generate a run ID:

```bash
mkdir -p .agent/artifacts .agent/logs .agent/artifacts/agent-status
TASK_SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-' | cut -c1-40)
RUN_ID="$(date -u +%Y%m%d-%H%M%S)-${TASK_SLUG}"
echo "$RUN_ID" > .agent/artifacts/run_id
```

If there is an existing `.agent/artifacts/eval.json` from a prior run, delete it so the evaluator starts clean.

Note the current branch name — you'll need it later:

```bash
git branch --show-current
```

Write the `run.start` log entry:

```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"run.start\",\"iteration\":0,\"data\":{\"task\":\"$ARGUMENTS\",\"branch\":\"$(git branch --show-current)\",\"platform\":\"cursor\"}}" >> .agent/logs/$RUN_ID.jsonl
```

---

**Step 2 — Plan**

Log spawn:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.spawned\",\"iteration\":0,\"data\":{\"agent\":\"planner\"}}" >> .agent/logs/$RUN_ID.jsonl
```

**Manual Step:** Run the planner subagent:

```
/planner Plan this task: $ARGUMENTS
```

Wait for the planner to complete. It will write `.agent/artifacts/spec.md`. If spec.md does not exist after the planner finishes, abort with an error.

Log completion:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.completed\",\"iteration\":0,\"data\":{\"agent\":\"planner\",\"artifact\":\"spec.md\"}}" >> .agent/logs/$RUN_ID.jsonl
```

---

**Step 3 — Decompose**

Log spawn:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.spawned\",\"iteration\":0,\"data\":{\"agent\":\"decomposer\"}}" >> .agent/logs/$RUN_ID.jsonl
```

**Manual Step:** Run the decomposer subagent:

```
/decomposer Decompose the spec into executable tasks.
```

Wait for it to complete. It will write `.agent/artifacts/tasks.json`. If tasks.json does not exist after the decomposer finishes, abort with an error.

Log completion (include `parallel` and task count from tasks.json):
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.completed\",\"iteration\":0,\"data\":{\"agent\":\"decomposer\",\"artifact\":\"tasks.json\"}}" >> .agent/logs/$RUN_ID.jsonl
```

---

**Step 4 — Execute → Evaluate loop**

Run up to 3 iterations. Track iteration count starting at 1.

**4a. Execute**

Log iteration start:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"iteration.start\",\"iteration\":$N,\"data\":{}}" >> .agent/logs/$RUN_ID.jsonl
```

Read `.agent/artifacts/tasks.json` to understand the task structure.

**Manual Step:** For each iteration:

- **Iteration 1:** Run the executor subagent:
  ```
  /executor Implement the spec at .agent/artifacts/spec.md. Focus on the tasks defined in .agent/artifacts/tasks.json.
  ```

- **Iterations 2–3:** Run the executor subagent:
  ```
  /executor Fix only the blocking issues in .agent/artifacts/eval.json. Do not make unrelated changes. The spec is at .agent/artifacts/spec.md.
  ```

Log executor spawn:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.spawned\",\"iteration\":$N,\"data\":{\"agent\":\"executor\"}}" >> .agent/logs/$RUN_ID.jsonl
```

Wait for the executor to finish. Log completion:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.completed\",\"iteration\":$N,\"data\":{\"agent\":\"executor\"}}" >> .agent/logs/$RUN_ID.jsonl
```

**4b. Evaluate**

Log spawn:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.spawned\",\"iteration\":$N,\"data\":{\"agent\":\"evaluator\"}}" >> .agent/logs/$RUN_ID.jsonl
```

**Manual Step:** Run the evaluator subagent:

```
/evaluator Evaluate the implementation against the spec at .agent/artifacts/spec.md
```

Wait for it to finish. It will print a summary and write `.agent/artifacts/eval.json`. Echo the evaluator's printed summary so it's visible in the main conversation.

Log completion:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"agent.completed\",\"iteration\":$N,\"data\":{\"agent\":\"evaluator\"}}" >> .agent/logs/$RUN_ID.jsonl
```

**4c. Archive eval snapshot**

Copy the eval output to the history directory so each iteration's result is preserved:

```bash
mkdir -p .agent/artifacts/eval-history
N=$(ls .agent/artifacts/eval-history/eval-*.json 2>/dev/null | wc -l | tr -d ' ')
cp .agent/artifacts/eval.json .agent/artifacts/eval-history/eval-$((N+1)).json
```

**4d. Check verdict**

Read `.agent/artifacts/eval.json`. Log the verdict:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"verdict\",\"iteration\":$N,\"data\":{\"verdict\":\"<pass|fail>\",\"retry\":<true|false>,\"blocking_count\":<n>,\"warning_count\":<n>}}" >> .agent/logs/$RUN_ID.jsonl
```

- `verdict: "pass"` or `retry: false` → exit loop, go to Step 5
- `verdict: "fail"` and `retry: true` and iteration < 3 → log retry, print `[Iteration N failed — retrying executor with eval feedback]`, increment iteration, go to 4a:
  ```bash
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"retry\",\"iteration\":$N,\"data\":{\"reason\":\"<eval summary>\"}}" >> .agent/logs/$RUN_ID.jsonl
  ```
- `verdict: "fail"` and iteration = 3 → exit loop, go to Step 5 (failure path)

---

**Step 5 — Report**

- If passed: print the eval summary and list any warnings from eval.json.
- If failed after 3 iterations: print the final eval summary and the list of blocking issues with their file, line, and reason. Tell the user to inspect `.agent/artifacts/eval.json` for the full verdict. Stop here — do not create a PR.

Log run end:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"run.end\",\"iteration\":$N,\"data\":{\"outcome\":\"<pass|fail>\",\"iterations_used\":$N,\"log\":\".agent/logs/$RUN_ID.jsonl\"}}" >> .agent/logs/$RUN_ID.jsonl
```

---

**Step 6 — PR (on pass only)**

Ask the user: "Build passed. Would you like me to create a PR?"

If yes:
- Ensure changes are committed: `git add -A && git commit -m "<task description>"` (skip if nothing to commit)
- Push and create the PR:

```bash
git push -u origin HEAD
gh pr create --title "<task description>" --body "<eval summary from eval.json>\n\nGenerated by /build (Cursor)"
```

Print the PR URL.

Log PR creation:
```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"run_id\":\"$RUN_ID\",\"phase\":\"orchestrator\",\"event\":\"pr.created\",\"iteration\":$N,\"data\":{\"url\":\"<pr-url>\",\"branch\":\"<branch>\"}}" >> .agent/logs/$RUN_ID.jsonl
```

If no, stop here.

---

**What NOT to do:**
- Do not write any code yourself — all implementation goes through the executor agent
- Do not modify the spec after the planner writes it
- Do not skip the evaluator even if the executor reports success
- Do not run more than 3 executor iterations
- Do not create a PR if the build failed

**Key Differences from Claude Code:**
- Manual subagent invocation using `/planner`, `/decomposer`, `/executor`, `/evaluator`
- No programmatic spawning — user must run each subagent manually
- Platform identifier added to logging for dual platform support
- Simplified workflow without worktree isolation (Cursor handles isolation differently)