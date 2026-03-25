# claude-coding-agent

An autonomous coding pipeline for Claude Code. Drop it into any project and run `/build`.

## How it works

`/build` orchestrates three agents in sequence:

1. **Planner** (Opus) — explores the codebase, writes a structured spec to `.agent/artifacts/spec.md`
2. **Executor** (Sonnet) — implements the spec, runs tests, writes notes. Spawns parallel subagents for independent work items.
3. **Evaluator** (Opus) — skeptical code reviewer. Checks spec compliance, runs tests, writes a verdict to `.agent/artifacts/eval.json` and prints a summary.

If the evaluator finds blocking issues, the executor retries with the feedback. Up to 3 iterations.

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
