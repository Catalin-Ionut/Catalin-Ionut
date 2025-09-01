# CLAUDE.md

Guidance for working in this repository.

## What this repo is

Personal macOS dotfiles + machine bootstrap for **Catalin Ionut Titov**. A single
clone provisions a fresh Mac: shell, prompt, git, fonts, GUI apps, App Store apps,
macOS defaults, and secrets. Managed declaratively with **Dotbot**.

This repo doubles as the GitHub **profile repo** (`Catalin-Ionut/Catalin-Ionut`),
so `README.md` and `ROADMAP.md` render on the GitHub profile page — they are *not*
documentation for the dotfiles. Don't repurpose them.

## Layout

```
.dotfiles/
  install              Bootstrap entrypoint (bash). Run this to provision a machine.
  config.yaml          Dotbot manifest: links, brew/cask/tap, shell steps, secrets.
  zsh/                 .zshrc, .zprofile        → linked to ~
  git/                 .gitconfig, .gitignore   → linked to ~ (ENCRYPTED)
  starship/            starship.toml            → ~/.config/starship.toml
  claude/agents/       Claude Code agents       → ~/.claude/agents/ (glob-linked)
  claude/skills/       Claude Code skills       → ~/.claude/skills/ (glob-linked dirs)
  claude/plugins/      claude-hud config.json   → ~/.claude/plugins/… (copied by claude.sh,
                       not dotbot-linked — see gotchas)
  shell/helper.sh      Shared bash helpers (log/item/info/warn/die/have,
                       set_front_matter) — sourced, never executed
  shell/scripts/       mas.sh (App Store apps), settings.sh (macOS `defaults`),
                       claude.sh (MCP/plugins), icons.sh (custom app icons via
                       `fileicon`),
                       skills.sh / agents.sh (re-vendor Claude skills and
                       subagents from upstream repos)
  ssh/ vpn/ tideways/  ENCRYPTED secrets (git-crypt) — never commit plaintext here
  terminal/themes/     Terminal.app color themes
  icons/ images/       App icons / prompt screenshots
  dotbot*/             git submodules: dotbot + its plugins (vendored, don't edit)
```

## How provisioning works

`.dotfiles/install` (run from the `.dotfiles` dir) does, in order:

1. Enables password-less sudo for the current user.
2. Installs the **Zap** zsh plugin manager and **Homebrew** if missing.
3. Syncs/updates git submodules.
4. Runs Dotbot with `config.yaml` and four plugins, in this order: `brew`, `sync`,
   `conditional`, `gitcrypt`. **The order matters** — `gitcrypt.py` registers its
   `git-decrypted` condition by importing `dotbot_conditional`, which is only on
   `sys.path` once `conditional.py` has loaded. Load `gitcrypt` first and the
   condition silently fails to register; `Tester` then finds no plugin for the
   directive and evaluates it as *true*, so every `git-decrypted` gate passes
   unconditionally.

Dotbot then: symlinks the unencrypted dotfiles into `$HOME`, installs the
brew/cask/tap lists, and finishes with everything that needs git-crypt, grouped
at the end of `config.yaml`: it unlocks with the key at
`~/.config/git-crypt/git-crypt.key`, then — only if the respective directory
decrypted — links `git/` into `$HOME` and syncs `~/.ssh`, and finally runs the
shell scripts. The unlock has to stay ahead of that script block because
`claude.sh` reads `tideways/env`.

## Conventions & gotchas

- **Declarative first.** To add a CLI tool, GUI app, font, or tap → edit the lists
  in `config.yaml`. To add an App Store app → add `id:name` to the array in
  `shell/scripts/mas.sh`. To change macOS behavior → add a `defaults write` to
  `shell/scripts/settings.sh`. To override an app's icon → drop `<AppName>.icns`
  in `icons/` (name must match the `.app` bundle) and add the bundle path to the
  array in `shell/scripts/icons.sh`. To vendor a third-party Claude skill → add
  `name:owner/repo:ref` to the array in `shell/scripts/skills.sh` (the upstream
  repo must have `SKILL.md` at its root). To vendor a subagent → add
  `name:owner/repo:ref:path/to/agent.md` to the array in `shell/scripts/agents.sh`.
  To add a Claude plugin → add its marketplace to `marketplaces` and
  `plugin@marketplace` to `plugins` in `shell/scripts/claude.sh`. Avoid imperative
  one-offs that aren't captured in the repo.
- **Shell output goes through `shell/helper.sh`.** Source it rather than calling
  `echo`, so every script indents identically: `log "Phase"` → `==> Phase`,
  `item name [state]` → `  => name: state`, `info detail` → `     detail`, plus
  `warn`/`die` on stderr and `have <cmd>`. Both arrows are green on a TTY only.
  It sets no `set` options — each script keeps its own.
- **Scripts carry no comments except section banners** (80 `#`, `# Title`, 80 `#`).
  Two deliberate choices that are therefore *not* stated in the code: `settings.sh`
  uses `set -uo pipefail` **without `-e`**, so one failed `defaults write` can't
  abort the rest; and `mas.sh` captures `mas list` inside an `if` so `pipefail`
  can't kill the run before anything installs. Keep both if you touch those
  files. Likewise `claude.sh` registers `tideways` by `mcp remove` + `mcp add`
  rather than the skip-if-present `register_mcp`, so rotating a credential in
  `tideways/env` actually propagates to `~/.claude.json`; and `skills.sh`
  `warn`s instead of `die`ing on every fetch failure, so an unreachable GitHub
  can't abort a provisioning run — it keeps the vendored copy and moves on;
  and `claude.sh` `cp`s `claude/plugins/claude-hud/config.json` into
  `~/.claude/plugins/claude-hud/config.json` instead of dotbot-linking it,
  because claude-hud's `config.js` `lstat`s that path and silently ignores it
  (falling back to every default) if it's a symlink — don't move that copy
  step back into a `config.yaml` `link:` directive.
- **Vendored skills and agents keep the local name, not the upstream one.** Both
  sync scripts rewrite the front matter `name:` to the manifest name via
  `set_front_matter`, because the *directory* (skills) or *filename* (agents) is
  what Claude Code registers — `security-audit` is upstream's `VibeSec-Skill`, and
  without the rewrite every run would re-dirty the file. Any other local edit must
  be declared in `agents.sh`'s `overrides` array (`name:key=value`), which is how
  `semble-search` keeps `model: sonnet` on top of an otherwise verbatim upstream
  file; undeclared edits are overwritten on the next `./install`.
- **Dotfile linking is glob-based.** Files in `git/` and `zsh/` are linked into `~`
  via `path: git/.*` / `zsh/.*`. New dotfiles dropped in those dirs are linked
  automatically — no per-file config entry needed. `git/` is additionally wrapped
  in a `git-decrypted` conditional: linking an encrypted `.gitconfig` to
  `~/.gitconfig` would make *every* git command on the machine fail with `bad
  config line 1`, including the `git-crypt unlock` needed to recover.
- **Secrets are git-crypt encrypted.** `.gitattributes` encrypts `.dotfiles/git/**`,
  `.dotfiles/ssh/**`, `.dotfiles/vpn/**` and `.dotfiles/tideways/**` (the first is the
  git config, the last holds the Tideways MCP credentials read by `claude.sh`).
  Never add plaintext keys/credentials, and never move secret paths out from under
  those globs. Verify with `git-crypt status` before pushing — and after adding a
  path to `.gitattributes`, re-stage the already-tracked files with
  `git-crypt status -f <path>`, since the clean filter only runs on `git add`.
- **Submodules under `.dotfiles/` are vendored** (dotbot + plugins). Don't edit them;
  update via submodule bumps.
- `default branch is master` (see `.gitconfig` `init.defaultBranch`). Tags are
  GPG/SSH-signed; commits are signed with the SSH key.
- Custom shell helpers live in `zsh/.zshrc`: `update` (brew + mas upgrade),
  `docker clean|armageddon|no-restart`, `dsclean`, `fs`, `mkdir` (auto-cd).

## Common tasks

```bash
cd .dotfiles && ./install        # provision / re-apply everything (idempotent)
git-crypt status                 # confirm secret files are encrypted
git submodule update --init --recursive   # after cloning
```

Changes to `config.yaml` or anything in `shell/scripts/` take effect on the next
`./install` run. Shell changes apply on a new shell or `source ~/.zshrc`.
