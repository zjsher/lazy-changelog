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
