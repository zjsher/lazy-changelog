import { execSync } from 'child_process';

/**
 * Configuration for including code diffs in AI analysis
 */
export interface DiffOptions {
  /**
   * Whether to include code diffs in the AI prompt.
   * - true: Always include diffs
   * - false: Never include diffs
   * - 'auto': Include diffs only when commit messages seem sparse/unhelpful
   * Default: false
   */
  enabled?: boolean | 'auto';

  /**
   * Maximum total characters of diff to include.
   * Diffs exceeding this will be truncated with a note.
   * Default: 50000 (~50KB, roughly 12k tokens)
   */
  maxChars?: number;

  /**
   * Maximum characters per file diff.
   * Large single-file changes will be summarized instead.
   * Default: 5000
   */
  maxCharsPerFile?: number;

  /**
   * File patterns to exclude from diffs (glob patterns).
   * Default: ['*.lock', '*.json', '*.svg', '*.png', '*.jpg', '*.gif', 'dist/**']
   */
  excludePatterns?: string[];

  /**
   * Only include diffs for these file patterns (glob patterns).
   * If set, only matching files are included.
   * Default: undefined (include all non-excluded files)
   */
  includePatterns?: string[];
}

/**
 * Options for generating AI changelog
 */
export interface AIChangelogOptions {
  /**
   * AI provider to use for summarization.
   * Supported: 'anthropic' | 'openai' | 'google' | 'ollama'
   * Default: 'anthropic'
   */
  aiProvider?: 'anthropic' | 'openai' | 'google' | 'ollama';

  /**
   * Model to use for the AI provider.
   * Default depends on provider:
   * - anthropic: 'claude-sonnet-4-20250514'
   * - openai: 'gpt-4o'
   * - google: 'gemini-2.0-flash'
   * - ollama: 'llama3.2'
   */
  aiModel?: string;

  /**
   * Custom prompt template for the AI. Use {changes} as placeholder for the changes list,
   * and {diffs} for code diffs (if enabled).
   */
  customPrompt?: string;

  /**
   * Base URL for the AI provider (useful for Ollama or custom endpoints)
   */
  aiBaseUrl?: string;

  /**
   * Configuration for including code diffs in AI analysis.
   * Can be a boolean (true = enabled with defaults) or a DiffOptions object.
   */
  includeDiffs?: boolean | DiffOptions;

  /**
   * Git ref to compare from (tag, commit, branch).
   * Default: auto-detect last tag
   */
  from?: string;

  /**
   * Git ref to compare to.
   * Default: HEAD
   */
  to?: string;

  /**
   * Version string for the changelog header.
   * Default: auto-detect from package.json or git tag
   */
  version?: string;

  /**
   * Working directory for git commands.
   * Default: process.cwd()
   */
  cwd?: string;
}

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  ollama: 'llama3.2',
};

export const DEFAULT_DIFF_OPTIONS: Required<DiffOptions> = {
  enabled: false,
  maxChars: 50000,
  maxCharsPerFile: 5000,
  excludePatterns: [
    '*.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '*.svg',
    '*.png',
    '*.jpg',
    '*.jpeg',
    '*.gif',
    '*.ico',
    '*.woff',
    '*.woff2',
    '*.ttf',
    '*.eot',
    'dist/**',
    'build/**',
    '.nx/**',
    'node_modules/**',
  ],
  includePatterns: undefined as unknown as string[],
};

export const DEFAULT_PROMPT = `You are a technical writer creating release notes for a software project.

Analyze the following information and create a concise, user-friendly changelog summary.

## Input Sources

### Commit Messages
These are the git commit messages for this release:
{changes}

{diffs}

## Guidelines

1. **Prioritize commit messages** - They describe the developer's intent
2. **Use code diffs to fill gaps** - When commit messages are vague (like "ok", "fix", "update"), use the diff to understand what actually changed
3. **Group by category** - Features, Improvements, Bug Fixes, etc.
4. **Be user-focused** - Describe what changed from the user's perspective
5. **Be concise** - One line per significant change
6. **Use emoji sparingly** - One per category header is fine

## Output Format

Return markdown content for the changelog entry. Structure it like this:

### ✨ Features
- [commits] Feature descriptions based on commit messages
- [code] Features discovered in code changes (only if not mentioned in commits)

### 🐛 Bug Fixes
- [commits] Bug fixes mentioned in commits
- [code] Bug fixes discovered in code changes

### 🛠️ Improvements
- Other improvements and refactoring

**IMPORTANT rules for source attribution:**
- If code diffs are provided, you MUST prefix EVERY item with either [commits] or [code] to show where the info came from
- [commits] = information derived from the commit message text
- [code] = information derived from analyzing the actual code diff
- If NO code diffs are provided (only commit messages), then do NOT use any prefixes
- Skip empty categories
- If there are no meaningful changes, return: "Maintenance release with internal improvements."`;

/**
 * Core AI changelog generator that works independently of Nx.
 * Can be used standalone via CLI or programmatically.
 */
export class AIChangelogGenerator {
  private options: AIChangelogOptions;
  private cwd: string;

  constructor(options: AIChangelogOptions = {}) {
    this.options = options;
    this.cwd = options.cwd || process.cwd();
  }

  /**
   * Generate an AI-powered changelog entry
   */
  async generate(): Promise<string> {
    const commits = this.getCommits();

    if (commits.length === 0) {
      return 'No changes found.';
    }

    console.log(`🔍 Found ${commits.length} commits for changelog`);

    const summary = await this.generateAISummary(commits);
    const version = this.getVersion();
    const date = new Date().toISOString().split('T')[0];

    return `## ${version} (${date})\n\n${summary}`;
  }

  /**
   * Generate just the AI summary without version header
   */
  async generateSummaryOnly(): Promise<string> {
    const commits = this.getCommits();

    if (commits.length === 0) {
      return 'No changes found.';
    }

    return this.generateAISummary(commits);
  }

  /**
   * Get the version string
   */
  private getVersion(): string {
    if (this.options.version) {
      return this.options.version;
    }

    // Try to get from package.json
    try {
      const pkgJson = execSync('cat package.json', {
        encoding: 'utf-8',
        cwd: this.cwd,
      });
      const pkg = JSON.parse(pkgJson);
      if (pkg.version) {
        return pkg.version;
      }
    } catch {
      // Ignore
    }

    // Try to get from latest tag
    try {
      return execSync('git describe --tags --abbrev=0 2>/dev/null', {
        encoding: 'utf-8',
        cwd: this.cwd,
      }).trim();
    } catch {
      return 'Unreleased';
    }
  }

  /**
   * Get the last tag before the target ref
   */
  private getLastTag(): string | null {
    try {
      const to = this.options.to || 'HEAD';
      return execSync(`git describe --tags --abbrev=0 ${to}~1 2>/dev/null`, {
        encoding: 'utf-8',
        cwd: this.cwd,
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Resolve diff options from config
   */
  private getDiffOptions(): Required<DiffOptions> {
    const { includeDiffs } = this.options;

    if (!includeDiffs) {
      return { ...DEFAULT_DIFF_OPTIONS, enabled: false };
    }

    if (includeDiffs === true) {
      return { ...DEFAULT_DIFF_OPTIONS, enabled: true };
    }

    return {
      ...DEFAULT_DIFF_OPTIONS,
      ...includeDiffs,
      enabled: includeDiffs.enabled ?? DEFAULT_DIFF_OPTIONS.enabled,
    };
  }

  /**
   * Check if commit messages are "sparse" (short, unhelpful)
   */
  private areCommitMessagesSparse(commits: string[]): boolean {
    if (commits.length === 0) return true;

    const avgLength =
      commits.reduce((sum, c) => sum + c.length, 0) / commits.length;
    const hasConventionalFormat = commits.some((c) =>
      /^[a-f0-9]+\s+(feat|fix|chore|docs|style|refactor|test|perf|ci|build)(\(.+\))?:/i.test(
        c
      )
    );

    return avgLength < 30 && !hasConventionalFormat;
  }

  /**
   * Get commits for the changelog
   */
  private getCommits(): string[] {
    try {
      const from = this.options.from || this.getLastTag();
      const to = this.options.to || 'HEAD';

      let commits: string[];

      if (from) {
        commits = execSync(`git log ${from}..${to} --oneline`, {
          encoding: 'utf-8',
          cwd: this.cwd,
        })
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);
      } else {
        // No previous tag, get recent commits
        commits = execSync(`git log -50 --oneline`, {
          encoding: 'utf-8',
          cwd: this.cwd,
        })
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);
      }

      // Filter out release commits and merge commits
      return commits.filter(
        (line) =>
          !line.includes('chore(release)') &&
          !line.includes('Merge pull request')
      );
    } catch (error) {
      console.warn('Failed to fetch git commits:', error);
      return [];
    }
  }

  /**
   * Fetch code diffs
   */
  private getDiffs(): string {
    const diffOptions = this.getDiffOptions();
    const from = this.options.from || this.getLastTag();
    const to = this.options.to || 'HEAD';

    const diffRange = from ? `${from}..${to}` : `${to}~10..${to}`;

    const excludeArgs = diffOptions.excludePatterns
      .map((p) => `':(exclude)${p}'`)
      .join(' ');

    const includeArgs = diffOptions.includePatterns
      ? diffOptions.includePatterns.map((p) => `'${p}'`).join(' ')
      : '';

    try {
      const diffStat = execSync(
        `git diff ${diffRange} --stat ${includeArgs} -- . ${excludeArgs}`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          cwd: this.cwd,
        }
      ).trim();

      let diff = execSync(
        `git diff ${diffRange} ${includeArgs} -- . ${excludeArgs}`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          cwd: this.cwd,
        }
      ).trim();

      if (!diff) {
        return '';
      }

      diff = this.processDiff(diff, diffOptions);

      const header = `### Code Diffs (for additional context)
**Files changed:**
\`\`\`
${diffStat}
\`\`\``;

      if (diff.length > 0) {
        return `${header}

**Detailed code changes:**
\`\`\`diff
${diff}
\`\`\``;
      }

      return header;
    } catch (error) {
      console.warn('Failed to fetch git diff:', error);
      return '';
    }
  }

  /**
   * Process and truncate diff to fit within limits
   */
  private processDiff(diff: string, options: Required<DiffOptions>): string {
    const files = diff.split(/^diff --git /m).filter((f) => f.length > 0);
    const processedFiles: string[] = [];
    let totalChars = 0;
    let truncatedFiles = 0;
    let skippedFiles = 0;

    for (const file of files) {
      if (totalChars >= options.maxChars) {
        skippedFiles++;
        continue;
      }

      const fileContent = 'diff --git ' + file;
      const remainingChars = options.maxChars - totalChars;

      if (fileContent.length <= options.maxCharsPerFile) {
        if (fileContent.length <= remainingChars) {
          processedFiles.push(fileContent);
          totalChars += fileContent.length;
        } else {
          const truncated =
            fileContent.substring(0, remainingChars - 50) + '\n... [truncated]';
          processedFiles.push(truncated);
          totalChars += truncated.length;
          truncatedFiles++;
        }
      } else {
        const lines = fileContent.split('\n');
        const headerLines = lines.slice(0, 4).join('\n');
        const addedLines = (fileContent.match(/^\+[^+]/gm) || []).length;
        const removedLines = (fileContent.match(/^-[^-]/gm) || []).length;

        const summary = `${headerLines}\n... [large file: +${addedLines}/-${removedLines} lines, truncated]`;

        if (summary.length <= remainingChars) {
          processedFiles.push(summary);
          totalChars += summary.length;
          truncatedFiles++;
        } else {
          skippedFiles++;
        }
      }
    }

    let result = processedFiles.join('\n');

    if (truncatedFiles > 0 || skippedFiles > 0) {
      const notes: string[] = [];
      if (truncatedFiles > 0) notes.push(`${truncatedFiles} files truncated`);
      if (skippedFiles > 0) notes.push(`${skippedFiles} files skipped`);
      result += `\n\n[Note: ${notes.join(', ')} due to size limits]`;
    }

    return result;
  }

  /**
   * Generate AI summary from commits
   */
  private async generateAISummary(commits: string[]): Promise<string> {
    const provider = this.options.aiProvider || 'anthropic';
    const model = this.options.aiModel || DEFAULT_MODELS[provider];
    const prompt = this.options.customPrompt || DEFAULT_PROMPT;

    const changesText = commits.join('\n');

    const diffOptions = this.getDiffOptions();
    let diffsText = '';

    if (
      diffOptions.enabled === true ||
      (diffOptions.enabled === 'auto' && this.areCommitMessagesSparse(commits))
    ) {
      console.log('📝 Including code diffs in AI analysis...');
      diffsText = this.getDiffs();
      if (diffsText) {
        console.log(`   Diff size: ${(diffsText.length / 1024).toFixed(1)}KB`);
      }
    }

    const fullPrompt = prompt
      .replace('{changes}', changesText)
      .replace('{diffs}', diffsText ? `\n${diffsText}\n` : '');

    return this.callAIProvider(provider, model, fullPrompt);
  }

  /**
   * Call the AI provider
   */
  private async callAIProvider(
    provider: string,
    model: string,
    prompt: string
  ): Promise<string> {
    const { generateText } = await import('ai');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let providerInstance: any;
    const baseUrl = this.options.aiBaseUrl;

    switch (provider) {
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        const anthropic = createAnthropic({
          apiKey: process.env['ANTHROPIC_API_KEY'],
        });
        providerInstance = anthropic(model);
        break;
      }
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const openai = createOpenAI({
          apiKey: process.env['OPENAI_API_KEY'],
          ...(baseUrl && { baseURL: baseUrl }),
        });
        providerInstance = openai(model);
        break;
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        const google = createGoogleGenerativeAI({
          apiKey: process.env['GOOGLE_API_KEY'],
        });
        providerInstance = google(model);
        break;
      }
      case 'ollama': {
        const { createOllama } = await import('ollama-ai-provider');
        const ollama = createOllama({
          baseURL: baseUrl || 'http://localhost:11434/api',
        });
        providerInstance = ollama(model);
        break;
      }
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    const result = await generateText({
      model: providerInstance,
      prompt,
      maxOutputTokens: 1024,
    });

    return result.text.trim();
  }
}

/**
 * Convenience function to generate a changelog
 */
export async function generateChangelog(
  options: AIChangelogOptions = {}
): Promise<string> {
  const generator = new AIChangelogGenerator(options);
  return generator.generate();
}

/**
 * Convenience function to generate just the summary
 */
export async function generateSummary(
  options: AIChangelogOptions = {}
): Promise<string> {
  const generator = new AIChangelogGenerator(options);
  return generator.generateSummaryOnly();
}
