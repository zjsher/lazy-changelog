// Re-export core functionality for standalone usage
export {
  AIChangelogGenerator,
  AICommitMessageGenerator,
  generateChangelog,
  generateSummary,
  generateCommitMessage,
  DEFAULT_MODELS,
  DEFAULT_DIFF_OPTIONS,
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
  const body = change.body?.trim();
  const summary = `${hash}${type}${change.description}`;

  return body ? `${summary}\n${body}` : summary;
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
        changes: this.changes.map(formatNxChange),
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
