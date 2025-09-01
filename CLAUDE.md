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
  git/                 .gitconfig, .gitignore   → linked to ~
  starship/            starship.toml            → ~/.config/starship.toml
  claude/agents/       Claude Code agents       → ~/.claude/agents/ (glob-linked)
  claude/skills/       Claude Code skills       → ~/.claude/skills/ (glob-linked dirs)
  shell/               mas.sh (App Store apps), settings.sh (macOS `defaults`)
  ssh/  etc/  vpn/     ENCRYPTED secrets (git-crypt) — never commit plaintext here
  terminal/themes/     Terminal.app color themes
  icons/ images/       App icons / prompt screenshots
  dotbot*/             git submodules: dotbot + its plugins (vendored, don't edit)
```

## How provisioning works

`.dotfiles/install` (run from the `.dotfiles` dir) does, in order:

1. Enables password-less sudo for the current user.
2. Installs the **Zap** zsh plugin manager and **Homebrew** if missing.
3. Syncs/updates git submodules.
4. Runs Dotbot with `config.yaml` and four plugins: `brew`, `sync`, `gitcrypt`, `conditional`.

Dotbot then: symlinks dotfiles into `$HOME`, installs the brew/cask/tap lists,
unlocks git-crypt with the key at `~/.config/git-crypt/git-crypt.key`, runs the
shell scripts, and — only if git-crypt is unlocked — syncs `~/.ssh`.

## Conventions & gotchas

- **Declarative first.** To add a CLI tool, GUI app, font, or tap → edit the lists
  in `config.yaml`. To add an App Store app → add `id:name` to the array in
  `shell/mas.sh`. To change macOS behavior → add a `defaults write` to
  `shell/settings.sh`. Avoid imperative one-offs that aren't captured in the repo.
- **Dotfile linking is glob-based.** Files in `git/` and `zsh/` are linked into `~`
  via `path: git/.*` / `zsh/.*`. New dotfiles dropped in those dirs are linked
  automatically — no per-file config entry needed.
- **Secrets are git-crypt encrypted.** `.gitattributes` encrypts `ssh/**`, `etc/**`,
  `vpn/**`. Never add plaintext keys/credentials, and never move secret paths out
  from under those globs. Verify encryption with `git-crypt status` before pushing.
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

Changes to `config.yaml`, `mas.sh`, or `settings.sh` take effect on the next
`./install` run. Shell changes apply on a new shell or `source ~/.zshrc`.
