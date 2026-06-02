import { RawNewsItem, StructuredInsightItem, AggregationStats, TopEvent, DeepAnalysis, TrendAnalysis, DailyReport } from '../src/schema/types.js';
import { RawNewsItemSchema, StructuredInsightItemSchema, IngestSummarySchema, ExtractionSummarySchema } from '../src/schema/schemas.js';
import { loadFixture } from './fixtures/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid RawNewsItem to use as a base for mutation tests. */
function makeValidRawNewsItem(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    id: 'test-001',
    title: 'Test News Item Title',
    content: 'This is a test news item with enough content to pass the minimum length validation rule of fifty characters for proper testing purposes.',
    source: {
      name: 'Test Source',
      type: 'tech_media',
      url: 'https://example.com/test-001',
    },
    published_at: '2026-06-01T09:00:00Z',
    language: 'en',
    ...overrides,
  };
}

/** A minimal valid StructuredInsightItem to use as a base for mutation tests. */
function makeValidInsightItem(overrides: Partial<StructuredInsightItem> = {}): StructuredInsightItem {
  return {
    id: 'insight-001',
    ingested_at: '2026-06-01T10:00:00Z',
    source: {
      name: 'Test Source',
      type: 'tech_media',
      url: 'https://example.com/test-001',
    },
    title: 'Test Insight Title',
    title_zh: null,
    abstract: 'A short abstract that describes the key insight within the allowed character limit.',
    entities: {
      companies: [{ name: 'Acme Corp', confidence: 0.95 }],
      products: [],
      people: [],
      technologies: [],
    },
    topics: [
      { label: 'AI', category: 'technology', confidence: 0.9 },
    ],
    category: {
      primary: 'technology',
      secondary: null,
      confidence: 0.85,
    },
    sentiment: {
      overall: 'positive',
      score: 0.75,
      confidence: 0.9,
    },
    risk_level: 'none',
    risk_rationale: null,
    impact: {
      scope: 'global',
      time_horizon: 'long_term',
      category: 'technology',
      significance_score: 8,
      rationale: 'Major AI advancement affecting multiple industries globally.',
    },
    extraction_confidence: 0.85,
    needs_review: false,
    review_reason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Type Structure Tests
// ---------------------------------------------------------------------------

describe('RawNewsItem type structure', () => {
  test('can create a valid RawNewsItem with all required fields', () => {
    const item = makeValidRawNewsItem();
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('content');
    expect(item).toHaveProperty('source');
    expect(item).toHaveProperty('published_at');
    expect(item).toHaveProperty('language');
    expect(typeof item.id).toBe('string');
    expect(typeof item.title).toBe('string');
    expect(typeof item.content).toBe('string');
    expect(typeof item.published_at).toBe('string');
    expect(typeof item.language).toBe('string');
  });

  test('RawNewsItem.source has correct structure', () => {
    const item = makeValidRawNewsItem();
    expect(item.source).toHaveProperty('name');
    expect(item.source).toHaveProperty('type');
    expect(item.source).toHaveProperty('url');
    expect(typeof item.source.name).toBe('string');
    expect(typeof item.source.url).toBe('string');
    expect(['tech_media', 'official', 'social_media', 'aggregator']).toContain(item.source.type);
  });

  test('RawNewsItem language field accepts valid values', () => {
    const en = makeValidRawNewsItem({ language: 'en' });
    const zh = makeValidRawNewsItem({ language: 'zh' });
    const mixed = makeValidRawNewsItem({ language: 'mixed' });
    expect(en.language).toBe('en');
    expect(zh.language).toBe('zh');
    expect(mixed.language).toBe('mixed');
  });
});

describe('StructuredInsightItem type structure', () => {
  test('can create a valid StructuredInsightItem with all required fields', () => {
    const item = makeValidInsightItem();
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('ingested_at');
    expect(item).toHaveProperty('source');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('title_zh');
    expect(item).toHaveProperty('abstract');
    expect(item).toHaveProperty('entities');
    expect(item).toHaveProperty('topics');
    expect(item).toHaveProperty('category');
    expect(item).toHaveProperty('sentiment');
    expect(item).toHaveProperty('risk_level');
    expect(item).toHaveProperty('risk_rationale');
    expect(item).toHaveProperty('impact');
    expect(item).toHaveProperty('extraction_confidence');
    expect(item).toHaveProperty('needs_review');
    expect(item).toHaveProperty('review_reason');
  });

  test('entities has all four sub-arrays', () => {
    const item = makeValidInsightItem();
    expect(item.entities).toHaveProperty('companies');
    expect(item.entities).toHaveProperty('products');
    expect(item.entities).toHaveProperty('people');
    expect(item.entities).toHaveProperty('technologies');
    expect(Array.isArray(item.entities.companies)).toBe(true);
    expect(Array.isArray(item.entities.products)).toBe(true);
    expect(Array.isArray(item.entities.people)).toBe(true);
    expect(Array.isArray(item.entities.technologies)).toBe(true);
  });

  test('sentiment has correct structure', () => {
    const item = makeValidInsightItem();
    expect(item.sentiment).toHaveProperty('overall');
    expect(item.sentiment).toHaveProperty('score');
    expect(item.sentiment).toHaveProperty('confidence');
    expect(['positive', 'neutral', 'negative']).toContain(item.sentiment.overall);
    expect(typeof item.sentiment.score).toBe('number');
    expect(typeof item.sentiment.confidence).toBe('number');
  });

  test('impact has correct structure', () => {
    const item = makeValidInsightItem();
    expect(item.impact).toHaveProperty('scope');
    expect(item.impact).toHaveProperty('time_horizon');
    expect(item.impact).toHaveProperty('category');
    expect(item.impact).toHaveProperty('significance_score');
    expect(item.impact).toHaveProperty('rationale');
  });
});

// ---------------------------------------------------------------------------
// RawNewsItem Schema Validation
// ---------------------------------------------------------------------------

describe('RawNewsItemSchema validation', () => {
  test('validates a legal RawNewsItem', () => {
    const item = makeValidRawNewsItem();
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('rejects a RawNewsItem with missing title', () => {
    const { title, ...rest } = makeValidRawNewsItem();
    const result = RawNewsItemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with empty title', () => {
    const item = makeValidRawNewsItem({ title: '' });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with content too short', () => {
    const item = makeValidRawNewsItem({ content: 'Short content.' });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with empty content', () => {
    const item = makeValidRawNewsItem({ content: '' });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with missing content', () => {
    const { content, ...rest } = makeValidRawNewsItem();
    const result = RawNewsItemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with invalid source type', () => {
    const item = makeValidRawNewsItem({
      source: { name: 'Bad', type: 'invalid_type' as any, url: 'https://example.com' },
    });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with missing source url', () => {
    const item = makeValidRawNewsItem({
      source: { name: 'Bad', type: 'tech_media' } as any,
    });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with invalid language', () => {
    const item = makeValidRawNewsItem({ language: 'de' as any });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with invalid date format', () => {
    const item = makeValidRawNewsItem({ published_at: 'not-a-date' });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with missing id', () => {
    const { id, ...rest } = makeValidRawNewsItem();
    const result = RawNewsItemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects a RawNewsItem with null source', () => {
    const item = makeValidRawNewsItem({ source: null as any });
    const result = RawNewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StructuredInsightItem Schema Validation
// ---------------------------------------------------------------------------

describe('StructuredInsightItemSchema validation', () => {
  test('validates a legal StructuredInsightItem', () => {
    const item = makeValidInsightItem();
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('rejects entities where all sub-arrays are empty and topics is also empty', () => {
    const item = makeValidInsightItem({
      entities: { companies: [], products: [], people: [], technologies: [] },
      topics: [],
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('accepts empty entities when topics has at least one entry (at least one dimension non-empty)', () => {
    const item = makeValidInsightItem({
      entities: { companies: [], products: [], people: [], technologies: [] },
      topics: [{ label: 'AI Safety', category: 'ethics', confidence: 0.8 }],
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('rejects empty topics', () => {
    const item = makeValidInsightItem({ topics: [] });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects significance_score outside 1-10 range (too low)', () => {
    const item = makeValidInsightItem({
      impact: { ...makeValidInsightItem().impact, significance_score: 0 },
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects significance_score outside 1-10 range (too high)', () => {
    const item = makeValidInsightItem({
      impact: { ...makeValidInsightItem().impact, significance_score: 11 },
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects invalid risk_level', () => {
    const item = makeValidInsightItem({ risk_level: 'extreme' as any });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('ensures risk_rationale is non-empty when risk_level >= medium', () => {
    const item = makeValidInsightItem({
      risk_level: 'medium',
      risk_rationale: null,
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('ensures risk_rationale is non-empty when risk_level is high', () => {
    const item = makeValidInsightItem({
      risk_level: 'high',
      risk_rationale: null,
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('ensures risk_rationale is non-empty when risk_level is critical', () => {
    const item = makeValidInsightItem({
      risk_level: 'critical',
      risk_rationale: null,
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('allows risk_rationale to be null when risk_level is none', () => {
    const item = makeValidInsightItem({
      risk_level: 'none',
      risk_rationale: null,
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('allows risk_rationale to be null when risk_level is low', () => {
    const item = makeValidInsightItem({
      risk_level: 'low',
      risk_rationale: null,
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('rejects extraction_confidence below 0', () => {
    const item = makeValidInsightItem({ extraction_confidence: -0.1 });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects extraction_confidence above 1', () => {
    const item = makeValidInsightItem({ extraction_confidence: 1.5 });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects sentiment.score below -1', () => {
    const item = makeValidInsightItem({
      sentiment: { ...makeValidInsightItem().sentiment, score: -1.5 },
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects sentiment.score above 1', () => {
    const item = makeValidInsightItem({
      sentiment: { ...makeValidInsightItem().sentiment, score: 1.5 },
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('accepts sentiment.score at boundary values', () => {
    const item1 = makeValidInsightItem({
      sentiment: { ...makeValidInsightItem().sentiment, score: -1 },
    });
    const item2 = makeValidInsightItem({
      sentiment: { ...makeValidInsightItem().sentiment, score: 0 },
    });
    const item3 = makeValidInsightItem({
      sentiment: { ...makeValidInsightItem().sentiment, score: 1 },
    });
    expect(StructuredInsightItemSchema.safeParse(item1).success).toBe(true);
    expect(StructuredInsightItemSchema.safeParse(item2).success).toBe(true);
    expect(StructuredInsightItemSchema.safeParse(item3).success).toBe(true);
  });

  test('rejects abstract exceeding 120 characters', () => {
    const item = makeValidInsightItem({ abstract: 'A'.repeat(121) });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects empty abstract', () => {
    const item = makeValidInsightItem({ abstract: '' });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects negative extraction_confidence', () => {
    const item = makeValidInsightItem({ extraction_confidence: -0.01 });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects extraction_confidence > 1', () => {
    const item = makeValidInsightItem({ extraction_confidence: 1.01 });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('rejects missing id', () => {
    const { id, ...rest } = makeValidInsightItem();
    const result = StructuredInsightItemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('rejects missing title', () => {
    const { title, ...rest } = makeValidInsightItem();
    const result = StructuredInsightItemSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test('handles risk_level high with valid risk_rationale', () => {
    const item = makeValidInsightItem({
      risk_level: 'high',
      risk_rationale: 'Potential regulatory impact on operations.',
    });
    const result = StructuredInsightItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IngestSummarySchema and ExtractionSummarySchema
// ---------------------------------------------------------------------------

describe('IngestSummarySchema validation', () => {
  test('validates a legal IngestSummary', () => {
    const summary = {
      date: '2026-06-01',
      total_input: 10,
      validated: 8,
      skipped: 2,
      skipped_reasons: [
        { id: 'bad-001', reason: 'Missing title' },
        { id: 'bad-002', reason: 'Content too short' },
      ],
      source_distribution: { tech_media: 5, official: 3, social_media: 1, aggregator: 1 },
    };
    const result = IngestSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });

  test('rejects negative total_input', () => {
    const result = IngestSummarySchema.safeParse({
      date: '2026-06-01',
      total_input: -1,
      validated: 0,
      skipped: 0,
      skipped_reasons: [],
      source_distribution: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('ExtractionSummarySchema validation', () => {
  test('validates a legal ExtractionSummary', () => {
    const summary = {
      date: '2026-06-01',
      total_items: 8,
      extracted_successfully: 6,
      needs_review: 1,
      skipped: 1,
      average_confidence: 0.85,
      extraction_duration_seconds: 120,
    };
    const result = ExtractionSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });

  test('rejects average_confidence outside 0-1 range', () => {
    const result = ExtractionSummarySchema.safeParse({
      date: '2026-06-01',
      total_items: 8,
      extracted_successfully: 6,
      needs_review: 1,
      skipped: 1,
      average_confidence: 1.5,
      extraction_duration_seconds: 120,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AggregationStats Type Structure
// ---------------------------------------------------------------------------

describe('AggregationStats type', () => {
  test('can create a valid AggregationStats object', () => {
    const stats: AggregationStats = {
      topic_frequency: { AI: 10, Policy: 5 },
      source_distribution: { tech_media: 8, official: 2 },
      sentiment_distribution: { positive: 6, neutral: 3, negative: 1 },
      risk_distribution: { none: 5, low: 3, medium: 1, high: 1, critical: 0 },
      top_by_significance: [
        { id: '001', title: 'Top Story', score: 9, published_at: '2026-06-01T09:00:00Z' },
      ],
      entity_co_occurrence: [
        { source: 'OpenAI', target: 'GPT-5', weight: 3 },
      ],
    };
    expect(stats.topic_frequency).toBeDefined();
    expect(stats.top_by_significance.length).toBe(1);
    expect(stats.entity_co_occurrence[0].weight).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// TopEvent / DeepAnalysis / TrendAnalysis / DailyReport Type Structure
// ---------------------------------------------------------------------------

describe('TopEvent / DeepAnalysis / TrendAnalysis / DailyReport types', () => {
  test('can create a valid TopEvent object', () => {
    const event: TopEvent = {
      rank: 1,
      title: 'GPT-5 Release',
      item_ids: ['tc-001', 'ob-002'],
      significance: 9.5,
      why_important: 'Major milestone in AI capabilities',
      key_entities: ['OpenAI', 'GPT-5'],
      sentiment_summary: 'Overwhelmingly positive',
    };
    expect(event.rank).toBe(1);
    expect(event.significance).toBeGreaterThan(0);
  });

  test('can create a valid DeepAnalysis object', () => {
    const analysis: DeepAnalysis = {
      event_title: 'GPT-5 Release',
      background: 'OpenAI released GPT-5...',
      key_developments: ['New reasoning capabilities', 'Multimodal support'],
      impact_analysis: {
        short_term: 'Immediate industry disruption',
        medium_term: 'New product categories emerge',
        affected_parties: ['AI labs', 'Enterprises', 'Regulators'],
      },
      related_events: ['Safety Framework update', 'Competitor responses'],
      expert_perspective: 'Leading researchers view this as a paradigm shift.',
      references: ['https://openai.com/blog/gpt5'],
    };
    expect(analysis.key_developments.length).toBe(2);
    expect(analysis.impact_analysis.affected_parties).toContain('AI labs');
  });

  test('can create a valid TrendAnalysis object', () => {
    const trend: TrendAnalysis = {
      technology: {
        trend: 'Rapid capability advancement',
        confidence: 0.9,
        supporting_items: ['GPT-5', 'Gemini 3'],
        signals: ['Benchmark improvements', 'Real-world deployments'],
      },
      application: {
        trend: 'Enterprise adoption accelerating',
        confidence: 0.8,
        supporting_items: ['Copilot alternatives', 'Code generation'],
        signals: ['VC funding', 'Enterprise contracts'],
      },
      policy: {
        trend: 'Regulatory framework tightening',
        confidence: 0.7,
        supporting_items: ['EU AI Act', 'China regulations'],
        signals: ['Enforcement actions', 'New legislation'],
      },
      capital: {
        trend: 'Investment shifting to infrastructure',
        confidence: 0.75,
        supporting_items: ['NVIDIA chips', 'Data centers'],
        signals: ['Record funding rounds', 'Chip demand'],
      },
      overall_narrative: 'AI industry at inflection point',
      uncertainties: ['Regulatory timeline', 'Technical limitations'],
    };
    expect(trend.technology.confidence).toBe(0.9);
    expect(trend.overall_narrative).toBeTruthy();
  });

  test('can create a valid DailyReport object', () => {
    const report: DailyReport = {
      date: '2026-06-01',
      generated_at: '2026-06-01T18:00:00Z',
      dashboard: {
        total_items: 10,
        sentiment_distribution: { positive: 6, neutral: 3, negative: 1 },
        risk_count: 2,
        top_topics: ['AI', 'Policy', 'Chips'],
      },
      top_events: [
        {
          rank: 1,
          title: 'GPT-5 Release',
          item_ids: ['tc-001'],
          significance: 9.5,
          why_important: 'Major milestone',
          key_entities: ['OpenAI'],
          sentiment_summary: 'Positive',
        },
      ],
      deep_analyses: [
        {
          event_title: 'GPT-5 Release',
          background: 'Background text',
          key_developments: ['Development 1'],
          impact_analysis: {
            short_term: 'Short term impact',
            medium_term: 'Medium term impact',
            affected_parties: ['Party A'],
          },
          related_events: ['Related event'],
          expert_perspective: 'Expert perspective',
          references: ['Reference 1'],
        },
      ],
      trend_analysis: {
        technology: { trend: 'T1', confidence: 0.9, supporting_items: ['I1'], signals: ['S1'] },
        application: { trend: 'T2', confidence: 0.8, supporting_items: ['I2'], signals: ['S2'] },
        policy: { trend: 'T3', confidence: 0.7, supporting_items: ['I3'], signals: ['S3'] },
        capital: { trend: 'T4', confidence: 0.75, supporting_items: ['I4'], signals: ['S4'] },
        overall_narrative: 'Narrative',
        uncertainties: ['Uncertainty'],
      },
      risk_opportunity: {
        risks: [
          {
            description: 'Risk description',
            level: 'high',
            probability: 'medium',
            type: 'systemic',
            related_items: ['Item 1'],
            suggested_action: 'Action',
          },
        ],
        opportunities: [
          {
            description: 'Opportunity description',
            category: 'technology',
            time_window: 'short_term',
            related_items: ['Item 1'],
            rationale: 'Rationale text',
          },
        ],
        overall_risk_assessment: 'Assessment text',
      },
      references_index: [
        { id: 'tc-001', title: 'Article Title', source_name: 'TechCrunch', source_url: 'https://example.com' },
      ],
    };
    expect(report.date).toBe('2026-06-01');
    expect(report.dashboard.total_items).toBe(10);
    expect(report.top_events.length).toBe(1);
    expect(report.deep_analyses.length).toBe(1);
    expect(report.risk_opportunity.risks.length).toBe(1);
    expect(report.risk_opportunity.opportunities.length).toBe(1);
    expect(report.references_index.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fixture Integration Tests
// ---------------------------------------------------------------------------

describe('Fixture integration with RawNewsItem schema', () => {
  test('valid-news.json loads and validates as RawNewsItem[]', () => {
    const items = loadFixture('valid-news');
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      const result = RawNewsItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });

  test('empty.json loads as empty array', () => {
    const items = loadFixture('empty');
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(0);
  });

  test('invalid-news.json items are rejected by RawNewsItemSchema', () => {
    const items = loadFixture('invalid-news');
    expect(Array.isArray(items)).toBe(true);
    // At least some items should be invalid
    const results = items.map((item) => RawNewsItemSchema.safeParse(item));
    const invalidCount = results.filter((r) => !r.success).length;
    expect(invalidCount).toBeGreaterThan(0);
  });

  test('mixed-news.json contains both valid and invalid items', () => {
    const items = loadFixture('mixed-news');
    expect(Array.isArray(items)).toBe(true);
    const results = items.map((item) => RawNewsItemSchema.safeParse(item));
    const validCount = results.filter((r) => r.success).length;
    const invalidCount = results.filter((r) => !r.success).length;
    expect(validCount).toBeGreaterThan(0);
    expect(invalidCount).toBeGreaterThan(0);
  });

  test('en-only-news.json all items are valid', () => {
    const items = loadFixture('en-only-news');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      const result = RawNewsItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });

  test('high-risk-news.json items are valid RawNewsItems', () => {
    const items = loadFixture('high-risk-news');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      const result = RawNewsItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });
});
