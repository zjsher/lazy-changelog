// Re-export core functionality for standalone usage
export {
  AIChangelogGenerator,
  AICommitMessageGenerator,
  generateChangelog,
  generateSummary,
  generateCommitMessage,
  DEFAULT_MODELS,
  DEFAULT_DIFF_OPTIONS,
  DEFAULT_MAX_CHANGES_CHARS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_PROMPT,
  COMMIT_MESSAGE_PROMPT,
  FALLBACK_MODELS,
  DEFAULT_MODEL_TIER,
  resolveDefaultModel,
  detectKindFromPath,
  detectProjectVersion,
  parseVersionFromContent,
  readVersionFile,
} from "./core.js";

export type {
  AIChangelogOptions,
  DiffOptions,
  CommitMessageOptions,
  VersionFileKind,
  ModelProvider,
  ModelTier,
} from "./core.js";

// Nx-specific imports
import { execFileSync } from "child_process";
import DefaultChangelogRenderer from "nx/release/changelog-renderer";
import type { ChangelogChange } from "nx/src/command-line/release/changelog";
import type { DefaultChangelogRenderOptions } from "nx/release/changelog-renderer";
import type { NxReleaseConfig } from "nx/src/command-line/release/config/config";
import type { RemoteReleaseClient } from "nx/src/command-line/release/utils/remote-release-clients/remote-release-client";

import {
  AIChangelogGenerator,
  type DiffOptions,
  type VersionFileKind,
  type ModelTier,
} from "./core.js";

function formatNxChange(change: ChangelogChange): string {
  const hash = change.shortHash ? `${change.shortHash} ` : "";
  const scope = change.scope ? `(${change.scope})` : "";
  const type = change.type ? `${change.type}${scope}: ` : "";

  return `${hash}${type}${change.description}`;
}

function scopeNxChangesToRelease(
  changes: ChangelogChange[],
  baseRef?: string,
): {
  changes: ChangelogChange[];
  from: string | null;
  to: string;
  range: string | null;
  applied: boolean;
  strategy: "base-ref" | "tag";
} {
  const to = "HEAD";

  try {
    const from = baseRef
      ? execFileSync("git", ["merge-base", baseRef, to], {
          encoding: "utf8",
        }).trim()
      : execFileSync(
          "git",
          ["describe", "--tags", "--abbrev=0", `${to}~1`],
          { encoding: "utf8" },
        ).trim();

    if (!from) {
      throw new Error(
        baseRef
          ? `git merge-base returned no commit for ${baseRef} and ${to}`
          : `git describe returned no previous release tag for ${to}`,
      );
    }

    const range = `${from}..${to}`;
    const releaseHashes = execFileSync(
      "git",
      ["log", range, "--format=%h"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    const isReleaseHash = (shortHash: string): boolean =>
      releaseHashes.some(
        (releaseHash) =>
          releaseHash.startsWith(shortHash) || shortHash.startsWith(releaseHash),
      );
    const scopedChanges = changes.filter(
      (change) => !change.shortHash || isReleaseHash(change.shortHash),
    );
    const hashedChangeCount = changes.filter((change) => change.shortHash).length;
    const matchedHashCount = scopedChanges.filter((change) => change.shortHash).length;

    if (hashedChangeCount > 0 && matchedHashCount === 0) {
      if (baseRef) {
        throw new Error(
          `No Nx change hashes matched the branch-local release range ${range}`,
        );
      }
      return {
        changes,
        from,
        to,
        range,
        applied: false,
        strategy: "tag",
      };
    }

    return {
      changes: scopedChanges,
      from,
      to,
      range,
      applied: true,
      strategy: baseRef ? "base-ref" : "tag",
    };
  } catch (error) {
    if (baseRef) {
      throw new Error(
        `[lazy-changelog] Failed to scope Nx release from baseRef "${baseRef}": ${(error as Error).message}`,
      );
    }
    return {
      changes,
      from: null,
      to,
      range: null,
      applied: false,
      strategy: "tag",
    };
  }
}

// Re-export types for convenience
export type { ChangelogChange } from "nx/src/command-line/release/changelog";
export type { DefaultChangelogRenderOptions } from "nx/release/changelog-renderer";

/**
 * Extended render options that include AI configuration (for Nx usage)
 */
export interface AIChangelogRenderOptions extends DefaultChangelogRenderOptions {
  /**
   * AI provider to use for summarization.
   * Supported: 'anthropic' | 'openai' | 'google' | 'ollama'
   * Default: 'anthropic'
   */
  aiProvider?: "anthropic" | "openai" | "google" | "ollama";

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
   * Whether to enable AI summarization. Defaults to true.
   */
  enableAISummary?: boolean;

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
   * Branch ref used to scope Nx changes and diffs. The renderer resolves the
   * merge base between this ref and HEAD, then uses that single range for both
   * change selection and optional code-diff context. This is useful when
   * releases are cut from feature branches and release tags may be divergent.
   */
  baseRef?: string;

  /** Maximum characters of change descriptions included in the AI prompt. */
  maxChangesChars?: number;

  /** Maximum tokens the AI provider may emit. */
  maxOutputTokens?: number;

  /**
   * Explicit path to a project version file (relative to repo root).
   * If omitted, auto-detects across package.json, deno.json, Cargo.toml,
   * pyproject.toml, composer.json, pubspec.yaml, mix.exs, *.gemspec, VERSION.
   */
  versionFile?: string;

  /**
   * Parser kind override for {@link versionFile}.
   */
  versionFileKind?: VersionFileKind;
}

/**
 * AI-powered changelog renderer for Nx Release.
 *
 * You write bad commits. We get it. lazy-changelog reads your code anyway
 * and writes a proper changelog for you.
 *
 * @example
 * ```json
 * // nx.json
 * {
 *   "release": {
 *     "changelog": {
 *       "workspaceChangelog": {
 *         "renderer": "lazy-changelog",
 *         "renderOptions": {
 *           "aiProvider": "anthropic",
 *           "enableAISummary": true,
 *           "includeDiffs": true
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 */
export default class AIChangelogRenderer extends DefaultChangelogRenderer {
  protected override changelogRenderOptions: AIChangelogRenderOptions;

  constructor(config: {
    changes: ChangelogChange[];
    changelogEntryVersion: string;
    project: string | null;
    entryWhenNoChanges: string | false;
    isVersionPlans: boolean;
    changelogRenderOptions: AIChangelogRenderOptions;
    dependencyBumps?: { dependencyName: string; newVersion: string }[];
    conventionalCommitsConfig: NxReleaseConfig["conventionalCommits"] | null;
    remoteReleaseClient: RemoteReleaseClient<Record<string, unknown>>;
  }) {
    super(config);
    this.changelogRenderOptions = config.changelogRenderOptions;
  }

  override async render(): Promise<string> {
    const options = this.changelogRenderOptions;
    const receivedChangeCount = this.changes.length;
    const scoped = scopeNxChangesToRelease(this.changes, options.baseRef);
    this.changes = scoped.changes;

    if (scoped.range) {
      const base = options.baseRef ? ` base=${options.baseRef}` : "";
      console.log(
        `[lazy-changelog] Nx release scope: strategy=${scoped.strategy}${base} range=${scoped.range} received=${receivedChangeCount} selected=${this.changes.length} applied=${scoped.applied}`,
      );
    }

    if (this.changes.length === 0) {
      return this.renderDeterministicFallback();
    }

    const envSkipAI =
      process.env["NX_CHANGELOG_SKIP_AI"] === "true" ||
      process.env["NX_CHANGELOG_SKIP_AI"] === "1";

    const enableAI = !envSkipAI && options.enableAISummary !== false;

    if (!enableAI) {
      if (envSkipAI) {
        console.log(
          "⏭️  AI changelog summarization skipped (NX_CHANGELOG_SKIP_AI=true)",
        );
      }
      return this.renderDeterministicFallback();
    }

    const versionTitle = this.renderVersionTitle();

    try {
      console.log(
        `[lazy-changelog] Changelog input: source=nx changes=${this.changes.length}`,
      );

      // Use the core generator for AI summarization
      const generator = new AIChangelogGenerator({
        aiProvider: options.aiProvider,
        aiModel: options.aiModel,
        aiModelTier: options.aiModelTier,
        customPrompt: options.customPrompt,
        aiBaseUrl: options.aiBaseUrl,
        includeDiffs: options.includeDiffs,
        maxChangesChars: options.maxChangesChars,
        maxOutputTokens: options.maxOutputTokens,
        changes: this.changes.map(formatNxChange),
        from: scoped.from ?? undefined,
        to: scoped.to,
        versionFile: options.versionFile,
        versionFileKind: options.versionFileKind,
        version: this.changelogEntryVersion,
      });

      const aiSummary = await generator.generateSummaryOnly();

      const lines: string[] = [versionTitle, ""];

      if (aiSummary) {
        lines.push(aiSummary);
      }

      if (this.hasBreakingChanges()) {
        lines.push("");
        lines.push(...this.renderBreakingChanges());
      }

      if (this.shouldRenderAuthors()) {
        lines.push("");
        const authors = await this.renderAuthors();
        lines.push(...authors);
      }

      return lines.join("\n").trim();
    } catch (error) {
      console.warn(
        "AI summarization failed, falling back to default renderer:",
        error,
      );
      return this.renderDeterministicFallback();
    }
  }

  private async renderDeterministicFallback(): Promise<string> {
    const versionTitle = this.renderVersionTitle();
    const fallback = (await super.render()).trim();

    if (fallback && fallback !== versionTitle) {
      return fallback;
    }

    if (this.changes.length === 0) {
      return fallback;
    }

    return [
      versionTitle,
      "",
      "### Changes",
      "",
      ...this.changes.map((change) => this.formatChange(change)),
    ].join("\n");
  }
}

export { AIChangelogRenderer };
