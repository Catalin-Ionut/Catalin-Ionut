#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/../helper.sh"

export PATH="$HOME/.local/bin:$PATH"

if ! have claude; then
    log "Claude Code CLI not found; skipping Claude setup."
    exit 0
fi

################################################################################
# MCP servers
################################################################################

register_mcp() {
    local name="$1"
    shift

    item "$name"

    claude mcp get "$name" &>/dev/null && return

    if claude mcp add "$@"; then
        info "registered"
    else
        warn "failed to register $name"
    fi
}

add_mcp() {
    local name="$1"
    shift
    register_mcp "$name" "$name" -s user ${@+"$@"}
}

add_mcp_http() {
    local name="$1" url="$2"
    register_mcp "$name" --transport http "$name" "$url" -s user
}

log "Claude Code MCP servers"
add_mcp semble -- uvx --from "semble[mcp]" semble

################################################################################
# Tideways  (credentials from the git-crypt encrypted tideways/env)
################################################################################

TIDEWAYS_ENV="$SCRIPT_DIR/../../tideways/env"

tideways_vars=(
    TIDEWAYS_TOKEN
    TIDEWAYS_ORG
    TIDEWAYS_PROJECT
    TIDEWAYS_BASE_URL
    TIDEWAYS_MAX_RETRIES
    TIDEWAYS_REQUEST_TIMEOUT
)

log "Tideways"
if [[ ! -f "$TIDEWAYS_ENV" ]]; then
    info "credentials not found; skipping"
elif grep -qa GITCRYPT "$TIDEWAYS_ENV"; then
    info "credentials still encrypted; skipping"
else
    . "$TIDEWAYS_ENV"

    item "tideways"

    if [[ -z "${TIDEWAYS_TOKEN:-}" || -z "${TIDEWAYS_ORG:-}" || -z "${TIDEWAYS_PROJECT:-}" ]]; then
        info "credentials incomplete; skipping"
    else
        tideways_args=()

        for var in "${tideways_vars[@]}"; do
            [[ -n "${!var:-}" ]] || continue
            tideways_args+=(-e "$var=${!var}")
        done

        claude mcp remove tideways -s user &>/dev/null || true

        if claude mcp add tideways -s user ${tideways_args+"${tideways_args[@]}"} \
            -- npx -y tideways-mcp-server >/dev/null; then
            info "registered"
        else
            warn "failed to register tideways"
        fi
    fi
fi

################################################################################
# Plugin marketplaces  (source: github-user/repo)
################################################################################

marketplaces=(
    "anthropics/claude-plugins-official"
    "jarrodwatts/claude-hud"
    "thedotmack/claude-mem"
)

log "Claude Code marketplaces (${#marketplaces[@]} total)"
installed_markets="$(claude plugin marketplace list 2>/dev/null || true)"

for market in "${marketplaces[@]}"; do
    item "$market"

    output_mentions "$installed_markets" "$market" && continue

    if claude plugin marketplace add "$market"; then
        info "added"
    else
        warn "failed to add $market"
    fi
done

################################################################################
# Plugins  (name@marketplace)
################################################################################

plugins=(
    "superpowers@claude-plugins-official"
    "claude-hud@claude-hud"
    "claude-mem@thedotmack"
)

log "Claude Code plugins (${#plugins[@]} total)"
installed_plugins="$(claude plugin list 2>/dev/null || true)"

for plugin in "${plugins[@]}"; do
    plugin_name="${plugin%@*}"
    item "$plugin"

    output_mentions "$installed_plugins" "$plugin_name" && continue

    if claude plugin install "$plugin"; then
        info "installed"
    else
        warn "failed to install $plugin"
    fi
done

################################################################################
# HUD config
################################################################################

HUD_CONFIG_SRC="$SCRIPT_DIR/../../claude/plugins/claude-hud/config.json"
HUD_CONFIG_DEST="$HOME/.claude/plugins/claude-hud/config.json"

log "Claude HUD config"
if [[ ! -f "$HUD_CONFIG_SRC" ]]; then
    info "source not found; skipping"
else
    item "config.json"

    mkdir -p "$(dirname "$HUD_CONFIG_DEST")"
    [[ -e "$HUD_CONFIG_DEST" || -L "$HUD_CONFIG_DEST" ]] && rm -f "$HUD_CONFIG_DEST"

    if cp "$HUD_CONFIG_SRC" "$HUD_CONFIG_DEST"; then
        info "copied"
    else
        warn "failed to copy config.json"
    fi
fi

################################################################################
# Graphify  (knowledge-graph skill for Claude Code; PyPI package: graphifyy)
################################################################################

GRAPHIFY_SKILL="$HOME/.claude/skills/graphify/SKILL.md"

log "Graphify"
if ! have uv; then
    info "uv not found; skipping"
else
    item "graphifyy"

    needs_wiring=0

    if ! have graphify; then
        if uv tool install graphifyy; then
            info "installed"
            needs_wiring=1
        else
            warn "failed to install graphifyy"
        fi
    fi

    [[ -f "$GRAPHIFY_SKILL" ]] || needs_wiring=1

    if [[ "$needs_wiring" -eq 1 ]] && have graphify; then
        item "claude integration"

        if graphify install >/dev/null; then
            info "wired"
        else
            warn "graphify install failed"
        fi
    fi
fi
