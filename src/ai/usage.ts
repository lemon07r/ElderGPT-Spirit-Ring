import type { ApiProvider } from '../config/settings';

export interface TokenUsage {
  /** Total input, including cache reads/creation (Anthropic reports those separately). */
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

export class UsageTracker {
  private input?: number;
  private output?: number;
  private cached?: number;
  private created?: number;

  constructor(private readonly provider: ApiProvider) {}

  update(event: unknown): void {
    const root = record(event);
    const usage = record(root?.usage) ?? record(record(root?.message)?.usage);
    if (!usage) return;
    const number = (value: unknown, previous?: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : previous;
    if (this.provider === 'anthropic') {
      this.input = number(usage.input_tokens, this.input);
      this.output = number(usage.output_tokens, this.output);
      this.cached = number(usage.cache_read_input_tokens, this.cached);
      this.created = number(usage.cache_creation_input_tokens, this.created);
    } else {
      this.input = number(usage.prompt_tokens, this.input);
      this.output = number(usage.completion_tokens, this.output);
      this.cached = number(record(usage.prompt_tokens_details)?.cached_tokens, this.cached);
    }
  }

  snapshot(): TokenUsage | undefined {
    const usage: TokenUsage = {};
    if (this.input !== undefined) {
      usage.inputTokens = this.input + (this.provider === 'anthropic' ? (this.cached ?? 0) + (this.created ?? 0) : 0);
    }
    if (this.output !== undefined) usage.outputTokens = this.output;
    if (this.cached !== undefined) usage.cachedInputTokens = this.cached;
    if (this.created !== undefined) usage.cacheCreationInputTokens = this.created;
    return Object.keys(usage).length > 0 ? usage : undefined;
  }
}
