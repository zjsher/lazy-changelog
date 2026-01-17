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
