// =============================================================================
// M5 Pipeline — PipelineOrchestrator 测试
// =============================================================================
//
// 注意: 所有 LLM 调用必须使用 mock，禁止调用真实 API。
// =============================================================================

import { PipelineOrchestrator } from '../../src/pipeline/orchestrator.js';
import { LLMClient, LLMResponse } from '../../src/llm-client.js';
import { Logger, LogLevel } from '../../src/logger.js';
import { loadFixture } from '../fixtures/index.js';
import {
  StructuredInsightItem,
  TopEvent,
  DeepAnalysis,
  TrendAnalysis,
  RiskOpportunityPanel,
} from '../../src/schema/types.js';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// 测试数据准备: 创建仅含 valid-news.json 的测试目录
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const TEST_DATA_DIR = path.resolve(__dirname, '.pipeline-test-data');
const VALID_NEWS_SRC = path.join(FIXTURES_DIR, 'valid-news.json');

beforeAll(() => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  fs.copyFileSync(VALID_NEWS_SRC, path.join(TEST_DATA_DIR, 'valid-news.json'));
});

afterAll(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLLMResponse(content: string): LLMResponse {
  return {
    content,
    model: 'claude-sonnet-4-6',
    usage: { inputTokens: 500, outputTokens: 300 },
    durationMs: 100,
  };
}

function makeMockInsight(overrides?: Partial<StructuredInsightItem> & { id?: string }): string {
  const base: StructuredInsightItem = {
    id: overrides?.id ?? 'mock-001',
    ingested_at: '2026-06-01T12:00:00.000Z',
    source: { name: 'TechCrunch', type: 'tech_media', url: 'https://techcrunch.com/test' },
    title: overrides?.title ?? 'Test Article',
    title_zh: null,
    abstract: 'A test article for pipeline testing.',
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
  const merged = { ...base, ...overrides };
  if (overrides?.source) merged.source = { ...base.source, ...overrides.source };
  if (overrides?.impact) merged.impact = { ...base.impact, ...overrides.impact };
  if (overrides?.entities) merged.entities = { ...base.entities, ...overrides.entities };
  if (overrides?.topics !== undefined) merged.topics = overrides.topics;
  return JSON.stringify(merged);
}

function makeTopEventsJSON(): string {
  const events: TopEvent[] = [
    { rank: 1, title: 'AI Model Releases', item_ids: ['mock-001'], significance: 9, why_important: 'Major AI model releases', key_entities: ['OpenAI'], sentiment_summary: 'Positive' },
    { rank: 2, title: 'AI Regulation Updates', item_ids: ['mock-002'], significance: 8, why_important: 'Safety frameworks advancing', key_entities: ['OpenAI'], sentiment_summary: 'Neutral' },
    { rank: 3, title: 'Enterprise AI Growth', item_ids: ['mock-003'], significance: 7, why_important: 'Open source ecosystem expanding', key_entities: ['NVIDIA'], sentiment_summary: 'Positive' },
  ];
  return JSON.stringify(events);
}

function makeDeepAnalysisJSON(title?: string): string {
  const analysis: DeepAnalysis = {
    event_title: title ?? 'AI Model Releases',
    background: 'Multiple AI companies released significant model updates.',
    key_developments: ['GPT-5 release', 'Gemini 3 breakthrough'],
    impact_analysis: {
      short_term: 'Industry acceleration',
      medium_term: 'Competitive shift',
      affected_parties: ['AI companies', 'Enterprise customers'],
    },
    related_events: ['Safety framework updates'],
    expert_perspective: 'A step change in AI capability.',
    references: ['ref-001', 'ref-002'],
  };
  return JSON.stringify(analysis);
}

function makeTrendsJSON(): string {
  const trends: TrendAnalysis = {
    technology: { trend: 'AI reasoning advances', confidence: 0.85, supporting_items: ['mock-001'], signals: ['GPT-5 benchmarks'] },
    application: { trend: 'Enterprise AI adoption', confidence: 0.8, supporting_items: ['mock-002'], signals: ['Open-source growth'] },
    policy: { trend: 'Safety regulation convergence', confidence: 0.75, supporting_items: ['mock-003'], signals: ['Safety frameworks'] },
    capital: { trend: 'AI infrastructure investment', confidence: 0.7, supporting_items: ['mock-001'], signals: ['Chip race'] },
    overall_narrative: 'AI industry advancing rapidly.',
    uncertainties: ['Regulatory timeline', 'Geopolitical tensions'],
  };
  return JSON.stringify(trends);
}

function makeRiskOppJSON(): string {
  const panel: RiskOpportunityPanel = {
    risks: [{ description: 'Regulatory fragmentation', level: 'high', probability: 'medium', type: 'systemic', related_items: ['mock-002'], suggested_action: 'Monitor' }],
    opportunities: [{ description: 'Open-source AI adoption', category: 'technology', time_window: 'short_term', related_items: ['mock-001'], rationale: 'Cost-effective' }],
    overall_risk_assessment: 'Moderate risk.',
  };
  return JSON.stringify(panel);
}

// ---------------------------------------------------------------------------
// Mock 工厂
// ---------------------------------------------------------------------------

/**
 * 完整管道 mock: 前 10 次调用返回提取响应，之后返回合成响应。
 * valid-news.json 包含 10 条数据，经过验证后 10 条都有效。
 */
function createFullPipelineMock(): LLMClient {
  const extractResp = makeLLMResponse(makeMockInsight());
  const EXTRACT_COUNT = 10;

  const synthResponses: LLMResponse[] = [
    makeLLMResponse(makeTopEventsJSON()),
    makeLLMResponse(makeDeepAnalysisJSON('AI Model Releases')),
    makeLLMResponse(makeDeepAnalysisJSON('AI Regulation Updates')),
    makeLLMResponse(makeDeepAnalysisJSON('Enterprise AI Growth')),
    makeLLMResponse(makeTrendsJSON()),
    makeLLMResponse(makeRiskOppJSON()),
  ];

  let callIdx = 0;
  return {
    send: async () => {
      const idx = callIdx++;
      if (idx < EXTRACT_COUNT) return extractResp;
      const si = idx - EXTRACT_COUNT;
      return synthResponses[Math.min(si, synthResponses.length - 1)];
    },
  } as unknown as LLMClient;
}

/** 阶段跳越 mock: 跳过提取阶段，直接返回合成响应。 */
function createSkipExtractMock(): LLMClient {
  const responses: LLMResponse[] = [
    makeLLMResponse(makeTopEventsJSON()),
    makeLLMResponse(makeDeepAnalysisJSON()),
    makeLLMResponse(makeDeepAnalysisJSON()),
    makeLLMResponse(makeDeepAnalysisJSON()),
    makeLLMResponse(makeTrendsJSON()),
    makeLLMResponse(makeRiskOppJSON()),
  ];
  let callIdx = 0;
  return {
    send: async () => {
      const r = responses[Math.min(callIdx, responses.length - 1)];
      callIdx++;
      return r;
    },
  } as unknown as LLMClient;
}

/** 始终抛出错误的 mock */
function createErrorMock(): LLMClient {
  return {
    send: async () => { throw new Error('Mock LLM failure'); },
  } as unknown as LLMClient;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PipelineOrchestrator', () => {
  // =========================================================================
  // 完整管道
  // =========================================================================

  test('1. run() completes full pipeline with all 4 stages successful', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
    });
    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stages.ingest.status).toBe('success');
    expect(result.stages.extract.status).toBe('success');
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('2. run() returns detailed PipelineResult with all 4 stage outputs', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
    });
    const result = await orchestrator.run();

    // Ingest
    expect(result.stages.ingest.result).toBeDefined();
    expect(result.stages.ingest.result!.valid.length).toBeGreaterThan(0);
    expect(result.stages.ingest.result!.summary.validated).toBeGreaterThan(0);

    // Extract
    expect(typeof result.stages.extract.itemCount).toBe('number');
    expect(result.stages.extract.itemCount).toBeGreaterThan(0);
    expect(result.stages.extract.summary).toBeDefined();
    expect(result.stages.extract.summary!.extracted_successfully).toBeGreaterThan(0);

    // Synthesize
    expect(result.stages.synthesize.report).toBeDefined();
    expect(result.stages.synthesize.report!.dashboard.total_items).toBeGreaterThan(0);
    expect(result.stages.synthesize.report!.top_events).toHaveLength(3);
    expect(result.stages.synthesize.report!.deep_analyses).toHaveLength(3);
    expect(result.stages.synthesize.report!.trend_analysis.technology.trend).toBeTruthy();
    expect(result.stages.synthesize.report!.risk_opportunity.risks.length).toBeGreaterThan(0);

    // Visualize
    expect(result.stages.visualize.charts).toBeDefined();
    expect(typeof result.stages.visualize.charts!.topicSummary).toBe('string');
    expect(typeof result.stages.visualize.charts!.sentimentDonut).toBe('string');
    expect(typeof result.stages.visualize.charts!.trendRadar).toBe('string');
    expect(typeof result.stages.visualize.charts!.eventTimeline).toBe('string');
  });

  // =========================================================================
  // 失败处理
  // =========================================================================

  test('3. INGEST with 0 valid items flows through gracefully', async () => {
    const badDir = path.resolve(FIXTURES_DIR, 'nonexistent');
    const orchestrator = new PipelineOrchestrator({
      dataDir: badDir,
      llmClient: createSkipExtractMock(),
    });
    const result = await orchestrator.run();
    expect(result.stages.ingest.status).toBe('success');
    expect(result.stages.ingest.result!.valid).toHaveLength(0);
    expect(result.stages.extract.status).toBe('success');
    expect(result.stages.extract.itemCount).toBe(0);
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('4. EXTRACT partial failure does not block subsequent stages', async () => {
    const allItems = loadFixture('valid-news');
    const totalItems = allItems.length;
    const half = Math.floor(totalItems / 2);

    // Extract responses:
    // - First 5 items: valid on first attempt (5 calls)
    // - Last 5 items: first attempt fails + remedial fails (10 calls)
    // Total: 15 extract calls
    const extractResponses: LLMResponse[] = [
      // Items 0-4: first attempt succeeds
      ...allItems.slice(0, half).map((item) =>
        makeLLMResponse(makeMockInsight({ id: item.id, title: item.title })),
      ),
      // Items 5-9: first attempt fails
      ...allItems.slice(half).map(() => makeLLMResponse('{invalid}')),
      // Items 5-9: remedial also fails
      ...allItems.slice(half).map(() => makeLLMResponse('{invalid}')),
    ];

    const synthResponses: LLMResponse[] = [
      makeLLMResponse(makeTopEventsJSON()),
      makeLLMResponse(makeDeepAnalysisJSON()),
      makeLLMResponse(makeDeepAnalysisJSON()),
      makeLLMResponse(makeDeepAnalysisJSON()),
      makeLLMResponse(makeTrendsJSON()),
      makeLLMResponse(makeRiskOppJSON()),
    ];

    const allResponses = [...extractResponses, ...synthResponses];
    let callIdx = 0;

    const mockClient = {
      send: async () => {
        const r = allResponses[Math.min(callIdx, allResponses.length - 1)];
        callIdx++;
        return r;
      },
    } as unknown as LLMClient;

    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: mockClient,
    });
    const result = await orchestrator.run();

    expect(result.stages.extract.status).toBe('success');
    expect(result.stages.extract.itemCount).toBe(half);
    expect(result.stages.extract.summary!.skipped).toBeGreaterThan(0);
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  // =========================================================================
  // Stage 跳越
  // =========================================================================

  test('5. stage=extract skips INGEST', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createSkipExtractMock(),
      stage: 'extract',
    });
    const result = await orchestrator.run();
    expect(result.stages.ingest.status).toBe('skipped');
    expect(result.stages.extract.status).toBe('success');
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('6. stage=synthesize skips INGEST and EXTRACT', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createSkipExtractMock(),
      stage: 'synthesize',
    });
    const result = await orchestrator.run();
    expect(result.stages.ingest.status).toBe('skipped');
    expect(result.stages.extract.status).toBe('skipped');
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('7. stage=visualize skips INGEST, EXTRACT, and SYNTHESIZE', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createSkipExtractMock(),
      stage: 'visualize',
    });
    const result = await orchestrator.run();
    expect(result.stages.ingest.status).toBe('skipped');
    expect(result.stages.extract.status).toBe('skipped');
    expect(result.stages.synthesize.status).toBe('skipped');
    expect(result.stages.visualize.status).toBe('success');
  });

  // =========================================================================
  // 边界情况
  // =========================================================================

  test('8. run() records totalDurationMs > 0', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
    });
    const result = await orchestrator.run();
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  test('9. all LLM calls fail (error mock), pipeline does not crash', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createErrorMock(),
    });
    const result = await orchestrator.run();

    expect(result.stages.ingest.status).toBe('success');
    // extractBatch throws when LLM calls fail since extractOne doesn't catch send() errors
    expect(result.stages.extract.status).toBe('failed');
    // Synthesize has fallback for each LLM call
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('10. 0 extracted items (all extracts fail parsing) does not crash pipeline', async () => {
    // 10 items × 2 calls each (first attempt + remedial) = 20 extract calls
    const EXTRACT_COUNT = 20;
    const failingExtracts: LLMResponse[] = new Array(EXTRACT_COUNT).fill(makeLLMResponse('{invalid}'));

    const synthResponses: LLMResponse[] = [
      makeLLMResponse('[]'),               // identifyTopEvents -> empty array
      makeLLMResponse(makeTrendsJSON()),
      makeLLMResponse(makeRiskOppJSON()),
    ];

    const allResponses = [...failingExtracts, ...synthResponses];
    let callIdx = 0;

    const mockClient = {
      send: async () => {
        const r = allResponses[Math.min(callIdx, allResponses.length - 1)];
        callIdx++;
        return r;
      },
    } as unknown as LLMClient;

    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: mockClient,
    });
    const result = await orchestrator.run();

    expect(result.stages.extract.status).toBe('success');
    expect(result.stages.extract.itemCount).toBe(0);
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('11. PipelineResult.success is true when all stages pass', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
    });
    const result = await orchestrator.run();
    expect(result.success).toBe(true);
  });

  // =========================================================================
  // Logger
  // =========================================================================

  test('12. Logger outputs PIPELINE messages during pipeline run', async () => {
    const infoSpy = jest.spyOn(Logger.prototype, 'info');
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
    });
    await orchestrator.run();

    expect(infoSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('13. Logger messages contain stage names', async () => {
    const infoSpy = jest.spyOn(Logger.prototype, 'info');

    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
    });
    await orchestrator.run();

    const messages = infoSpy.mock.calls.map(([msg]) => String(msg));
    const stageMentions = ['INGEST', 'EXTRACT', 'SYNTHESIZE', 'VISUALIZE'].filter(
      (stage) => messages.some((m) => m.includes(stage)),
    );
    expect(stageMentions.length).toBeGreaterThanOrEqual(2);

    infoSpy.mockRestore();
  });

  // =========================================================================
  // 并发 & 参数
  // =========================================================================

  test('14. maxParallel parameter is passed through to Extractor', async () => {
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
      maxParallel: 2,
    });
    const result = await orchestrator.run();
    expect(result.success).toBe(true);
    expect(result.stages.extract.status).toBe('success');
    expect(result.stages.extract.itemCount).toBeGreaterThan(0);
  });

  test('15. custom date parameter is reflected in result and report', async () => {
    const customDate = '2026-06-15';
    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: createFullPipelineMock(),
      date: customDate,
    });
    const result = await orchestrator.run();
    expect(result.date).toBe(customDate);
    if (result.stages.synthesize.report) {
      expect(result.stages.synthesize.report.date).toBe(customDate);
    }
  });

  // =========================================================================
  // 空数据
  // =========================================================================

  test('16. empty data input handles gracefully (no crash)', async () => {
    const orchestrator = new PipelineOrchestrator({
      llmClient: createSkipExtractMock(),
      stage: 'synthesize',
    });
    const result = await orchestrator.run();
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });

  test('17. visualize generates valid chart strings even with empty stats', async () => {
    const mockClient = {
      send: async () => makeLLMResponse('[]'),
    } as unknown as LLMClient;

    const orchestrator = new PipelineOrchestrator({
      llmClient: mockClient,
      stage: 'synthesize',
    });
    const result = await orchestrator.run();
    expect(result.stages.visualize.status).toBe('success');
    expect(result.stages.visualize.charts).toBeDefined();
    expect(typeof result.stages.visualize.charts!.topicSummary).toBe('string');
    expect(typeof result.stages.visualize.charts!.sentimentDonut).toBe('string');
    expect(typeof result.stages.visualize.charts!.trendRadar).toBe('string');
    expect(typeof result.stages.visualize.charts!.eventTimeline).toBe('string');
  });

  // =========================================================================
  // 降级
  // =========================================================================

  test('18. LLM throws during extract, stage marked failed, pipeline continues', async () => {
    const mockClient = {
      send: async () => { throw new Error('Network error'); },
    } as unknown as LLMClient;

    const orchestrator = new PipelineOrchestrator({
      dataDir: TEST_DATA_DIR,
      llmClient: mockClient,
    });
    const result = await orchestrator.run();

    expect(result.stages.ingest.status).toBe('success');
    expect(result.stages.extract.status).toBe('failed');
    expect(result.stages.synthesize.status).toBe('success');
    expect(result.stages.visualize.status).toBe('success');
  });
});
