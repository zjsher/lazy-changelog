## v1.3.2 (2026-08-27)

### ✨ Features
- [code] Added `--max-changes-chars` and `--max-output-tokens` CLI options (and corresponding `maxChangesChars`/`maxOutputTokens` renderer options) to control how much change-list text is sent to the AI and how many tokens it may emit in response
- [code] Nx renderer now scopes changes to the range between the previous release tag and `HEAD` via `scopeNxChangesToRelease`, filtering out stale historical commits by matching short hashes against `git log`

### 🐛 Bug Fixes
- [commits] Fixed stale historical Nx changes leaking into a release's changelog when hashes weren't correctly bounded to the release range ("char bust")
- [code] Renderer falls back to Nx's original unfiltered change list when the release tag boundary can't be safely resolved (e.g. no previous tag or no hash matches), preventing empty changelogs

### 🛠️ Improvements
- [code] Added `truncateChanges` in `core.ts` to cap the change-description text included in the AI prompt (default 60,000 chars) with a "changes truncated" marker instead of sending unbounded text
- [code] `formatNxChange` no longer includes commit body text in the prompt, relying only on hash/type/scope/description to reduce prompt size
- [code] AI request logging now includes tag range, received/selected change counts, prompt/change-list character counts, and max output tokens for easier diagnosis
- [code] `generateText` output token limit is now configurable via `maxOutputTokens` instead of a hardcoded 1024
- [docs] Updated README to document new size/token limits, release-scoping behavior, and default budgets (50k diff chars, 5k per file, 60k change-list chars, 4,096 output tokens)

## v1.3.1 (2026-08-27)

### 🐛 Bug Fixes
- [commits] Fixed Nx commit generation so the renderer uses Nx's supplied `ChangelogChange[]` as the canonical change list instead of rediscovering commits from Git
- [code] Added `renderDeterministicFallback` to guarantee a non-empty changelog with a `### Changes` section when there are changes but AI summarization is skipped, fails, or returns empty text
- [code] `stripGeneratedChangelogTitle` strips AI-generated release/version headings from output so the prompt's "no title" rule is enforced even if the model ignores it

### ✨ Features
- [code] `AIChangelogOptions.changes` allows passing preformatted canonical changes (e.g. from Nx) directly into `AIChangelogGenerator`, bypassing Git commit discovery
- [code] `formatNxChange` converts Nx `ChangelogChange` objects (hash, type, scope, description, body) into formatted change strings for the AI prompt

### 🛠️ Improvements
- [code] Added diagnostic logging for changelog input source/count, AI provider/model/prompt size, and AI response size/finish reason to aid debugging
- [code] AI provider call now throws a descriptive error including provider, model, and finish reason when the response text is empty, triggering the deterministic fallback
- [code] Updated changelog prompt rules to explicitly forbid release titles, version headings, dates, or introductory prose in AI output
- [test] Added `test/nx-renderer.test.cjs` with coverage for the new Nx renderer behavior and fallback logic
- [commits] Added a `test` script (`node --test test/*.test.cjs`) to `package.json`
- [docs] Updated README to document Nx-as-canonical-source behavior and the deterministic fallback/logging guarantees

## 1.3.0 (2026-08-27)

### 🐛 Bug Fixes
- [commits] Fixed Nx commit generation to use Nx's supplied `ChangelogChange[]` as the canonical change list instead of rediscovering commits from Git
- [code] Added deterministic fallback rendering (`renderDeterministicFallback`) so a release with changes never silently produces only a version heading
- [code] AI provider now throws an explicit error when it returns empty changelog text instead of silently succeeding

### 🛠️ Improvements
- [code] Added `changes` option to `AIChangelogOptions` allowing preformatted Nx changes to be summarized instead of Git-discovered commits
- [code] Added `formatNxChange` to format Nx `ChangelogChange` entries (hash, type, scope, description, body) for AI prompts
- [code] Added `stripGeneratedChangelogTitle` to strip AI-generated release titles/version headings from output
- [code] Added logging of change source/count, selected provider/model, prompt size, response size, and finish reason for easier diagnosis
- [code] Updated AI prompt rules to instruct the model to omit release titles, version headings, dates, and intro prose
- [code] Added `test` script (`node --test test/*.test.cjs`) and new `test/nx-renderer.test.cjs` covering the Nx renderer behavior
- [commits] Updated README and CHANGELOG to document Nx-as-canonical-source behavior and AI fallback guarantees

## 1.3.0 (2026-08-27)

### 🐛 Bug Fixes
- [code] When used as an Nx Release renderer, `AIChangelogGenerator` now uses Nx's supplied `changes` array directly instead of rediscovering commits from Git, fixing incorrect/competing commit lists in Nx-generated changelogs
- [code] Added `stripGeneratedChangelogTitle` to strip stray release/version headings the AI sometimes generates, preventing duplicate titles in output
- [code] AI provider calls now throw an error when the response text is empty instead of silently returning blank content

### ✨ Features
- [code] Added `renderDeterministicFallback` in `AIChangelogRenderer` to produce a deterministic "### Changes" changelog from Nx's changes when AI is skipped, fails, or returns nothing
- [code] Added `formatNxChange` to convert Nx's `ChangelogChange[]` entries (hash, type, scope, description, body) into text usable by the AI prompt

### 🛠️ Improvements
- [code] Added `changes` option to `AIChangelogOptions` allowing canonical, preformatted change lists to be passed instead of Git-derived commits
- [code] Added logging for changelog input source/count, AI provider/model/prompt size, and AI response size/finish reason to aid debugging
- [code] Updated AI prompt rules to forbid release titles/version headings/dates so generated content starts directly with a section heading
- [code] Added `test` script (`node --test test/*.test.cjs`) and a new `test/nx-renderer.test.cjs` covering the Nx renderer behavior
- [code] Updated README to document Nx as the canonical change source, the deterministic fallback behavior, and the `NX_CHANGELOG_SKIP_AI` diagnostic logging

## 1.3.0 (2026-08-27)

### ✨ Features
- [code] AIChangelogGenerator now accepts a `changes` option to summarize canonical, preformatted change lists (e.g. from Nx) instead of discovering commits from Git
- [code] Added `formatNxChange` and a deterministic `renderDeterministicFallback` in the Nx renderer to build a changelog directly from Nx's supplied `ChangelogChange[]` when AI is skipped, fails, or returns empty text

### 🐛 Bug Fixes
- [code] Nx renderer no longer falls back to a potentially empty default render; it guarantees a non-empty changelog with a "### Changes" section when Nx changes exist
- [code] `AIProvider.generate` now throws an explicit error when the AI response text is empty instead of silently returning blank content
- [code] Added `stripGeneratedChangelogTitle` to strip AI-generated release/version title lines so they don't duplicate Nx's version heading

### 🛠️ Improvements
- [code] Prompt instructions now explicitly forbid AI from including a release title, version heading, or intro prose
- [code] Added `[lazy-changelog]` diagnostic logging for change source/count, selected provider/model, prompt size, response size, and finish reason
- [code] Added `test` script (`node --test test/*.test.cjs`) and a new `test/nx-renderer.test.cjs` suite covering the Nx renderer behavior
- [docs] Clarified in README that Git is used only for optional code-diff context when Nx supplies the canonical change list, and documented the AI failure fallback behavior

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
