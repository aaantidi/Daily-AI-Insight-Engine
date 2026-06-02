import { NewsExtractor, ExtractorOptions } from '../../src/extract/extractor.js';
import { LLMClient, LLMResponse } from '../../src/llm-client.js';
import { Logger, LogLevel } from '../../src/logger.js';
import { RawNewsItem, StructuredInsightItem } from '../../src/schema/types.js';
import { StructuredInsightItemSchema } from '../../src/schema/schemas.js';
import { loadFixture } from '../fixtures/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid StructuredInsightItem JSON string for mock responses. */
function makeMockInsight(overrides?: Partial<StructuredInsightItem> & { id?: string }): string {
  const base: StructuredInsightItem = {
    id: overrides?.id ?? 'tc-20260601-001',
    ingested_at: '2026-06-01T12:00:00.000Z',
    source: {
      name: 'TechCrunch',
      type: 'tech_media',
      url: 'https://techcrunch.com/2026/06/01/openai-gpt5-release',
    },
    title: 'OpenAI Releases GPT-5 with Advanced Reasoning Capabilities',
    title_zh: null,
    abstract: 'OpenAI releases GPT-5 with advanced reasoning capabilities, multi-modal processing, and 2M token context.',
    entities: {
      companies: [{ name: 'OpenAI', confidence: 1.0 }],
      products: [{ name: 'GPT-5', confidence: 1.0 }],
      people: [{ name: 'Sam Altman', confidence: 0.95 }],
      technologies: [],
    },
    topics: [{ label: 'Model Release', category: 'technology', confidence: 0.95 }],
    category: { primary: 'Model Release', secondary: null, confidence: 0.9 },
    sentiment: { overall: 'positive', score: 0.8, confidence: 0.85 },
    risk_level: 'none',
    risk_rationale: null,
    impact: {
      scope: 'global',
      time_horizon: 'short_term',
      category: 'technology',
      significance_score: 8,
      rationale: 'Significant leap in AI capability.',
    },
    extraction_confidence: 0.9,
    needs_review: false,
    review_reason: null,
  };

  // Merge overrides
  const merged = { ...base, ...overrides };
  if (overrides?.source) merged.source = { ...base.source, ...overrides.source };
  if (overrides?.impact) merged.impact = { ...base.impact, ...overrides.impact };
  if (overrides?.sentiment) merged.sentiment = { ...base.sentiment, ...overrides.sentiment };
  if (overrides?.entities) merged.entities = { ...base.entities, ...overrides.entities };
  if (overrides?.category) merged.category = { ...base.category, ...overrides.category };
  if (overrides?.topics !== undefined) merged.topics = overrides.topics;

  return JSON.stringify(merged);
}

function makeMockResponse(insightJson: string): LLMResponse {
  return {
    content: insightJson,
    model: 'claude-sonnet-4-6',
    usage: { inputTokens: 500, outputTokens: 300 },
    durationMs: 2000,
  };
}

const allItems = loadFixture('valid-news');

// Create a mock that sends requests through but we don't need it for timing
function createDefaultExtractor(
  mockResponse: LLMResponse,
  options?: Partial<ExtractorOptions>,
): NewsExtractor {
  const mockClient = LLMClient.createMock(mockResponse);
  return new NewsExtractor({
    llmClient: mockClient,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NewsExtractor', () => {
  // -----------------------------------------------------------------------
  // Basic extraction
  // -----------------------------------------------------------------------

  test('1. successfully extracts a single valid news item', async () => {
    const insightJson = makeMockInsight();
    const extractor = createDefaultExtractor(makeMockResponse(insightJson));
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('tc-20260601-001');
    expect(result.items[0].title).toBe('OpenAI Releases GPT-5 with Advanced Reasoning Capabilities');
    expect(result.items[0].extraction_confidence).toBe(0.9);
  });

  test('2. extracts multiple items (2 items), all succeed', async () => {
    const insightJson = makeMockInsight();
    const extractor = createDefaultExtractor(makeMockResponse(insightJson));
    const result = await extractor.extractBatch([allItems[0], allItems[1]]);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeDefined();
    expect(result.items[1]).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Response cleaning
  // -----------------------------------------------------------------------

  test('3. correctly cleans ```json markdown markers from LLM response', async () => {
    const insightJson = makeMockInsight();
    const response: LLMResponse = {
      content: '```json\n' + insightJson + '\n```',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 500, outputTokens: 300 },
      durationMs: 2000,
    };
    const extractor = createDefaultExtractor(response);
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('tc-20260601-001');
  });

  // -----------------------------------------------------------------------
  // Remedial retry
  // -----------------------------------------------------------------------

  test('4. LLM returns invalid JSON -> triggers remedial -> remedial fails -> returns null', async () => {
    const badResponse: LLMResponse = {
      content: '{invalid json here',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 500, outputTokens: 300 },
      durationMs: 2000,
    };
    const extractor = createDefaultExtractor(badResponse);
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(0);
    expect(result.summary.skipped).toBe(1);
  });

  test('5. extraction_confidence < 0.4 -> triggers remedial retry', async () => {
    const lowConfJson = makeMockInsight({ extraction_confidence: 0.3 });
    const extractor = createDefaultExtractor(makeMockResponse(lowConfJson));
    const result = await extractor.extractBatch([allItems[0]]);

    // After remedial: still 0.3 which is < 0.4, so item is skipped
    expect(result.items).toHaveLength(0);
    expect(result.summary.skipped).toBe(1);
  });

  test('6. extraction_confidence 0.4-0.6 -> needs_review=true but no remedial', async () => {
    const mediumConfJson = makeMockInsight({ extraction_confidence: 0.5 });
    const extractor = createDefaultExtractor(makeMockResponse(mediumConfJson));
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].needs_review).toBe(true);
    expect(result.items[0].extraction_confidence).toBe(0.5);
  });

  test('7. extraction_confidence >= 0.6 -> needs_review=false', async () => {
    const highConfJson = makeMockInsight({ extraction_confidence: 0.8 });
    const extractor = createDefaultExtractor(makeMockResponse(highConfJson));
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].needs_review).toBe(false);
    expect(result.items[0].extraction_confidence).toBe(0.8);
  });

  // -----------------------------------------------------------------------
  // Zod validation
  // -----------------------------------------------------------------------

  test('8. Zod validation fails (missing required field) -> triggers remedial -> null', async () => {
    // Missing "title" field
    const badJson = JSON.stringify({ id: 'test-001', ingested_at: '2026-06-01T12:00:00.000Z' });
    const extractor = createDefaultExtractor(makeMockResponse(badJson));
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(0);
    expect(result.summary.skipped).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Partial failure
  // -----------------------------------------------------------------------

  test('9. partially failed items do not block the batch', async () => {
    // First item will succeed, second will fail (invalid JSON)
    const goodResponse: LLMResponse = {
      content: makeMockInsight(),
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 500, outputTokens: 300 },
      durationMs: 2000,
    };

    // For the batch with 2 items and maxParallel=2, we need both to use
    // the same mock. To have one succeed and one fail, we use a mock that
    // alternates responses. But LLMClient.createMock returns fixed responses.
    // Instead, create a custom mock that returns different responses.
    let callCount = 0;
    const alternatingMock = {
      send: async (_prompt: string) => {
        callCount++;
        if (callCount === 1) {
          return goodResponse;
        }
        return { content: '{invalid}', model: 'c', usage: { inputTokens: 1, outputTokens: 1 }, durationMs: 1 };
      },
    } as unknown as LLMClient;

    const extractor = new NewsExtractor({
      llmClient: alternatingMock,
      maxParallel: 2,
    });

    const result = await extractor.extractBatch([allItems[0], allItems[1]]);
    expect(result.items).toHaveLength(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.items[0].id).toBe('tc-20260601-001');
  });

  // -----------------------------------------------------------------------
  // ExtractionSummary
  // -----------------------------------------------------------------------

  test('10. ExtractionSummary statistics are correct', async () => {
    // 3 items: 2 success (conf 0.5, 0.9), 1 skipped (invalid JSON)
    const goodJson = makeMockInsight();
    const mediumJson = makeMockInsight({ extraction_confidence: 0.5 });

    let callIdx = 0;
    const responses = [
      makeMockResponse(goodJson),
      makeMockResponse(mediumJson),
      { content: '{bad}', model: 'c', usage: { inputTokens: 1, outputTokens: 1 }, durationMs: 1 } as LLMResponse,
      // 4th response needed for the remedial retry of the 3rd item
      { content: '{bad}', model: 'c', usage: { inputTokens: 1, outputTokens: 1 }, durationMs: 1 } as LLMResponse,
    ];
    const stepMock = {
      send: async () => responses[callIdx++],
    } as unknown as LLMClient;

    const extractor = new NewsExtractor({
      llmClient: stepMock,
      maxParallel: 3,
    });

    const result = await extractor.extractBatch([allItems[0], allItems[1], allItems[2]]);

    expect(result.summary.total_items).toBe(3);
    expect(result.summary.extracted_successfully).toBe(2);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.needs_review).toBe(1); // the 0.5 confidence one
    expect(typeof result.summary.average_confidence).toBe('number');
    expect(result.summary.average_confidence).toBeGreaterThan(0);
    expect(result.summary.average_confidence).toBeLessThanOrEqual(1);
    expect(result.summary.extraction_duration_seconds).toBeGreaterThanOrEqual(0);
    expect(result.summary.date).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Concurrency control
  // -----------------------------------------------------------------------

  test('11. maxParallel=1 ensures sequential processing (verified via timing)', async () => {
    const delayMs = 50;
    const callTimestamps: number[] = [];

    const delayMock = {
      send: async () => {
        callTimestamps.push(Date.now());
        await new Promise((r) => setTimeout(r, delayMs));
        return makeMockResponse(makeMockInsight());
      },
    } as unknown as LLMClient;

    const extractor = new NewsExtractor({
      llmClient: delayMock,
      maxParallel: 1,
    });

    const result = await extractor.extractBatch([allItems[0], allItems[1], allItems[2]]);

    expect(result.items).toHaveLength(3);
    // Each call took at least delayMs, so the time between first and last
    // should be at least 2 * delayMs (strictly sequential)
    const totalSpan = callTimestamps[2] - callTimestamps[0];
    expect(totalSpan).toBeGreaterThanOrEqual(2 * delayMs);
    // Verify call order
    expect(callTimestamps[1]).toBeGreaterThanOrEqual(callTimestamps[0] + delayMs);
    expect(callTimestamps[2]).toBeGreaterThanOrEqual(callTimestamps[1] + delayMs);
  });

  // -----------------------------------------------------------------------
  // Empty input
  // -----------------------------------------------------------------------

  test('12. empty input returns empty array and correct summary', async () => {
    const extractor = createDefaultExtractor(makeMockResponse(makeMockInsight()));
    const result = await extractor.extractBatch([]);

    expect(result.items).toEqual([]);
    expect(result.summary.total_items).toBe(0);
    expect(result.summary.extracted_successfully).toBe(0);
    expect(result.summary.needs_review).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.average_confidence).toBe(0);
    expect(result.summary.extraction_duration_seconds).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // English news title_zh validation
  // -----------------------------------------------------------------------

  test('13. English news returns title_zh=null which passes Zod validation', async () => {
    const insightJson = makeMockInsight({ title_zh: null });
    const extractor = createDefaultExtractor(makeMockResponse(insightJson));
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title_zh).toBeNull();
  });

  // -----------------------------------------------------------------------
  // risk_rationale for risky items
  // -----------------------------------------------------------------------

  test('14. risk_level >= medium requires risk_rationale (Zod superRefine)', async () => {
    // Valid: risk_level medium with risk_rationale provided
    const validRisky = makeMockInsight({
      risk_level: 'medium',
      risk_rationale: 'Potential safety concerns with advanced capabilities.',
    });
    const extractor1 = createDefaultExtractor(makeMockResponse(validRisky));
    const result1 = await extractor1.extractBatch([allItems[0]]);

    expect(result1.items).toHaveLength(1);
    expect(result1.items[0].risk_level).toBe('medium');
    expect(result1.items[0].risk_rationale).toBeDefined();
  });

  test('14b. risk_level >= medium without risk_rationale fails Zod validation', async () => {
    // Invalid: risk_level medium without risk_rationale
    const invalidRisky = makeMockInsight({
      risk_level: 'medium',
      risk_rationale: null,
    });
    const extractor2 = createDefaultExtractor(makeMockResponse(invalidRisky));
    const result2 = await extractor2.extractBatch([allItems[0]]);

    // Should fail Zod superRefine -> remedial -> fail -> null
    expect(result2.items).toHaveLength(0);
    expect(result2.summary.skipped).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Logger output
  // -----------------------------------------------------------------------

  test('15. Logger outputs [INFO] [EXTRACT] messages during extraction', async () => {
    const infoSpy = jest.spyOn(Logger.prototype, 'info');
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const extractor = createDefaultExtractor(makeMockResponse(makeMockInsight()));
    await extractor.extractBatch([allItems[0], allItems[1]]);

    // Should have info messages about starting extraction
    expect(infoSpy).toHaveBeenCalled();
    // At least one info call should mention EXTRACT module (via message content)
    const infoCalls = infoSpy.mock.calls;
    const hasExtractMessage = infoCalls.some(
      ([msg]) => typeof msg === 'string' && msg.includes('EXTRACT'),
    );
    expect(hasExtractMessage).toBe(true);

    // Error should NOT have been called for successful extraction
    expect(errorSpy).not.toHaveBeenCalled();

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Custom options
  // -----------------------------------------------------------------------

  test('custom maxParallel=2 processes all items', async () => {
    const insightJson = makeMockInsight();
    const extractor = createDefaultExtractor(makeMockResponse(insightJson), { maxParallel: 2 });
    const result = await extractor.extractBatch([allItems[0], allItems[1], allItems[2], allItems[3]]);

    expect(result.items).toHaveLength(4);
  });

  test('custom minConfidence threshold affects needs_review', async () => {
    // With minConfidenceForReview=0.3, even 0.5 confidence doesn't need review
    const conf05 = makeMockInsight({ extraction_confidence: 0.5 });
    const extractor = createDefaultExtractor(makeMockResponse(conf05), {
      minConfidenceForReview: 0.3,
    });
    const result = await extractor.extractBatch([allItems[0]]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].needs_review).toBe(false);
  });

  test('custom minConfidence=0.2 skips remedial for confidence 0.3', async () => {
    const conf03 = makeMockInsight({ extraction_confidence: 0.3 });
    const extractor = createDefaultExtractor(makeMockResponse(conf03), {
      minConfidence: 0.2,
    });
    const result = await extractor.extractBatch([allItems[0]]);

    // 0.3 >= 0.2, so no remedial needed, item is accepted
    expect(result.items).toHaveLength(1);
    expect(result.items[0].extraction_confidence).toBe(0.3);
  });

  test('average_confidence is correctly calculated', async () => {
    let idx = 0;
    const confValues = [0.9, 0.5, 0.7];
    const stepMock = {
      send: async () => {
        const json = makeMockInsight({ extraction_confidence: confValues[idx++] });
        return makeMockResponse(json);
      },
    } as unknown as LLMClient;

    const extractor = new NewsExtractor({ llmClient: stepMock, maxParallel: 3 });
    const result = await extractor.extractBatch([allItems[0], allItems[1], allItems[2]]);

    expect(result.items).toHaveLength(3);
    // Average of 0.9, 0.5, 0.7 = 0.7
    expect(result.summary.average_confidence).toBeCloseTo(0.7, 5);
  });
});
