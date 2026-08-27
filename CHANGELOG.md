## 1.3.0 (2026-08-27)

### 🐛 Bug Fixes
- [code] Fix Nx changelog renderer to use Nx's supplied `ChangelogChange[]` as the canonical change list instead of rediscovering commits from Git, via the new `changes` option on `AIChangelogOptions` and `formatNxChange` helper
- [code] Fix AI changelog generation to strip erroneous release titles/version headings from AI output via new `stripGeneratedChangelogTitle` function
- [code] Fix silent empty changelogs by throwing an error when the AI provider returns empty text instead of returning it unchecked

### 🛠️ Improvements
- [code] Add `renderDeterministicFallback` to `AIChangelogRenderer` so a release with changes never produces only a version heading when AI is skipped, fails, or returns no usable content
- [code] Add logging of change source/count, selected provider/model, prompt size, response size, and finish reason to aid diagnosing failures
- [code] Update prompt rules to instruct the AI to omit release titles, version headings, dates, and introductory prose
- [code] Add `test` script to `package.json` and new `test/nx-renderer.test.cjs` covering the Nx renderer behavior

## v1.3.0 (2026-06-15)

## v1.3.0

### ✨ Features
- [code] Add auto-detection of the latest AI model per provider at runtime via new `resolveDefaultModel` function in `src/models.ts`
- [code] Add `--model-tier` CLI flag for both `generate` and `commit` commands to select between `balanced` (default), `newest`, and `fast` model tiers when no explicit model is pinned
- [code] Add `aiModelTier` option to `AIChangelogOptions`, `CommitMessageOptions`, and `AIChangelogRenderOptions` interfaces
- [code] Add `ModelTier` and `ModelProvider` types, exported from both `core.ts` and `index.ts`
- [code] Add `FALLBACK_MODELS` and `DEFAULT_MODEL_TIER` constants exported from the public API, replacing the previous `DEFAULT_MODELS` hardcoded map

### 🛠️ Improvements
- [code] Deprecate `DEFAULT_MODELS` in favor of `FALLBACK_MODELS`; the old export is kept as an alias for backward compatibility and is only used when runtime model detection fails
- [code] Update `providers` command description and help text to clarify that listed models are fallbacks, not defaults, and explain the auto-detection behavior
- [code] Update `-m, --model` help text to indicate auto-detection is the default when no model is specified
- [code] Remove hardcoded model (`claude-sonnet-4-20250514`) from `changelog` and `changelog:version` npm scripts, relying on auto-detection instead
- [code] Pass `aiModelTier` through to `AIChangelogGenerator` in the Nx `AIChangelogRenderer`
- [code] Update README tables to document `--model-tier` flag and `aiModelTier` Nx render option

## v1.2.0 (2026-05-21)

### ✨ Features
- [code] Add multi-ecosystem version detection support with auto-scan for project files (package.json, deno.json, Cargo.toml, pyproject.toml, composer.json, pubspec.yaml, mix.exs, *.gemspec, VERSION files)
- [code] Add `--version-file` CLI option to specify explicit path to version file with automatic ecosystem detection
- [code] Add `--version-file-kind` CLI option to override parser kind (npm, deno, cargo, pyproject, composer, pubspec, gemspec, mix, text)
- [code] Add `detectKindFromPath`, `detectProjectVersion`, `parseVersionFromContent`, and `readVersionFile` functions for version file parsing
- [code] Add `VersionFileKind` type and export version detection utilities from core module

### 🛠️ Improvements
- [code] Replace runtime package.json reads with build-time version injection via `__LAZY_CHANGELOG_VERSION__` constant in tsup config
- [code] Add `versionFile` and `versionFileKind` options to `AIChangelogRenderOptions` interface for Nx integration
- [code] Update CLI help text with version file options and ecosystem compatibility table in README

## v1.1.0 (2026-01-17)

### ✨ Features
- [cli] Add custom prompt support via `--prompt` option for both changelog and commit commands with placeholder substitution for {changes}, {diffs}, and other variables
- [cli] Add new `prompt` command with `--changelog` and `--commit` flags to display DEFAULT_PROMPT and COMMIT_MESSAGE_PROMPT templates

### 🛠️ Improvements
- [cli] Import DEFAULT_PROMPT and COMMIT_MESSAGE_PROMPT constants from core module for prompt display functionality
- [cli] Pass customPrompt parameter to AIChangelogGenerator and AICommitMessageGenerator constructors

## v1.0.2 (2026-01-17)

## v1.0.2

### 🐛 Bug Fixes
- [commits] Handle git diff in repositories with no commits
- [code] Fix getStagedDiff() method to work with brand new repositories by checking for HEAD existence and using empty tree hash for initial diffs

### 🛠️ Improvements
- [code] Add hasHead detection logic using git rev-parse HEAD to determine repository state
- [code] Implement conditional diff command generation based on repository state and includeUnstaged option
- [code] Consolidate stat command generation to match the selected diff strategy

## v1.0.1 (2026-01-17)

## v1.0.1

### 🐛 Bug Fixes
- [code] Replace execSync with spawnSync for git commit execution to avoid shell interpretation of special characters in commit messages

### 🛠️ Improvements
- [code] Import spawnSync from child_process module for safer command execution
- [code] Update error handling to check spawnSync result status instead of try-catch block

## v1.0.0 (2026-01-17)

Based on the commits and code diffs provided:

### ✨ Features
- [code] Add AI-powered commit message generation with `lazy-changelog commit` CLI command
- [code] Add AICommitMessageGenerator class with staged diff analysis capability
- [code] Add `generateCommitMessage` function for programmatic API usage
- [code] Add `-e/--execute` flag to automatically run git commit with generated message
- [code] Add `--prefix` option to prepend text like ticket numbers to commit messages
- [code] Add `-a/--all` flag to include unstaged changes in commit message generation

### 🛠️ Improvements
- [code] Restructure README.md with clearer "Quick Start" section featuring 4 distinct setup options
- [code] Add complete installation examples with specific AI provider packages (@ai-sdk/anthropic)
- [code] Enhanced CLI usage examples with package.json scripts for release workflows
- [code] Move GitHub Actions configuration into main setup options with improved workflow example
- [code] Expand programmatic API example with console.log output demonstration
- [code] Add git alias configuration example for `git lazy` shortcut

## v0.1.2 (2026-01-17)

## Version 0.1.2

### 🛠️ Improvements
- [code] Restructured README.md with clearer "Quick Start" section featuring 4 distinct setup options (CLI, Nx Release, GitHub Actions, Programmatic API)
- [code] Added complete installation examples with specific AI provider packages (@ai-sdk/anthropic)
- [code] Enhanced CLI usage examples with package.json scripts for release workflows
- [code] Moved GitHub Actions configuration from separate section into main setup options with improved workflow example
- [code] Expanded programmatic API example with console.log output demonstration
- [code] Reorganized documentation structure moving GitHub Actions section into Option 3 of Quick Start

## 0.1.0 (2026-01-17)

### ✨ Features
- [code] CLI tool with `generate` command for creating AI-powered changelogs from git commits and diffs
- [code] Support for multiple AI providers (Anthropic Claude, OpenAI GPT, Google Gemini, Ollama) with configurable models
- [code] Nx Release renderer integration (`AIChangelogRenderer`) for automated changelog generation in Nx workspaces
- [code] Code diff analysis with configurable limits (`maxChars`, `maxCharsPerFile`) to improve changelog accuracy
- [code] Auto-detection of git tags and commit ranges for changelog scope determination
- [code] File output options including prepend mode for existing changelog files
- [code] `providers` and `init` CLI commands for setup assistance and configuration generation
- [code] Environment variable support for API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`)
- [code] Programmatic API (`generateChangelog`, `generateSummary`) for integration into custom workflows
- [code] Smart filtering to exclude release commits, merge commits, lock files, and build artifacts
- [code] Summary-only mode and version header customization options
- [code] GitHub Actions workflow templates and git hook configuration examples
