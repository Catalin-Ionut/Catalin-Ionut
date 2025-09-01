# Visual Studio Code
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# Trash
export PATH="/opt/homebrew/opt/trash/bin:$PATH"

# macOS Terminal
export SHELL_SESSIONS_DISABLE=1

# Homebrew (Apple Silicon & Intel support)
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi