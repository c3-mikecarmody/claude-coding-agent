# Install from a GitHub template

Use this flow when you want a **new repository** that already includes the Coding Agent Autonomy Stack, or you prefer to **copy files by hand** without running the shell installer.

## Enable “Template repository” (maintainers)

In the GitHub repo **Settings → General → Template repository**, enable **Template repository**.  
That adds a **Use this template** button for anyone with access.

This is a repository setting only; it does not change how the stack runs locally.

## Create a project from the template

1. Open `https://github.com/c3-mikecarmody/claude-coding-agent` (or your fork).
2. Click **Use this template** → **Create a new repository**.
3. Clone your new repository and open it in Cursor or Claude Code.

You now have the full stack tree (`.claude/`, `.cursor/`, `.agent/dashboard/`, `setup.js`, docs).

## Finish setup in the new repo

From the repository root:

```bash
node setup.js --platform=both
```

Or pick one platform:

```bash
node setup.js --platform=claude-code
node setup.js --platform=cursor
```

Or interactively:

```bash
node setup.js -i
```

## Using the template only as a reference (existing repo)

If you already have an application repository:

1. Create a **separate** repo from the template (or clone this repo once).
2. Copy the directories you need into your app root, for example:

```bash
# Example: from a clone of the template or this repo
cp -R /path/to/claude-coding-agent/.claude /your/app/
cp -R /path/to/claude-coding-agent/.cursor /your/app/
mkdir -p /your/app/.agent/dashboard
cp /path/to/claude-coding-agent/.agent/dashboard/server.js /your/app/.agent/dashboard/
cp /path/to/claude-coding-agent/setup.js /your/app/
cp /path/to/claude-coding-agent/PLATFORM.md /your/app/
cp /path/to/claude-coding-agent/coding-agent-stack.gitignore.snippet /your/app/
```

3. Append `coding-agent-stack.gitignore.snippet` to your app `.gitignore`.
4. Run `node setup.js --platform=...` in `/your/app`.

Alternatively, skip manual copying and use the one-shot installer against your app directory — see [INSTALL.md](./INSTALL.md).

## When to prefer the installer vs template

| Goal | Prefer |
|------|--------|
| Add stack to an **existing** repo quickly | [INSTALL.md](./INSTALL.md) one-shot installer |
| **New** repo that is the stack or a greenfield app + stack | GitHub template |
| Air-gapped or **no** `curl \| bash` | Template or manual copy + `node setup.js` |
