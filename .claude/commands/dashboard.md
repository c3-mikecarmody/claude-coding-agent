---
name: dashboard
description: Start (or stop) the observability dashboard server. Usage: /dashboard [--stop]
---

Start the observability dashboard server.

**Argument parsing:**

Parse `$ARGUMENTS` for:
- `--stop` — find and kill the running dashboard server process instead of starting one

---

**Step 1 — Check for `--stop`**

If `$ARGUMENTS` contains `--stop`:

Run:

```bash
pgrep -f "node .agent/dashboard/server.js"
```

If no process is found, print:

```
No dashboard server process found. Nothing to stop.
```

If a process is found, kill it:

```bash
pkill -f "node .agent/dashboard/server.js"
```

Print:

```
Dashboard server stopped.
```

Stop here. Do not proceed to Step 2.

---

**Step 2 — Preflight: check `node`**

Run:

```bash
node --version
```

If the command fails or `node` is not found, print:

```
Error: node is not available. Install Node.js (https://nodejs.org) and ensure it is on your PATH, then re-run this command.
```

Stop. Do not proceed.

---

**Step 3 — Preflight: check server file**

Check whether `.agent/dashboard/server.js` exists:

```bash
test -f .agent/dashboard/server.js
```

If the file does not exist, print:

```
Error: .agent/dashboard/server.js not found. Run /build first to generate the dashboard, or verify the repo is complete.
```

Stop. Do not proceed.

---

**Step 4 — Ensure artifact directories exist**

```bash
mkdir -p .agent/artifacts/agent-status
mkdir -p .agent/artifacts/eval-history
```

---

**Step 5 — Start the server**

```bash
node .agent/dashboard/server.js &
```

Then print:

```
Dashboard started. Open http://localhost:3000 in your browser. (actual port may vary if 3000 is in use — check the output above)
```

---

**What NOT to do:**
- Do not start the server if `node` is unavailable or `server.js` is missing
- Do not kill unrelated node processes when `--stop` is used
