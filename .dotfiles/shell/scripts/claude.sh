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
