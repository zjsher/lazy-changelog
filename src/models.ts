/**
 * Dynamic default-model resolution.
 *
 * Instead of hardcoding a dated model ID per provider (which goes stale and 404s
 * the moment the provider retires it), we ask each provider's models API for the
 * models it currently serves and pick the latest one in the requested tier.
 *
 * Everything here is best-effort: any network/auth/parse failure falls back to a
 * sane current default ({@link FALLBACK_MODELS}) so changelog/commit generation
 * never breaks just because model discovery did.
 */

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'ollama';

/**
 * Which slice of a provider's lineup to treat as "the latest model":
 * - `balanced`: newest mid-tier model (Sonnet / gpt-4o / Gemini Flash). Default.
 * - `newest`:   newest model overall, regardless of tier (often the flagship).
 * - `fast`:     newest fast/cheap model (Haiku / *-mini / *-flash-lite).
 */
export type ModelTier = 'balanced' | 'newest' | 'fast';

export const DEFAULT_MODEL_TIER: ModelTier = 'balanced';

/**
 * Fallbacks used only when dynamic resolution fails (offline, missing key, API
 * change). These are current, non-dated IDs — kept here as a safety net, not as
 * the primary source of truth.
 */
export const FALLBACK_MODELS: Record<ModelProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
  google: 'gemini-flash-latest',
  ollama: 'llama3.2',
};

export interface ResolveModelOptions {
  /** API key for the provider (defaults to the provider's standard env var). */
  apiKey?: string;
  /** Override the provider base URL (Ollama, proxies, gateways). */
  baseUrl?: string;
  /** Which tier counts as "latest". Defaults to {@link DEFAULT_MODEL_TIER}. */
  tier?: ModelTier;
  /** Abort the discovery request after this many ms (default 5000). */
  timeoutMs?: number;
}

const ENV_KEYS: Record<ModelProvider, string | undefined> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  ollama: undefined,
};

// Per-process cache so a single run never lists models twice for the same target.
const cache = new Map<string, Promise<string>>();

/**
 * Resolve the latest model ID for a provider/tier, falling back to a known-good
 * default on any failure. Results are memoized for the life of the process.
 */
export function resolveDefaultModel(
  provider: string,
  options: ResolveModelOptions = {}
): Promise<string> {
  const tier = options.tier ?? DEFAULT_MODEL_TIER;
  const fallback = FALLBACK_MODELS[provider as ModelProvider] ?? '';
  const key = `${provider}:${tier}:${options.baseUrl ?? ''}`;

  const cached = cache.get(key);
  if (cached) return cached;

  const resolved = resolveUncached(provider, tier, options).then(
    (model) => model || fallback,
    (error) => {
      console.warn(
        `⚠️  Could not auto-detect latest ${provider} model (${stringifyError(
          error
        )}); using ${fallback}`
      );
      return fallback;
    }
  );

  cache.set(key, resolved);
  return resolved;
}

/** Clears the resolution cache. Intended for tests. */
export function clearModelCache(): void {
  cache.clear();
}

async function resolveUncached(
  provider: string,
  tier: ModelTier,
  options: ResolveModelOptions
): Promise<string | undefined> {
  const apiKey =
    options.apiKey ??
    (ENV_KEYS[provider as ModelProvider]
      ? process.env[ENV_KEYS[provider as ModelProvider] as string]
      : undefined);

  switch (provider) {
    case 'anthropic':
      return resolveAnthropic(tier, apiKey, options);
    case 'openai':
      return resolveOpenAI(tier, apiKey, options);
    case 'google':
      return resolveGoogle(tier, apiKey, options);
    case 'ollama':
      return resolveOllama(tier, options);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

// --- Provider resolvers ----------------------------------------------------

async function resolveAnthropic(
  tier: ModelTier,
  apiKey: string | undefined,
  options: ResolveModelOptions
): Promise<string | undefined> {
  if (!apiKey) return undefined;
  const base = trimSlash(options.baseUrl) || 'https://api.anthropic.com/v1';
  const json = await fetchJson(`${base}/models?limit=1000`, options.timeoutMs, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  });

  // { data: [{ id, display_name, created_at }], ... } — already newest-first.
  const models = asArray(getProp(json, 'data'))
    .map((m) => ({
      id: asString(getProp(m, 'id')),
      created: Date.parse(asString(getProp(m, 'created_at')) ?? '') || 0,
    }))
    .filter((m): m is { id: string; created: number } => Boolean(m.id));

  const match = (predicate: (id: string) => boolean) =>
    newestBy(
      models.filter((m) => predicate(m.id)),
      (m) => m.created
    )?.id;

  if (tier === 'fast') return match((id) => id.includes('haiku'));
  if (tier === 'balanced') {
    return match((id) => id.includes('sonnet')) ?? match(() => true);
  }
  return match(() => true);
}

async function resolveOpenAI(
  tier: ModelTier,
  apiKey: string | undefined,
  options: ResolveModelOptions
): Promise<string | undefined> {
  if (!apiKey) return undefined;
  const base = trimSlash(options.baseUrl) || 'https://api.openai.com/v1';
  const json = await fetchJson(`${base}/models`, options.timeoutMs, {
    authorization: `Bearer ${apiKey}`,
  });

  // { data: [{ id, created }] } — created is a unix timestamp (seconds).
  const models = asArray(getProp(json, 'data'))
    .map((m) => ({
      id: asString(getProp(m, 'id')),
      created: asNumber(getProp(m, 'created')) ?? 0,
    }))
    .filter((m): m is { id: string; created: number } => Boolean(m.id));

  // Exclude non-chat / specialized variants from every tier.
  const NON_CHAT = [
    'audio',
    'realtime',
    'search',
    'transcribe',
    'tts',
    'image',
    'embedding',
    'moderation',
    'instruct',
    'dall-e',
    'whisper',
  ];
  const isChat = (id: string) => !NON_CHAT.some((t) => id.includes(t));

  const match = (predicate: (id: string) => boolean) =>
    newestBy(
      models.filter((m) => isChat(m.id) && predicate(m.id)),
      (m) => m.created
    )?.id;

  if (tier === 'fast') {
    return match((id) => id.startsWith('gpt-4o') && id.includes('mini'));
  }
  if (tier === 'balanced') {
    return (
      match((id) => id.startsWith('gpt-4o') && !id.includes('mini')) ??
      match((id) => id.startsWith('gpt-') && !id.includes('mini'))
    );
  }
  return match((id) => id.startsWith('gpt-'));
}

async function resolveGoogle(
  tier: ModelTier,
  apiKey: string | undefined,
  options: ResolveModelOptions
): Promise<string | undefined> {
  if (!apiKey) return undefined;
  const base =
    trimSlash(options.baseUrl) ||
    'https://generativelanguage.googleapis.com/v1beta';
  const json = await fetchJson(
    `${base}/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
    options.timeoutMs
  );

  // { models: [{ name: "models/gemini-2.0-flash", supportedGenerationMethods }] }
  const ids = asArray(getProp(json, 'models'))
    .filter((m) =>
      asArray(getProp(m, 'supportedGenerationMethods'))
        .map((v) => asString(v))
        .includes('generateContent')
    )
    .map((m) => (asString(getProp(m, 'name')) ?? '').replace(/^models\//, ''))
    .filter((id) => id.startsWith('gemini'));

  const pick = (predicate: (id: string) => boolean) => {
    const candidates = ids.filter(predicate);
    // Google publishes floating "*-latest" aliases — prefer them outright.
    const latestAlias = candidates.find((id) => id.endsWith('-latest'));
    if (latestAlias) return latestAlias;
    // Otherwise prefer stable (non exp/preview) and the highest version number.
    return newestBy(
      candidates.map((id) => ({
        id,
        version: parseGeminiVersion(id),
        stable: !/(exp|preview)/.test(id) ? 1 : 0,
      })),
      (m) => m.stable * 1000 + m.version
    )?.id;
  };

  if (tier === 'fast') {
    return pick((id) => id.includes('flash-lite')) ?? pick((id) => id.includes('flash'));
  }
  if (tier === 'balanced') {
    return (
      pick((id) => id.includes('flash') && !id.includes('lite')) ??
      pick((id) => id.includes('flash'))
    );
  }
  return pick((id) => id.includes('pro')) ?? pick(() => true);
}

async function resolveOllama(
  tier: ModelTier,
  options: ResolveModelOptions
): Promise<string | undefined> {
  const base = trimSlash(options.baseUrl) || 'http://localhost:11434/api';
  const json = await fetchJson(`${base}/tags`, options.timeoutMs);

  // { models: [{ name: "llama3.2:latest", modified_at }] } — locally installed.
  const models = asArray(getProp(json, 'models'))
    .map((m) => ({
      id: asString(getProp(m, 'name')),
      modified: Date.parse(asString(getProp(m, 'modified_at')) ?? '') || 0,
    }))
    .filter((m): m is { id: string; modified: number } => Boolean(m.id));

  if (models.length === 0) return undefined;

  // No real tiers locally; prefer a llama model, else newest installed.
  const newest = (subset: typeof models) =>
    newestBy(subset, (m) => m.modified)?.id;

  if (tier === 'balanced' || tier === 'newest') {
    const llama = models.filter((m) => m.id.toLowerCase().includes('llama'));
    return newest(llama.length ? llama : models);
  }
  return newest(models);
}

// --- Helpers ---------------------------------------------------------------

async function fetchJson(
  url: string,
  timeoutMs: number | undefined,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 5000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function newestBy<T>(items: T[], score: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}

/** Extracts a comparable numeric version from a Gemini id (e.g. "2.5" → 2.5). */
function parseGeminiVersion(id: string): number {
  const match = id.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (!match) return 0;
  const major = Number(match[1]);
  const minor = match[2] ? Number(match[2]) : 0;
  return major + minor / 100;
}

function getProp(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function trimSlash(url: string | undefined): string | undefined {
  return url ? url.replace(/\/+$/, '') : url;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
