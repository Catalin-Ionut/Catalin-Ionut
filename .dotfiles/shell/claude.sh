#!/usr/bin/env bash

set -euo pipefail

if ! command -v claude &>/dev/null; then
    echo "Claude Code CLI not found; skipping Claude setup."
    exit 0
fi

# ---------------------------------------------------------------------------
# MCP servers
# ---------------------------------------------------------------------------

add_mcp() {
    local name="$1"; shift
    if claude mcp get "$name" &>/dev/null; then
        echo "  - ${name}: already registered"
    elif claude mcp add "$name" -s user "$@"; then
        echo "  - ${name}: registered"
    else
        echo "  - ${name}: failed to register" >&2
    fi
}

add_mcp_http() {
    local name="$1" url="$2"
    if claude mcp get "$name" &>/dev/null; then
        echo "  - ${name}: already registered"
    elif claude mcp add --transport http "$name" "$url" -s user; then
        echo "  - ${name}: registered"
    else
        echo "  - ${name}: failed to register" >&2
    fi
}

echo "Claude Code MCP servers"
add_mcp semble -- uvx --from "semble[mcp]" semble
add_mcp_http GitLab https://gitlab.nxs360.com/api/v4/mcp

# ---------------------------------------------------------------------------
# Plugin marketplaces  (source: github-user/repo)
# ---------------------------------------------------------------------------
marketplaces=(
    "jeffallan/claude-skills"
    "anthropics/claude-plugins-official"
)

echo "Claude Code marketplaces (${#marketplaces[@]} total)"
installed_markets="$(claude plugin marketplace list 2>/dev/null || true)"

for market in "${marketplaces[@]}"; do
    if echo "$installed_markets" | grep -qi "$market"; then
        echo "  - ${market}: already added"
    else
        echo "  - ${market}: adding"
        claude plugin marketplace add "$market"
    fi
done

# ---------------------------------------------------------------------------
# Plugins  (name@marketplace)
# ---------------------------------------------------------------------------
plugins=(
    "fullstack-dev-skills@fullstack-dev-skills"
    "superpowers@claude-plugins-official"
)

echo "Claude Code plugins (${#plugins[@]} total)"
installed_plugins="$(claude plugin list 2>/dev/null || true)"

for plugin in "${plugins[@]}"; do
    plugin_name="${plugin%@*}"
    if echo "$installed_plugins" | grep -q "$plugin_name"; then
        echo "  - ${plugin}: already installed"
    else
        echo "  - ${plugin}: installing"
        claude plugin install "$plugin"
    fi
done
