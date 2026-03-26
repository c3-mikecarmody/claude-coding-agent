---
name: jira-build
description: Fetch a Jira ticket and run it through the full build pipeline. Usage: /jira-build [ticket-id | --urgent] [project=KEY]
---

Fetch a Jira ticket and run it through the coding pipeline.

**Argument parsing:**

Parse `$ARGUMENTS` for:
- A ticket ID (e.g. `SWAT-123`) — fetch that specific ticket
- `--urgent` or no ticket ID — fetch the most urgent open ticket
- `project=KEY` (e.g. `project=SWAT`) — scope search to that project (optional)

---

**Step 1 — Fetch ticket**

**If a ticket ID was provided:**

Use the Jira MCP tool `getJiraIssue` with that ID. If the ticket doesn't exist or you don't have access, print an error and stop.

**If no ticket ID (or `--urgent`):**

Build a JQL query to find the most urgent open ticket:

```
status not in (Done, Closed, Resolved) AND priority in (Highest, High) ORDER BY priority ASC, created ASC
```

If `project=KEY` was provided, prepend `project = KEY AND` to the query.

Use `searchJiraIssuesUsingJql` with `maxResults: 5`. Show the user a numbered list:

```
Open tickets by priority:
1. SWAT-42  [Highest]  Auth tokens not expiring correctly
2. SWAT-38  [High]     Pagination breaks on empty result set
3. SWAT-31  [High]     User profile image upload fails > 2MB
...

Which ticket should I work on? (enter number or ticket ID, or 'cancel')
```

Wait for the user to respond. If they say cancel, stop. Otherwise fetch the selected ticket with `getJiraIssue`.

---

**Step 2 — Summarize ticket**

From the fetched ticket, extract:
- **ID** — e.g. `SWAT-42`
- **Summary** — the ticket title
- **Description** — full description text
- **Acceptance criteria** — if present in the description or a dedicated field
- **Priority** — for context
- **Labels / components** — if any

Print a summary:

```
Ticket: SWAT-42 [Highest]
Summary: Auth tokens not expiring correctly
---
<description>
---
Proceed with /build? (yes / no)
```

Wait for confirmation. If no, stop.

---

**Step 3 — Build**

Format the task description for the planner:

```
<ticket summary>

Context from Jira ticket <ticket-id>:
<description, trimmed to essential details>

Acceptance criteria:
<acceptance criteria if present, otherwise omit this section>
```

Write this to `.agent/artifacts/ticket.md` so the planner has full context.

Then run the full build pipeline exactly as `/build` does, with this task description. Follow all the same steps:

1. Setup — `mkdir -p .agent/artifacts`, clear stale eval.json
2. Plan — spawn `subagent_type: planner` with: "Plan this task: <ticket summary>. Full context is in .agent/artifacts/ticket.md"
3. Decompose — spawn `subagent_type: decomposer`
4. Execute → Evaluate loop (up to 3 iterations)
5. Report
6. PR prompt — if passed, use the ticket ID and summary as the PR title: `<ticket-id>: <summary>`

---

**What NOT to do:**
- Do not start building without user confirmation in Step 2
- Do not modify the ticket content — pass it as-is to the planner
- Do not create a PR if the build failed
