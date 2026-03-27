# Coding Agent Autonomy Stack

An autonomous coding pipeline supporting both Claude Code and Cursor platforms. Drop it into any project and run the build pipeline.

## How it works

`/build` orchestrates four agents in sequence:

1. **Planner** (Opus) — explores the codebase, writes a structured spec to `.agent/artifacts/spec.md`
2. **Decomposer** (Haiku) — analyzes the spec and produces a structured task breakdown, identifying which work items can run in parallel without file conflicts.
3. **Executor** (Sonnet) — implements the spec, runs tests, writes notes. Spawns parallel subagents in isolated git worktrees for independent work items.
4. **Evaluator** (Opus) — skeptical code reviewer. Checks spec compliance, runs tests, writes a verdict to `.agent/artifacts/eval.json` and prints a summary.

If the evaluator finds blocking issues, the executor retries with the feedback. Up to 3 iterations. On a passing build, you'll be prompted to create a PR. Every run produces a timestamped JSONL audit log.

## Platform Support

This stack supports both **Claude Code** and **Cursor** platforms:

| Platform | Orchestration | Setup | Commands |
|----------|---------------|-------|----------|
| **Claude Code** | Automatic subagent spawning | Copy `.claude/` directory | `/build`, `/ticket-build`, `/build-log` |
| **Cursor** | Manual subagent invocation | Run `node setup.js` | Step-by-step guided workflow |

Both platforms share the same artifacts, logging, and dashboard for consistent experience.

## Setup

### Quick Setup (Recommended)

```bash
git clone https://github.com/c3-mikecarmody/claude-coding-agent.git
cd claude-coding-agent

# Automatic platform detection and setup
node setup.js
```

The setup script detects your platform and configures the appropriate components automatically.

### Manual Setup

#### Claude Code Only
```bash
git clone https://github.com/c3-mikecarmody/claude-coding-agent.git
cp -r claude-coding-agent/.claude /your/project/
```

#### Cursor Only
```bash
git clone https://github.com/c3-mikecarmody/claude-coding-agent.git
cp -r claude-coding-agent/.cursor /your/project/
cp -r claude-coding-agent/.agent /your/project/
```

For detailed platform-specific instructions, see [`PLATFORM.md`](PLATFORM.md).

## Usage

### Claude Code (Automatic)

Full automation with programmatic agent orchestration:

```bash
/build <task description>
```

Examples:
```bash
/build add JWT authentication to the Express API
/build refactor the data fetching layer to use React Query  
/build add pagination to the /users endpoint
```

### Cursor (Manual)

Step-by-step guided workflow with manual subagent invocation:

```bash
# 1. Get step-by-step instructions
/build <task description>

# 2. Follow the guided workflow:
# → Invoke @planner with the task
# → Invoke @decomposer after planning
# → Invoke @executor after decomposition  
# → Invoke @evaluator after implementation
```

Example workflow:
```bash
/build add JWT authentication to the Express API
# → Follow displayed steps to invoke @planner, @decomposer, @executor, @evaluator
```

### Ticket Integration

#### Claude Code: `/ticket-build`

Automated ticket fetching and processing:

```bash
/ticket-build                        # unified priority list from all enabled sources
/ticket-build --urgent               # top ticket across all sources without prompting
/ticket-build SWAT-42                # specific Jira ticket
/ticket-build #123                   # specific GitHub issue
/ticket-build source=github          # restrict to GitHub Issues only
/ticket-build source=jira            # restrict to Jira only
/ticket-build project=SWAT           # scope Jira search to a project
/ticket-build repo=owner/repo        # scope GitHub search to a repo
```

#### Cursor: Manual Ticket Workflow

```bash
# 1. Get ticket build instructions
/ticket-build SWAT-42

# 2. Follow guided steps to process the ticket through the pipeline
```

Results from all sources are normalized to a common P1–P4 priority scale and merged into a single list. Priority mappings are configurable in `.claude/ticket-sources.yml` (Claude Code) or through manual ticket processing (Cursor). On a passing build, the PR title is automatically set to `<ticket-id>: <summary>`.

### Build Logs

#### Claude Code: `/build-log`

```bash
/build-log           # most recent run
/build-log <run_id>  # specific run
/build-log --list    # all runs with outcomes
```

#### Cursor: Manual Log Access

```bash
# View logs through command
/build-log

# Or access log files directly
ls .agent/logs/
cat .agent/logs/[run_id].jsonl
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

### Log Format

Each run produces a JSONL file at `.agent/logs/<run_id>.jsonl`. Every entry shares a common envelope with platform identification:

```json
{"ts": "2026-03-26T14:32:01Z", "run_id": "20260326-143200-add-jwt-auth", "platform": "claude-code", "phase": "orchestrator", "event": "run.start", "iteration": 0, "data": {}}
```

The `platform` field identifies whether the run was executed on `claude-code` or `cursor`, enabling platform-specific analysis while maintaining log compatibility.

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

**Enhanced Platform Support**
- Unified setup script for automatic platform detection and configuration
- Cross-platform artifact sharing and logging consistency
- Platform-aware dashboard with tailored UI elements
- Migration tools for existing single-platform setups

## Contributing

PRs welcome. For questions or suggestions, reach out to [mike.carmody@c3.ai](mailto:mike.carmody@c3.ai).
