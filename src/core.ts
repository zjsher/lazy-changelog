import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import {
  resolveDefaultModel,
  FALLBACK_MODELS,
  type ModelTier,
} from './models.js';

export {
  resolveDefaultModel,
  FALLBACK_MODELS,
  DEFAULT_MODEL_TIER,
  type ModelProvider,
  type ModelTier,
} from './models.js';

/**
 * Parser kinds for project version files.
 *
 * - `npm`: package.json (Node, Bun, JavaScript, TypeScript)
 * - `deno`: deno.json / deno.jsonc / jsr.json
 * - `cargo`: Cargo.toml (Rust)
 * - `pyproject`: pyproject.toml (Python — supports [project] and [tool.poetry])
 * - `composer`: composer.json (PHP)
 * - `pubspec`: pubspec.yaml (Dart / Flutter)
 * - `gemspec`: *.gemspec (Ruby)
 * - `mix`: mix.exs (Elixir)
 * - `text`: plain text file containing only a version (e.g. VERSION, VERSION.txt)
 */
export type VersionFileKind =
  | 'npm'
  | 'deno'
  | 'cargo'
  | 'pyproject'
  | 'composer'
  | 'pubspec'
  | 'gemspec'
  | 'mix'
  | 'text';

/**
 * Auto-detection order. First match with a non-empty version wins.
 * For globs (gemspec), the directory is scanned for a matching file.
 */
const AUTO_DETECT_FILES: Array<
  { name: string; kind: VersionFileKind } | { glob: RegExp; kind: VersionFileKind }
> = [
  { name: 'package.json', kind: 'npm' },
  { name: 'deno.json', kind: 'deno' },
  { name: 'deno.jsonc', kind: 'deno' },
  { name: 'jsr.json', kind: 'deno' },
  { name: 'Cargo.toml', kind: 'cargo' },
  { name: 'pyproject.toml', kind: 'pyproject' },
  { name: 'composer.json', kind: 'composer' },
  { name: 'pubspec.yaml', kind: 'pubspec' },
  { name: 'pubspec.yml', kind: 'pubspec' },
  { name: 'mix.exs', kind: 'mix' },
  { glob: /\.gemspec$/i, kind: 'gemspec' },
  { name: 'VERSION', kind: 'text' },
  { name: 'VERSION.txt', kind: 'text' },
  { name: 'version.txt', kind: 'text' },
];

/**
 * Infer a parser kind from a file path's basename.
 * Returns null if the file isn't recognized.
 */
export function detectKindFromPath(filePath: string): VersionFileKind | null {
  const base = basename(filePath).toLowerCase();
  if (base === 'package.json') return 'npm';
  if (base === 'deno.json' || base === 'deno.jsonc' || base === 'jsr.json') return 'deno';
  if (base === 'cargo.toml') return 'cargo';
  if (base === 'pyproject.toml') return 'pyproject';
  if (base === 'composer.json') return 'composer';
  if (base === 'pubspec.yaml' || base === 'pubspec.yml') return 'pubspec';
  if (base === 'mix.exs') return 'mix';
  if (base.endsWith('.gemspec')) return 'gemspec';
  if (base === 'version' || base === 'version.txt') return 'text';
  return null;
}

function stripJsonComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Extract the body of a TOML section `[header]` — lines after the header
 * up to the next `[...]` header or end-of-file. Returns null if the section
 * isn't present.
 */
function findTomlSection(content: string, header: string): string | null {
  const target = `[${header}]`;
  const lines = content.split('\n');
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader =
      trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.startsWith('[[');
    if (isHeader) {
      if (inSection) break;
      if (trimmed === target) {
        inSection = true;
        continue;
      }
    }
    if (inSection) out.push(line);
  }
  return inSection ? out.join('\n') : null;
}

/**
 * Parse a version string out of a file's contents given the parser kind.
 * Returns null if no version field is present.
 */
export function parseVersionFromContent(
  content: string,
  kind: VersionFileKind
): string | null {
  switch (kind) {
    case 'npm':
    case 'composer': {
      try {
        const json = JSON.parse(content);
        return typeof json.version === 'string' ? json.version : null;
      } catch {
        return null;
      }
    }
    case 'deno': {
      try {
        const json = JSON.parse(stripJsonComments(content));
        return typeof json.version === 'string' ? json.version : null;
      } catch {
        return null;
      }
    }
    case 'cargo': {
      const section = findTomlSection(content, 'package');
      if (!section) return null;
      const m = section.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
      return m ? m[1] : null;
    }
    case 'pyproject': {
      for (const header of ['project', 'tool.poetry']) {
        const section = findTomlSection(content, header);
        if (!section) continue;
        const m = section.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
        if (m) return m[1];
      }
      return null;
    }
    case 'pubspec': {
      const m = content.match(/^version\s*:\s*["']?([^\s"'#\n]+)["']?/m);
      return m ? m[1] : null;
    }
    case 'gemspec': {
      const m = content.match(/\.version\s*=\s*["']([^"']+)["']/);
      return m ? m[1] : null;
    }
    case 'mix': {
      const m = content.match(/version\s*:\s*["']([^"']+)["']/);
      return m ? m[1] : null;
    }
    case 'text': {
      const trimmed = content.trim();
      return trimmed ? trimmed.split(/\s+/)[0] : null;
    }
  }
}

/**
 * Find a project version by scanning the working directory for known files.
 * Returns the first non-empty version found in {@link AUTO_DETECT_FILES} order,
 * or null if no recognized file exists.
 */
export function detectProjectVersion(cwd: string): string | null {
  let dirEntries: string[] | null = null;
  for (const entry of AUTO_DETECT_FILES) {
    let filePath: string | null = null;
    if ('name' in entry) {
      const candidate = join(cwd, entry.name);
      if (existsSync(candidate)) filePath = candidate;
    } else {
      if (dirEntries === null) {
        try {
          dirEntries = readdirSync(cwd);
        } catch {
          dirEntries = [];
        }
      }
      const match = dirEntries.find((f) => entry.glob.test(f));
      if (match) filePath = join(cwd, match);
    }

    if (!filePath) continue;
    try {
      const content = readFileSync(filePath, 'utf-8');
      const version = parseVersionFromContent(content, entry.kind);
      if (version) return version;
    } catch {
      // Skip unreadable files
    }
  }
  return null;
}

/**
 * Read a version from an explicit file. If `kind` is omitted, it's inferred
 * from the file's basename via {@link detectKindFromPath}. Throws if the file
 * doesn't exist or its kind can't be determined.
 */
export function readVersionFile(
  filePath: string,
  kind?: VersionFileKind
): string | null {
  if (!existsSync(filePath)) {
    throw new Error(`Version file not found: ${filePath}`);
  }
  const resolvedKind = kind ?? detectKindFromPath(filePath);
  if (!resolvedKind) {
    throw new Error(
      `Cannot infer version-file kind from "${filePath}". Pass an explicit kind.`
    );
  }
  const content = readFileSync(filePath, 'utf-8');
  return parseVersionFromContent(content, resolvedKind);
}

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
   * If omitted, the latest model for the provider is auto-detected at runtime
   * (see {@link aiModelTier}), falling back to {@link FALLBACK_MODELS}.
   */
  aiModel?: string;

  /**
   * Which tier to target when auto-detecting the latest model (only used when
   * {@link aiModel} is not set).
   * - 'balanced' (default): Sonnet / gpt-4o / Gemini Flash class.
   * - 'newest': newest model overall, often the flagship.
   * - 'fast': Haiku / *-mini / *-flash-lite class.
   */
  aiModelTier?: ModelTier;

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
   * Canonical, preformatted changes to summarize. When provided, these are used
   * instead of discovering commits from Git. Nx renderers should pass the
   * ChangelogChange[] values supplied by Nx through this option.
   */
  changes?: string[];

  /**
   * Maximum characters of canonical change descriptions included in the AI prompt.
   * Default: 60000
   */
  maxChangesChars?: number;

  /**
   * Maximum tokens the AI provider may emit for the changelog.
   * Default: 4096
   */
  maxOutputTokens?: number;

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
   * Default: auto-detect via {@link versionFile} (or its auto-detection) and git tag fallback.
   */
  version?: string;

  /**
   * Explicit path to a version file (e.g. `Cargo.toml`, `pyproject.toml`, `VERSION`).
   * If omitted, the working directory is scanned for known files in this order:
   * package.json, deno.json/jsonc, jsr.json, Cargo.toml, pyproject.toml,
   * composer.json, pubspec.yaml, mix.exs, *.gemspec, VERSION / VERSION.txt / version.txt.
   *
   * Final fallback when nothing matches: `git describe --tags --abbrev=0`.
   */
  versionFile?: string;

  /**
   * Parser kind override for {@link versionFile}. By default the kind is inferred
   * from the file's basename. Pass this when the filename doesn't follow
   * convention (e.g. a custom path to TOML you want parsed as `cargo`).
   */
  versionFileKind?: VersionFileKind;

  /**
   * Working directory for git commands.
   * Default: process.cwd()
   */
  cwd?: string;
}

/**
 * @deprecated Models are now auto-detected at runtime via
 * {@link resolveDefaultModel}. This alias of {@link FALLBACK_MODELS} is kept for
 * backward compatibility and is only used when detection fails.
 */
export const DEFAULT_MODELS: Record<string, string> = FALLBACK_MODELS;

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

export const DEFAULT_MAX_CHANGES_CHARS = 60000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export const COMMIT_MESSAGE_PROMPT = `You are writing a git commit message. Analyze the staged changes below and write a concise, informative commit message.

STAGED CHANGES:
{diffs}

TASK: Write a commit message based ONLY on what you see above. Do NOT make up changes.

RULES:
1. Use conventional commit format: type(scope): description
2. Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build
3. Scope is optional but helpful (e.g., feat(auth): add login)
4. First line should be under 72 characters
5. If changes are complex, add a blank line then bullet points
6. Be specific - mention actual function names, files, or components
7. Focus on WHAT changed and WHY, not HOW

EXAMPLES:
- feat(api): add user authentication endpoint
- fix: resolve null pointer in data processing
- refactor(components): extract shared button logic
- docs: update API documentation for v2 endpoints

Now write the commit message:`;

export const DEFAULT_PROMPT = `You are a technical writer. Analyze the git commits and code diffs below, then write release notes.

COMMITS:
{changes}

{diffs}

TASK: Write a changelog entry based ONLY on what you see above. Do NOT make up features - describe what the actual code does.

RULES:
1. Read the code diffs carefully to understand what was actually built
2. Group into: Features, Bug Fixes, Improvements (skip empty sections)
3. If diffs are provided, prefix each item with [commits] or [code] to show the source
4. Be specific - mention actual function names, components, or capabilities you see in the code
5. Keep each item to one line
6. Do NOT include a release title, version heading, date, or introductory prose; start with a ### section heading

FORMAT:
### ✨ Features
- [source] Description of actual feature from the code

### 🐛 Bug Fixes
- [source] Description of actual fix

### 🛠️ Improvements
- [source] Description of actual improvement

Now write the changelog based on the commits and code above:`;

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
   * Get the version string for the changelog header.
   *
   * Resolution order:
   * 1. Explicit `version` option (e.g. CLI `--tag`)
   * 2. Explicit `versionFile` (kind inferred from filename or overridden via `versionFileKind`)
   * 3. Auto-detect across known ecosystem files in `cwd`
   * 4. `git describe --tags --abbrev=0`
   * 5. `'Unreleased'`
   */
  private getVersion(): string {
    if (this.options.version) {
      return this.options.version;
    }

    if (this.options.versionFile) {
      try {
        const v = readVersionFile(
          join(this.cwd, this.options.versionFile),
          this.options.versionFileKind
        );
        if (v) return v;
      } catch (e) {
        console.warn(`⚠️  Failed to read version file: ${(e as Error).message}`);
      }
    } else {
      const detected = detectProjectVersion(this.cwd);
      if (detected) return detected;
    }

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
    if (this.options.changes) {
      return this.options.changes.filter((change) => change.trim().length > 0);
    }

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
      const filteredCommits = commits.filter(
        (line) =>
          !line.includes('chore(release)') &&
          !line.includes('Merge pull request')
      );

      const source = from ? `range=${from}..${to}` : 'recent=50';
      console.log(
        `[lazy-changelog] Changelog input: source=git ${source} changes=${filteredCommits.length}`
      );

      return filteredCommits;
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

    let diffRange: string;
    // Empty tree hash - universal constant in git for diffing against "nothing"
    const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

    if (from) {
      diffRange = `${from}..${to}`;
    } else {
      // No tag found - this is likely an initial release, show all code
      // For established repos with many commits but no tags, limit to last 10 commits
      try {
        const commitCount = parseInt(
          execSync(`git rev-list --count ${to}`, {
            encoding: 'utf-8',
            cwd: this.cwd,
          }).trim(),
          10
        );

        if (commitCount <= 10) {
          // Small repo or initial release - show everything
          diffRange = `${EMPTY_TREE}..${to}`;
        } else {
          // Larger repo without tags - limit to recent commits
          diffRange = `${to}~10..${to}`;
        }
      } catch {
        // Fallback to diff against empty tree
        diffRange = `${EMPTY_TREE}..${to}`;
      }
    }

    const excludeArgs = diffOptions.excludePatterns
      .map((p) => `':(exclude)${p}'`)
      .join(' ');

    const includeArgs = diffOptions.includePatterns
      ? diffOptions.includePatterns.map((p) => `'${p}'`).join(' ')
      : '';

    try {
      const rawDiffStat = execSync(
        `git diff ${diffRange} --stat ${includeArgs} -- . ${excludeArgs}`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          cwd: this.cwd,
        }
      ).trim();
      const diffStat = this.truncateDiffStat(
        rawDiffStat,
        Math.min(diffOptions.maxChars, 10_000)
      );

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
   * Bound the file-stat section independently so a release touching many files
   * cannot bypass the detailed-diff character budget.
   */
  private truncateDiffStat(diffStat: string, maxChars: number): string {
    if (diffStat.length <= maxChars) {
      return diffStat;
    }

    const note = '\n... [diff stat truncated]';
    const contentChars = Math.max(0, maxChars - note.length);
    return diffStat.substring(0, contentChars) + note;
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
    const model =
      this.options.aiModel ||
      (await resolveDefaultModel(provider, {
        baseUrl: this.options.aiBaseUrl,
        tier: this.options.aiModelTier,
      }));
    const prompt = this.options.customPrompt || DEFAULT_PROMPT;

    const changesText = truncateChanges(
      commits,
      this.options.maxChangesChars ?? DEFAULT_MAX_CHANGES_CHARS
    );

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

    const maxOutputTokens =
      this.options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

    console.log(
      `[lazy-changelog] AI request: provider=${provider} model=${model} promptChars=${fullPrompt.length} changesChars=${changesText.length} maxOutputTokens=${maxOutputTokens}`
    );

    return this.callAIProvider(provider, model, fullPrompt, maxOutputTokens);
  }

  /**
   * Call the AI provider
   */
  private async callAIProvider(
    provider: string,
    model: string,
    prompt: string,
    maxOutputTokens: number
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
          baseURL: baseUrl || 'https://api.anthropic.com/v1',
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
      maxOutputTokens,
    });

    const summary = stripGeneratedChangelogTitle(result.text);

    console.log(
      `[lazy-changelog] AI response: chars=${summary.length} finishReason=${result.finishReason}`
    );

    if (!summary) {
      throw new Error(
        `AI provider returned an empty changelog (provider=${provider}, model=${model}, finishReason=${result.finishReason})`
      );
    }

    return summary;
  }
}

function truncateChanges(changes: string[], maxChars: number): string {
  const text = changes.join('\n');
  const safeMaxChars = Math.max(1000, maxChars);

  if (text.length <= safeMaxChars) {
    return text;
  }

  const omittedChars = text.length - safeMaxChars;
  const suffix = `\n...[changes truncated: ${omittedChars} characters omitted]`;
  return `${text.slice(0, safeMaxChars - suffix.length).trimEnd()}${suffix}`;
}

function stripGeneratedChangelogTitle(text: string): string {
  const lines = text.trim().split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const isReleaseTitle = /^#{1,2}\s+(?:release notes|changelog)\b/i.test(firstLine);
  const isVersionTitle = /^#{1,2}\s+v?\d+\.\d+\.\d+\b/i.test(firstLine);

  if (!isReleaseTitle && !isVersionTitle) {
    return text.trim();
  }

  lines.shift();
  while (lines[0]?.trim() === '') {
    lines.shift();
  }

  return lines.join('\n').trim();
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

/**
 * Options for generating commit messages
 */
export interface CommitMessageOptions {
  /**
   * AI provider to use for summarization.
   * Default: 'anthropic'
   */
  aiProvider?: 'anthropic' | 'openai' | 'google' | 'ollama';

  /**
   * Model to use for the AI provider.
   * If omitted, the latest model for the provider is auto-detected at runtime
   * (see {@link aiModelTier}), falling back to {@link FALLBACK_MODELS}.
   */
  aiModel?: string;

  /**
   * Which tier to target when auto-detecting the latest model (only used when
   * {@link aiModel} is not set). 'balanced' (default) | 'newest' | 'fast'.
   */
  aiModelTier?: ModelTier;

  /**
   * Base URL for the AI provider
   */
  aiBaseUrl?: string;

  /**
   * Custom prompt template. Use {diffs} as placeholder.
   */
  customPrompt?: string;

  /**
   * Working directory for git commands.
   * Default: process.cwd()
   */
  cwd?: string;

  /**
   * Include unstaged changes as well as staged
   */
  includeUnstaged?: boolean;
}

/**
 * AI-powered commit message generator
 */
export class AICommitMessageGenerator {
  private options: CommitMessageOptions;
  private cwd: string;

  constructor(options: CommitMessageOptions = {}) {
    this.options = options;
    this.cwd = options.cwd || process.cwd();
  }

  /**
   * Generate a commit message from staged changes
   */
  async generate(): Promise<string> {
    const diff = this.getStagedDiff();

    if (!diff) {
      throw new Error('No staged changes found. Stage some files with `git add` first.');
    }

    console.log('📝 Analyzing staged changes...');

    const provider = this.options.aiProvider || 'anthropic';
    const model =
      this.options.aiModel ||
      (await resolveDefaultModel(provider, {
        baseUrl: this.options.aiBaseUrl,
        tier: this.options.aiModelTier,
      }));
    const prompt = this.options.customPrompt || COMMIT_MESSAGE_PROMPT;

    const fullPrompt = prompt.replace('{diffs}', diff);

    return this.callAIProvider(provider, model, fullPrompt);
  }

  /**
   * Get staged diff
   */
  private getStagedDiff(): string {
    try {
      // Check if this is a brand new repo with no commits
      let hasHead = true;
      try {
        execSync('git rev-parse HEAD', {
          encoding: 'utf-8',
          cwd: this.cwd,
          stdio: 'pipe',
        });
      } catch {
        hasHead = false;
      }

      let diffCmd: string;
      let statCmd: string;

      if (!hasHead) {
        // New repo with no commits - diff staged files against empty tree
        const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        diffCmd = `git diff --cached ${EMPTY_TREE}`;
        statCmd = `git diff --cached ${EMPTY_TREE} --stat`;
      } else if (this.options.includeUnstaged) {
        diffCmd = 'git diff HEAD';
        statCmd = 'git diff HEAD --stat';
      } else {
        diffCmd = 'git diff --cached';
        statCmd = 'git diff --cached --stat';
      }

      const diff = execSync(diffCmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        cwd: this.cwd,
      }).trim();

      if (!diff) {
        return '';
      }

      const stat = execSync(statCmd, {
        encoding: 'utf-8',
        cwd: this.cwd,
      }).trim();

      // Truncate if too large (keep it reasonable for commit messages)
      const maxChars = 30000;
      let truncatedDiff = diff;
      if (diff.length > maxChars) {
        truncatedDiff = diff.substring(0, maxChars) + '\n\n[diff truncated due to size]';
      }

      return `Files changed:\n${stat}\n\nDiff:\n${truncatedDiff}`;
    } catch (error) {
      console.warn('Failed to get staged diff:', error);
      return '';
    }
  }

  /**
   * Call the AI provider (reusing logic from changelog generator)
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
          baseURL: baseUrl || 'https://api.anthropic.com/v1',
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
      maxOutputTokens: 500,
    });

    return result.text.trim();
  }
}

/**
 * Convenience function to generate a commit message
 */
export async function generateCommitMessage(
  options: CommitMessageOptions = {}
): Promise<string> {
  const generator = new AICommitMessageGenerator(options);
  return generator.generate();
}
