import { Command } from 'commander';
import { AIChangelogGenerator, DEFAULT_MODELS } from './core.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const program = new Command();

// Get version from package.json
let version = '0.0.0';
try {
  const pkgPath = join(__dirname, '..', 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    version = pkg.version;
  }
} catch {
  // Ignore
}

program
  .name('lazy-changelog')
  .description(
    'You write bad commits. We get it. lazy-changelog reads your code anyway.'
  )
  .version(version);

program
  .command('generate')
  .description('Generate a changelog entry for recent changes')
  .option(
    '-p, --provider <provider>',
    'AI provider (anthropic, openai, google, ollama)',
    'anthropic'
  )
  .option('-m, --model <model>', 'AI model to use')
  .option('-f, --from <ref>', 'Git ref to compare from (tag, commit, branch)')
  .option('-t, --to <ref>', 'Git ref to compare to', 'HEAD')
  .option('--tag <version>', 'Version string for changelog header (e.g., v1.0.0)')
  .option('-d, --diffs', 'Include code diffs in AI analysis')
  .option('--diffs-auto', 'Include diffs only when commit messages are sparse')
  .option('--max-diff-chars <chars>', 'Maximum total diff characters', '50000')
  .option('--max-file-chars <chars>', 'Maximum diff characters per file', '5000')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .option('--prepend <file>', 'Prepend to existing changelog file')
  .option('--summary-only', 'Output only the summary without version header')
  .option('--base-url <url>', 'Base URL for AI provider (for Ollama or proxies)')
  .option('-C, --cwd <dir>', 'Working directory', process.cwd())
  .action(async (options) => {
    try {
      const generator = new AIChangelogGenerator({
        aiProvider: options.provider,
        aiModel: options.model,
        from: options.from,
        to: options.to,
        version: options.tag,
        aiBaseUrl: options.baseUrl,
        cwd: options.cwd,
        includeDiffs: options.diffs
          ? {
              enabled: true,
              maxChars: parseInt(options.maxDiffChars, 10),
              maxCharsPerFile: parseInt(options.maxFileChars, 10),
            }
          : options.diffsAuto
            ? {
                enabled: 'auto',
                maxChars: parseInt(options.maxDiffChars, 10),
                maxCharsPerFile: parseInt(options.maxFileChars, 10),
              }
            : false,
      });

      let result: string;

      if (options.summaryOnly) {
        result = await generator.generateSummaryOnly();
      } else {
        result = await generator.generate();
      }

      if (options.prepend) {
        // Prepend to existing file (or create if it doesn't exist)
        const fileExists = existsSync(options.prepend);
        const existingContent = fileExists
          ? readFileSync(options.prepend, 'utf-8')
          : '';

        const newContent = existingContent
          ? result + '\n\n' + existingContent
          : result + '\n';
        writeFileSync(options.prepend, newContent);
        console.log(
          fileExists
            ? `✅ Prepended changelog to ${options.prepend}`
            : `✅ Created ${options.prepend}`
        );
      } else if (options.output) {
        // Write to file
        writeFileSync(options.output, result);
        console.log(`✅ Wrote changelog to ${options.output}`);
      } else {
        // Output to stdout
        console.log(result);
      }
    } catch (error) {
      console.error('❌ Error generating changelog:', error);
      process.exit(1);
    }
  });

program
  .command('providers')
  .description('List available AI providers and their default models')
  .action(() => {
    console.log('\nAvailable AI Providers:\n');
    console.log('  Provider     Default Model               Env Variable');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(
      `  anthropic    ${DEFAULT_MODELS.anthropic.padEnd(28)} ANTHROPIC_API_KEY`
    );
    console.log(
      `  openai       ${DEFAULT_MODELS.openai.padEnd(28)} OPENAI_API_KEY`
    );
    console.log(
      `  google       ${DEFAULT_MODELS.google.padEnd(28)} GOOGLE_API_KEY`
    );
    console.log(
      `  ollama       ${DEFAULT_MODELS.ollama.padEnd(28)} (local, no key needed)`
    );
    console.log('');
  });

program
  .command('init')
  .description('Initialize configuration in your project')
  .option('--nx', 'Generate nx.json configuration')
  .option('--hook', 'Generate git hook configuration')
  .option('--github-action', 'Generate GitHub Action workflow')
  .action((options) => {
    if (options.nx) {
      console.log(`
Add this to your nx.json:

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
`);
    }

    if (options.hook) {
      console.log(`
Create a file at .git/hooks/pre-push or use husky:

#!/bin/bash
# Generate changelog before push (optional)
npx lazy-changelog generate --prepend CHANGELOG.md
git add CHANGELOG.md
git commit --amend --no-edit

Or for post-tag hook (.git/hooks/post-tag):

#!/bin/bash
TAG_NAME=$1
npx lazy-changelog generate --tag "$TAG_NAME" --prepend CHANGELOG.md
`);
    }

    if (options.githubAction) {
      console.log(`
Create .github/workflows/changelog.yml:

name: Generate Changelog

on:
  push:
    tags:
      - 'v*'

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

      - name: Install dependencies
        run: npm install -g lazy-changelog @ai-sdk/anthropic

      - name: Generate changelog
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          lazy-changelog generate --tag "\${GITHUB_REF#refs/tags/}" --prepend CHANGELOG.md

      - name: Commit changelog
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add CHANGELOG.md
          git commit -m "docs: update changelog for \${GITHUB_REF#refs/tags/}"
          git push
`);
    }

    if (!options.nx && !options.hook && !options.githubAction) {
      console.log('Usage: lazy-changelog init [--nx] [--hook] [--github-action]');
      console.log('');
      console.log('Options:');
      console.log('  --nx             Show nx.json configuration');
      console.log('  --hook           Show git hook setup');
      console.log('  --github-action  Show GitHub Action workflow');
    }
  });

program.parse();
