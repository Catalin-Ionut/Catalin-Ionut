# Debugging
if [[ -n "$ZSH_DEBUG" ]]; then
  zmodload zsh/zprof
fi

# Initialize Zap plugin manager
[ -f "$HOME/.local/share/zap/zap.zsh" ] && source "$HOME/.local/share/zap/zap.zsh"

# History settings
HISTFILE="$HOME/.zhistory"
HISTORY_IGNORE="(l|l *|ls|ls *|ll|ll *|la|la *|hist *|rm *|cat *|nano *|code *|ssh *|sftp *|cd|cd *|cd ..*|cd -|z *)"

# Z settings
ZSHZ_TILDE=1
ZSHZ_DATA="$HOME/.zpaths"

# Disable autocompleting from known_hosts or /etc/hosts
zstyle ':completion:*:(ssh|sftp):*' known-hosts off
zstyle ':completion:*:(ssh|sftp):*' hosts off

# History settings
setopt BANG_HIST               # Treat the '!' character specially during expansion.
setopt EXTENDED_HISTORY        # Write the history file in the ":start:elapsed;command" format.
setopt INC_APPEND_HISTORY      # Write to the history file immediately, not when the shell exits.
setopt SHARE_HISTORY           # Share history between all sessions.
setopt HIST_EXPIRE_DUPS_FIRST  # Expire duplicate entries first when trimming history.
setopt HIST_IGNORE_DUPS        # Don't record an entry that was just recorded again.
setopt HIST_IGNORE_ALL_DUPS    # Delete old recorded entry if new entry is a duplicate.
setopt HIST_FIND_NO_DUPS       # Do not display a line previously found.
setopt HIST_IGNORE_SPACE       # Don't record an entry starting with a space.
setopt HIST_SAVE_NO_DUPS       # Don't write duplicate entries in the history file.
setopt HIST_REDUCE_BLANKS      # Remove superfluous blanks before recording entry.
setopt HIST_VERIFY             # Don't execute immediately upon history expansion.
setopt HIST_BEEP               # Beep when accessing nonexistent history.

# Load plugins
plug "agkozak/zsh-z"
plug "Aloxaf/fzf-tab"
plug "wintermi/zsh-lsd"
plug "fdellwing/zsh-bat"
plug "zap-zsh/completions"
plug "hlissner/zsh-autopair"
plug "marlonrichert/zsh-hist"
plug "zsh-users/zsh-autosuggestions"
plug "zsh-users/zsh-syntax-highlighting"

# Initialize starship prompt if available
if command -v starship >/dev/null 2>&1; then
    eval "$(starship init zsh)"
fi

# Custom function to delete .DS_Store files
dsclean() {
    local BASEDIR="${1:-.}"

    if [[ ! -d "$BASEDIR" ]]; then
        echo "Error: '$BASEDIR' is not a valid directory." >&2
        return 1
    fi

    find "$BASEDIR" -name ".DS_Store" -type f -print | tee /dev/stderr | while read file; do
        rm -f "$file"
    done
}

# Custom function to handle Docker commands
docker() {
    if [[ $1 == "no-restart" ]]; then
        docker update --restart=no $(docker ps -a -q)
    elif [[ $@ == "ps" ]] || [[ $@ == "container ls" ]] || [[ $@ == "container ls -a" ]]; then
        command docker "$@" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}"
    elif [[ $1 == "clean" ]]; then
        docker image prune -af
        docker volume prune -af
        docker builder prune -af
    else
        command docker "$@"
    fi
}

# Determine size of a file or total size of a directory
function fs() {
	if du -b /dev/null > /dev/null 2>&1; then
		local arg=-sbh;
	else
		local arg=-sh;
	fi

	if [[ -n "$@" ]]; then
		du $arg -- "$@";
	else
		du $arg .[^.]* ./*;
	fi;
}

# Handle updates and upgrades
function update() {
  brew update -q
  brew upgrade -qg
  brew cleanup -qs
  brew autoremove -q

  # Upgrade Mac App Store apps if available
  command -v mas >/dev/null 2>&1 && mas upgrade
}

# Create a new directory and enter it
function mkdir() {
    command mkdir -p "$@" && cd "$_"
}

# Command not found handler
command-not-found() {
    (( ? == 127 )) && hist -fs fix -1
}

# Command not found hook
autoload -Uz add-zsh-hook
add-zsh-hook precmd command-not-found

# Cleanup temporary/junk files
rm -f $HOME/.lesshst
rm -f $HOME/.ssh/known_hosts.old
rm -rf $HOME/Downloads/MSTeams

# Debugging
if [[ -n "$ZSH_DEBUGRC" ]]; then
  zprof
fi