#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTWATCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$AGENTWATCH_DIR" rev-parse --show-toplevel)"

TEMPLATE_DIR="$AGENTWATCH_DIR/templates"
CODEx_TEMPLATE="$TEMPLATE_DIR/codex-hooks.json"
GIT_TEMPLATE_DIR="$TEMPLATE_DIR/git-hooks"

mkdir -p "$HOME/.codex"
mkdir -p "$REPO_ROOT/.git/hooks"

echo "Installing Codex hook config to $HOME/.codex/hooks.json"
cp "$CODEx_TEMPLATE" "$HOME/.codex/hooks.json"

for hook in post-commit post-merge post-checkout; do
  cp "$GIT_TEMPLATE_DIR/$hook" "$REPO_ROOT/.git/hooks/$hook"
  chmod +x "$REPO_ROOT/.git/hooks/$hook"
  echo "Installed .git/hooks/$hook"
done

echo "AgentWatch hook scripts installed."
