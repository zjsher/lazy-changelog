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

When used as an Nx Release renderer, Nx's supplied `ChangelogChange[]` is the
canonical source for descriptions, types, scopes, and affected-project data.
lazy-changelog intersects hashed Nx changes with the previous-release-tag to
`HEAD` boundary so stale historical entries cannot leak into a release. It does
not rediscover or reinterpret commit messages from Git. If the boundary cannot
be resolved safely, it keeps Nx's list unchanged.

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

The defaults are conservative: 50k diff characters, 5k per file, 60k change-list
characters, and 4,096 output tokens. Commit bodies supplied by Nx are not sent;
the structured Nx description/type/scope metadata is enough and avoids enormous
prompts. For a large monorepo, you can dial the budgets down:

```bash
# Smaller limits
lazy-changelog generate --diffs --max-diff-chars 20000 --max-file-chars 2000 \
  --max-changes-chars 30000 --max-output-tokens 3000
```

Or in nx.json:

```json
{
  "renderOptions": {
    "includeDiffs": {
      "enabled": true,
      "maxChars": 20000,
      "maxCharsPerFile": 2000
    },
    "maxChangesChars": 30000,
    "maxOutputTokens": 3000
  }
}
```

Use `--diffs-auto` if you only want diffs when your commit messages are particularly useless (it checks if they're sparse/uninformative).

For Ollama users: local models = no token costs, go wild.

## Version detection (no `package.json` required)

`lazy-changelog` doesn't care what language you write in. The version that lands in the changelog header is resolved in this order:

1. `--tag <version>` (explicit override)
2. `--version-file <path>` (explicit file; parser inferred from filename, or override with `--version-file-kind`)
3. Auto-scan the repo for known files
4. `git describe --tags --abbrev=0`
5. `Unreleased`

Auto-scan order:

| File | Ecosystem |
|------|-----------|
| `package.json` | Node / Bun / JavaScript / TypeScript |
| `deno.json` / `deno.jsonc` / `jsr.json` | Deno / JSR |
| `Cargo.toml` | Rust |
| `pyproject.toml` | Python (PEP 621 or Poetry) |
| `composer.json` | PHP |
| `pubspec.yaml` | Dart / Flutter |
| `mix.exs` | Elixir |
| `*.gemspec` | Ruby |
| `VERSION` / `VERSION.txt` / `version.txt` | Plain text |

Go projects don't have a version field in `go.mod` — they fall through to the `git describe` fallback automatically.

Override examples:

```bash
# Explicit file (kind inferred from name)
lazy-changelog generate --version-file Cargo.toml

# Non-standard filename, force a parser
lazy-changelog generate --version-file ./packages/core/version.toml --version-file-kind cargo

# Plain text VERSION file
lazy-changelog generate --version-file VERSION
```

Kinds: `npm`, `deno`, `cargo`, `pyproject`, `composer`, `pubspec`, `gemspec`, `mix`, `text`.

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

If an Nx AI request fails or returns empty text, lazy-changelog falls back to a
deterministic changelog made from the same release-scoped Nx changes. A release
with changes will never silently produce only a version heading. Release logs
include the tag range, received/selected counts, provider/model, prompt and
change-list sizes, output budget, response size, and finish reason.

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
| `-m, --model` | Pin a specific model (default: auto-detect the latest) |
| `--model-tier` | Tier to auto-detect when `--model` is unset: `balanced` (default), `newest`, `fast` |
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
| `-m, --model` | Pin a specific model (default: auto-detect the latest) |
| `--model-tier` | Tier to auto-detect when `--model` is unset: `balanced` (default), `newest`, `fast` |
| `-f, --from` | Start ref (tag, commit, branch) |
| `-t, --to` | End ref (default: HEAD) |
| `--tag` | Version for the changelog header (e.g., v1.0.0) |
| `-d, --diffs` | Include code diffs |
| `--diffs-auto` | Only include diffs when commits look sparse |
| `--max-diff-chars` | Total diff size limit (default: 50000) |
| `--max-file-chars` | Per-file limit (default: 5000) |
| `--max-changes-chars` | Change-list prompt limit (default: 60000) |
| `--max-output-tokens` | Changelog response budget (default: 4096) |
| `-o, --output` | Write to file |
| `--prepend` | Prepend to existing changelog (creates if missing) |
| `--summary-only` | Just the summary, no version header |
| `--version-file` | Explicit project version file (Cargo.toml, pyproject.toml, VERSION, etc.) |
| `--version-file-kind` | Override parser kind (npm, deno, cargo, pyproject, composer, pubspec, gemspec, mix, text) |

Nx renderOptions:

| Option | Default | Notes |
|--------|---------|-------|
| `aiProvider` | `anthropic` | |
| `aiModel` | auto-detect | Pin a model, or leave unset to auto-detect the latest per provider |
| `aiModelTier` | `balanced` | Tier to auto-detect when `aiModel` is unset: `balanced`, `newest`, `fast` |
| `enableAISummary` | `true` | Set false to use default Nx renderer |
| `includeDiffs` | `false` | `true`, `false`, or an object with limits |
| `maxChangesChars` | `60000` | Maximum Nx change-description characters sent to AI |
| `maxOutputTokens` | `4096` | Maximum changelog tokens the AI may emit |
| `customPrompt` | built-in | Your own prompt if you want |
| `aiBaseUrl` | default | For proxies or custom endpoints |

## Requirements

- Node 18+
- Nx 19+ (only if using the Nx renderer)

## License

MIT
