---
name: build-log
description: View the audit log for a build run. Usage: /build-log [run_id] — omit run_id to see the most recent run.
---

Display the audit log for a build run.

**If a run_id was provided in $ARGUMENTS**, use that. Otherwise find the most recent log:

```bash
ls -t .agent/logs/*.jsonl 2>/dev/null | head -1
```

If no logs exist, print "No build logs found in .agent/logs/" and stop.

**Read the log file and print a human-readable timeline:**

```bash
cat .agent/logs/<run_id>.jsonl
```

Format each line as:

```
[HH:MM:SS] PHASE  EVENT            data summary
```

Examples:
```
[14:32:01] orch   run.start        task: "add JWT auth to Express API"
[14:32:03] orch   agent.spawned    agent: planner
[14:32:04] plan   phase.start
[14:32:31] plan   phase.end        status: done, files: 4
[14:32:32] orch   agent.completed  agent: planner
[14:32:33] orch   agent.spawned    agent: decomposer
[14:32:35] decomp phase.end        parallel: true, tasks: 2
[14:32:36] orch   iteration.start  iteration: 1
[14:32:37] orch   agent.spawned    agent: executor, task: task-1
[14:32:37] orch   agent.spawned    agent: executor, task: task-2
[14:33:12] exec   phase.end        status: done, tests: passed
[14:33:14] orch   merge.success
[14:33:15] orch   agent.spawned    agent: evaluator
[14:33:45] eval   phase.end        verdict: fail, blocking: 2, warnings: 1
[14:33:46] orch   verdict          fail — retrying
[14:33:47] orch   retry            iteration 1 → 2
[14:35:22] eval   phase.end        verdict: pass, warnings: 1
[14:35:23] orch   verdict          pass
[14:35:24] orch   run.end          outcome: pass, iterations: 2
[14:35:31] orch   pr.created       https://github.com/...
```

Print total wall time (last ts minus first ts) at the bottom.

**To list all available logs:**

If the user passes `--list`, run:

```bash
ls -lt .agent/logs/*.jsonl 2>/dev/null
```

And for each file, print the run_id, date, and final outcome (grep for `run.end` in each file).
