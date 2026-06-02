import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  durationMs: number;
}

export interface LLMClientConfig {
  maxRetries?: number;   // default 3
  baseDelayMs?: number;  // default 1000
  apiKey?: string;       // default process.env.DEEPSEEK_API_KEY
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_MAX_TOKENS = 4096;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LLMClient {
  private readonly client: OpenAI;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  /**
   * @param config          Public config options.
   * @param config.openai   Optional pre-configured OpenAI SDK instance
   *                        (used for dependency injection / testing).
   */
  constructor(
    config?: LLMClientConfig & { openai?: OpenAI },
  ) {
    this.maxRetries = config?.maxRetries ?? 3;
    this.baseDelayMs = config?.baseDelayMs ?? 1000;

    if (config?.openai) {
      this.client = config.openai;
    } else {
      this.client = new OpenAI({
        apiKey: config?.apiKey ?? process.env.DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Send a prompt to the LLM and receive a structured response.
   * Automatically retries on retry-able errors (network timeout, 429, 5xx).
   */
  async send(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const startTime = Date.now();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create(
          {
            model: options?.model ?? DEFAULT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
            ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
          },
          options?.timeout !== undefined ? { timeout: options.timeout } : {},
        );

        const durationMs = Date.now() - startTime;
        const content = response.choices[0]?.message?.content ?? '';
        const model = response.model;
        const inputTokens = response.usage?.prompt_tokens ?? 0;
        const outputTokens = response.usage?.completion_tokens ?? 0;

        return {
          content,
          model,
          usage: { inputTokens, outputTokens },
          durationMs,
        };
      } catch (err: unknown) {
        // If this is the last attempt, rethrow immediately.
        if (attempt >= this.maxRetries || !this.isRetryable(err)) {
          throw err;
        }

        const delayMs = this.baseDelayMs * Math.pow(2, attempt);
        console.log(
          `[WARN] LLM call failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delayMs}ms: ${(err as Error).message}`,
        );
        await this.sleep(delayMs);
      }
    }

    // Unreachable -- the loop always returns or throws.
    throw new Error('Unexpected state in LLMClient.send');
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  /**
   * Create a mock LLMClient that does **not** make real API calls.
   *
   * @param stubResponse  Return this LLMResponse on success, or throw this
   *                      Error on failure.  The full retry machinery is still
   *                      active so you can test retry exhaustion.
   */
  static createMock(stubResponse: LLMResponse | Error): LLMClient {
    const mockOpenAI = {
      chat: {
        completions: {
          create: async (): Promise<Record<string, unknown>> => {
            if (stubResponse instanceof Error) {
              throw stubResponse;
            }
            return {
              id: 'chatcmpl-mock-001',
              object: 'chat.completion',
              created: Date.now(),
              model: stubResponse.model,
              choices: [{
                index: 0,
                message: { role: 'assistant', content: stubResponse.content },
                finish_reason: 'stop',
              }],
              usage: {
                prompt_tokens: stubResponse.usage.inputTokens,
                completion_tokens: stubResponse.usage.outputTokens,
                total_tokens: stubResponse.usage.inputTokens + stubResponse.usage.outputTokens,
              },
            };
          },
        },
      },
    };

    return new LLMClient({ openai: mockOpenAI as unknown as OpenAI });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Determine whether an error is worth retrying.
   *
   * Retry-able:
   *   - Network / connection errors  (status === undefined)
   *   - HTTP 429 (rate-limit)
   *   - HTTP 5xx (server errors)
   *
   * Non-retry-able (thrown immediately):
   *   - HTTP 401 (auth)
   *   - HTTP 403 (permission)
   *   - HTTP 400 (bad request)
   */
  private isRetryable(err: unknown): boolean {
    const error = err as { status?: number };
    const status = error.status;

    // Non-retry-able status codes
    if (status === 401 || status === 403 || status === 400) {
      return false;
    }

    // Retry-able: rate limits, server errors, network timeouts
    if (status === 429) return true;
    if (status !== undefined && status >= 500) return true;
    if (status === undefined) return true; // e.g. APIConnectionTimeoutError

    return false;
  }

  /** Promise-based delay for retry back-off. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
