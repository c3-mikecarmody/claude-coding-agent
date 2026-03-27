#!/usr/bin/env bash
# Coding Agent Autonomy Stack — one-shot installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/c3-mikecarmody/claude-coding-agent/main/scripts/install.sh | bash
#   curl -fsSL ... | bash -s -- /path/to/project
#   bash scripts/install.sh [target_dir]
#
# Environment:
#   CA_STACK_REPO   Git URL (default: https://github.com/c3-mikecarmody/claude-coding-agent.git)
#   CA_STACK_REF    branch or tag (default: main)
#   CA_STACK_LOCAL  If set, use this directory as the source tree instead of cloning

set -euo pipefail

DEFAULT_REPO="${CA_STACK_REPO:-https://github.com/c3-mikecarmody/claude-coding-agent.git}"
REF="${CA_STACK_REF:-main}"

usage() {
  cat <<'EOF'
Coding Agent Autonomy Stack — installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/c3-mikecarmody/claude-coding-agent/main/scripts/install.sh | bash
  curl -fsSL ... | bash -s -- --target /path/to/project
  bash scripts/install.sh [--target DIR] [DIR]

Options:
  --yes, -y              Non-interactive; default both platforms unless --claude/--cursor given
  --target DIR           Install into DIR (default: current directory)
  --claude               Include Claude Code (.claude/)
  --cursor               Include Cursor (.cursor/)
  --both                 Include both (same as --claude --cursor)
  --ref REF              Git ref to clone (default: main)
  --repo URL             Git repo to clone (override fork)

Environment:
  CA_STACK_REPO          Same as --repo
  CA_STACK_REF           Same as --ref
  CA_STACK_LOCAL         Use this repo path instead of cloning (for development)

  -h, --help             Show this help
EOF
}

die() {
  echo "install.sh: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

copy_tree() {
  local from="$1" to="$2"
  [[ -d "$from" ]] || return 0
  mkdir -p "$to"
  cp -R "${from}/." "$to/"
}

INC_CLAUDE=""
INC_CURSOR=""
NONINTERACTIVE=false
TARGET=""
positional=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --yes|-y)
      NONINTERACTIVE=true
      shift
      ;;
    --target=*)
      TARGET="${1#*=}"
      shift
      ;;
    --target)
      TARGET="${2:-}"
      [[ -n "$TARGET" ]] || die "--target requires a directory"
      shift 2
      ;;
    --ref=*)
      REF="${1#*=}"
      shift
      ;;
    --ref)
      REF="${2:-}"
      [[ -n "$REF" ]] || die "--ref requires a value"
      shift 2
      ;;
    --repo=*)
      DEFAULT_REPO="${1#*=}"
      shift
      ;;
    --repo)
      DEFAULT_REPO="${2:-}"
      [[ -n "$DEFAULT_REPO" ]] || die "--repo requires a URL"
      shift 2
      ;;
    --claude)
      INC_CLAUDE=1
      shift
      ;;
    --cursor)
      INC_CURSOR=1
      shift
      ;;
    --both)
      INC_CLAUDE=1
      INC_CURSOR=1
      shift
      ;;
    *)
      if [[ -z "$positional" && ! "$1" =~ ^- ]]; then
        positional="$1"
        shift
      else
        die "unknown argument: $1 (try --help)"
      fi
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  TARGET="${positional:-.}"
fi
mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"

if [[ -z "$INC_CLAUDE" && -z "$INC_CURSOR" ]]; then
  if $NONINTERACTIVE; then
    INC_CLAUDE=1
    INC_CURSOR=1
  else
    echo "Coding Agent Autonomy Stack — installer"
    echo "Target directory: $TARGET"
    echo ""
    read -r -p "Include Claude Code (.claude/)? [Y/n] " a
    read -r -p "Include Cursor (.cursor/)? [Y/n] " b
    case "${a:-y}" in
      [Nn]|[Nn][Oo]) ;;
      *) INC_CLAUDE=1 ;;
    esac
    case "${b:-y}" in
      [Nn]|[Nn][Oo]) ;;
      *) INC_CURSOR=1 ;;
    esac
  fi
fi

if [[ -z "$INC_CLAUDE" && -z "$INC_CURSOR" ]]; then
  die "select at least one of Claude Code or Cursor"
fi

require_cmd git
require_cmd node

TMP=""
cleanup() {
  if [[ -n "${TMP}" && -d "${TMP}" ]]; then
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT

if [[ -n "${CA_STACK_LOCAL:-}" ]]; then
  SRC="$(cd "$CA_STACK_LOCAL" && pwd)"
  [[ -f "$SRC/setup.js" ]] || die "CA_STACK_LOCAL must point to the stack repo root (setup.js not found)"
else
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/ca-stack-install.XXXXXX")"
  echo "Cloning ${DEFAULT_REPO} (${REF}) …"
  git clone --depth 1 --branch "$REF" "$DEFAULT_REPO" "${TMP}/src"
  SRC="${TMP}/src"
fi

echo "Installing into: $TARGET"

mkdir -p "$TARGET/.agent/dashboard"
cp "$SRC/.agent/dashboard/server.js" "$TARGET/.agent/dashboard/server.js"
cp "$SRC/setup.js" "$TARGET/setup.js"
cp "$SRC/PLATFORM.md" "$TARGET/PLATFORM.md"
if [[ -f "$SRC/coding-agent-stack.gitignore.snippet" ]]; then
  cp "$SRC/coding-agent-stack.gitignore.snippet" "$TARGET/coding-agent-stack.gitignore.snippet"
fi
if [[ -f "$SRC/docs/INSTALL.md" ]]; then
  mkdir -p "$TARGET/docs"
  cp "$SRC/docs/INSTALL.md" "$TARGET/docs/INSTALL.md"
fi
if [[ -f "$SRC/docs/install-from-template.md" ]]; then
  mkdir -p "$TARGET/docs"
  cp "$SRC/docs/install-from-template.md" "$TARGET/docs/install-from-template.md"
fi

if [[ -n "$INC_CLAUDE" ]]; then
  echo "  + .claude/"
  mkdir -p "$TARGET/.claude"
  copy_tree "$SRC/.claude" "$TARGET/.claude"
fi

if [[ -n "$INC_CURSOR" ]]; then
  echo "  + .cursor/"
  mkdir -p "$TARGET/.cursor"
  copy_tree "$SRC/.cursor" "$TARGET/.cursor"
fi

if [[ -n "$INC_CLAUDE" && -n "$INC_CURSOR" ]]; then
  SETUP_PLATFORM="both"
elif [[ -n "$INC_CLAUDE" ]]; then
  SETUP_PLATFORM="claude-code"
else
  SETUP_PLATFORM="cursor"
fi

echo "Running: node setup.js --platform=$SETUP_PLATFORM"
(
  cd "$TARGET"
  node setup.js --platform="$SETUP_PLATFORM"
)

echo ""
echo "Done. See PLATFORM.md and docs/INSTALL.md in $TARGET"
