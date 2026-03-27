#!/usr/bin/env bash
# Double-click this file in Finder (macOS) after placing it in your PROJECT ROOT.
# One dialog: Claude only, Cursor only, or both — then fully automatic (no more prompts).
#
# Optional environment (set in Terminal before open, or use launchctl for Finder — rarely needed):
#   CA_STACK_REPO, CA_STACK_REF, CA_STACK_INSTALLER_URL

set -euo pipefail

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

DEFAULT_INSTALLER_URL="${CA_STACK_INSTALLER_URL:-https://raw.githubusercontent.com/c3-mikecarmody/claude-coding-agent/main/scripts/install.sh}"
DEFAULT_REPO="${CA_STACK_REPO:-https://github.com/c3-mikecarmody/claude-coding-agent.git}"
DEFAULT_REF="${CA_STACK_REF:-main}"

if ! command -v osascript >/dev/null 2>&1; then
  echo "This click-to-install flow needs macOS (osascript). From a terminal in your project run:" >&2
  echo "  curl -fsSL \"$DEFAULT_INSTALLER_URL\" | bash -s -- --yes --both --target \"$ROOT\"" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  osascript -e 'display dialog "curl is not found in PATH. Install Xcode Command Line Tools, then try again." buttons {"OK"} default button 1 with title "Coding Agent stack"'
  exit 1
fi

RAW_CHOICE="$(osascript -e 'choose from list {"Claude Code only", "Cursor only", "Both"} with prompt "Install into the folder that contains this script:" default items {"Both"}' 2>/dev/null || true)"
CHOICE="$(echo "$RAW_CHOICE" | tr -d '\r{}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [[ -z "$CHOICE" || "$CHOICE" == "false" ]]; then
  exit 0
fi

FLAGS=(--yes --target "$ROOT" --repo "$DEFAULT_REPO" --ref "$DEFAULT_REF")
case "$CHOICE" in
  "Claude Code only") FLAGS+=(--claude) ;;
  "Cursor only") FLAGS+=(--cursor) ;;
  "Both") FLAGS+=(--both) ;;
  *)
    osascript -e 'display dialog "Cancelled." buttons {"OK"} default button 1 with title "Coding Agent stack"'
    exit 1
    ;;
esac

TMP_LOG="$(mktemp "${TMPDIR:-/tmp}/ca-stack-install.XXXXXX.log")"
export CA_STACK_REPO="$DEFAULT_REPO"
export CA_STACK_REF="$DEFAULT_REF"

set +e
curl -fsSL "$DEFAULT_INSTALLER_URL" | bash -s -- "${FLAGS[@]}" >"$TMP_LOG" 2>&1
STATUS=$?
set -e

if [[ "$STATUS" -eq 0 ]]; then
  rm -f "$TMP_LOG"
  osascript -e 'display dialog "Done. Open this folder in Cursor or Claude Code. Merge coding-agent-stack.gitignore.snippet into .gitignore if you use git." buttons {"OK"} default button 1 with title "Coding Agent stack"'
  exit 0
fi

FAIL_LOG="$ROOT/coding-agent-install-failure.log"
cp "$TMP_LOG" "$FAIL_LOG"
rm -f "$TMP_LOG"
osascript -e 'display dialog "Install failed. A log was written next to this script: coding-agent-install-failure.log" buttons {"OK"} default button 1 with title "Coding Agent stack"'
exit "$STATUS"
