#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/../helper.sh"

have curl || die "curl is not installed."
have tar || die "tar is not installed."

SKILLS_DIR="$SCRIPT_DIR/../../claude/skills"
WORK_DIR=""

################################################################################
# Skills  (name:owner/repo:ref — SKILL.md must sit at the repo root; the local
# name wins and is rewritten into the synced frontmatter)
################################################################################

skills=(
    "humanizer:blader/humanizer:main"
    "prompt-master:nidhinjs/prompt-master:main"
    "security-audit:BehiSecc/VibeSec-Skill:main"
)

################################################################################
# Helpers
################################################################################

cleanup() {
    [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] && rm -rf -- "$WORK_DIR"
    return 0
}

download() {
    local repo="$1" ref="$2" dest="$3"

    curl --proto '=https' --tlsv1.2 -fsL \
        --connect-timeout 15 --retry 3 --retry-delay 2 \
        "https://codeload.github.com/$repo/tar.gz/$ref" |
        tar -xz -C "$dest" --strip-components 1 2>/dev/null
}

resolve_sha() {
    local repo="$1" ref="$2" body=""

    if body="$(curl --proto '=https' --tlsv1.2 -fsSL \
        --connect-timeout 15 "https://api.github.com/repos/$repo/commits/$ref")"; then
        printf '%s' "$body" | grep -m1 '"sha"' | cut -d'"' -f4 | cut -c1-12
    fi
}

collect_payload() {
    local src="$1" dest="$2"

    cp "$src/SKILL.md" "$dest/"
    [[ -f "$src/LICENSE" ]] && cp "$src/LICENSE" "$dest/"
    [[ -d "$src/references" ]] && cp -R "$src/references" "$dest/"
    return 0
}

list_files() {
    [[ -d "$1" ]] || return 0
    (cd "$1" && find . -type f) | sed 's|^\./||' | sort
}

################################################################################
# Sync
################################################################################

trap cleanup EXIT
WORK_DIR="$(mktemp -d)"

log "Claude Code skills (${#skills[@]} total)"

for entry in "${skills[@]}"; do
    name="${entry%%:*}"
    rest="${entry#*:}"
    repo="${rest%%:*}"
    ref="${rest##*:}"

    if [[ -z "$name" || "$repo" != */* || -z "$ref" ]]; then
        warn "malformed manifest entry: $entry"
        continue
    fi

    item "$name"

    target="$SKILLS_DIR/$name"
    upstream="$WORK_DIR/$name-upstream"
    payload="$WORK_DIR/$name-payload"
    mkdir -p "$upstream" "$payload"

    if ! download "$repo" "$ref" "$upstream"; then
        warn "could not download $repo@$ref; keeping the vendored copy of $name"
        continue
    fi

    if [[ ! -f "$upstream/SKILL.md" ]]; then
        warn "$repo@$ref has no SKILL.md at its root; keeping the vendored copy of $name"
        continue
    fi

    collect_payload "$upstream" "$payload"
    set_front_matter "$payload/SKILL.md" name "$name" ||
        warn "$name has no front matter; left as published"

    changes=()

    while IFS= read -r path; do
        if [[ ! -f "$target/$path" ]]; then
            changes+=("+$path")
        elif ! cmp -s "$payload/$path" "$target/$path"; then
            changes+=("~$path")
        fi
    done < <(list_files "$payload")

    while IFS= read -r path; do
        [[ -f "$payload/$path" ]] || changes+=("-$path")
    done < <(list_files "$target")

    [[ "${#changes[@]}" -eq 0 ]] && continue

    rm -rf -- "${target:?}"
    cp -R "$payload" "$target"
    find "$target" -type d -exec chmod 755 {} +
    find "$target" -type f -exec chmod 644 {} +

    info "${changes[*]}"

    sha="$(resolve_sha "$repo" "$ref" || true)"
    [[ -n "$sha" ]] && info "now at $repo@$sha"
done
