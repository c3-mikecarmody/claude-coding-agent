# Installing the Coding Agent Autonomy Stack

Two supported paths: **one-shot installer** (clone + copy + `setup.js`) or **GitHub template** (new repo, then copy or run installer from a clone).

## Prerequisites

- **Git** (for the installer clone, or template workflow)
- **Node.js 18+** (for `setup.js` and the dashboard)

## One-shot installer (recommended)

From the directory where you want the stack (usually your app repo root):

```bash
curl -fsSL https://raw.githubusercontent.com/c3-mikecarmody/claude-coding-agent/main/scripts/install.sh | bash
```

The script asks whether to include **Claude Code** (`.claude/`), **Cursor** (`.cursor/`), or **both** — the choices are not mutually exclusive.

### Install into another directory

```bash
curl -fsSL https://raw.githubusercontent.com/c3-mikecarmody/claude-coding-agent/main/scripts/install.sh | bash -s -- --target /path/to/your/project
```

### Non-interactive (CI or scripts)

```bash
# Both platforms, default target = current directory
curl -fsSL https://raw.githubusercontent.com/c3-mikecarmody/claude-coding-agent/main/scripts/install.sh | bash -s -- --yes

# Claude Code only
curl -fsSL ... | bash -s -- --yes --claude

# Cursor only
curl -fsSL ... | bash -s -- --yes --cursor

# Explicit both
curl -fsSL ... | bash -s -- --yes --both
```

### Forks and pinned versions

```bash
export CA_STACK_REPO='https://github.com/your-org/claude-coding-agent.git'
export CA_STACK_REF='v1.0.0'
curl -fsSL https://raw.githubusercontent.com/your-org/claude-coding-agent/v1.0.0/scripts/install.sh | bash
```

Use `--repo` and `--ref` on a local script invocation if you prefer flags over environment variables.

### What gets installed

| Component | Purpose |
|-----------|---------|
| `.claude/` | Claude Code agents and slash commands (if selected) |
| `.cursor/` | Cursor agents and commands (if selected) |
| `.agent/dashboard/server.js` | Observability dashboard |
| `setup.js` | Shared directories, validation, optional Cursor generation from Claude agents |
| `PLATFORM.md` | Platform-specific usage |
| `coding-agent-stack.gitignore.snippet` | Patterns to merge into your `.gitignore` |
| `docs/INSTALL.md`, `docs/install-from-template.md` | This documentation |

After files are copied, the installer runs:

`node setup.js --platform=claude-code|cursor|both`

### Gitignore

Append the contents of `coding-agent-stack.gitignore.snippet` to your project `.gitignore` so artifacts and logs stay local.

### Interactive setup without the shell installer

If you already have the files (e.g. from a template repo), run:

```bash
node setup.js -i
```

to choose Claude / Cursor / both interactively.

## GitHub template (manual)

Use a **template repository** when you want a new project that already contains the stack, or you prefer to inspect diffs before integrating.

See [install-from-template.md](./install-from-template.md).

## Security note

Piping `curl` to `bash` is convenient; review `scripts/install.sh` in this repo (or pin `--ref` to a known tag) if you need supply-chain guarantees.
