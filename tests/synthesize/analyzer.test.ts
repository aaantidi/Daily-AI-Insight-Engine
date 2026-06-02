import { InsightAnalyzer } from '../../src/synthesize/analyzer.js';
import { LLMClient, LLMResponse } from '../../src/llm-client.js';
import { StructuredInsightItem, TopEvent, DeepAnalysis, TrendAnalysis, RiskOpportunityPanel } from '../../src/schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLLMResponse(content: string): LLMResponse {
  return {
    content,
    model: 'claude-sonnet-4-6',
    usage: { inputTokens: 500, outputTokens: 300 },
    durationMs: 2000,
  };
}

function makeMockAnalyzer(mockContent: string): InsightAnalyzer {
  const mockClient = LLMClient.createMock(makeLLMResponse(mockContent));
  return new InsightAnalyzer({ llmClient: mockClient });
}

function makeItem(overrides: Partial<StructuredInsightItem> & { id: string }): StructuredInsightItem {
  return {
    id: overrides.id,
    ingested_at: overrides.ingested_at ?? '2026-06-01T12:00:00.000Z',
    source: overrides.source ?? { name: 'TechCrunch', type: 'tech_media', url: 'https://techcrunch.com/test' },
    title: overrides.title ?? 'Test Article',
    title_zh: overrides.title_zh ?? null,
    abstract: overrides.abstract ?? 'A test article abstract.',
    entities: overrides.entities ?? { companies: [], products: [], people: [], technologies: [] },
    topics: overrides.topics ?? [{ label: 'AI', category: 'technology', confidence: 0.9 }],
    category: overrides.category ?? { primary: 'AI', secondary: null, confidence: 0.9 },
    sentiment: overrides.sentiment ?? { overall: 'neutral', score: 0, confidence: 0.8 },
    risk_level: overrides.risk_level ?? 'none',
    risk_rationale: overrides.risk_rationale ?? null,
    impact: overrides.impact ?? {
      scope: 'global', time_horizon: 'short_term', category: 'technology',
      significance_score: 5, rationale: 'Impact rationale.',
    },
    extraction_confidence: overrides.extraction_confidence ?? 0.9,
    needs_review: overrides.needs_review ?? false,
    review_reason: overrides.review_reason ?? null,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('InsightAnalyzer', () => {
  // -----------------------------------------------------------------------
  // identifyTopEvents
  // -----------------------------------------------------------------------

  test('1. identifyTopEvents returns 3 events', async () => {
    const mockTopEvents: TopEvent[] = [
      { rank: 1, title: 'Event 1', item_ids: ['a'], significance: 9, why_important: 'Key', key_entities: ['OpenAI'], sentiment_summary: 'Positive' },
      { rank: 2, title: 'Event 2', item_ids: ['b'], significance: 7, why_important: 'Notable', key_entities: ['Google'], sentiment_summary: 'Neutral' },
      { rank: 3, title: 'Event 3', item_ids: ['c'], significance: 5, why_important: 'Minor', key_entities: ['Meta'], sentiment_summary: 'Negative' },
    ];

    const analyzer = makeMockAnalyzer(JSON.stringify(mockTopEvents));
    const stats = { topicFrequency: { AI: 5, Regulation: 3 }, topBySignificance: [makeItem({ id: 'a', title: 'A' })] };

    const result = await analyzer.identifyTopEvents(stats);

    expect(result).toHaveLength(3);
  });

  test('2. identifyTopEvents ranks start from 1', async () => {
    const mockTopEvents: TopEvent[] = [
      { rank: 1, title: 'Top Event', item_ids: ['a'], significance: 9, why_important: 'Important', key_entities: ['OpenAI'], sentiment_summary: 'Positive' },
      { rank: 2, title: 'Second Event', item_ids: ['b'], significance: 7, why_important: 'Notable', key_entities: ['Google'], sentiment_summary: 'Neutral' },
      { rank: 3, title: 'Third Event', item_ids: ['c'], significance: 5, why_important: 'Minor', key_entities: ['Meta'], sentiment_summary: 'Negative' },
    ];

    const analyzer = makeMockAnalyzer(JSON.stringify(mockTopEvents));
    const result = await analyzer.identifyTopEvents({ topicFrequency: {}, topBySignificance: [] });

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });

  // -----------------------------------------------------------------------
  // analyzeEvent
  // -----------------------------------------------------------------------

  test('3. analyzeEvent returns DeepAnalysis with complete structure', async () => {
    const mockAnalysis: DeepAnalysis = {
      event_title: 'GPT-5 Release',
      background: 'OpenAI released GPT-5 in June 2026.',
      key_developments: ['Advanced reasoning', 'Multi-modal support'],
      impact_analysis: {
        short_term: 'Industry disruption',
        medium_term: 'Market leadership shift',
        affected_parties: ['AI labs', 'Enterprise customers'],
      },
      related_events: ['GPT-4 launch'],
      expert_perspective: 'Game changing technology',
      references: ['a'],
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockAnalysis));
    const event: TopEvent = {
      rank: 1, title: 'GPT-5 Release', item_ids: ['a'], significance: 9,
      why_important: 'Major release', key_entities: ['OpenAI'], sentiment_summary: 'Positive',
    };
    const relatedItems = [makeItem({ id: 'a', title: 'GPT-5 Launch' })];

    const result = await analyzer.analyzeEvent(event, relatedItems);

    expect(result).toBeDefined();
    expect(result.event_title).toBe('GPT-5 Release');
    expect(result.background).toBeTruthy();
    expect(result.key_developments).toHaveLength(2);
    expect(result.impact_analysis.short_term).toBeDefined();
    expect(result.impact_analysis.medium_term).toBeDefined();
    expect(result.impact_analysis.affected_parties).toHaveLength(2);
    expect(result.related_events).toContain('GPT-4 launch');
    expect(result.expert_perspective).toBeDefined();
  });

  test('4. analyzeEvent references contain ref ids', async () => {
    const mockAnalysis: DeepAnalysis = {
      event_title: 'Test Event',
      background: 'Background',
      key_developments: ['Dev'],
      impact_analysis: {
        short_term: 'ST',
        medium_term: 'MT',
        affected_parties: ['Party A'],
      },
      related_events: [],
      expert_perspective: 'Perspective',
      references: ['ref-001', 'ref-002'],
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockAnalysis));
    const event: TopEvent = {
      rank: 1, title: 'Test Event', item_ids: ['a'], significance: 5,
      why_important: 'Test', key_entities: [], sentiment_summary: 'Neutral',
    };

    const result = await analyzer.analyzeEvent(event, [makeItem({ id: 'a' })]);

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toBe('ref-001');
    expect(result.references[1]).toBe('ref-002');
  });

  // -----------------------------------------------------------------------
  // analyzeTrends
  // -----------------------------------------------------------------------

  test('5. analyzeTrends returns four dimensions of trends', async () => {
    const mockTrends: TrendAnalysis = {
      technology: { trend: 'AI advancement', confidence: 0.9, supporting_items: ['a'], signals: ['Signal 1'] },
      application: { trend: 'App adoption', confidence: 0.8, supporting_items: ['b'], signals: ['Signal 2'] },
      policy: { trend: 'Regulation', confidence: 0.7, supporting_items: ['c'], signals: ['Signal 3'] },
      capital: { trend: 'Investment', confidence: 0.6, supporting_items: ['d'], signals: ['Signal 4'] },
      overall_narrative: 'Narrative',
      uncertainties: ['Uncertainty 1'],
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockTrends));
    const result = await analyzer.analyzeTrends([makeItem({ id: 'a' })], []);

    expect(result.technology).toBeDefined();
    expect(result.application).toBeDefined();
    expect(result.policy).toBeDefined();
    expect(result.capital).toBeDefined();
    expect(result.overall_narrative).toBe('Narrative');
  });

  test('6. analyzeTrends each dimension has supporting_items', async () => {
    const mockTrends: TrendAnalysis = {
      technology: { trend: 'AI', confidence: 0.9, supporting_items: ['a', 'b'], signals: ['S1'] },
      application: { trend: 'App', confidence: 0.8, supporting_items: ['c'], signals: ['S2'] },
      policy: { trend: 'Policy', confidence: 0.7, supporting_items: ['d'], signals: ['S3'] },
      capital: { trend: 'Cap', confidence: 0.6, supporting_items: ['e', 'f'], signals: ['S4'] },
      overall_narrative: 'Narrative',
      uncertainties: [],
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockTrends));
    const result = await analyzer.analyzeTrends([], []);

    expect(result.technology.supporting_items).toHaveLength(2);
    expect(result.application.supporting_items).toHaveLength(1);
    expect(result.policy.supporting_items).toHaveLength(1);
    expect(result.capital.supporting_items).toHaveLength(2);
  });

  test('7. analyzeTrends includes overall_narrative', async () => {
    const mockTrends: TrendAnalysis = {
      technology: { trend: 'AI', confidence: 0.9, supporting_items: [], signals: [] },
      application: { trend: 'App', confidence: 0.8, supporting_items: [], signals: [] },
      policy: { trend: 'Policy', confidence: 0.7, supporting_items: [], signals: [] },
      capital: { trend: 'Cap', confidence: 0.6, supporting_items: [], signals: [] },
      overall_narrative: 'The AI industry is accelerating rapidly with broad implications.',
      uncertainties: ['Regulatory timeline'],
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockTrends));
    const result = await analyzer.analyzeTrends([], []);

    expect(result.overall_narrative).toContain('AI');
    expect(typeof result.overall_narrative).toBe('string');
  });

  // -----------------------------------------------------------------------
  // identifyRisksAndOpportunities
  // -----------------------------------------------------------------------

  test('8. identifyRisksAndOpportunities returns risks and opportunities', async () => {
    const mockPanel: RiskOpportunityPanel = {
      risks: [
        { description: 'Regulatory crackdown', level: 'high', probability: 'medium', type: 'systemic', related_items: ['a'], suggested_action: 'Monitor' },
        { description: 'Market volatility', level: 'medium', probability: 'high', type: 'quantifiable', related_items: ['b'], suggested_action: 'Hedge' },
      ],
      opportunities: [
        { description: 'AI adoption', category: 'technology', time_window: 'short_term', related_items: ['c'], rationale: 'Growing market' },
      ],
      overall_risk_assessment: 'Moderate risk with significant upside.',
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockPanel));
    const result = await analyzer.identifyRisksAndOpportunities([], {
      technology: { trend: 'AI', confidence: 0.9, supporting_items: [], signals: [] },
      application: { trend: 'App', confidence: 0.8, supporting_items: [], signals: [] },
      policy: { trend: 'Policy', confidence: 0.7, supporting_items: [], signals: [] },
      capital: { trend: 'Cap', confidence: 0.6, supporting_items: [], signals: [] },
      overall_narrative: 'Narrative',
      uncertainties: [],
    });

    expect(result.risks).toHaveLength(2);
    expect(result.opportunities).toHaveLength(1);
    expect(result.overall_risk_assessment).toBeDefined();
  });

  test('9. risks include different levels (medium, high, critical)', async () => {
    const mockPanel: RiskOpportunityPanel = {
      risks: [
        { description: 'Risk 1', level: 'critical', probability: 'high', type: 'systemic', related_items: ['a'], suggested_action: 'Act' },
        { description: 'Risk 2', level: 'high', probability: 'medium', type: 'quantifiable', related_items: ['b'], suggested_action: 'Mitigate' },
        { description: 'Risk 3', level: 'medium', probability: 'low', type: 'systemic', related_items: ['c'], suggested_action: 'Watch' },
      ],
      opportunities: [],
      overall_risk_assessment: 'High risk environment.',
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockPanel));
    const result = await analyzer.identifyRisksAndOpportunities([], {
      technology: { trend: 'AI', confidence: 0.9, supporting_items: [], signals: [] },
      application: { trend: 'App', confidence: 0.8, supporting_items: [], signals: [] },
      policy: { trend: 'Policy', confidence: 0.7, supporting_items: [], signals: [] },
      capital: { trend: 'Cap', confidence: 0.6, supporting_items: [], signals: [] },
      overall_narrative: 'Narrative',
      uncertainties: [],
    });

    const levels = result.risks.map((r) => r.level);
    expect(levels).toContain('critical');
    expect(levels).toContain('high');
    expect(levels).toContain('medium');
  });

  test('10. no risk data returns empty risks array', async () => {
    const mockPanel: RiskOpportunityPanel = {
      risks: [],
      opportunities: [{ description: 'New opportunity', category: 'technology', time_window: 'short_term', related_items: ['a'], rationale: 'Rationale' }],
      overall_risk_assessment: 'No significant risks identified.',
    };

    const analyzer = makeMockAnalyzer(JSON.stringify(mockPanel));
    const result = await analyzer.identifyRisksAndOpportunities([], {
      technology: { trend: 'AI', confidence: 0.9, supporting_items: [], signals: [] },
      application: { trend: 'App', confidence: 0.8, supporting_items: [], signals: [] },
      policy: { trend: 'Policy', confidence: 0.7, supporting_items: [], signals: [] },
      capital: { trend: 'Cap', confidence: 0.6, supporting_items: [], signals: [] },
      overall_narrative: 'Narrative',
      uncertainties: [],
    });

    expect(result.risks).toEqual([]);
    expect(result.opportunities).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Invalid JSON handling
  // -----------------------------------------------------------------------

  test('11. LLM returns invalid JSON, identifyTopEvents returns empty array gracefully', async () => {
    const analyzer = makeMockAnalyzer('{invalid json}');

    // Should not throw — should return empty array
    const result = await analyzer.identifyTopEvents({ topicFrequency: {}, topBySignificance: [] });
    expect(result).toEqual([]);
  });

  test('12. LLM returns invalid JSON, analyzeEvent returns fallback DeepAnalysis', async () => {
    const analyzer = makeMockAnalyzer('{broken json');
    const event: TopEvent = {
      rank: 1, title: 'Test Event', item_ids: ['a'], significance: 5,
      why_important: 'Test', key_entities: [], sentiment_summary: 'Neutral',
    };

    // Should not throw — should return a fallback
    const result = await analyzer.analyzeEvent(event, [makeItem({ id: 'a' })]);

    expect(result).toBeDefined();
    expect(result.event_title).toBe('Test Event');
  });

  test('13. LLM returns invalid JSON, identifyRisksAndOpportunities returns fallback panel', async () => {
    const analyzer = makeMockAnalyzer('not json at all');

    const result = await analyzer.identifyRisksAndOpportunities([], {
      technology: { trend: 'AI', confidence: 0.9, supporting_items: [], signals: [] },
      application: { trend: 'App', confidence: 0.8, supporting_items: [], signals: [] },
      policy: { trend: 'Policy', confidence: 0.7, supporting_items: [], signals: [] },
      capital: { trend: 'Cap', confidence: 0.6, supporting_items: [], signals: [] },
      overall_narrative: 'Narrative',
      uncertainties: [],
    });

    expect(result).toBeDefined();
    expect(result.risks).toEqual([]);
    expect(result.opportunities).toEqual([]);
    expect(result.overall_risk_assessment).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Clean JSON with markdown code blocks
  // -----------------------------------------------------------------------

  test('14. handle JSON wrapped in ```json code blocks', async () => {
    const mockTopEvent: TopEvent = {
      rank: 1, title: 'Wrapped Event', item_ids: ['a'], significance: 8,
      why_important: 'Important', key_entities: ['OpenAI'], sentiment_summary: 'Positive',
    };

    const analyzer = makeMockAnalyzer('```json\n' + JSON.stringify([mockTopEvent]) + '\n```');
    const result = await analyzer.identifyTopEvents({ topicFrequency: {}, topBySignificance: [] });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Wrapped Event');
  });

  // -----------------------------------------------------------------------
  // LLM error case (mock throws error)
  // -----------------------------------------------------------------------

  test('15. LLM client throws error, identifyTopEvents handles gracefully', async () => {
    // 使用自定义 mock 避免 LLMClient.createMock 的自动重试
    const errorMock = {
      send: async () => { throw new Error('Network error'); },
    } as unknown as LLMClient;
    const analyzer = new InsightAnalyzer({ llmClient: errorMock });

    const result = await analyzer.identifyTopEvents({ topicFrequency: {}, topBySignificance: [] });
    expect(result).toEqual([]);
  });
});
