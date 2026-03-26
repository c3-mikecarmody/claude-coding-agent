# Coding Agent Autonomy Stack

An autonomous coding pipeline for Claude Code. Drop it into any project and run `/build`.

## How it works

`/build` orchestrates three agents in sequence:

1. **Planner** (Opus) — explores the codebase, writes a structured spec to `.agent/artifacts/spec.md`
2. **Executor** (Sonnet) — implements the spec, runs tests, writes notes. Spawns parallel subagents in isolated git worktrees for independent work items.
3. **Evaluator** (Opus) — skeptical code reviewer. Checks spec compliance, runs tests, writes a verdict to `.agent/artifacts/eval.json` and prints a summary.

If the evaluator finds blocking issues, the executor retries with the feedback. Up to 3 iterations. On a passing build, you'll be prompted to create a PR.

## Setup

Clone and copy `.claude/` into your project root:

```bash
git clone https://github.com/c3-mikecarmody/claude-coding-agent.git
cp -r claude-coding-agent/.claude /your/project/
```

Open the project in Claude Code. No other setup needed.

## Usage

```
/build <task description>
```

Examples:

```
/build add JWT authentication to the Express API
/build refactor the data fetching layer to use React Query
/build add pagination to the /users endpoint
```

## Artifacts

All inter-agent communication lives in `.agent/artifacts/` (gitignored by default):

| File | Written by | Read by |
|------|-----------|---------|
| `spec.md` | Planner | Executor, Evaluator |
| `notes.md` | Executor | Evaluator |
| `eval.json` | Evaluator | Orchestrator, Executor (on retry) |

## Future improvements

**Reliability**
- `--resume` support — pick up a run from the last checkpoint if interrupted mid-pipeline
- Spec validation after planning — abort early if spec.md is malformed or missing required sections rather than letting the executor fail silently
- Evaluator confidence scoring — distinguish "barely passing" from "clearly passing"

**Executor**
- Smarter parallelism — dedicated decomposition step before spawning parallel executors, rather than having the orchestrator eyeball the spec

**Observability**
- Iteration log — a running `.agent/artifacts/log.md` capturing what each phase did, eval verdicts, and which issues were fixed; useful for debugging failed runs
- Cost tracking — report token usage and estimated cost at the end of each `/build` run

**Configuration**
- `.agent/config.yaml` per project to override max iterations, model choices, and test command
- Model choices are currently hardcoded in agent frontmatter

**Distribution**
- Install script (`curl | sh`) that clones and copies `.claude/` into the current directory
- Ship a `.gitignore` snippet for `.agent/artifacts/` so run artifacts don't get accidentally committed

**Cursor support**
- Cursor doesn't support programmatic agent spawning, so a direct port isn't possible — but the planner/executor/evaluator prompts could be packaged as `.cursor/rules/` files for manual use

## Contributing

PRs welcome. For questions or suggestions, reach out to [mike.carmody@c3.ai](mailto:mike.carmody@c3.ai).
