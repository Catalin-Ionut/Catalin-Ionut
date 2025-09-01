#!/usr/bin/env bash

set -uo pipefail

CLAUDE_DIR="$HOME/.claude"
DOTFILES="${DOTFILES:-$HOME/.dotfiles}"

echo "Claude Code — clearing ephemeral state"

for dir in backups paste-cache cache daemon file-history jobs plans plugins/cache session-env sessions shell-snapshots projects; do
    if [[ -d "$CLAUDE_DIR/$dir" ]]; then
        rm -rf "${CLAUDE_DIR:?}/$dir"
        echo "  cleared: $dir/"
    fi
done

for f in history.jsonl daemon.log .last-cleanup mcp-needs-auth-cache.json \
          policy-limits.json remote-settings.json; do
    if [[ -f "$CLAUDE_DIR/$f" ]]; then
        rm -f "$CLAUDE_DIR/$f"
        echo "  cleared: $f"
    fi
done

# Re-register MCPs and plugins (idempotent — skips already-registered servers)
for script in mcp.sh claude.sh; do
    [[ -f "$DOTFILES/shell/$script" ]] && bash "$DOTFILES/shell/$script"
done

echo ""
echo "Done — start a fresh Claude session."
