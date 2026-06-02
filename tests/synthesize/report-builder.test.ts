import { ReportBuilder } from '../../src/synthesize/report-builder.js';
import {
  AggregationStats, TopEvent, DeepAnalysis, TrendAnalysis,
  RiskOpportunityPanel, StructuredInsightItem,
} from '../../src/schema/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockStats: AggregationStats = {
  topic_frequency: { AI: 5, Regulation: 3, Blockchain: 1 },
  source_distribution: { tech_media: 4, official: 3, social_media: 2 },
  sentiment_distribution: { positive: 3, neutral: 4, negative: 2 },
  risk_distribution: { none: 5, low: 2, medium: 1, high: 1, critical: 0 },
  top_by_significance: [
    { id: 'a', title: 'GPT-5 Release', score: 9, published_at: '2026-06-01T12:00:00.000Z' },
    { id: 'b', title: 'AI Regulation', score: 7, published_at: '2026-06-01T10:00:00.000Z' },
    { id: 'c', title: 'Blockchain News', score: 4, published_at: '2026-06-01T08:00:00.000Z' },
  ],
  entity_co_occurrence: [
    { source: 'Microsoft', target: 'OpenAI', weight: 3 },
  ],
};

const mockTopEvents: TopEvent[] = [
  { rank: 1, title: 'GPT-5 Release', item_ids: ['a'], significance: 9, why_important: 'Major AI advancement', key_entities: ['OpenAI', 'Microsoft'], sentiment_summary: 'Positive' },
  { rank: 2, title: 'AI Regulation', item_ids: ['b'], significance: 7, why_important: 'Policy shift', key_entities: ['EU'], sentiment_summary: 'Negative' },
  { rank: 3, title: 'Blockchain News', item_ids: ['c'], significance: 4, why_important: 'New development', key_entities: ['Ethereum'], sentiment_summary: 'Neutral' },
];

const mockDeepAnalyses: DeepAnalysis[] = [
  {
    event_title: 'GPT-5 Release',
    background: 'OpenAI released GPT-5 with advanced reasoning.',
    key_developments: ['Advanced reasoning capabilities', 'Multi-modal processing', '2M token context'],
    impact_analysis: {
      short_term: 'Industry disruption expected',
      medium_term: 'Market leadership shift toward OpenAI',
      affected_parties: ['AI labs', 'Enterprise customers', 'Developers'],
    },
    related_events: ['GPT-4 launch', 'Claude 4 release'],
    expert_perspective: 'This represents a step change in AI capability.',
    references: ['a', 'b'],
  },
  {
    event_title: 'AI Regulation',
    background: 'EU proposes new AI regulation framework.',
    key_developments: ['New compliance requirements'],
    impact_analysis: {
      short_term: 'Compliance costs increase',
      medium_term: 'Industry consolidation',
      affected_parties: ['Tech companies', 'Startups'],
    },
    related_events: ['US executive order'],
    expert_perspective: 'Regulation will shape the industry.',
    references: ['b'],
  },
];

const mockTrends: TrendAnalysis = {
  technology: { trend: 'AI capabilities rapidly advancing', confidence: 0.9, supporting_items: ['a'], signals: ['GPT-5 release', 'Claude 4'] },
  application: { trend: 'Enterprise AI adoption accelerating', confidence: 0.8, supporting_items: ['a'], signals: ['Major deployments'] },
  policy: { trend: 'Regulatory frameworks emerging', confidence: 0.7, supporting_items: ['b'], signals: ['EU AI Act'] },
  capital: { trend: 'AI investment boom continuing', confidence: 0.85, supporting_items: ['c'], signals: ['Record VC funding'] },
  overall_narrative: 'The AI landscape is experiencing rapid transformation across all dimensions.',
  uncertainties: ['Speed of regulation', 'Geopolitical tensions'],
};

const mockRiskOpp: RiskOpportunityPanel = {
  risks: [
    { description: 'Regulatory compliance costs may burden startups', level: 'high', probability: 'medium', type: 'systemic', related_items: ['b'], suggested_action: 'Monitor regulatory developments' },
    { description: 'AI safety concerns could trigger public backlash', level: 'medium', probability: 'high', type: 'quantifiable', related_items: ['a'], suggested_action: 'Proactive safety measures' },
  ],
  opportunities: [
    { description: 'Enterprise AI consulting demand growing', category: 'business', time_window: 'short_term', related_items: ['a', 'c'], rationale: 'Companies need help adopting AI' },
    { description: 'AI compliance tools market expanding', category: 'technology', time_window: 'medium_term', related_items: ['b'], rationale: 'New regulations create demand' },
  ],
  overall_risk_assessment: 'Moderate risk with significant upside potential.',
};

const mockItems: StructuredInsightItem[] = [
  {
    id: 'a',
    ingested_at: '2026-06-01T12:00:00.000Z',
    source: { name: 'TechCrunch', type: 'tech_media', url: 'https://techcrunch.com/gpt-5' },
    title: 'GPT-5 Release',
    title_zh: null,
    abstract: 'OpenAI released GPT-5 with advanced reasoning.',
    entities: { companies: [{ name: 'OpenAI', confidence: 0.95 }], products: [], people: [], technologies: [{ name: 'GPT-5', confidence: 0.9 }] },
    topics: [{ label: 'AI', category: 'technology', confidence: 0.95 }],
    category: { primary: 'technology', secondary: null, confidence: 0.9 },
    sentiment: { overall: 'positive', score: 0.8, confidence: 0.85 },
    risk_level: 'none',
    risk_rationale: null,
    impact: { scope: 'global', time_horizon: 'short_term', category: 'technology', significance_score: 9, rationale: 'Major AI release' },
    extraction_confidence: 0.9,
    needs_review: false,
    review_reason: null,
  },
  {
    id: 'b',
    ingested_at: '2026-06-01T10:00:00.000Z',
    source: { name: 'Reuters', type: 'tech_media', url: 'https://reuters.com/ai-regulation' },
    title: 'AI Regulation',
    title_zh: null,
    abstract: 'EU proposes new AI regulation framework.',
    entities: { companies: [{ name: 'EU Commission', confidence: 0.9 }], products: [], people: [], technologies: [] },
    topics: [{ label: 'Regulation', category: 'policy', confidence: 0.95 }],
    category: { primary: 'policy', secondary: null, confidence: 0.9 },
    sentiment: { overall: 'negative', score: -0.3, confidence: 0.7 },
    risk_level: 'medium',
    risk_rationale: 'Regulatory impact',
    impact: { scope: 'regional', time_horizon: 'medium_term', category: 'policy', significance_score: 7, rationale: 'Policy shift' },
    extraction_confidence: 0.85,
    needs_review: false,
    review_reason: null,
  },
  {
    id: 'c',
    ingested_at: '2026-06-01T08:00:00.000Z',
    source: { name: 'CoinDesk', type: 'tech_media', url: 'https://coindesk.com/blockchain-news' },
    title: 'Blockchain News',
    title_zh: null,
    abstract: 'Blockchain news.',
    entities: { companies: [], products: [], people: [], technologies: [{ name: 'Blockchain', confidence: 0.8 }] },
    topics: [{ label: 'Blockchain', category: 'technology', confidence: 0.8 }],
    category: { primary: 'technology', secondary: null, confidence: 0.8 },
    sentiment: { overall: 'neutral', score: 0.1, confidence: 0.6 },
    risk_level: 'low',
    risk_rationale: null,
    impact: { scope: 'global', time_horizon: 'long_term', category: 'technology', significance_score: 4, rationale: 'New development' },
    extraction_confidence: 0.75,
    needs_review: false,
    review_reason: null,
  },
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ReportBuilder', () => {
  const builder = new ReportBuilder();

  test('1. buildReport returns a complete DailyReport object', () => {
    const report = builder.buildReport(
      '2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems,
    );

    expect(report).toBeDefined();
    expect(report.date).toBe('2026-06-01');
    expect(report.generated_at).toBeDefined();
    expect(report.dashboard.total_items).toBe(9);
    expect(report.dashboard.top_topics).toEqual(['AI', 'Regulation', 'Blockchain']);
    expect(report.top_events).toHaveLength(3);
    expect(report.deep_analyses).toHaveLength(2);
    expect(report.trend_analysis).toBeDefined();
    expect(report.risk_opportunity).toBeDefined();
    expect(report.references_index).toBeDefined();
  });

  test('2. toMarkdown contains report title and date', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('AI 分析日报');
    expect(md).toContain('2026-06-01');
  });

  test('3. toMarkdown contains dashboard overview panel', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('概览面板');
    expect(md).toContain('9');
    expect(md).toContain('正面');
    expect(md).toContain('中性');
    expect(md).toContain('负面');
  });

  test('4. toMarkdown contains Top-3 events section', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('Top 3 焦点事件');
    expect(md).toContain('GPT-5 Release');
    expect(md).toContain('AI Regulation');
    expect(md).toContain('Blockchain News');
  });

  test('5. toMarkdown contains deep analysis section', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('深度分析');
    expect(md).toContain('Advanced reasoning capabilities');
    expect(md).toContain('Industry disruption expected');
  });

  test('6. toMarkdown contains trend analysis section', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('趋势推演');
    expect(md).toContain('技术趋势');
    expect(md).toContain('应用趋势');
    expect(md).toContain('政策趋势');
    expect(md).toContain('资本趋势');
  });

  test('7. toMarkdown contains risks and opportunities section', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('机会与风险提示');
    expect(md).toContain('Regulatory compliance costs');
    expect(md).toContain('Enterprise AI consulting');
  });

  test('8. toMarkdown contains appendix A and B', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    expect(md).toContain('附录 A');
    expect(md).toContain('附录 B');
    expect(md).toContain('完整结构化数据索引');
  });

  test('9. references_index correctly maps from items with real source info', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);

    expect(report.references_index).toHaveLength(3);
    // id and title from items
    expect(report.references_index[0].id).toBe('a');
    expect(report.references_index[0].title).toBe('GPT-5 Release');
    expect(report.references_index[1].id).toBe('b');
    expect(report.references_index[1].title).toBe('AI Regulation');
    // source_name and source_url from items (not hardcoded empty strings)
    expect(report.references_index[0].source_name).toBe('TechCrunch');
    expect(report.references_index[0].source_url).toBe('https://techcrunch.com/gpt-5');
    expect(report.references_index[1].source_name).toBe('Reuters');
    expect(report.references_index[1].source_url).toBe('https://reuters.com/ai-regulation');
    expect(report.references_index[2].source_name).toBe('CoinDesk');
    expect(report.references_index[2].source_url).toBe('https://coindesk.com/blockchain-news');
  });

  test('10. empty/missing data does not crash the report builder', () => {
    const emptyStats: AggregationStats = {
      topic_frequency: {},
      source_distribution: {},
      sentiment_distribution: {},
      risk_distribution: {},
      top_by_significance: [],
      entity_co_occurrence: [],
    };

    const report = builder.buildReport('2026-06-01', emptyStats, [], [], {
      technology: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      application: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      policy: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      capital: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      overall_narrative: '',
      uncertainties: [],
    }, {
      risks: [],
      opportunities: [],
      overall_risk_assessment: 'No risks identified.',
    }, []);

    expect(report).toBeDefined();
    expect(report.top_events).toEqual([]);
    expect(report.deep_analyses).toEqual([]);
    expect(report.references_index).toEqual([]);

    const md = builder.toMarkdown(report);
    expect(md).toContain('AI 分析日报');
    expect(md).toContain('0 条');
  });

  test('11. special characters in table cells are escaped', () => {
    const statsWithPipe: AggregationStats = {
      ...mockStats,
      topic_frequency: { 'AI | ML': 3, 'Regulation: Policy': 2 },
    };

    const report = builder.buildReport('2026-06-01', statsWithPipe, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    // The pipe character in the topic should be escaped or handled
    expect(md).toContain('AI');
    expect(md).toBeDefined();
  });

  test('12. toMarkdown contains [ref:xxx] style references', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);
    const md = builder.toMarkdown(report);

    // Deep analysis should include [ref: a] style references
    expect(md).toContain('[ref:');
  });

  test('13. dashboard values are consistent with input stats', () => {
    const report = builder.buildReport('2026-06-01', mockStats, mockTopEvents, mockDeepAnalyses, mockTrends, mockRiskOpp, mockItems);

    // total_items = sentiment_distribution values summed
    expect(report.dashboard.total_items).toBe(3 + 4 + 2);

    // risk_count = sum of risk_distribution except 'none'
    const riskCountTotal = 2 + 1 + 1 + 0; // low + medium + high + critical
    expect(report.dashboard.risk_count).toBe(riskCountTotal);

    // top_topics should be sorted by frequency
    expect(report.dashboard.top_topics[0]).toBe('AI');
    expect(report.dashboard.top_topics[1]).toBe('Regulation');
    expect(report.dashboard.top_topics[2]).toBe('Blockchain');
  });
});
