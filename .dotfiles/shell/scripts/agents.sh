#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/../helper.sh"

have curl || die "curl is not installed."

AGENTS_DIR="$SCRIPT_DIR/../../claude/agents"
WORK_DIR=""

################################################################################
# Agents  (name:owner/repo:ref:path/to/agent.md — the local name wins and is
# rewritten into the synced front matter)
################################################################################

agents=(
    "semble-search:MinishLab/semble:main:src/semble/agents/claude.md"
)

################################################################################
# Local front matter overrides  (name:key=value — reapplied after every sync)
################################################################################

overrides=(
    "semble-search:model=sonnet"
)

################################################################################
# Helpers
################################################################################

cleanup() {
    [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] && rm -rf -- "$WORK_DIR"
    return 0
}

download_file() {
    local repo="$1" ref="$2" path="$3" dest="$4"

    curl --proto '=https' --tlsv1.2 -fsL \
        --connect-timeout 15 --retry 3 --retry-delay 2 \
        -o "$dest" "https://raw.githubusercontent.com/$repo/$ref/$path"
    [[ -s "$dest" ]]
}

resolve_sha() {
    local repo="$1" ref="$2" body=""

    if body="$(curl --proto '=https' --tlsv1.2 -fsSL \
        --connect-timeout 15 "https://api.github.com/repos/$repo/commits/$ref")"; then
        printf '%s' "$body" | grep -m1 '"sha"' | cut -d'"' -f4 | cut -c1-12
    fi
}

apply_overrides() {
    local file="$1" name="$2" override="" pair=""

    for override in ${overrides+"${overrides[@]}"}; do
        [[ "${override%%:*}" == "$name" ]] || continue

        pair="${override#*:}"
        set_front_matter "$file" "${pair%%=*}" "${pair#*=}" ||
            warn "could not apply override $pair to $name"
    done
}

################################################################################
# Sync
################################################################################

trap cleanup EXIT
WORK_DIR="$(mktemp -d)"

log "Claude Code agents (${#agents[@]} total)"

for entry in "${agents[@]}"; do
    name="${entry%%:*}"
    rest="${entry#*:}"
    repo="${rest%%:*}"
    rest="${rest#*:}"
    ref="${rest%%:*}"
    path="${rest#*:}"

    if [[ -z "$name" || "$repo" != */* || -z "$ref" || -z "$path" ]]; then
        warn "malformed manifest entry: $entry"
        continue
    fi

    item "$name"

    target="$AGENTS_DIR/$name.md"
    staged="$WORK_DIR/$name.md"

    if ! download_file "$repo" "$ref" "$path" "$staged"; then
        warn "could not download $repo@$ref:$path; keeping the vendored copy of $name"
        continue
    fi

    if ! set_front_matter "$staged" name "$name"; then
        warn "$repo@$ref:$path has no front matter; keeping the vendored copy of $name"
        continue
    fi

    apply_overrides "$staged" "$name"

    cmp -s "$staged" "$target" && continue

    cp "$staged" "$target"
    chmod 644 "$target"

    info "updated $name.md"

    sha="$(resolve_sha "$repo" "$ref" || true)"
    [[ -n "$sha" ]] && info "now at $repo@$sha"
done
