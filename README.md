# lazy-changelog

**You write bad commits. We get it.**

```
fix stuff
update things
wip
asdfasdf
. <-- My go-to short lazy commit message, sorry world.
```

Sound familiar? `lazy-changelog` reads your actual code changes and writes proper commit messages and changelogs anyway.

```bash
# Generate a commit message from staged changes
npx lazy-changelog commit

# Generate a changelog from recent commits
npx lazy-changelog generate --diffs
```

No judgment.

---

## How it works

**For commit messages (`lazy-changelog commit`):**
1. Reads your staged changes (`git diff --cached`)
2. Sends them to AI
3. Returns a proper conventional commit message

**For changelogs (`lazy-changelog generate`):**
1. Finds your last git tag (like `v1.0.0`)
2. Grabs all the commits since then
3. Optionally reads the actual code diffs too
4. Sends it to Claude/GPT/Gemini/Ollama
5. Returns something your PM can actually read

Works as a standalone CLI, an Nx Release renderer, or a programmatic API.

## Install

```bash
npm install lazy-changelog
```

You'll also need whichever AI SDK you want to use:

```bash
npm install @ai-sdk/anthropic   # Claude (recommended)
npm install @ai-sdk/openai      # GPT
npm install @ai-sdk/google      # Gemini
npm install ollama-ai-provider  # Local Ollama
```

## Quick Start

Pick your setup:

### Option 1: Standalone CLI

```bash
# Install
npm install lazy-changelog @ai-sdk/anthropic

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Generate changelog
npx lazy-changelog generate --diffs --prepend CHANGELOG.md
```

Add to package.json for releases:

```json
{
  "scripts": {
    "changelog": "lazy-changelog generate --diffs --prepend CHANGELOG.md",
    "release": "npm run changelog && npm version patch"
  }
}
```

### Option 2: Nx Release

```bash
# Install
npm install lazy-changelog @ai-sdk/anthropic
```

Add to `nx.json`:

```json
{
  "release": {
    "changelog": {
      "workspaceChangelog": {
        "renderer": "lazy-changelog",
        "renderOptions": {
          "aiProvider": "anthropic",
          "includeDiffs": true
        }
      }
    }
  }
}
```

Then just run:

```bash
nx release
```

### Option 3: GitHub Actions

Create `.github/workflows/changelog.yml`:

```yaml
name: Changelog
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
      - run: npm install -g lazy-changelog @ai-sdk/anthropic
      - run: lazy-changelog generate --diffs --tag "${GITHUB_REF#refs/tags/}" --prepend CHANGELOG.md
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add CHANGELOG.md
          git commit -m "docs: changelog" && git push || true
```

### Option 4: Programmatic API

```typescript
import { generateChangelog } from 'lazy-changelog';

const changelog = await generateChangelog({
  aiProvider: 'anthropic',
  includeDiffs: true,
});

console.log(changelog);
```

## Token usage warning

**Heads up:** The `--diffs` flag sends your actual code changes to the AI, which can eat through tokens fast on big releases.

The defaults are pretty conservative (50k chars total, 5k per file), but if you're working on a large monorepo or had a lot of changes since the last release, you might want to dial it down:

```bash
# Smaller limits
lazy-changelog generate --diffs --max-diff-chars 20000 --max-file-chars 2000
```

Or in nx.json:

```json
{
  "renderOptions": {
    "includeDiffs": {
      "enabled": true,
      "maxChars": 20000,
      "maxCharsPerFile": 2000
    }
  }
}
```

Use `--diffs-auto` if you only want diffs when your commit messages are particularly useless (it checks if they're sparse/uninformative).

For Ollama users: local models = no token costs, go wild.

## What gets included

The tool figures out what to analyze based on your git tags:

- **Has a previous tag?** Everything from that tag to HEAD
- **No tags yet?** Last 50 commits (diffs limited to last 10 commits worth)
- **Specify `--from`?** Uses that as the starting point

It automatically skips release commits, merge commits, lock files, images, and build output.

## Environment variables

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
```

Skip AI entirely (Nx only): `NX_CHANGELOG_SKIP_AI=true`

## Example

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

### Improvements
- [code] Optimized database queries for better performance
```

You're welcome.

## Commit Messages

Generate AI-powered commit messages from your staged changes:

```bash
# Stage your changes
git add .

# Generate a commit message
lazy-changelog commit

# Generate and commit in one step
lazy-changelog commit -e
```

Example output:
```
feat(core): add AI-powered commit message generation

- Add AICommitMessageGenerator class with staged diff analysis
- Add COMMIT_MESSAGE_PROMPT for conventional commit formatting
- Add 'commit' CLI command with -e flag for direct execution
```

### Commit command flags

| Flag | What it does |
|------|-------------|
| `-p, --provider` | AI provider (anthropic, openai, google, ollama) |
| `-m, --model` | Override the default model |
| `-a, --all` | Include unstaged changes too |
| `-e, --execute` | Actually run git commit with the message |
| `--prefix` | Prefix to prepend (e.g., ticket number) |
| `--base-url` | Base URL for AI provider |

### Adding ticket numbers

Use `--prefix` to add ticket numbers or other prefixes to your commit messages:

```bash
# Add a Jira ticket number
lazy-changelog commit --prefix "JIRA-123: " -e

# Output: JIRA-123: feat(auth): add login endpoint
```

### Git alias (optional)

Add to your `~/.gitconfig`:

```ini
[alias]
  lazy = !npx lazy-changelog commit -e
```

Then just run `git lazy` to stage + generate + commit.

## All the options

### Generate command flags

| Flag | What it does |
|------|-------------|
| `-p, --provider` | anthropic, openai, google, or ollama |
| `-m, --model` | Override the default model |
| `-f, --from` | Start ref (tag, commit, branch) |
| `-t, --to` | End ref (default: HEAD) |
| `--tag` | Version for the changelog header (e.g., v1.0.0) |
| `-d, --diffs` | Include code diffs |
| `--diffs-auto` | Only include diffs when commits look sparse |
| `--max-diff-chars` | Total diff size limit (default: 50000) |
| `--max-file-chars` | Per-file limit (default: 5000) |
| `-o, --output` | Write to file |
| `--prepend` | Prepend to existing changelog (creates if missing) |
| `--summary-only` | Just the summary, no version header |

Nx renderOptions:

| Option | Default | Notes |
|--------|---------|-------|
| `aiProvider` | `anthropic` | |
| `aiModel` | varies | Claude Sonnet, GPT-4o, Gemini Flash, or Llama 3.2 |
| `enableAISummary` | `true` | Set false to use default Nx renderer |
| `includeDiffs` | `false` | `true`, `false`, or an object with limits |
| `customPrompt` | built-in | Your own prompt if you want |
| `aiBaseUrl` | default | For proxies or custom endpoints |

## Requirements

- Node 18+
- Nx 19+ (only if using the Nx renderer)

## License

MIT
