# shellcheck shell=bash

[[ -n "${DOTFILES_HELPER_SOURCED:-}" ]] && return 0
readonly DOTFILES_HELPER_SOURCED=1

################################################################################
# Colour
################################################################################

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    readonly GREEN=$'\033[32m'
    readonly RESET=$'\033[0m'
else
    readonly GREEN=""
    readonly RESET=""
fi

################################################################################
# Output
################################################################################

log() { printf '%s==>%s %s\n' "$GREEN" "$RESET" "$*"; }
info() { printf '     %s\n' "$*"; }

item() {
    local text="$1"

    if [[ $# -ge 2 ]]; then
        text="$1: $2"
    fi

    printf '  %s=>%s %s\n' "$GREEN" "$RESET" "$text"
}

warn() { printf 'warning: %s\n' "$*" >&2; }

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

################################################################################
# Predicates
################################################################################

have() { command -v "$1" &>/dev/null; }

list_has() { grep -qxF -- "$2" <<<"$1"; }

output_mentions() { grep -qiF -- "$2" <<<"$1"; }

################################################################################
# Front matter
################################################################################

set_front_matter() {
    local file="$1" key="$2" value="$3" staged="$1.staged"

    awk -v key="$key" -v value="$value" '
        NR == 1 && /^---$/ { print; front = 1; found = 1; next }
        front && /^---$/ {
            if (!seen) print key ": " value
            front = 0
            print
            next
        }
        front && $0 ~ "^" key ":" { print key ": " value; seen = 1; next }
        { print }
        END { exit(found ? 0 : 1) }
    ' "$file" >"$staged" || {
        rm -f -- "$staged"
        return 1
    }

    mv -f "$staged" "$file"
}
