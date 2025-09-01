---
name: phpstorm
description: Use when working in a PHP project that is open in PhpStorm and the jetbrains MCP tools (mcp__jetbrains__*) are available. Covers resolving what a PHP symbol really is (including vendor and framework code), IDE diagnostics after edits, semantic renames, finding files and text through the IDE index, running tests through saved run configurations, and formatting. Also use when the user refers to "this file", "the open file" or "what I have open". Not for projects that are not open in PhpStorm.
---

# PhpStorm MCP

PhpStorm knows things the terminal does not: the configured PHP language level and
interpreter (often inside Docker), resolved types through interfaces and DI, vendor
code, inspections, and saved run configurations. Use the IDE for that knowledge. Use
Claude Code's own tools (Read, Edit, Write, Bash, Grep) for everything else.

## Ground rules

- Pass `projectPath` on every call, set to the project root (usually the current
  working directory). Without it the call can hit another open project.
- All `filePath` / `pathInProject` arguments are relative to the project root.
- Lines and columns are 1-based.
- If a call fails because PhpStorm or the project is not open, say so once and
  continue with terminal tools. Do not retry in a loop.

## Tool routing

| Need | Use | Not |
|---|---|---|
| What is this symbol, its type, signature, docblock, declaration | `get_symbol_info` | guessing from names |
| Errors and warnings in a file | `get_file_problems` with `errorsOnly: false` | `php -l` alone |
| Rename a class, method, property, function, constant | `rename_refactoring` | Edit / sed |
| Find a file by part of its name | `find_files_by_name_keyword` | `find` |
| Find files by path pattern | `find_files_by_glob` | — |
| Find text or regex in project code | `search_in_files_by_text` / `search_in_files_by_regex` | — |
| Search in `vendor/`, `var/`, `generated/`, other excluded dirs | Grep / `rg` | IDE search (skips excluded dirs) |
| Read or edit files | Read, Edit, Write | `get_file_text_by_path`, `replace_text_in_file`, `create_new_file` |
| Run shell commands | Bash | `execute_terminal_command` |
| Run tests the way the IDE does | `get_run_configurations` → `execute_run_configuration` | guessing the interpreter |
| Project layout overview | `list_directory_tree` with a small `maxDepth` | `ls -R` |
| What the user is looking at | `get_all_open_file_paths` (first entry is the active editor) | asking |
| Repos in a multi-repo project | `get_repositories` | — |
| Library and module inventory | `get_project_dependencies`, `get_project_modules` | — |

Why not the IDE edit tools: `replace_text_in_file` defaults to `replaceAll: true`
and saves immediately; `create_new_file` can overwrite. Claude Code's Edit and Write
are exact and reviewable.

Why not `execute_terminal_command`: it asks for confirmation inside the IDE (unless
Brave Mode is on), so it blocks while the user is in the terminal, and it truncates
output. Use it only when the user says the IDE terminal environment matters.

## Understanding code: get_symbol_info

This is the most valuable tool here. It returns the Quick Documentation view: the
resolved declaration, signature, types and docblock, also for symbols in `vendor/`.

To use it, you need a position:

1. Find an occurrence with `search_in_files_by_text` / `search_in_files_by_regex`
   (matches are wrapped in `||`), or Read the file.
2. Call `get_symbol_info` with that file, line, and a column inside the symbol name.

Use it to:

- Resolve what `$this->repository->save()` actually calls when the property is typed
  as an interface.
- Check method signatures and return types of framework or vendor APIs before
  calling them, instead of assuming from memory.
- Follow a stack-trace frame (for example from a Tideways issue) to the real
  declaration.

## After every PHP edit: diagnostics

1. Run `get_file_problems` with `errorsOnly: false` on each changed file.
2. Fix errors. Fix warnings caused by the change (undefined method, wrong type,
   unused import you added). Report pre-existing warnings; do not fix them unasked.
3. Then run the project checks that exist: PHPStan/Psalm, php-cs-fixer, tests.

This catches undefined classes and methods, type mismatches, and syntax that is
invalid for the project's PHP language level, which `php -l` with the host PHP misses.

If the result does not match the file you just wrote (stale content), call
`open_file_in_editor` on the file and run `get_file_problems` again.

## Renames: rename_refactoring

- Arguments are `pathInProject` (a file that declares or uses the symbol),
  `symbolName`, `newName`. It updates declarations, usages and imports.
- It renames by name, not position. If the file has more than one symbol with that
  name, use the file that declares the one you mean.
- Afterwards, search the old name with `rg` across the repo, including config:
  DI XML/YAML, routes, templates, and string references are often not updated.
  Fix the rest by hand.
- Run `get_file_problems` on the changed files.
- A class rename does not always rename the file. Check with `git status`.

## Running tests

1. `get_run_configurations` first. Saved PHPUnit/Pest configurations hold the real
   interpreter (Docker, remote, a specific PHP version), config file and env.
2. If one fits, use `execute_run_configuration` with its `configurationName` and a
   `timeout` that fits the suite. Use `truncateMode: START` to keep the summary.
3. If none fits, read how the project runs tests (Makefile, composer scripts,
   docker compose, README) and use Bash. Do not assume the host `php` matches the
   project's PHP version.
4. An empty output with exit code 0 is not proof that tests ran. Check the output for
   a test count.

## Formatting: reformat_file

- Only on files you changed, never on others to make the diff look uniform.
- If the project has `.php-cs-fixer.php`, `phpcs.xml` or `ecs.php`, use that tool
  instead. The IDE code style can disagree with it and create noise in the diff.

## Safety

- Ask before running a run configuration that is not a test or that targets a
  non-local system (deploy, migrations, HTTP request files with remote hosts).
- Never print secrets from run configuration environment variables in output.
