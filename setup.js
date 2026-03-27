#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Platform Detection ──────────────────────────────────────────────────────

function detectPlatform() {
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
  
  // Check for Cursor-specific directories in user home
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const cursorDirs = [
      path.join(homeDir, '.cursor'),
      path.join(homeDir, 'Library', 'Application Support', 'Cursor'),
      path.join(homeDir, 'AppData', 'Roaming', 'Cursor')
    ];
    
    for (const dir of cursorDirs) {
      if (fs.existsSync(dir)) {
        return 'cursor';
      }
    }
  }
  
  return 'unknown';
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created directory: ${dirPath}`);
  }
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  ensureDir(destDir);
  
  if (fs.existsSync(dest)) {
    console.log(`⚠ File exists, skipping: ${dest}`);
    return false;
  }
  
  fs.copyFileSync(src, dest);
  console.log(`✓ Copied: ${src} → ${dest}`);
  return true;
}

function fileExists(filePath) {
  try {
    fs.statSync(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

function readTemplate(templatePath, replacements = {}) {
  let content = fs.readFileSync(templatePath, 'utf8');
  
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return content;
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  
  if (fs.existsSync(filePath)) {
    console.log(`⚠ File exists, skipping: ${filePath}`);
    return false;
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`✓ Created: ${filePath}`);
  return true;
}

// ─── Platform-Specific Setup ─────────────────────────────────────────────────

function setupSharedDirectories() {
  console.log('\n📁 Setting up shared directories...');
  
  ensureDir('.agent');
  ensureDir('.agent/artifacts');
  ensureDir('.agent/artifacts/agent-status');
  ensureDir('.agent/artifacts/eval-history');
  ensureDir('.agent/logs');
  
  // Create run_id if it doesn't exist
  const runIdPath = '.agent/artifacts/run_id';
  if (!fileExists(runIdPath)) {
    const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(runIdPath, runId);
    console.log(`✓ Created run ID: ${runId}`);
  }
}

function setupClaudeCode() {
  console.log('\n🔵 Setting up Claude Code platform...');
  
  if (!fs.existsSync('.claude/')) {
    console.log('❌ No .claude/ directory found. This doesn\'t appear to be a Claude Code project.');
    return false;
  }
  
  // Verify required Claude files exist
  const requiredFiles = [
    '.claude/agents/planner.md',
    '.claude/agents/executor.md',
    '.claude/commands/build.md'
  ];
  
  const missing = requiredFiles.filter(f => !fileExists(f));
  if (missing.length > 0) {
    console.log('❌ Missing required Claude Code files:');
    missing.forEach(f => console.log(`   - ${f}`));
    return false;
  }
  
  console.log('✓ Claude Code platform detected and verified');
  return true;
}

function setupCursor() {
  console.log('\n🟡 Setting up Cursor platform...');
  
  ensureDir('.cursor');
  ensureDir('.cursor/agents');
  ensureDir('.cursor/commands');
  
  // Copy/convert Claude agents to Cursor format
  const agentMappings = [
    { claude: '.claude/agents/planner.md', cursor: '.cursor/agents/planner.md' },
    { claude: '.claude/agents/decomposer.md', cursor: '.cursor/agents/decomposer.md' },
    { claude: '.claude/agents/executor.md', cursor: '.cursor/agents/executor.md' },
    { claude: '.claude/agents/evaluator.md', cursor: '.cursor/agents/evaluator.md' }
  ];
  
  let copiedAgents = 0;
  for (const mapping of agentMappings) {
    if (fileExists(mapping.claude)) {
      if (convertClaudeAgentToCursor(mapping.claude, mapping.cursor)) {
        copiedAgents++;
      }
    } else {
      console.log(`⚠ Source agent not found: ${mapping.claude}`);
    }
  }
  
  // Create Cursor commands
  createCursorCommands();
  
  console.log(`✓ Cursor platform setup complete (${copiedAgents} agents converted)`);
  return true;
}

function convertClaudeAgentToCursor(claudePath, cursorPath) {
  if (fileExists(cursorPath)) {
    console.log(`⚠ Cursor agent exists, skipping: ${cursorPath}`);
    return false;
  }
  
  try {
    const claudeContent = fs.readFileSync(claudePath, 'utf8');
    
    // Extract YAML frontmatter and content
    const yamlMatch = claudeContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!yamlMatch) {
      console.log(`❌ Invalid Claude agent format: ${claudePath}`);
      return false;
    }
    
    const yamlContent = yamlMatch[1];
    const agentContent = yamlMatch[2];
    
    // Convert Claude YAML to Cursor format
    const cursorYaml = yamlContent
      .replace(/model:\s*opus/g, 'model: claude-3.5-sonnet')
      .replace(/tools:\s*\[([^\]]+)\]/g, (match, tools) => {
        // Convert tool names from Claude to Cursor format
        const converted = tools
          .split(',')
          .map(t => t.trim().replace(/"/g, ''))
          .map(t => {
            if (t === 'Bash') return 'Shell';
            return t;
          })
          .map(t => `"${t}"`)
          .join(', ');
        return `tools: [${converted}]`;
      });
    
    // Update agent content for Cursor compatibility
    const cursorContent = agentContent
      .replace(/```bash/g, '```shell')
      .replace(/Bash tool/g, 'Shell tool')
      .replace(/bash commands/g, 'shell commands');
    
    const finalContent = `---\n${cursorYaml}\n---\n\n${cursorContent}`;
    
    writeFile(cursorPath, finalContent);
    return true;
  } catch (error) {
    console.log(`❌ Error converting agent ${claudePath}: ${error.message}`);
    return false;
  }
}

function createCursorCommands() {
  console.log('\n📝 Creating Cursor commands...');
  
  // Build command
  const buildCommand = `# Build Pipeline

Use this command to run the complete coding agent pipeline in Cursor.

## Prerequisites

1. Run \`node setup.js\` to ensure platform setup is complete
2. Ensure you have a task description ready

## Manual Orchestration Workflow

Since Cursor doesn't support programmatic subagent spawning like Claude Code, you'll need to manually invoke each agent in sequence:

### Step 1: Planning
\`\`\`
@planner <your-task-description>
\`\`\`

Wait for the planner to complete and create \`.agent/artifacts/spec.md\`.

### Step 2: Decomposition  
\`\`\`
@decomposer
\`\`\`

Wait for the decomposer to complete and create \`.agent/artifacts/tasks.json\`.

### Step 3: Execution
\`\`\`
@executor
\`\`\`

Wait for the executor to complete and create \`.agent/artifacts/notes.md\`.

### Step 4: Evaluation
\`\`\`
@evaluator  
\`\`\`

Wait for the evaluator to complete and create \`.agent/artifacts/eval.json\`.

## Monitoring

Run the dashboard to monitor progress:
\`\`\`
node .agent/dashboard/server.js
\`\`\`

## Artifacts

All agents communicate through shared artifacts in \`.agent/artifacts/\`:
- \`spec.md\` - Implementation specification from planner
- \`tasks.json\` - Task breakdown from decomposer  
- \`notes.md\` - Implementation notes from executor
- \`eval.json\` - Evaluation results from evaluator

## Retry Logic

If evaluation fails:
1. Check \`.agent/artifacts/eval.json\` for issues
2. Re-run \`@executor\` to fix issues
3. Re-run \`@evaluator\` to verify fixes
`;

  writeFile('.cursor/commands/build.md', buildCommand);
  
  // Dashboard command
  const dashboardCommand = `# Dashboard

Launch the observability dashboard to monitor agent pipeline progress.

## Usage

\`\`\`bash
node .agent/dashboard/server.js
\`\`\`

The dashboard will be available at \`http://localhost:3000\` (or next available port).

## Features

- Real-time pipeline status
- Agent execution monitoring  
- Evaluation results and history
- Artifact timeline
- Platform detection (shows "Cursor" in the interface)

## Platform Awareness

The dashboard automatically detects you're using Cursor and provides:
- Manual orchestration guidance
- Cursor-specific next steps
- Agent invocation instructions
`;

  writeFile('.cursor/commands/dashboard.md', dashboardCommand);
  
  // Build log command
  const buildLogCommand = `# Build Log Viewer

View and analyze JSONL audit logs from agent pipeline execution.

## Usage

View recent logs:
\`\`\`bash
tail -f .agent/logs/*.jsonl
\`\`\`

View specific run:
\`\`\`bash
cat .agent/logs/[run-id].jsonl | jq '.'
\`\`\`

## Log Format

Each log entry contains:
- \`ts\` - ISO timestamp
- \`run_id\` - Unique run identifier  
- \`platform\` - "cursor" for Cursor platform
- \`phase\` - Current agent (planner, decomposer, executor, evaluator)
- \`event\` - Event type (phase.start, phase.end, etc.)
- \`data\` - Additional event data

## Analysis

Filter by phase:
\`\`\`bash
cat .agent/logs/*.jsonl | jq 'select(.phase == "executor")'
\`\`\`

Find errors:
\`\`\`bash  
cat .agent/logs/*.jsonl | jq 'select(.event == "error")'
\`\`\`
`;

  writeFile('.cursor/commands/build-log.md', buildLogCommand);
  
  // Ticket build command (optional)
  const ticketBuildCommand = `# Ticket Build

Build from Jira/GitHub tickets (if ticket integration is configured).

## Usage

\`\`\`
@planner Load ticket: [TICKET-ID]
\`\`\`

Then follow the normal build workflow from the \`build.md\` command.

## Configuration

Ticket sources are configured in \`.claude/ticket-sources.yml\` (shared with Claude Code platform).

## Manual Workflow

1. Copy ticket content to \`.agent/artifacts/ticket.md\`
2. Follow normal build pipeline starting with \`@planner\`
3. Monitor progress via dashboard

## Supported Sources

- Jira (if configured)
- GitHub Issues (if configured)  
- Manual ticket files
`;

  writeFile('.cursor/commands/ticket-build.md', ticketBuildCommand);
}

function enhanceDashboard(platform) {
  console.log('\n🎛️ Enhancing dashboard with platform detection...');
  
  const dashboardPath = '.agent/dashboard/server.js';
  if (!fileExists(dashboardPath)) {
    console.log('❌ Dashboard server not found');
    return false;
  }
  
  // Read current dashboard content
  let content = fs.readFileSync(dashboardPath, 'utf8');
  
  // Check if platform detection is already added
  if (content.includes('detectCurrentPlatform')) {
    console.log('✓ Dashboard already has platform detection');
    return true;
  }
  
  // Add platform detection function after the existing helper functions
  const platformDetectionCode = `
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
`;
  
  // Insert platform detection after file helpers
  content = content.replace(
    '// ─── Status derivation ───────────────────────────────────────────────────────',
    platformDetectionCode + '\n// ─── Status derivation ───────────────────────────────────────────────────────'
  );
  
  // Add platform to buildStatus function
  content = content.replace(
    'return {',
    `const platform = detectCurrentPlatform();
  
  return {
    platform,`
  );
  
  // Add platform display to HTML template
  content = content.replace(
    '<h1>Agent Pipeline Dashboard</h1>',
    '<h1>Agent Pipeline Dashboard</h1>\n    <span id="platform-badge" class="badge" style="background: var(--c-idle); color: #fff; font-size: 11px; margin-left: 8px;"></span>'
  );
  
  // Add platform rendering to JavaScript
  content = content.replace(
    'badge.textContent = phase;',
    `badge.textContent = phase;
  
  // Platform badge
  const platformBadge = document.getElementById('platform-badge');
  if (data.platform) {
    platformBadge.textContent = data.platform.toUpperCase();
    platformBadge.style.display = 'inline-block';
  } else {
    platformBadge.style.display = 'none';
  }`
  );
  
  // Write enhanced dashboard
  fs.writeFileSync(dashboardPath, content);
  console.log('✓ Dashboard enhanced with platform detection');
  return true;
}

// ─── Validation Functions ─────────────────────────────────────────────────────

function validateSetup(platform) {
  console.log('\n🔍 Validating setup...');
  
  const checks = [];
  
  // Shared directory checks
  checks.push({
    name: 'Shared artifacts directory',
    check: () => fs.existsSync('.agent/artifacts'),
    required: true
  });
  
  checks.push({
    name: 'Shared logs directory', 
    check: () => fs.existsSync('.agent/logs'),
    required: true
  });
  
  checks.push({
    name: 'Dashboard server',
    check: () => fs.existsSync('.agent/dashboard/server.js'),
    required: true
  });
  
  // Platform-specific checks
  const needClaude = platform === 'claude-code' || platform === 'both' || platform === 'auto';
  const needCursor = platform === 'cursor' || platform === 'both' || platform === 'auto';

  if (needClaude) {
    checks.push({
      name: 'Claude Code agents',
      check: () => fs.existsSync('.claude/agents/planner.md'),
      required: platform === 'claude-code' || platform === 'both'
    });

    checks.push({
      name: 'Claude Code commands',
      check: () => fs.existsSync('.claude/commands/build.md'),
      required: platform === 'claude-code' || platform === 'both'
    });
  }

  if (needCursor) {
    checks.push({
      name: 'Cursor agents directory',
      check: () => fs.existsSync('.cursor/agents'),
      required: platform === 'cursor' || platform === 'both'
    });

    checks.push({
      name: 'Cursor commands directory',
      check: () => fs.existsSync('.cursor/commands'),
      required: platform === 'cursor' || platform === 'both'
    });

    checks.push({
      name: 'Cursor build command',
      check: () => fs.existsSync('.cursor/commands/build.md'),
      required: platform === 'cursor' || platform === 'both'
    });
  }
  
  let passed = 0;
  let failed = 0;
  
  for (const check of checks) {
    const result = check.check();
    if (result) {
      console.log(`✓ ${check.name}`);
      passed++;
    } else {
      const symbol = check.required ? '❌' : '⚠';
      console.log(`${symbol} ${check.name}`);
      if (check.required) failed++;
    }
  }
  
  console.log(`\n📊 Validation complete: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

function showNextSteps(platform) {
  console.log('\n🚀 Next Steps:');

  if (platform === 'both') {
    console.log(`
1. Start the dashboard:
   node .agent/dashboard/server.js

2. Claude Code: use commands in .claude/commands/ (e.g. /build)
3. Cursor: follow .cursor/commands/build.md for manual agent steps

4. See PLATFORM.md for platform-specific detail
`);
    return;
  }

  if (platform === 'claude-code') {
    console.log(`
1. Start the dashboard:
   node .agent/dashboard/server.js

2. Run a build pipeline:
   Use your existing Claude Code commands in .claude/commands/

3. The dashboard will show "CLAUDE-CODE" platform indicator
`);
  } else if (platform === 'cursor') {
    console.log(`
1. Start the dashboard:
   node .agent/dashboard/server.js

2. Run the build pipeline manually:
   - Read .cursor/commands/build.md for step-by-step instructions
   - Use @planner, @decomposer, @executor, @evaluator in sequence

3. The dashboard will show "CURSOR" platform indicator

4. All agents share the same .agent/artifacts/ for coordination
`);
  } else {
    console.log(`
1. Start the dashboard:
   node .agent/dashboard/server.js

2. Platform-specific instructions:
   - Claude Code: Use .claude/commands/
   - Cursor: Use .cursor/commands/ and manual agent invocation

3. Check PLATFORM.md for detailed usage instructions
`);
  }
}

function parsePlatformsArg(value) {
  const parts = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set(parts);
  const hasClaude = set.has('claude-code') || set.has('claude');
  const hasCursor = set.has('cursor');
  if (hasClaude && hasCursor) return 'both';
  if (hasClaude) return 'claude-code';
  if (hasCursor) return 'cursor';
  return null;
}

function promptLine(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function interactivePlatformChoice() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nSelect platforms (not mutually exclusive — you can enable both):\n');
    const rawA = await promptLine(rl, '  Include Claude Code (.claude/)? [Y/n] ');
    const rawB = await promptLine(rl, '  Include Cursor (.cursor/)? [Y/n] ');
    const incClaude = rawA.trim() === '' || /^y(es)?$/i.test(rawA.trim());
    const incCursor = rawB.trim() === '' || /^y(es)?$/i.test(rawB.trim());
    if (!incClaude && !incCursor) {
      console.log('❌ Choose at least one platform.');
      process.exit(1);
    }
    if (incClaude && incCursor) return 'both';
    if (incClaude) return 'claude-code';
    return 'cursor';
  } finally {
    rl.close();
  }
}

// ─── Main Setup Function ──────────────────────────────────────────────────────

async function main() {
  console.log('🔧 Coding Agent Autonomy Stack - Platform Setup');
  console.log('===============================================\n');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  let targetPlatform = 'auto';
  let force = false;
  let interactive = false;
  
  for (const arg of args) {
    if (arg.startsWith('--platform=')) {
      const raw = arg.split('=')[1];
      const parsed = parsePlatformsArg(raw);
      targetPlatform = parsed || raw;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--interactive' || arg === '-i') {
      interactive = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node setup.js [options]

Options:
  --platform=<p>       Target: auto | claude-code | cursor | both
                        Or comma list: claude-code,cursor (same as both)
  --interactive, -i    Prompt for Claude / Cursor (non-exclusive); ignores auto
  --force               Overwrite existing files (reserved for future use)
  --help, -h            Show this help

Platforms:
  auto                  Auto-detect; if unknown, set up both when possible
  claude-code           Claude Code only
  cursor                Cursor only
  both                  Claude Code and Cursor

Examples:
  node setup.js
  node setup.js --platform=cursor
  node setup.js --platform=both
  node setup.js --platform=claude-code,cursor
  node setup.js -i
`);
      return;
    }
  }
  
  if (interactive) {
    targetPlatform = await interactivePlatformChoice();
  }

  if (!['auto', 'claude-code', 'cursor', 'both'].includes(targetPlatform)) {
    console.log(`❌ Invalid platform: ${targetPlatform}`);
    console.log('Valid: auto, claude-code, cursor, both, or claude-code,cursor');
    process.exit(1);
  }
  
  // Detect current platform
  const detectedPlatform = detectPlatform();
  console.log(`🔍 Platform detection:`);
  console.log(`   Detected: ${detectedPlatform}`);
  console.log(`   Target: ${targetPlatform}`);
  
  let setupPlatform = targetPlatform;
  if (targetPlatform === 'auto') {
    if (detectedPlatform !== 'unknown') {
      setupPlatform = detectedPlatform;
    } else {
      console.log('\n⚠ Could not auto-detect platform. Setting up for both platforms.');
      setupPlatform = 'both';
    }
  } else if (targetPlatform === 'both') {
    setupPlatform = 'both';
  }
  
  console.log(`   Setup mode: ${setupPlatform}`);
  
  // Setup shared directories first
  setupSharedDirectories();
  
  let success = true;
  
  // Platform-specific setup
  if (setupPlatform === 'claude-code') {
    success = setupClaudeCode();
  } else if (setupPlatform === 'cursor') {
    success = setupCursor();
  } else if (setupPlatform === 'both') {
    const claudeSuccess = setupClaudeCode();
    const cursorSuccess = setupCursor();
    success = claudeSuccess || cursorSuccess;
  }
  
  if (!success) {
    console.log('\n❌ Setup failed. Please check the errors above.');
    process.exit(1);
  }
  
  // Enhance dashboard with platform detection
  enhanceDashboard(setupPlatform);
  
  // Validate setup
  const validationPassed = validateSetup(setupPlatform);
  
  if (validationPassed) {
    console.log('\n✅ Setup completed successfully!');
    showNextSteps(setupPlatform);
  } else {
    console.log('\n⚠ Setup completed with warnings. Check validation results above.');
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  detectPlatform,
  setupSharedDirectories,
  setupClaudeCode,
  setupCursor,
  validateSetup
};