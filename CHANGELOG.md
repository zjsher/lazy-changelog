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
