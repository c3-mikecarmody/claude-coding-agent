# Platform Support Guide

The Coding Agent Autonomy Stack supports both Claude Code and Cursor platforms, providing the same powerful autonomous coding pipeline with platform-specific optimizations.

## Platform Comparison

| Feature | Claude Code | Cursor |
|---------|-------------|--------|
| **Orchestration** | Programmatic subagent spawning | Manual subagent invocation |
| **Setup** | Copy `.claude/` directory | Run `node setup.js` |
| **Commands** | `/build`, `/ticket-build`, `/build-log` | Manual workflow with step-by-step guidance |
| **Agent Definitions** | `.claude/agents/*.md` | `.cursor/agents/*.md` |
| **Parallel Execution** | Automatic via git worktrees | Manual coordination |
| **Dashboard** | Integrated | Integrated (platform-aware) |
| **Logging** | JSONL audit logs | JSONL audit logs (platform-tagged) |
| **Artifacts** | Shared `.agent/artifacts/` | Shared `.agent/artifacts/` |

## Installation

### Prerequisites

- Node.js 18+ for the dashboard server
- Git for version control and worktree management
- Your target platform (Claude Code or Cursor)

### Recommended: installer or template

- **One-shot installer** (`curl … | bash`) with optional Claude, Cursor, or both: [docs/INSTALL.md](docs/INSTALL.md)
- **GitHub template** for new repos or manual copy: [docs/install-from-template.md](docs/install-from-template.md)

### Platform detection and setup

After files are in your project root:

```bash
node setup.js
```

Or choose platforms explicitly:

```bash
node setup.js --platform=both
node setup.js --platform=claude-code,cursor
node setup.js -i
```

The setup script will:

1. Detect your current platform when using `auto`, or honor `both` / a single platform
2. Create necessary directories (`.agent/artifacts/`, `.agent/logs/`)
3. Install or validate platform-specific configurations (Cursor conversion when `.claude/` is present)
4. Validate requirements
5. Print next steps

### Manual platform setup

#### Claude Code Only

```bash
# Copy Claude Code components to your project
cp -r claude-coding-agent/.claude /your/project/
```

#### Cursor Only

```bash
# Copy Cursor components to your project  
cp -r claude-coding-agent/.cursor /your/project/
cp -r claude-coding-agent/.agent /your/project/
cp claude-coding-agent/setup.js /your/project/
```

#### Dual Platform (Both)

```bash
# Copy all components for maximum flexibility
cp -r claude-coding-agent/.claude /your/project/
cp -r claude-coding-agent/.cursor /your/project/ 
cp -r claude-coding-agent/.agent /your/project/
cp claude-coding-agent/setup.js /your/project/
```

## Usage Differences

### Claude Code Workflow

Claude Code provides fully automated orchestration:

```bash
# Start a build - everything happens automatically
/build add JWT authentication to the Express API

# View build logs
/build-log

# Build from tickets
/ticket-build SWAT-42
```

**Pipeline Flow:**
1. `/build` command starts orchestration
2. Planner agent spawned automatically → writes `spec.md`
3. Decomposer agent spawned automatically → writes `tasks.json`
4. Executor agent(s) spawned automatically → implements code, writes `notes.md`
5. Evaluator agent spawned automatically → reviews code, writes `eval.json`
6. Results displayed with PR creation prompt

### Cursor Workflow

Cursor requires manual subagent invocation with guided steps:

```bash
# 1. Start the build process
/build add JWT authentication to the Express API
```

This provides step-by-step instructions:

```
Step 1: Planning Phase
→ Invoke @planner with: "add JWT authentication to the Express API"
→ Wait for spec.md to be created in .agent/artifacts/

Step 2: Task Decomposition  
→ Invoke @decomposer 
→ Wait for tasks.json to be created

Step 3: Implementation
→ Invoke @executor
→ Wait for implementation and notes.md

Step 4: Evaluation
→ Invoke @evaluator
→ Review eval.json for final verdict
```

**Manual Pipeline Flow:**
1. User runs `/build <task>` → receives step-by-step instructions
2. User invokes `@planner` → creates `spec.md`
3. User invokes `@decomposer` → creates `tasks.json`
4. User invokes `@executor` → implements code, creates `notes.md`
5. User invokes `@evaluator` → reviews code, creates `eval.json`
6. User reviews results and creates PR manually

### Platform-Specific Examples

#### Claude Code: Automated Build

```bash
# Single command handles everything
/build refactor the data fetching layer to use React Query

# Output:
# ✓ Planner completed - spec written to .agent/artifacts/spec.md
# ✓ Decomposer completed - 3 tasks identified
# ✓ Executor completed - all tests passing
# ✓ Evaluator completed - PASS verdict
# 
# Create PR? [y/N]
```

#### Cursor: Manual Build

```bash
# Step-by-step guidance
/build refactor the data fetching layer to use React Query

# Output:
# Cursor Build Workflow Started
# 
# Step 1: Planning
# → Invoke: @planner 
# → Task: "refactor the data fetching layer to use React Query"
# → Wait for: .agent/artifacts/spec.md
#
# [Continue with remaining steps after each completion...]
```

## Migration Guide

### From Claude Code Only → Dual Platform

If you have an existing Claude Code setup:

```bash
# In your existing project with .claude/ directory
node setup.js

# This adds:
# - .cursor/ directory with agent definitions
# - Platform detection in dashboard
# - Enhanced logging with platform tags
# - No changes to existing .claude/ functionality
```

Your existing workflows continue to work unchanged. You gain the ability to use Cursor subagents when needed.

### From Single Platform → Dual Platform

1. **Backup your current setup** (optional but recommended):
   ```bash
   cp -r .claude .claude.backup  # if using Claude Code
   cp -r .cursor .cursor.backup  # if using Cursor
   ```

2. **Run the setup script**:
   ```bash
   node setup.js
   ```

3. **Verify both platforms work**:
   - Test your existing platform workflow
   - Test the newly added platform workflow
   - Check dashboard shows platform detection

4. **Update your team**:
   - Share the new `PLATFORM.md` documentation
   - Update any CI/CD scripts if needed
   - Consider standardizing on one platform or supporting both

### Migration Validation

After migration, verify:

- [ ] Existing workflows still function
- [ ] New platform components are accessible
- [ ] Dashboard loads and shows correct platform
- [ ] Artifacts directory structure is intact
- [ ] Logging continues to work
- [ ] No file conflicts or permission issues

## Troubleshooting

### Platform Detection Issues

**Problem**: `setup.js` reports "unknown platform"

**Solutions**:
```bash
# Force Claude Code detection
CLAUDE_CODE=1 node setup.js

# Force Cursor detection  
CURSOR_IDE=1 node setup.js

# Manual platform setup
mkdir -p .cursor/agents .cursor/commands  # for Cursor
mkdir -p .claude/agents .claude/commands  # for Claude Code
```

### Agent Invocation Issues

**Claude Code - Agents not spawning**:
- Check `.claude/commands/build.md` exists and is valid
- Verify agent definitions in `.claude/agents/` have correct frontmatter
- Check Claude Code console for error messages

**Cursor - Subagents not found**:
- Verify `.cursor/agents/` directory exists with agent definitions
- Check agent YAML frontmatter is valid
- Ensure Cursor recognizes the subagent definitions

### Artifact and Logging Issues

**Artifacts not shared between agents**:
```bash
# Check directory structure
ls -la .agent/artifacts/
ls -la .agent/logs/

# Recreate if missing
mkdir -p .agent/artifacts .agent/logs
```

**Dashboard not loading**:
```bash
# Start dashboard manually
cd .agent/dashboard
node server.js

# Check for port conflicts
lsof -i :3000
```

### Performance Issues

**Slow dashboard loading**:
- Check log file sizes in `.agent/logs/`
- Consider archiving old log files
- Restart dashboard server

**Git worktree conflicts** (Claude Code):
- Clean up stale worktrees: `git worktree prune`
- Check for uncommitted changes in worktrees
- Ensure sufficient disk space

### Platform-Specific Issues

**Claude Code**:
- Verify programmatic agent spawning is enabled
- Check for Claude Code platform updates
- Validate `.claude/commands/` syntax

**Cursor**:
- Ensure manual subagent invocation is working
- Check Cursor subagent system is enabled
- Validate YAML frontmatter in agent definitions

### Getting Help

1. **Check the logs**:
   ```bash
   # View recent build logs
   /build-log  # Claude Code
   # or manually check .agent/logs/[latest].jsonl
   ```

2. **Verify platform setup**:
   ```bash
   node setup.js --verify
   ```

3. **Reset to clean state**:
   ```bash
   # Remove artifacts and logs
   rm -rf .agent/artifacts/* .agent/logs/*
   
   # Re-run setup
   node setup.js
   ```

4. **Platform-specific reset**:
   ```bash
   # Claude Code only
   rm -rf .cursor/
   
   # Cursor only  
   rm -rf .claude/
   ```

For additional support, check the project repository issues or contact [mike.carmody@c3.ai](mailto:mike.carmody@c3.ai).

## Advanced Configuration

### Custom Platform Detection

You can override platform detection by setting environment variables:

```bash
# Force Claude Code mode
export CLAUDE_CODE=1

# Force Cursor mode  
export CURSOR_IDE=1

# Force dual platform mode
export DUAL_PLATFORM=1
```

### Dashboard Customization

The dashboard automatically detects your platform and shows relevant UI elements. You can customize this behavior by modifying `.agent/dashboard/server.js`.

### Logging Configuration

Both platforms use the same JSONL logging format with platform identification:

```json
{
  "ts": "2026-03-27T21:00:00Z",
  "run_id": "20260327-210000-jwt-auth",
  "platform": "cursor",
  "phase": "executor",
  "event": "phase.start",
  "iteration": 0,
  "data": {"task": "add JWT authentication"}
}
```

### Integration with CI/CD

Both platforms can be integrated into CI/CD pipelines:

**Claude Code** (fully automated):
```yaml
# GitHub Actions example
- name: Run autonomous build
  run: echo "/build ${{ github.event.pull_request.title }}" | claude-code
```

**Cursor** (requires scripting):
```yaml
# Requires custom orchestration script
- name: Run manual build pipeline  
  run: ./scripts/cursor-build.sh "${{ github.event.pull_request.title }}"
```