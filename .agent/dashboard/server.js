'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const REPO_ROOT = path.resolve(__dirname, '../..');
const ARTIFACTS = path.join(REPO_ROOT, '.agent', 'artifacts');

// ─── Platform Detection ──────────────────────────────────────────────────────

function detectPlatform() {
  // Check for Claude Code specific indicators
  if (fs.existsSync(path.join(REPO_ROOT, '.claude/commands/')) && process.env.CLAUDE_CODE) {
    return 'claude-code';
  }
  
  // Check for Cursor specific indicators  
  if (fs.existsSync(path.join(REPO_ROOT, '.cursor/')) || process.env.CURSOR_IDE) {
    return 'cursor';
  }
  
  // Fallback detection based on file structure
  if (fs.existsSync(path.join(REPO_ROOT, '.claude/')) && !fs.existsSync(path.join(REPO_ROOT, '.cursor/'))) {
    return 'claude-code';
  }
  
  if (fs.existsSync(path.join(REPO_ROOT, '.cursor/')) && !fs.existsSync(path.join(REPO_ROOT, '.claude/'))) {
    return 'cursor';
  }
  
  return 'unknown';
}

// ─── Platform-aware logging helper ──────────────────────────────────────────

function generateLogEntry(runId, phase, event, iteration, data) {
  const platform = detectPlatform();
  const timestamp = new Date().toISOString();
  
  return JSON.stringify({
    ts: timestamp,
    run_id: runId,
    platform: platform,
    phase: phase,
    event: event,
    iteration: iteration,
    data: data || {}
  });
}

// ─── File helpers ────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

function fileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch (_) {
    return null;
  }
}

function fileExists(filePath) {
  try {
    fs.statSync(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

function listDir(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (_) {
    return [];
  }
}


// ─── Platform Detection ──────────────────────────────────────────────────────

function detectCurrentPlatform() {
  // Check for Claude Code specific indicators
  if (fs.existsSync('.claude/commands/') && process.env.CLAUDE_CODE) {
    return 'claude-code';
  }
  
  // Check for Cursor specific indicators  
  if (fs.existsSync('.cursor/') || process.env.CURSOR_IDE) {
    return 'cursor';
  }
  
  // Fallback detection based on file structure
  if (fs.existsSync('.claude/') && !fs.existsSync('.cursor/')) {
    return 'claude-code';
  }
  
  if (fs.existsSync('.cursor/') && !fs.existsSync('.claude/')) {
    return 'cursor';
  }
  
  return 'unknown';
}

// ─── Status derivation ───────────────────────────────────────────────────────

function derivePhase(ticketExists, specExists, tasksExists, evalData) {
  if (!ticketExists && !specExists && !tasksExists && !evalData) return 'idle';
  if (ticketExists && !specExists) return 'planning';
  if (specExists && !tasksExists) return 'decomposing';
  if (tasksExists && !evalData) return 'executing';
  if (evalData) {
    if (evalData.verdict === 'pass') return 'done';
    if (evalData.verdict === 'fail' && evalData.retry === false) return 'failed';
    if (evalData.verdict === 'fail') return 'retrying';
    // eval.json exists but no verdict yet
    return 'evaluating';
  }
  return 'idle';
}

function parseTicket(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const header = lines[0] || '';
  const match = header.match(/^#\s*([^:]+):\s*(.+)/);
  const id = match ? match[1].trim() : null;
  const summary = match ? match[2].trim() : header.replace(/^#+\s*/, '').trim();

  let source = 'Unknown';
  for (const line of lines) {
    const sm = line.match(/^Source:\s*(.+)/i);
    if (sm) { source = sm[1].trim(); break; }
  }

  const platform = detectCurrentPlatform();
  
  return {
    platform, id, summary, source };
}

function parseAgents() {
  const dir = path.join(ARTIFACTS, 'agent-status');
  const files = listDir(dir);
  const agents = [];
  const now = Date.now();
  const platform = detectPlatform();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const data = readJSON(path.join(dir, file));
    if (!data) continue;

    let stalled = false;
    if (data.status === 'running' && data.startedAt) {
      const elapsed = now - new Date(data.startedAt).getTime();
      if (elapsed > 10 * 60 * 1000) stalled = true;
    }

    agents.push({
      ...data,
      stalled,
      platform: data.platform || platform, // Include platform metadata
    });
  }

  return agents;
}

function parseTimeline() {
  const entries = [
    { file: path.join(ARTIFACTS, 'ticket.md'),  event: 'Ticket loaded' },
    { file: path.join(ARTIFACTS, 'spec.md'),    event: 'Planning complete' },
    { file: path.join(ARTIFACTS, 'tasks.json'), event: 'Decomposition complete' },
    { file: path.join(ARTIFACTS, 'notes.md'),   event: 'Execution complete' },
    { file: path.join(ARTIFACTS, 'eval.json'),  event: 'Evaluation complete' },
  ];

  const timeline = [];
  for (const { file, event } of entries) {
    const ts = fileMtime(file);
    if (ts) timeline.push({ event, timestamp: ts });
  }

  timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return timeline;
}

function parseEvalHistory() {
  const dir = path.join(ARTIFACTS, 'eval-history');
  const files = listDir(dir)
    .filter(f => f.match(/^eval-\d+\.json$/))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    });

  return files.map(f => {
    const data = readJSON(path.join(dir, f));
    if (!data) return null;
    return { ...data, _mtime: fileMtime(path.join(dir, f)) };
  }).filter(Boolean);
}

function buildStatus() {
  const ticketPath = path.join(ARTIFACTS, 'ticket.md');
  const specPath   = path.join(ARTIFACTS, 'spec.md');
  const notesPath  = path.join(ARTIFACTS, 'notes.md');
  const tasksPath  = path.join(ARTIFACTS, 'tasks.json');
  const evalPath   = path.join(ARTIFACTS, 'eval.json');

  const ticketExists = fileExists(ticketPath);
  const specExists   = fileExists(specPath);
  const tasksExists  = fileExists(tasksPath);
  const evalData     = readJSON(evalPath);

  const phase = derivePhase(ticketExists, specExists, tasksExists, evalData);
  const platform = detectPlatform();

  const ticketText = readText(ticketPath);
  const ticket = parseTicket(ticketText);

  const specText  = readText(specPath);
  const notesText = readText(notesPath);

  const ticketLoadedAt   = fileMtime(ticketPath);
  const evalCompletedAt  = fileMtime(evalPath);
  const duration = (ticketLoadedAt && evalCompletedAt)
    ? Math.floor((new Date(evalCompletedAt) - new Date(ticketLoadedAt)) / 1000)
    : null;

  const tasksData = readJSON(tasksPath);
  const tasks = tasksData ? (tasksData.tasks || tasksData) : null;

  const evalResult = evalData
    ? { verdict: evalData.verdict, summary: evalData.summary, issues: evalData.issues || [], retry: evalData.retry }
    : null;

  // Derive iteration from eval history count
  const evalHistory = parseEvalHistory();
  const iteration = evalHistory.length;

  const agents = parseAgents();
  const timeline = parseTimeline();

  // Artifacts list
  const artifactFiles = [
    'ticket.md', 'spec.md', 'tasks.json', 'notes.md', 'eval.json',
  ].map(name => {
    const fp = path.join(ARTIFACTS, name);
    const ts = fileMtime(fp);
    return { name, exists: !!ts, mtime: ts };
  });

  return {
    phase,
    iteration,
    platform,
    ticket,
    tasks,
    eval: evalResult,
    agents,
    timeline,
    evalHistory,
    artifacts: artifactFiles,
    spec: specText,
    notes: notesText,
    duration,
    ticketLoadedAt,
    evalCompletedAt,
  };
}

// ─── HTML Dashboard ──────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Pipeline Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #22263a;
    --border: #2e3250;
    --text: #e2e8f0;
    --text-muted: #8892a4;
    --accent: #6366f1;

    --c-idle: #6b7280;
    --c-planning: #3b82f6;
    --c-decomposing: #06b6d4;
    --c-executing: #eab308;
    --c-evaluating: #f97316;
    --c-retrying: #f97316;
    --c-done: #22c55e;
    --c-failed: #ef4444;
    --c-stalled: #ef4444;
    --c-running: #22c55e;

    --c-platform-claude: #8b5cf6;
    --c-platform-cursor: #06b6d4;
    --c-platform-unknown: #6b7280;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 24px;
  }

  h1 { font-size: 22px; font-weight: 700; color: var(--text); }
  h2 { font-size: 15px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
  h3 { font-size: 13px; font-weight: 600; }

  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    flex-wrap: wrap;
  }
  .header-right { margin-left: auto; color: var(--text-muted); font-size: 12px; }

  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .badge-idle       { background: var(--c-idle);       color: #fff; }
  .badge-planning   { background: var(--c-planning);   color: #fff; }
  .badge-decomposing{ background: var(--c-decomposing); color: #000; }
  .badge-executing  { background: var(--c-executing);  color: #000; }
  .badge-evaluating { background: var(--c-evaluating); color: #fff; }
  .badge-retrying   { background: var(--c-retrying);   color: #fff; animation: pulse 1.4s ease-in-out infinite; }
  .badge-done       { background: var(--c-done);       color: #000; }
  .badge-failed     { background: var(--c-failed);     color: #fff; }

  .platform-badge { font-size: 11px; text-transform: uppercase; }
  .badge-claude-code { background: var(--c-platform-claude); color: #fff; }
  .badge-cursor     { background: var(--c-platform-cursor); color: #000; }
  .badge-unknown    { background: var(--c-platform-unknown); color: #fff; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: .5; }
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 20px;
  }

  /* Pipeline */
  .pipeline {
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .stage {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-weight: 500;
    font-size: 13px;
    color: var(--text-muted);
    background: var(--surface2);
    border: 1px solid var(--border);
    position: relative;
    transition: all .2s;
  }
  .stage.active {
    color: var(--text);
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .stage.done-stage { color: var(--c-done); border-color: var(--c-done); }
  .arrow {
    color: var(--border);
    font-size: 16px;
    padding: 0 4px;
    flex-shrink: 0;
  }
  .check { color: var(--c-done); }

  /* Agents */
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .agent-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .agent-name { font-weight: 600; margin-bottom: 6px; }
  .agent-status { font-size: 12px; }
  .status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 5px;
  }
  .dot-idle    { background: var(--c-idle); }
  .dot-running { background: var(--c-running); box-shadow: 0 0 0 2px #16a34a55; animation: pulse 1s ease-in-out infinite; }
  .dot-done    { background: var(--c-done); }
  .dot-failed  { background: var(--c-failed); }
  .dot-stalled { background: var(--c-stalled); }

  .elapsed { color: var(--text-muted); font-size: 11px; margin-top: 4px; }

  /* Eval */
  .verdict-pass { color: var(--c-done); font-weight: 700; }
  .verdict-fail { color: var(--c-failed); font-weight: 700; }
  .issues-list { list-style: none; margin-top: 10px; }
  .issues-list li { padding: 6px 10px; background: var(--surface2); border-radius: 6px; margin-bottom: 6px; border-left: 3px solid var(--c-failed); font-size: 13px; }

  /* Eval history table */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 10px; color: var(--text-muted); border-bottom: 1px solid var(--border); font-weight: 500; }
  td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }

  /* Timeline */
  .timeline { list-style: none; }
  .timeline li { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); align-items: baseline; }
  .timeline li:last-child { border-bottom: none; }
  .tl-event { flex: 1; }
  .tl-ts { color: var(--text-muted); font-size: 11px; white-space: nowrap; }

  /* Artifacts */
  details summary { cursor: pointer; user-select: none; color: var(--text-muted); padding: 4px 0; }
  details summary:hover { color: var(--text); }
  .artifact-row { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .artifact-row:last-child { border-bottom: none; }
  .artifact-name { flex: 1; font-family: monospace; }
  .artifact-ts { color: var(--text-muted); font-size: 11px; }
  .exists-yes { color: var(--c-done); }
  .exists-no  { color: var(--c-idle); }

  /* Ticket info */
  .ticket-info { color: var(--text-muted); font-size: 13px; }
  .ticket-id { font-weight: 600; color: var(--accent); }

  .muted { color: var(--text-muted); font-size: 13px; }
  .mt-8 { margin-top: 8px; }

  .last-updated { font-size: 11px; color: var(--text-muted); }

  .duration-display { font-size: 12px; color: var(--text-muted); margin-left: 4px; }

  .platform-info { font-size: 13px; line-height: 1.6; }
  .platform-commands { background: var(--surface2); border-radius: 6px; padding: 12px; margin-top: 10px; font-family: monospace; font-size: 12px; }
  .platform-commands code { color: var(--accent); }
  .platform-warning { color: var(--c-failed); font-weight: 500; }

  .details-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text-muted); font-size: 12px; padding: 3px 10px; border-radius: 6px; cursor: pointer; }
  .details-btn:hover { color: var(--text); border-color: var(--accent); }

  .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; align-items:center; justify-content:center; }
  .modal-overlay.open { display:flex; }
  .modal { background:#1e1e2e; border:1px solid #333; border-radius:8px; padding:24px; max-width:720px; width:90%; max-height:80vh; overflow-y:auto; position:relative; }
  .modal-close { position:absolute; top:12px; right:16px; background:none; border:none; color:#aaa; font-size:20px; cursor:pointer; }
  .modal-close:hover { color:#fff; }
  .modal h3 { color:#cdd6f4; margin:16px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #333; padding-bottom:4px; }
  .modal h3:first-child { margin-top:0; }
  .modal pre { background:#12121a; border-radius:4px; padding:12px; font-size:12px; white-space:pre-wrap; word-break:break-word; color:#a6adc8; overflow-x:auto; max-height:200px; overflow-y:auto; }
  .modal .task-row { padding:8px 0; border-bottom:1px solid #2a2a3a; }
  .modal .task-row:last-child { border-bottom:none; }
  .modal .task-id { color:#89b4fa; font-family:monospace; font-size:12px; }
  .modal .task-desc { color:#cdd6f4; font-size:13px; margin:4px 0; }
  .modal .task-files { color:#6c7086; font-size:11px; font-family:monospace; }
  .modal .issue-row { padding:6px 8px; margin:4px 0; border-radius:4px; background:#12121a; font-size:12px; }
  .modal .issue-row .sev-error { color:#f38ba8; }
  .modal .issue-row .sev-warning { color:#fab387; }
</style>
</head>
<body>

<div id="app">
  <div class="header">
    <h1>Agent Pipeline Dashboard</h1>
    <span id="platform-badge" class="badge" style="background: var(--c-idle); color: #fff; font-size: 11px; margin-left: 8px;"></span>
    <span id="phase-badge" class="badge">loading…</span>
    <span id="platform-badge" class="badge platform-badge">loading…</span>
    <span id="duration-display" class="duration-display"></span>
    <span id="ticket-info" class="ticket-info"></span>
    <button class="details-btn" onclick="openModal(_lastData)">Details</button>
    <div class="header-right"><span class="last-updated" id="last-updated"></span></div>
  </div>

  <div class="card">
    <h2>Pipeline</h2>
    <div id="pipeline" class="pipeline"></div>
  </div>

  <div id="platform-card" class="card">
    <h2>Platform Status</h2>
    <div id="platform-content"></div>
  </div>

  <div class="card">
    <h2>Agents</h2>
    <div id="agents" class="agents-grid"></div>
  </div>

  <div id="eval-card" class="card" style="display:none">
    <h2>Evaluation Result</h2>
    <div id="eval-content"></div>
  </div>

  <div id="history-card" class="card" style="display:none">
    <h2>Eval History</h2>
    <div id="history-content"></div>
  </div>

  <div class="card">
    <h2>Timeline</h2>
    <ul id="timeline" class="timeline"></ul>
  </div>

  <div class="card">
    <details>
      <summary>Artifacts</summary>
      <div id="artifacts" class="mt-8"></div>
    </details>
  </div>

  <div id="modal-overlay" class="modal-overlay">
    <div class="modal">
      <button id="modal-close" class="modal-close" onclick="closeModal()">&#x2715;</button>
      <div id="modal-body"></div>
    </div>
  </div>
</div>

<script>
const STAGES = ['Ticket', 'Plan', 'Decompose', 'Execute', 'Evaluate'];
const PHASE_STAGE = {
  idle: -1,
  planning: 0,
  decomposing: 1,
  executing: 2,
  evaluating: 3,
  retrying: 3,
  done: 4,
  failed: 4,
};

const KNOWN_AGENTS = ['planner', 'decomposer', 'executor', 'evaluator'];

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

function formatDuration(s) {
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return m + 'm ' + sec + 's';
  return Math.floor(m/60) + 'h ' + (m%60) + 'm';
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  } catch(_) { return iso; }
}

function elapsed(startedAt, endedAt) {
  const end = endedAt ? new Date(endedAt) : new Date();
  const diff = Math.floor((end - new Date(startedAt)) / 1000);
  if (diff < 60) return diff + 's';
  if (diff < 3600) return Math.floor(diff/60) + 'm ' + (diff%60) + 's';
  return Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'm';
}

function renderPipeline(phase) {
  const activeIdx = PHASE_STAGE[phase] ?? -1;
  const isDone = phase === 'done';
  const isFailed = phase === 'failed';

  return STAGES.map((s, i) => {
    let cls = 'stage';
    let icon = '';
    if (i < activeIdx || (isDone)) {
      cls += ' done-stage';
      icon = '<span class="check">✓</span>';
    } else if (i === activeIdx && !isDone && !isFailed) {
      cls += ' active';
    }
    if (i === activeIdx && isFailed) {
      cls += ' active';
      icon = '<span style="color:var(--c-failed)">✗</span>';
    }
    const arrow = i < STAGES.length - 1 ? '<span class="arrow">›</span>' : '';
    return \`<div class="\${cls}">\${icon}\${esc(s)}</div>\${arrow}\`;
  }).join('');
}

function renderAgents(agentsData) {
  // Merge known agents with received data
  const map = {};
  for (const a of agentsData) {
    const key = (a.agent || '').toLowerCase();
    map[key] = a;
  }

  function agentCard(name, a) {
    const status = a ? (a.stalled ? 'stalled' : a.status) : 'idle';
    const dotCls = 'dot-' + status;
    let elapsedStr = '';
    if (a && (a.status === 'running' || a.status === 'done') && a.startedAt) {
      elapsedStr = elapsed(a.startedAt, a.completedAt);
    }
    return \`<div class="agent-card">
      <div class="agent-name">\${esc(name)}</div>
      <div class="agent-status">
        <span class="status-dot \${dotCls}"></span>\${esc(status)}
      </div>
      \${elapsedStr ? \`<div class="elapsed">\${esc(elapsedStr)}</div>\` : ''}
    </div>\`;
  }

  const knownCards = KNOWN_AGENTS.map(name => agentCard(name, map[name] || null));

  // Executor-task agents (executor-task1, executor-task2, etc.)
  const taskAgents = agentsData.filter(a => (a.agent || '').startsWith('executor-task'));
  const taskCards = taskAgents.map(a => agentCard(a.agent, a));

  return knownCards.concat(taskCards).join('');
}

function renderEval(ev) {
  if (!ev) return '';
  const vCls = ev.verdict === 'pass' ? 'verdict-pass' : 'verdict-fail';
  const issues = (ev.issues || []).map(i => {
    const txt = typeof i === 'string' ? i : [i.severity, i.file, i.line ? 'L' + i.line : '', i.reason || i.message || ''].filter(Boolean).join(' \u2014 ');
    return \`<li>\${esc(txt)}</li>\`;
  }).join('');
  return \`<div>
    <span class="\${vCls}">\${esc(ev.verdict || '—')}</span>
    \${ev.summary ? \`<p class="mt-8">\${esc(ev.summary)}</p>\` : ''}
    \${issues ? \`<ul class="issues-list">\${issues}</ul>\` : ''}
    \${ev.retry === false ? '<p class="mt-8 muted">Retry: disabled</p>' : ''}
  </div>\`;
}

function renderHistory(history) {
  if (!history || !history.length) return '';
  const rows = history.map((h, i) => \`<tr>
    <td>\${i+1}</td>
    <td>\${esc(h.verdict || '—')}</td>
    <td>\${esc(h.summary || '')}</td>
    <td>\${(h.issues||[]).length}</td>
  </tr>\`).join('');
  return \`<table>
    <thead><tr><th>#</th><th>Verdict</th><th>Summary</th><th>Issues</th></tr></thead>
    <tbody>\${rows}</tbody>
  </table>\`;
}

function renderTimeline(tl) {
  if (!tl || !tl.length) return '<li class="muted">No events yet</li>';
  return tl.map(e => \`<li>
    <span class="tl-event">\${esc(e.event)}</span>
    <span class="tl-ts">\${fmtTime(e.timestamp)}</span>
  </li>\`).join('');
}

function renderArtifacts(artifacts) {
  return (artifacts || []).map(a => \`<div class="artifact-row">
    <span class="\${a.exists ? 'exists-yes' : 'exists-no'}">\${a.exists ? '✓' : '○'}</span>
    <span class="artifact-name">\${esc(a.name)}</span>
    \${a.mtime ? \`<span class="artifact-ts">\${fmtTime(a.mtime)}</span>\` : ''}
  </div>\`).join('');
}

function renderPlatformInfo(platform, phase) {
  const platformName = platform === 'claude-code' ? 'Claude Code' : 
                      platform === 'cursor' ? 'Cursor' : 'Unknown';
  
  let content = \`<div class="platform-info">
    <p><strong>Detected Platform:</strong> \${esc(platformName)}</p>\`;

  if (platform === 'claude-code') {
    content += \`<p>Using Claude Code orchestration with programmatic subagent spawning.</p>
      <div class="platform-commands">
        <strong>Available Commands:</strong><br>
        <code>/build &lt;task&gt;</code> - Run full pipeline<br>
        <code>/dashboard</code> - Open this dashboard<br>
        <code>/build-log</code> - View execution logs
      </div>\`;
    
    // Add phase-specific guidance for Claude Code
    if (phase === 'idle') {
      content += \`<p><strong>Next Step:</strong> Use <code>/build &lt;your-task&gt;</code> to start a new build.</p>\`;
    }
  } else if (platform === 'cursor') {
    content += \`<p>Using Cursor subagent system with manual orchestration.</p>
      <div class="platform-commands">
        <strong>Manual Workflow:</strong><br>
        1. <code>@planner</code> - Analyze and create spec<br>
        2. <code>@decomposer</code> - Break down into tasks<br>
        3. <code>@executor</code> - Implement the solution<br>
        4. <code>@evaluator</code> - Review and validate
      </div>\`;
    
    // Add phase-specific guidance for Cursor
    if (phase === 'idle') {
      content += \`<p><strong>Next Step:</strong> Use <code>@planner</code> to analyze your task and create a spec.</p>\`;
    } else if (phase === 'planning') {
      content += \`<p><strong>Next Step:</strong> Use <code>@decomposer</code> to break down the spec into tasks.</p>\`;
    } else if (phase === 'decomposing') {
      content += \`<p><strong>Next Step:</strong> Use <code>@executor</code> to implement the solution.</p>\`;
    } else if (phase === 'executing') {
      content += \`<p><strong>Next Step:</strong> Use <code>@evaluator</code> to review and validate the implementation.</p>\`;
    } else if (phase === 'evaluating') {
      content += \`<p><strong>Status:</strong> Evaluation in progress. Check back soon for results.</p>\`;
    } else if (phase === 'retrying') {
      content += \`<p><strong>Next Step:</strong> Use <code>@executor</code> to fix the issues identified by the evaluator.</p>\`;
    }
  } else {
    content += \`<div class="platform-warning">
        <p>⚠️ Platform not detected. Run <code>node setup.js</code> to configure dual platform support.</p>
        <p>This repository supports both Claude Code and Cursor platforms.</p>
      </div>\`;
  }

  content += '</div>';
  return content;
}

function render(data) {
  const phase = data.phase || 'idle';

  // Phase badge
  const badge = document.getElementById('phase-badge');
  badge.className = 'badge badge-' + phase;
  badge.textContent = phase;
  
  // Platform badge
  const platformBadge = document.getElementById('platform-badge');
  if (data.platform) {
    platformBadge.textContent = data.platform.toUpperCase();
    platformBadge.style.display = 'inline-block';
  } else {
    platformBadge.style.display = 'none';
  }

  // Platform badge
  const platformBadge = document.getElementById('platform-badge');
  const platform = data.platform || 'unknown';
  platformBadge.className = 'badge platform-badge badge-' + platform.replace('-', '');
  platformBadge.textContent = platform;

  // Ticket
  const ti = document.getElementById('ticket-info');
  if (data.ticket && (data.ticket.id || data.ticket.summary)) {
    ti.innerHTML = data.ticket.id
      ? \`<span class="ticket-id">\${esc(data.ticket.id)}</span> — \${esc(truncate(data.ticket.summary, 60))} <span style="color:var(--text-muted)">[</span>\${esc(data.ticket.source)}<span style="color:var(--text-muted)">]</span>\`
      : esc(truncate(data.ticket.summary, 60));
  } else {
    ti.textContent = '';
  }

  // Duration display (Change 2)
  if (_durationInterval) { clearInterval(_durationInterval); _durationInterval = null; }
  var durEl = document.getElementById('duration-display');
  if (data.duration !== null && data.duration !== undefined) {
    durEl.textContent = formatDuration(data.duration);
  } else if (data.ticketLoadedAt) {
    var _ticketLoadedAt = data.ticketLoadedAt;
    var updateLiveDuration = function() {
      var s = Math.floor((Date.now() - new Date(_ticketLoadedAt)) / 1000);
      durEl.textContent = formatDuration(s);
    };
    updateLiveDuration();
    _durationInterval = setInterval(updateLiveDuration, 1000);
  } else {
    durEl.textContent = '';
  }

  // Pipeline
  document.getElementById('pipeline').innerHTML = renderPipeline(phase);

  // Agents
  document.getElementById('agents').innerHTML = renderAgents(data.agents || []);

  // Eval
  const evalCard = document.getElementById('eval-card');
  if (data.eval) {
    evalCard.style.display = '';
    document.getElementById('eval-content').innerHTML = renderEval(data.eval);
  } else {
    evalCard.style.display = 'none';
  }

  // Eval history
  const histCard = document.getElementById('history-card');
  if (data.evalHistory && data.evalHistory.length) {
    histCard.style.display = '';
    document.getElementById('history-content').innerHTML = renderHistory(data.evalHistory);
  } else {
    histCard.style.display = 'none';
  }

  // Timeline
  document.getElementById('timeline').innerHTML = renderTimeline(data.timeline);

  // Platform info
  document.getElementById('platform-content').innerHTML = renderPlatformInfo(data.platform || 'unknown', phase);

  // Artifacts
  document.getElementById('artifacts').innerHTML = renderArtifacts(data.artifacts);

  // Last updated
  document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

var _lastData = null;
var _durationInterval = null;

function openModal(data) {
  if (!data) return;
  var b = document.getElementById('modal-body');
  var h = '';
  if (data.platform) {
    h += '<h3>Platform</h3><p><strong>Detected:</strong> ' + esc(data.platform === 'claude-code' ? 'Claude Code' : data.platform === 'cursor' ? 'Cursor' : 'Unknown') + '</p>';
  }
  if (data.ticket) {
    h += '<h3>Ticket</h3><p><strong>' + esc(data.ticket.id) + '</strong>: ' + esc(data.ticket.summary) + '</p>';
  }
  if (data.spec) {
    h += '<h3>Plan</h3><pre>' + esc(data.spec) + '</pre>';
  }
  if (data.tasks && data.tasks.length) {
    h += '<h3>Tasks</h3>';
    data.tasks.forEach(function(t) {
      var ag = (data.agents || []).find(function(a) { return a.agent === 'executor-task' + t.id; });
      h += '<div class="task-row">';
      h += '<div><span class="task-id">' + esc(t.id) + '</span>' + (ag ? ' <span style="font-size:11px;color:#6c7086">' + esc(ag.status) + '</span>' : '') + '</div>';
      h += '<div style="color:#cdd6f4;font-size:13px;margin:4px 0">' + esc(t.description) + '</div>';
      if (t.files && t.files.length) h += '<div class="task-files">' + t.files.map(esc).join(' · ') + '</div>';
      h += '</div>';
    });
  }
  if (data.eval) {
    h += '<h3>Eval</h3>';
    if (data.eval.summary) h += '<p>' + esc(data.eval.summary) + '</p>';
    if (data.eval.issues && data.eval.issues.length) {
      data.eval.issues.forEach(function(i) {
        var txt = typeof i === 'string' ? i : [i.severity, i.file, i.line ? 'L' + i.line : '', i.reason || i.message || ''].filter(Boolean).join(' \u2014 ');
        h += '<div class="issue-row">' + esc(txt) + '</div>';
      });
    }
  }
  if (data.notes) {
    h += '<h3>Implementation Notes</h3><pre>' + esc(data.notes) + '</pre>';
  }
  b.innerHTML = h;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

async function refresh() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    _lastData = data;
    render(data);
  } catch(e) {
    document.getElementById('last-updated').textContent = 'Error: ' + e.message;
  }
}

refresh();
setInterval(refresh, 2000);

document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
</script>
</body>
</html>`;

// ─── HTTP server ──────────────────────────────────────────────────────────────

function isPortFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.listen(port, '127.0.0.1', () => { srv.close(() => resolve(true)); });
    srv.on('error', () => resolve(false));
  });
}

async function findPort(start) {
  for (let p = start; p <= start + 3; p++) {
    if (await isPortFree(p)) return p;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/status') {
    try {
      const status = buildStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

(async () => {
  const basePort = parseInt(process.env.PORT || '3000', 10);
  const port = await findPort(basePort);

  if (!port) {
    console.error('Could not find a free port in range ' + basePort + '–' + (basePort + 3));
    process.exit(1);
  }

  server.listen(port, () => {
    console.log('Dashboard running at http://localhost:' + port);
  });
})();
