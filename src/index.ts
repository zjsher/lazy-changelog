// Re-export core functionality for standalone usage
export {
  AIChangelogGenerator,
  generateChangelog,
  generateSummary,
  DEFAULT_MODELS,
  DEFAULT_DIFF_OPTIONS,
  DEFAULT_PROMPT,
} from "./core.js";

export type { AIChangelogOptions, DiffOptions } from "./core.js";

// Nx-specific imports
import DefaultChangelogRenderer from "nx/release/changelog-renderer";
import type { ChangelogChange } from "nx/src/command-line/release/changelog";
import type { DefaultChangelogRenderOptions } from "nx/release/changelog-renderer";
import type { NxReleaseConfig } from "nx/src/command-line/release/config/config";
import type { RemoteReleaseClient } from "nx/src/command-line/release/utils/remote-release-clients/remote-release-client";

import { AIChangelogGenerator, type DiffOptions } from "./core.js";

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
   * Default depends on provider:
   * - anthropic: 'claude-sonnet-4-20250514'
   * - openai: 'gpt-4o'
   * - google: 'gemini-2.0-flash'
   * - ollama: 'llama3.2'
   */
  aiModel?: string;

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
      return super.render();
    }

    const versionTitle = this.renderVersionTitle();

    try {
      // Use the core generator for AI summarization
      const generator = new AIChangelogGenerator({
        aiProvider: options.aiProvider,
        aiModel: options.aiModel,
        customPrompt: options.customPrompt,
        aiBaseUrl: options.aiBaseUrl,
        includeDiffs: options.includeDiffs,
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
      return super.render();
    }
  }
}

export { AIChangelogRenderer };
