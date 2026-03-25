---
name: build
description: Run the full Planner → Executor → Evaluator pipeline on a coding task.
---

Run an autonomous coding pipeline for the following task: $ARGUMENTS

**Pipeline rules:**
- Max 3 iterations (plan once, retry executor up to 3x)
- All agent communication goes through `.agent/artifacts/`
- Never skip the evaluator — always get a verdict before accepting

---

**Step 1 — Setup**

Create the artifacts directory if it doesn't exist:

```bash
mkdir -p .agent/artifacts
```

If there is an existing `.agent/artifacts/eval.json` from a prior run, delete it so the evaluator starts clean.

---

**Step 2 — Plan**

Spawn a subagent using `subagent_type: planner` (the custom planner agent, not the built-in Plan type).

Pass it: "Plan this task: $ARGUMENTS"

Wait for it to complete. It will write `.agent/artifacts/spec.md`. If spec.md does not exist after the planner finishes, abort with an error.

---

**Step 3 — Execute → Evaluate loop**

Run up to 3 iterations. Track iteration count starting at 1.

**3a. Execute**

Read `.agent/artifacts/spec.md`. Look at the "Files to change" section to determine if there are independent work items that can be parallelized. If yes, spawn multiple subagents in parallel using `subagent_type: executor` — one per independent work item, each with a focused subset of the spec. If no clear parallelism exists, spawn a single `subagent_type: executor` agent.

- Iteration 1: tell the executor "Implement the spec at .agent/artifacts/spec.md"
- Iterations 2–3: tell the executor "Fix only the blocking issues listed in .agent/artifacts/eval.json. Do not make unrelated changes. The spec is at .agent/artifacts/spec.md"

Wait for all executors to finish.

**3b. Evaluate**

Spawn a subagent using `subagent_type: evaluator`. Tell it: "Evaluate the implementation against the spec at .agent/artifacts/spec.md"

Wait for it to finish. It will print a summary and write `.agent/artifacts/eval.json`. Echo the evaluator's printed summary so it's visible in the main conversation.

**3c. Check verdict**

Read `.agent/artifacts/eval.json`:
- `verdict: "pass"` or `retry: false` → exit loop, go to Step 4
- `verdict: "fail"` and `retry: true` and iteration < 3 → print `[Iteration N failed — retrying executor with eval feedback]`, increment iteration, go to 3a
- `verdict: "fail"` and iteration = 3 → exit loop, go to Step 4 (failure path)

---

**Step 4 — Report**

Print a summary:

- If passed: print the eval summary and list any warnings from eval.json.
- If failed after 3 iterations: print the final eval summary and the list of blocking issues with their file, line, and reason. Tell the user to inspect `.agent/artifacts/eval.json` for the full verdict.

---

**What NOT to do:**
- Do not write any code yourself — all implementation goes through the executor agent
- Do not modify the spec after the planner writes it
- Do not skip the evaluator even if the executor reports success
- Do not run more than 3 executor iterations
