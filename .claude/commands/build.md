---
name: build
description: Run the full Planner → Executor → Evaluator pipeline on a coding task.
---

Run an autonomous coding pipeline for the following task: $ARGUMENTS

**Pipeline rules:**
- Max 3 iterations (plan once, retry executor up to 3x)
- All agent communication goes through `.agent/artifacts/`
- Never skip the evaluator — always get a verdict before accepting
- Executors run in isolated git worktrees to prevent conflicts

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

Create the artifacts directory if it doesn't exist:

```bash
mkdir -p .agent/artifacts
```

If there is an existing `.agent/artifacts/eval.json` from a prior run, delete it so the evaluator starts clean.

Note the current branch name — you'll need it later:

```bash
git branch --show-current
```

---

**Step 2 — Plan**

Spawn a subagent using `subagent_type: planner` (the custom planner agent, not the built-in Plan type).

Pass it: "Plan this task: $ARGUMENTS"

Wait for it to complete. It will write `.agent/artifacts/spec.md`. If spec.md does not exist after the planner finishes, abort with an error.

---

**Step 3 — Decompose**

Spawn a subagent using `subagent_type: decomposer`. Tell it: "Decompose the spec into executable tasks."

Wait for it to complete. It will write `.agent/artifacts/tasks.json`. If tasks.json does not exist after the decomposer finishes, abort with an error.

---

**Step 4 — Execute → Evaluate loop**

Run up to 3 iterations. Track iteration count starting at 1.

**4a. Execute**

Read `.agent/artifacts/tasks.json`.

- If `parallel: true`: spawn one `subagent_type: executor` per task in parallel, each with `isolation: "worktree"`. Pass each executor its specific task description and file list from tasks.json.
- If `parallel: false`: spawn a single `subagent_type: executor` with `isolation: "worktree"`.

- Iteration 1: tell each executor "Implement the spec at .agent/artifacts/spec.md. Your task: <task description>. Focus on these files: <file list>"
- Iterations 2–3: tell each executor "Fix only the blocking issues in .agent/artifacts/eval.json that relate to your files. Do not make unrelated changes. The spec is at .agent/artifacts/spec.md"

Wait for all executors to finish. For each executor that made changes, note the branch name returned.

**4b. Merge worktree branches**

For each branch returned by an executor:

```bash
git merge <branch> --no-edit
```

If any merge produces conflicts, print `[Merge conflict on <branch> — stopping]`, list the conflicting files, and abort the pipeline. Do not proceed to evaluation with a conflicted working tree.

If all merges succeed, continue.

**4c. Evaluate**

Spawn a subagent using `subagent_type: evaluator`. Tell it: "Evaluate the implementation against the spec at .agent/artifacts/spec.md"

Wait for it to finish. It will print a summary and write `.agent/artifacts/eval.json`. Echo the evaluator's printed summary so it's visible in the main conversation.

**4d. Check verdict**

Read `.agent/artifacts/eval.json`:
- `verdict: "pass"` or `retry: false` → exit loop, go to Step 5
- `verdict: "fail"` and `retry: true` and iteration < 3 → print `[Iteration N failed — retrying executor with eval feedback]`, increment iteration, go to 4a
- `verdict: "fail"` and iteration = 3 → exit loop, go to Step 5 (failure path)

---

**Step 5 — Report**

- If passed: print the eval summary and list any warnings from eval.json.
- If failed after 3 iterations: print the final eval summary and the list of blocking issues with their file, line, and reason. Tell the user to inspect `.agent/artifacts/eval.json` for the full verdict. Stop here — do not create a PR.

---

**Step 6 — PR (on pass only)**

Ask the user: "Build passed. Would you like me to create a PR?"

If yes:
- Ensure changes are committed: `git add -A && git commit -m "<task description>"` (skip if nothing to commit)
- Push and create the PR:

```bash
git push -u origin HEAD
gh pr create --title "<task description>" --body "<eval summary from eval.json>\n\nGenerated by /build"
```

Print the PR URL.

If no, stop here.

---

**What NOT to do:**
- Do not write any code yourself — all implementation goes through the executor agent
- Do not modify the spec after the planner writes it
- Do not skip the evaluator even if the executor reports success
- Do not run more than 3 executor iterations
- Do not create a PR if the build failed
