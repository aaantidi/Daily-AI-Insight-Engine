import { LLMClient, LLMResponse } from '../src/llm-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate an SDK error with an optional HTTP status code. */
function makeApiError(status: number | undefined, message: string): Error & { status?: number } {
  const err = new Error(message) as Error & { status?: number };
  if (status !== undefined) err.status = status;
  return err;
}

/** Build a fake OpenAI ChatCompletion response. */
function makeFakeCompletion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-mock-001',
    object: 'chat.completion',
    created: Date.now(),
    model: 'deepseek-chat',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Hello, world!' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 25, total_tokens: 35 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('LLMClient', () => {
  let mockCreate: jest.Mock;
  let mockCompletions: { create: jest.Mock };
  let mockChat: { completions: { create: jest.Mock } };
  let mockOpenAI: { chat: { completions: { create: jest.Mock } } };

  beforeEach(() => {
    mockCreate = jest.fn();
    mockCompletions = { create: mockCreate };
    mockChat = { completions: mockCompletions };
    mockOpenAI = { chat: mockChat };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // send() – success path
  // -----------------------------------------------------------------------

  describe('send()', () => {
    test('returns LLMResponse on success', async () => {
      mockCreate.mockResolvedValue(makeFakeCompletion());

      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 0 });
      const result = await client.send('test prompt');

      expect(result).toMatchObject({
        content: 'Hello, world!',
        model: 'deepseek-chat',
        usage: { inputTokens: 10, outputTokens: 25 },
      });
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          max_tokens: expect.any(Number),
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'test prompt' }),
          ]),
        }),
        expect.anything(),
      );
    });

    // -----------------------------------------------------------------------
    // Retry-able errors
    // -----------------------------------------------------------------------

    test('retries on network timeout (status undefined)', async () => {
      const timeoutErr = makeApiError(undefined, 'Connection timeout');
      mockCreate
        .mockRejectedValueOnce(timeoutErr)
        .mockRejectedValueOnce(timeoutErr)
        .mockResolvedValueOnce(makeFakeCompletion());

      jest.useFakeTimers();
      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 3, baseDelayMs: 1000 });

      const promise = client.send('retry-me');
      await jest.advanceTimersByTimeAsync(1000); // after attempt 0
      await jest.advanceTimersByTimeAsync(2000); // after attempt 1

      const result = await promise;
      expect(result.content).toBe('Hello, world!');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    test('retries on HTTP 429', async () => {
      const rateErr = makeApiError(429, 'Rate limited');
      mockCreate
        .mockRejectedValueOnce(rateErr)
        .mockRejectedValueOnce(rateErr)
        .mockResolvedValueOnce(makeFakeCompletion());

      jest.useFakeTimers();
      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 3, baseDelayMs: 1000 });

      const promise = client.send('test');
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result.content).toBe('Hello, world!');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    test('retries on HTTP 5xx', async () => {
      const serverErr = makeApiError(502, 'Bad gateway');
      mockCreate
        .mockRejectedValueOnce(serverErr)
        .mockRejectedValueOnce(serverErr)
        .mockResolvedValueOnce(makeFakeCompletion());

      jest.useFakeTimers();
      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 3, baseDelayMs: 1000 });

      const promise = client.send('test');
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result.content).toBe('Hello, world!');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    // -----------------------------------------------------------------------
    // Non-retry-able errors
    // -----------------------------------------------------------------------

    test.each([
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [400, 'Bad request'],
    ])('does NOT retry HTTP %s (%s)', async (status, msg) => {
      const err = makeApiError(status, msg as string);
      mockCreate.mockRejectedValue(err);

      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 3, baseDelayMs: 10 });
      await expect(client.send('test')).rejects.toThrow(msg as string);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Retry exhaustion
    // -----------------------------------------------------------------------

    test('throws after exhausting all retries', async () => {
      const err = makeApiError(429, 'Always rate limited');
      mockCreate.mockRejectedValue(err);

      jest.useFakeTimers();
      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 2, baseDelayMs: 100 });

      const rejection = expect(client.send('test')).rejects.toThrow('Always rate limited');
      await jest.advanceTimersByTimeAsync(100);  // attempt 0 -> attempt 1
      await jest.advanceTimersByTimeAsync(200);  // attempt 1 -> attempt 2
      // attempt 2 fails -> no more retries (2 < 2 is false)
      await rejection;

      // total calls = maxRetries + 1 = 3
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    // -----------------------------------------------------------------------
    // Duration tracking
    // -----------------------------------------------------------------------

    test('records durationMs', async () => {
      mockCreate.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return makeFakeCompletion();
      });

      jest.useFakeTimers();
      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 0 });

      const promise = client.send('test');
      await jest.advanceTimersByTimeAsync(50);
      const result = await promise;

      expect(result.durationMs).toBeGreaterThanOrEqual(50);
    });

    // -----------------------------------------------------------------------
    // Custom options passthrough
    // -----------------------------------------------------------------------

    test('passes custom model and maxTokens to the SDK', async () => {
      mockCreate.mockResolvedValue(makeFakeCompletion({ model: 'clopus-4-5' }));

      const client = new LLMClient({ openai: mockOpenAI as never, maxRetries: 0 });
      await client.send('hello', { model: 'clopus-4-5', maxTokens: 2048, temperature: 0.5 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'clopus-4-5',
          max_tokens: 2048,
          temperature: 0.5,
        }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // createMock()
  // -----------------------------------------------------------------------

  describe('createMock()', () => {
    test('returns a mock instance that returns the stub response on success', async () => {
      const stub: LLMResponse = {
        content: 'Mock reply',
        model: 'mock-model',
        usage: { inputTokens: 5, outputTokens: 9 },
        durationMs: 0,
      };

      const client = LLMClient.createMock(stub);
      const result = await client.send('anything');

      expect(result.content).toBe('Mock reply');
      expect(result.model).toBe('mock-model');
      expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 9 });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('returns a mock instance that throws when given an Error', async () => {
      jest.useFakeTimers();
      const err = new Error('Simulated failure');
      const client = LLMClient.createMock(err);

      const rejection = expect(client.send('test')).rejects.toThrow('Simulated failure');
      // Advance through default retries: 1s, 2s, 4s
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);
      await rejection;
    });

    test('createMock instance supports retry simulation', async () => {
      jest.useFakeTimers();
      // createMock with an error; verify that the default retry logic kicks in
      // by checking that the error is still thrown after exhaustion
      const err = makeApiError(429, 'Mock rate-limit');
      const client = LLMClient.createMock(err);

      const rejection = expect(client.send('test')).rejects.toThrow('Mock rate-limit');
      // Advance through default retries: 1s, 2s, 4s
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);
      await rejection;
    });
  });
});
