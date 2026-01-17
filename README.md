# lazy-changelog

**You write bad commits. We get it.**

```
fix stuff
update things
wip
asdfasdf
. <-- My go-to short lazy commit message, sorry world.
```

Sound familiar? `lazy-changelog` reads your actual code changes and writes a proper changelog anyway.

```bash
npx lazy-changelog generate --diffs
```

No judgment.

---

## What It Actually Does

1. **Finds your last release** - Detects the previous git tag (e.g., `v1.0.0`)
2. **Gathers changes** - Collects all commits and optionally code diffs since that tag
3. **Sends to AI** - Uses Claude, GPT, Gemini, or Ollama to analyze what actually changed
4. **Returns real notes** - Outputs categorized, human-readable release notes

**Works with:**
- **Standalone CLI** - any git repository
- **Nx Release** - as a custom changelog renderer
- **Programmatic API** - for custom integrations

## Features

- **Tag-based detection** - Automatically finds commits since your last release
- **Multiple AI providers** - Anthropic, OpenAI, Google, Ollama
- **Code diff analysis** - Reads your actual code when your commits say nothing useful
- **Source attribution** - Marks items as `[commits]` or `[code]` based on source
- **Smart fallback** - Falls back gracefully if AI fails

## Installation

```bash
npm install lazy-changelog
# or
pnpm add lazy-changelog
# or
yarn add lazy-changelog
```

Then install your preferred AI provider SDK:

```bash
# For Anthropic Claude (recommended)
npm install @ai-sdk/anthropic

# For OpenAI
npm install @ai-sdk/openai

# For Google Gemini
npm install @ai-sdk/google

# For local Ollama
npm install ollama-ai-provider
```

## Quick Start

### Option 1: Standalone CLI

Generate a changelog for any git repository:

```bash
# Basic usage
npx lazy-changelog generate

# With code diffs (recommended for lazy commit messages)
npx lazy-changelog generate --diffs

# With options
npx lazy-changelog generate --provider anthropic --diffs --prepend CHANGELOG.md

# See all options
npx lazy-changelog generate --help
```

### Option 2: Nx Release Integration

Add the renderer to your `nx.json`:

```json
{
  "release": {
    "changelog": {
      "workspaceChangelog": {
        "renderer": "lazy-changelog",
        "renderOptions": {
          "aiProvider": "anthropic",
          "enableAISummary": true,
          "includeDiffs": true
        }
      }
    }
  }
}
```

### Option 3: Programmatic API

```typescript
import { generateChangelog, AIChangelogGenerator } from 'lazy-changelog';

// Simple usage
const changelog = await generateChangelog({
  aiProvider: 'anthropic',
  includeDiffs: true,
});

// Or with more control
const generator = new AIChangelogGenerator({
  aiProvider: 'openai',
  aiModel: 'gpt-4o',
  from: 'v1.0.0',
  to: 'HEAD',
  includeDiffs: {
    enabled: true,
    maxChars: 30000,
  },
});

const result = await generator.generate();
```

## CLI Usage

```
Usage: lazy-changelog [command] [options]

Commands:
  generate [options]  Generate a changelog entry
  providers          List available AI providers
  init [options]     Initialize configuration

Generate Options:
  -p, --provider <provider>  AI provider (anthropic, openai, google, ollama)
  -m, --model <model>        AI model to use
  -f, --from <ref>           Git ref to compare from (tag, commit, branch)
  -t, --to <ref>             Git ref to compare to (default: HEAD)
  -v, --version <version>    Version string for changelog header
  -d, --diffs                Include code diffs in AI analysis
  --diffs-auto               Include diffs only when commits are sparse
  --max-diff-chars <chars>   Maximum total diff characters (default: 50000)
  --max-file-chars <chars>   Maximum diff characters per file (default: 5000)
  -o, --output <file>        Write output to file
  --prepend <file>           Prepend to existing changelog file
  --summary-only             Output only the summary without version header
  --base-url <url>           Base URL for AI provider
  -C, --cwd <dir>            Working directory
```

### CLI Examples

```bash
# Generate and print to stdout
lazy-changelog generate

# Your commits are garbage? Use diffs
lazy-changelog generate --diffs

# Generate with specific provider and model
lazy-changelog generate --provider openai --model gpt-4-turbo

# Generate for a specific version range
lazy-changelog generate --from v1.0.0 --to v1.1.0

# Prepend to existing CHANGELOG.md
lazy-changelog generate --prepend CHANGELOG.md

# Use with local Ollama
lazy-changelog generate --provider ollama --model llama3.2 --base-url http://localhost:11434/api
```

## How It Works

The tool automatically detects which commits and code changes to include based on git tags:

### Automatic Range Detection

| Scenario | Commits Included | Diffs Included |
|----------|------------------|----------------|
| Has previous tag (e.g., `v1.0.0`) | All commits from `v1.0.0..HEAD` | All changes from `v1.0.0..HEAD` |
| No previous tags | Last 50 commits | Last 10 commits worth of changes |
| `--from` specified | From that ref to HEAD | From that ref to HEAD |
| `--from` and `--to` specified | Between those two refs | Between those two refs |

### Example

If your git history looks like:
```
* abc123 (HEAD) fix stuff
* def456 wip
* ghi789 (tag: v1.0.0) chore(release): v1.0.0
* jkl012 asdfasdf
```

Running `lazy-changelog generate --diffs` will:
1. Find the previous tag (`v1.0.0`)
2. Gather commits `abc123` and `def456` (everything after `v1.0.0`)
3. Get the code diff for those changes (since your commits are useless)
4. Send to AI for summarization
5. Output something actually readable

### Filtering

The tool automatically excludes:
- Release commits (`chore(release): ...`)
- Merge commits (`Merge pull request ...`)
- Lock files, images, and build artifacts from diffs

## Environment Variables

Set the API key for your chosen provider:

```bash
# Anthropic
export ANTHROPIC_API_KEY=your-api-key

# OpenAI
export OPENAI_API_KEY=your-api-key

# Google
export GOOGLE_API_KEY=your-api-key

# Skip AI summarization (Nx only)
export NX_CHANGELOG_SKIP_AI=true
```

## Nx Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `aiProvider` | `'anthropic' \| 'openai' \| 'google' \| 'ollama'` | `'anthropic'` | AI provider to use |
| `aiModel` | `string` | Provider default | Model to use |
| `enableAISummary` | `boolean` | `true` | Enable/disable AI summarization |
| `includeDiffs` | `boolean \| DiffOptions` | `false` | Include code diffs in AI analysis |
| `customPrompt` | `string` | Built-in prompt | Custom prompt template |
| `aiBaseUrl` | `string` | Provider default | Custom base URL |

### Diff Options

When `includeDiffs` is an object:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean \| 'auto'` | `false` | `true` = always, `'auto'` = when commits are sparse |
| `maxChars` | `number` | `50000` | Maximum total diff characters |
| `maxCharsPerFile` | `number` | `5000` | Maximum per-file characters |
| `excludePatterns` | `string[]` | Lock files, images, dist | Patterns to exclude |
| `includePatterns` | `string[]` | All files | Patterns to include |

## Git Hooks Integration

Use with git hooks for automatic changelog generation:

```bash
# Show git hook setup instructions
lazy-changelog init --hook
```

Example post-tag hook:

```bash
#!/bin/bash
TAG_NAME=$1
npx lazy-changelog generate --version "$TAG_NAME" --prepend CHANGELOG.md
```

## GitHub Actions Integration

```bash
# Show GitHub Action workflow
lazy-changelog init --github-action
```

Example workflow:

```yaml
name: Generate Changelog
on:
  push:
    tags: ['v*']

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install -g lazy-changelog @ai-sdk/anthropic

      - name: Generate changelog
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: lazy-changelog generate --version "${GITHUB_REF#refs/tags/}" --prepend CHANGELOG.md

      - name: Commit changelog
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add CHANGELOG.md
          git commit -m "docs: update changelog"
          git push
```

## Example Output

Your commits:
```
fix stuff
update things
wip
```

Your changelog:
```markdown
## 1.2.0 (2025-01-17)

### Features
- [code] Added user authentication with OAuth2 support
- [code] Implemented rate limiting for API endpoints

### Bug Fixes
- [code] Fixed memory leak in WebSocket connection handling
- [code] Resolved race condition in cache invalidation

### Improvements
- [code] Optimized database queries for better performance
- [code] Updated dependencies to latest stable versions
```

You're welcome.

## Default Models

| Provider | Default Model |
|----------|---------------|
| Anthropic | `claude-sonnet-4-20250514` |
| OpenAI | `gpt-4o` |
| Google | `gemini-2.0-flash` |
| Ollama | `llama3.2` |

## Requirements

- Node.js >= 18.0.0
- Nx >= 19.0.0 (only for Nx integration)

## License

MIT
