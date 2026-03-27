---
name: build-log
description: View the audit log for a build run. Usage: /build-log [run_id] — omit run_id to see the most recent run.
---

Display the audit log for a build run with Cursor platform support.

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
[HH:MM:SS] PLATFORM PHASE  EVENT            data summary
```

Examples:
```
[14:32:01] cursor   orch   run.start        task: "add JWT auth to Express API"
[14:32:03] cursor   orch   agent.spawned    agent: planner
[14:32:04] cursor   plan   phase.start      
[14:32:31] cursor   plan   phase.end        status: done, files: 4
[14:32:32] cursor   orch   agent.completed  agent: planner
[14:32:33] cursor   orch   agent.spawned    agent: decomposer
[14:32:35] cursor   decomp phase.end        parallel: true, tasks: 2
[14:32:36] cursor   orch   iteration.start  iteration: 1
[14:32:37] cursor   orch   agent.spawned    agent: executor
[14:33:12] cursor   exec   phase.end        status: done, tests: passed
[14:33:15] cursor   orch   agent.spawned    agent: evaluator
[14:33:45] cursor   eval   phase.end        verdict: fail, blocking: 2, warnings: 1
[14:33:46] cursor   orch   verdict          fail — retrying
[14:33:47] cursor   orch   retry            iteration 1 → 2
[14:35:22] cursor   eval   phase.end        verdict: pass, warnings: 1
[14:35:23] cursor   orch   verdict          pass
[14:35:24] cursor   orch   run.end          outcome: pass, iterations: 2
[14:35:31] cursor   orch   pr.created       https://github.com/...
```

**Platform-aware formatting:**
- Show platform identifier (cursor/claude-code) in each line
- Highlight manual orchestration points for Cursor runs
- Show subagent invocation commands that were used

Print total wall time (last ts minus first ts) at the bottom.

**To list all available logs:**

If the user passes `--list`, run:

```bash
ls -lt .agent/logs/*.jsonl 2>/dev/null
```

And for each file, print the run_id, date, platform (if available), and final outcome (grep for `run.end` in each file).

Example output:
```
Available build logs:
20260327-143201-jwt-auth.jsonl    2026-03-27 14:32  cursor     pass
20260327-120045-user-profile.jsonl 2026-03-27 12:00  claude-code pass  
20260326-165432-api-docs.jsonl    2026-03-26 16:54  cursor     fail
```

**Key Differences from Claude Code:**
- Platform-aware log display showing cursor/claude-code identifier
- Enhanced formatting for manual orchestration workflow
- Cross-platform log compatibility with shared JSONL format