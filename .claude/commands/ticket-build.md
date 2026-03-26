---
name: ticket-build
description: Fetch a ticket from Jira and/or GitHub Issues and run it through the full build pipeline. Usage: /ticket-build [ticket-id | #issue | --urgent] [source=jira|github] [project=KEY] [repo=owner/repo]
---

Fetch a ticket and run it through the coding pipeline.

**Argument parsing:**

Parse `$ARGUMENTS` for:
- A Jira ticket ID (e.g. `SWAT-123`) — fetch from Jira directly
- A GitHub issue (e.g. `#123` or `owner/repo#123`) — fetch from GitHub directly
- `--urgent` or no ID — query enabled sources and show unified priority list
- `source=jira` or `source=github` — restrict to one source
- `project=KEY` — scope Jira search to a project
- `repo=owner/repo` — scope GitHub search to a repo

---

**Step 0 — Preflight**

**0a. GitHub auth check**

Run:

```bash
gh auth status
```

If not authenticated, print:

```
GitHub CLI is not authenticated. Run `gh auth login` to continue, then re-run this command.
```

Stop. Do not proceed until auth passes.

**0b. Repo check**

Run:

```bash
git rev-parse --show-toplevel 2>/dev/null
```

If this succeeds, you're inside a git repo. Print the repo root path and continue to Step 1.

If it fails, ask the user:

```
You don't appear to be inside a git repo. How would you like to proceed?
  1. I don't have the repo yet — provide a GitHub URL or owner/repo and I'll clone it
  2. I have it locally — tell me the path and I'll navigate there
```

Wait for the user's response:

- **Option 1 (clone):** Ask for the repo URL or `owner/repo`. Run:
  ```bash
  gh repo clone <owner/repo>
  cd <repo-name>
  ```
  Confirm you're now inside the repo root, then continue to Step 1.

- **Option 2 (navigate):** Take the path they provide. Run:
  ```bash
  cd <path>
  git rev-parse --show-toplevel
  ```
  If that fails, tell the user the path doesn't appear to be a git repo and ask them to check it. Do not proceed until confirmed.

**0c. Load priority mapping**

Read `.claude/ticket-sources.yml`. This defines which sources are enabled and how their priority values map to the internal P1–P4 scale. If the file doesn't exist, use these defaults:

- Jira: `Highest/Critical → P1`, `High → P2`, `Medium → P3`, `Low/Lowest → P4`, default `P3`
- GitHub: `P1/critical/high priority → P1`, `high/bug → P2`, `medium → P3`, `low → P4`, default `P3`

If `source=` was specified, disable the other source regardless of what the config says.

---

**Step 1 — Fetch ticket(s)**

**If a specific ticket ID was provided:**

- Jira format (`PROJ-123`): use `getJiraIssue`. If not found or no access, print an error and stop.
- GitHub format (`#123` or `owner/repo#123`): use `gh issue view <number> --repo <owner/repo> --json number,title,body,labels,state`. If not found, print an error and stop.

Skip to Step 2.

**If no ID (or `--urgent`):**

Query each enabled source:

*Jira:* Build JQL:
```
status not in (Done, Closed, Resolved) AND priority in (Highest, Critical, High) ORDER BY priority ASC, created ASC
```
Prepend `project = KEY AND` if `project=` was given. Use `searchJiraIssuesUsingJql` with `maxResults: 10`.

*GitHub:* Run:
```bash
gh issue list --repo <owner/repo> --state open --json number,title,body,labels,createdAt --limit 20
```
If `repo=` was given, use that repo. Otherwise use the current repo (`gh repo view --json nameWithOwner`).

**Normalize priorities:**

For each result, apply the priority mapping from `ticket-sources.yml`:
- Jira: map the `priority.name` field
- GitHub: scan the issue's labels for the first match in the label map; use `default` if none match

**Merge and sort** all results by internal priority (P1 first), then by created date (oldest first within same priority).

Show the user a unified list (max 8):

```
Open tickets by priority:
1. [P1] SWAT-42   (Jira)    Auth tokens not expiring correctly
2. [P1] #87       (GitHub)  Password reset link invalid after first use
3. [P2] SWAT-38   (Jira)    Pagination breaks on empty result set
4. [P2] #91       (GitHub)  Profile image upload fails > 2MB
...

Which ticket should I work on? (enter number or ID, or 'cancel')
```

Wait for the user to respond. If they say cancel, stop. Otherwise fetch the full ticket details for the selected item.

---

**Step 2 — Summarize ticket**

Extract from the fetched ticket:
- **ID** — e.g. `SWAT-42` or `#87`
- **Source** — Jira or GitHub
- **Summary / title**
- **Description / body**
- **Acceptance criteria** — if present in description or a dedicated field
- **Priority** — internal P1–P4 and original value
- **Labels / components**

Print a summary:

```
Ticket: SWAT-42 [P1 / Highest] (Jira)
Summary: Auth tokens not expiring correctly
---
<description>
---
Proceed with build? (yes / no)
```

Wait for confirmation. If no, stop.

---

**Step 3 — Build**

Write ticket context to `.agent/artifacts/ticket.md`:

```
# <ticket-id>: <summary>

Source: <Jira|GitHub>
Priority: <P1–P4> (<original value>)
Labels: <labels if any>

## Description
<description>

## Acceptance criteria
<acceptance criteria if present, otherwise omit>
```

Then run the full build pipeline:

1. **Setup** — `mkdir -p .agent/artifacts`, clear stale `eval.json`
2. **Plan** — spawn `subagent_type: planner` with: `"Plan this task: <ticket summary>. Full context is in .agent/artifacts/ticket.md"`
3. **Decompose** — spawn `subagent_type: decomposer`
4. **Execute → Evaluate loop** — up to 3 iterations with worktree isolation
5. **Report** — print eval summary or blocking issues
6. **PR prompt** — if passed, ask user. PR title: `<ticket-id>: <summary>`

---

**What NOT to do:**
- Do not start building without user confirmation in Step 2
- Do not modify the ticket content — pass it as-is to the planner
- Do not create a PR if the build failed
- Do not query a disabled source
