# Coding Agent Autonomy Stack

An autonomous coding pipeline for Claude Code. Drop it into any project and run `/build`.

## How it works

`/build` orchestrates four agents in sequence:

1. **Planner** (Opus) — explores the codebase, writes a structured spec to `.agent/artifacts/spec.md`
2. **Decomposer** (Haiku) — analyzes the spec and produces a structured task breakdown, identifying which work items can run in parallel without file conflicts.
3. **Executor** (Sonnet) — implements the spec, runs tests, writes notes. Spawns parallel subagents in isolated git worktrees for independent work items.
4. **Evaluator** (Opus) — skeptical code reviewer. Checks spec compliance, runs tests, writes a verdict to `.agent/artifacts/eval.json` and prints a summary.

If the evaluator finds blocking issues, the executor retries with the feedback. Up to 3 iterations. On a passing build, you'll be prompted to create a PR. Every run produces a timestamped JSONL audit log.

## Setup

Clone and copy `.claude/` into your project root:

```bash
git clone https://github.com/c3-mikecarmody/claude-coding-agent.git
cp -r claude-coding-agent/.claude /your/project/
```

Open the project in Claude Code. No other setup needed.

## Usage

### `/build`

```
/build <task description>
```

Examples:

```
/build add JWT authentication to the Express API
/build refactor the data fetching layer to use React Query
/build add pagination to the /users endpoint
```

### `/ticket-build`

Fetch a ticket from Jira and/or GitHub Issues and run it through the same pipeline. Requires the Atlassian MCP for Jira and `gh` CLI for GitHub.

```
/ticket-build                        # unified priority list from all enabled sources
/ticket-build --urgent               # top ticket across all sources without prompting
/ticket-build SWAT-42                # specific Jira ticket
/ticket-build #123                   # specific GitHub issue
/ticket-build source=github          # restrict to GitHub Issues only
/ticket-build source=jira            # restrict to Jira only
/ticket-build project=SWAT           # scope Jira search to a project
/ticket-build repo=owner/repo        # scope GitHub search to a repo
```

Results from all sources are normalized to a common P1–P4 priority scale and merged into a single list. Priority mappings are configurable in `.claude/ticket-sources.yml`. On a passing build, the PR title is automatically set to `<ticket-id>: <summary>`.

### `/build-log`

View the audit log for any build run:

```
/build-log           # most recent run
/build-log <run_id>  # specific run
/build-log --list    # all runs with outcomes
```

## Artifacts

All inter-agent communication lives in `.agent/artifacts/` and `.agent/logs/` (both gitignored):

| File | Written by | Read by |
|------|-----------|---------|
| `artifacts/ticket.md` | `/ticket-build` orchestrator | Planner |
| `artifacts/spec.md` | Planner | Decomposer, Executor, Evaluator |
| `artifacts/tasks.json` | Decomposer | Orchestrator, Executor |
| `artifacts/notes.md` | Executor | Evaluator |
| `artifacts/eval.json` | Evaluator | Orchestrator, Executor (on retry) |
| `artifacts/run_id` | Orchestrator | All agents |
| `artifacts/agent-status/<agent>.json` | Each agent | Orchestrator (live status) |
| `logs/<run_id>.jsonl` | Orchestrator + all agents | `/build-log` |

### Log format

Each run produces a JSONL file at `.agent/logs/<run_id>.jsonl`. Every entry shares a common envelope:

```json
{"ts": "2026-03-26T14:32:01Z", "run_id": "20260326-143200-add-jwt-auth", "phase": "orchestrator", "event": "run.start", "iteration": 0, "data": {}}
```

Events: `run.start`, `run.end`, `agent.spawned`, `agent.completed`, `phase.start`, `phase.end`, `iteration.start`, `verdict`, `retry`, `merge.success`, `merge.conflict`, `pr.created`.

## Future improvements

**Reliability**
- `--resume` support — pick up a run from the last checkpoint if interrupted mid-pipeline
- Spec validation after planning — abort early if spec.md is malformed or missing required sections rather than letting the executor fail silently
- Evaluator confidence scoring — distinguish "barely passing" from "clearly passing"

**Observability**
- Cost tracking — report token usage and estimated cost at the end of each `/build` run

**Configuration**
- `.agent/config.yaml` per project to override max iterations, model choices, and test command
- Model choices are currently hardcoded in agent frontmatter

**Distribution**
- Install script (`curl | sh`) that clones and copies `.claude/` into the current directory

**Cursor support**
- Cursor doesn't support programmatic agent spawning, so a direct port isn't possible — but the planner/executor/evaluator prompts could be packaged as `.cursor/rules/` files for manual use

## Contributing

PRs welcome. For questions or suggestions, reach out to [mike.carmody@c3.ai](mailto:mike.carmody@c3.ai).
