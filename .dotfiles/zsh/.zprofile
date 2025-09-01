# UV tool shims (e.g. graphify, semble)
export PATH="$HOME/.local/bin:$PATH"

# macOS Terminal
export SHELL_SESSIONS_DISABLE=1

# Homebrew (Apple Silicon & Intel support)
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi
