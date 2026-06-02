import { StatsAggregator } from '../../src/synthesize/aggregator.js';
import { StructuredInsightItem } from '../../src/schema/types.js';

// ---------------------------------------------------------------------------
// Build helper — creates mock StructuredInsightItem[] for testing
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<StructuredInsightItem> & { id: string }): StructuredInsightItem {
  return {
    id: overrides.id,
    ingested_at: overrides.ingested_at ?? '2026-06-01T12:00:00.000Z',
    source: overrides.source ?? { name: 'TechCrunch', type: 'tech_media', url: 'https://techcrunch.com/test' },
    title: overrides.title ?? 'Test Article',
    title_zh: overrides.title_zh ?? null,
    abstract: overrides.abstract ?? 'A test article abstract.',
    entities: overrides.entities ?? {
      companies: [],
      products: [],
      people: [],
      technologies: [],
    },
    topics: overrides.topics ?? [{ label: 'AI', category: 'technology', confidence: 0.9 }],
    category: overrides.category ?? { primary: 'AI', secondary: null, confidence: 0.9 },
    sentiment: overrides.sentiment ?? { overall: 'neutral', score: 0, confidence: 0.8 },
    risk_level: overrides.risk_level ?? 'none',
    risk_rationale: overrides.risk_rationale ?? null,
    impact: overrides.impact ?? {
      scope: 'global',
      time_horizon: 'short_term',
      category: 'technology',
      significance_score: 5,
      rationale: 'Impact rationale.',
    },
    extraction_confidence: overrides.extraction_confidence ?? 0.9,
    needs_review: overrides.needs_review ?? false,
    review_reason: overrides.review_reason ?? null,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('StatsAggregator', () => {
  const aggregator = new StatsAggregator();

  // -----------------------------------------------------------------------
  // Empty input
  // -----------------------------------------------------------------------

  test('1. empty array input returns all-zero stats', () => {
    const result = aggregator.aggregate([]);

    expect(result.topic_frequency).toEqual({});
    expect(result.source_distribution).toEqual({});
    expect(result.sentiment_distribution).toEqual({});
    expect(result.risk_distribution).toEqual({});
    expect(result.top_by_significance).toEqual([]);
    expect(result.entity_co_occurrence).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Topic frequency
  // -----------------------------------------------------------------------

  test('2. single item with one topic returns correct topic_frequency', () => {
    const items = [
      makeItem({
        id: 'test-001',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.9 }],
      }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.topic_frequency).toEqual({ AI: 1 });
  });

  test('3. multiple items aggregate topic frequency correctly', () => {
    const items = [
      makeItem({
        id: 'test-001',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.9 }],
      }),
      makeItem({
        id: 'test-002',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.8 }],
      }),
      makeItem({
        id: 'test-003',
        topics: [{ label: 'Blockchain', category: 'technology', confidence: 0.7 }],
      }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.topic_frequency).toEqual({ AI: 2, Blockchain: 1 });
  });

  // -----------------------------------------------------------------------
  // Source distribution
  // -----------------------------------------------------------------------

  test('4. source_distribution counts by source type correctly', () => {
    const items = [
      makeItem({ id: 'test-001', source: { name: 'TechCrunch', type: 'tech_media', url: 'https://tc.com/a' } }),
      makeItem({ id: 'test-002', source: { name: 'Reuters', type: 'official', url: 'https://reuters.com/b' } }),
      makeItem({ id: 'test-003', source: { name: 'Wired', type: 'tech_media', url: 'https://wired.com/c' } }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.source_distribution).toEqual({
      tech_media: 2,
      official: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Sentiment distribution
  // -----------------------------------------------------------------------

  test('5. sentiment_distribution counts overall sentiment correctly', () => {
    const items = [
      makeItem({ id: 'test-001', sentiment: { overall: 'positive', score: 0.8, confidence: 0.9 } }),
      makeItem({ id: 'test-002', sentiment: { overall: 'positive', score: 0.6, confidence: 0.8 } }),
      makeItem({ id: 'test-003', sentiment: { overall: 'negative', score: -0.5, confidence: 0.7 } }),
      makeItem({ id: 'test-004', sentiment: { overall: 'neutral', score: 0, confidence: 0.8 } }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.sentiment_distribution).toEqual({
      positive: 2,
      negative: 1,
      neutral: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Risk distribution
  // -----------------------------------------------------------------------

  test('6. risk_distribution counts risk levels correctly', () => {
    const items = [
      makeItem({ id: 'test-001', risk_level: 'none' }),
      makeItem({ id: 'test-002', risk_level: 'low' }),
      makeItem({ id: 'test-003', risk_level: 'medium' }),
      makeItem({ id: 'test-004', risk_level: 'high' }),
      makeItem({ id: 'test-005', risk_level: 'critical' }),
      makeItem({ id: 'test-006', risk_level: 'none' }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.risk_distribution).toEqual({
      none: 2,
      low: 1,
      medium: 1,
      high: 1,
      critical: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Top by significance
  // -----------------------------------------------------------------------

  test('7. top_by_significance returns items in descending order by score', () => {
    const items = [
      makeItem({
        id: 'test-001',
        title: 'Low Impact',
        impact: { scope: 'company', time_horizon: 'long_term', category: 'technology', significance_score: 3, rationale: 'Minor.' },
        ingested_at: '2026-06-01T10:00:00.000Z',
      }),
      makeItem({
        id: 'test-002',
        title: 'High Impact',
        impact: { scope: 'global', time_horizon: 'short_term', category: 'technology', significance_score: 9, rationale: 'Major.' },
        ingested_at: '2026-06-01T12:00:00.000Z',
      }),
      makeItem({
        id: 'test-003',
        title: 'Medium Impact',
        impact: { scope: 'regional', time_horizon: 'medium_term', category: 'policy', significance_score: 6, rationale: 'Significant.' },
        ingested_at: '2026-06-01T11:00:00.000Z',
      }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.top_by_significance).toHaveLength(3);
    expect(result.top_by_significance[0].id).toBe('test-002');
    expect(result.top_by_significance[0].score).toBe(9);
    expect(result.top_by_significance[1].id).toBe('test-003');
    expect(result.top_by_significance[1].score).toBe(6);
    expect(result.top_by_significance[2].id).toBe('test-001');
    expect(result.top_by_significance[2].score).toBe(3);
  });

  test('8. top_by_significance only returns top 10 items', () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      makeItem({
        id: `test-${String(i + 1).padStart(3, '0')}`,
        title: `Item ${i + 1}`,
        impact: {
          scope: 'company',
          time_horizon: 'short_term',
          category: 'technology',
          significance_score: (i % 10) + 1,
          rationale: `Score ${(i % 10) + 1}.`,
        },
        ingested_at: '2026-06-01T12:00:00.000Z',
      }),
    );

    const result = aggregator.aggregate(items);
    expect(result.top_by_significance).toHaveLength(10);
    // First item should have highest score (10)
    expect(result.top_by_significance[0].score).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Entity co-occurrence
  // -----------------------------------------------------------------------

  test('9. entity_co_occurrence builds correct co-occurrence pairs from companies', () => {
    const items = [
      makeItem({
        id: 'test-001',
        entities: {
          companies: [
            { name: 'OpenAI', confidence: 1.0 },
            { name: 'Microsoft', confidence: 1.0 },
            { name: 'Google', confidence: 0.9 },
          ],
          products: [],
          people: [],
          technologies: [],
        },
      }),
    ];

    const result = aggregator.aggregate(items);
    // 3 companies -> C(3,2) = 3 pairs
    expect(result.entity_co_occurrence).toHaveLength(3);

    // Each pair should have weight 1
    for (const pair of result.entity_co_occurrence) {
      expect(pair.weight).toBe(1);
    }

    // Verify specific pairs exist (alphabetically sorted: Google, Microsoft, OpenAI)
    const pairs = result.entity_co_occurrence.map((p) => `${p.source}-${p.target}`);
    expect(pairs).toContain('Google-Microsoft');
    expect(pairs).toContain('Google-OpenAI');
    expect(pairs).toContain('Microsoft-OpenAI');
  });

  test('10. entity_co_occurrence weight increments when same pair appears in multiple items', () => {
    const baseItem = {
      entities: {
        companies: [
          { name: 'OpenAI', confidence: 1.0 },
          { name: 'Microsoft', confidence: 1.0 },
        ],
        products: [],
        people: [],
        technologies: [],
      },
    };

    const items = [
      makeItem({ id: 'test-001', ...baseItem }),
      makeItem({ id: 'test-002', ...baseItem }),
      makeItem({ id: 'test-003', ...baseItem }),
    ];

    const result = aggregator.aggregate(items);
    // Only one pair: OpenAI-Microsoft, weight should be 3
    expect(result.entity_co_occurrence).toHaveLength(1);
    expect(result.entity_co_occurrence[0].source).toBe('Microsoft');
    expect(result.entity_co_occurrence[0].target).toBe('OpenAI');
    expect(result.entity_co_occurrence[0].weight).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Mixed data — comprehensive test
  // -----------------------------------------------------------------------

  test('11. multiple items with mixed attributes produce correct aggregate stats', () => {
    const items = [
      makeItem({
        id: 'test-001',
        source: { name: 'TechCrunch', type: 'tech_media', url: 'https://tc.com/a' },
        topics: [
          { label: 'AI', category: 'technology', confidence: 0.9 },
          { label: 'Model Release', category: 'technology', confidence: 0.8 },
        ],
        sentiment: { overall: 'positive', score: 0.8, confidence: 0.9 },
        risk_level: 'none',
        impact: { scope: 'global', time_horizon: 'short_term', category: 'technology', significance_score: 8, rationale: 'Big release.' },
        entities: {
          companies: [{ name: 'OpenAI', confidence: 1.0 }],
          products: [],
          people: [],
          technologies: [],
        },
        ingested_at: '2026-06-01T12:00:00.000Z',
      }),
      makeItem({
        id: 'test-002',
        source: { name: 'Reuters', type: 'official', url: 'https://reuters.com/b' },
        topics: [
          { label: 'AI', category: 'technology', confidence: 0.9 },
          { label: 'Regulation', category: 'policy', confidence: 0.85 },
        ],
        sentiment: { overall: 'negative', score: -0.6, confidence: 0.8 },
        risk_level: 'high',
        risk_rationale: 'Regulatory risk.',
        impact: { scope: 'global', time_horizon: 'medium_term', category: 'policy', significance_score: 7, rationale: 'Policy shift.' },
        entities: {
          companies: [
            { name: 'OpenAI', confidence: 1.0 },
            { name: 'Microsoft', confidence: 0.9 },
          ],
          products: [],
          people: [],
          technologies: [],
        },
        ingested_at: '2026-06-01T14:00:00.000Z',
      }),
      makeItem({
        id: 'test-003',
        source: { name: 'Wired', type: 'tech_media', url: 'https://wired.com/c' },
        topics: [{ label: 'Blockchain', category: 'technology', confidence: 0.7 }],
        sentiment: { overall: 'neutral', score: 0, confidence: 0.9 },
        risk_level: 'low',
        impact: { scope: 'company', time_horizon: 'long_term', category: 'application', significance_score: 4, rationale: 'New tech.' },
        entities: {
          companies: [{ name: 'Microsoft', confidence: 1.0 }],
          products: [],
          people: [],
          technologies: [],
        },
        ingested_at: '2026-06-01T10:00:00.000Z',
      }),
    ];

    const result = aggregator.aggregate(items);

    // Topic frequency: AI appears in 2 items, Model Release 1, Regulation 1, Blockchain 1
    expect(result.topic_frequency).toEqual({
      AI: 2,
      'Model Release': 1,
      Regulation: 1,
      Blockchain: 1,
    });

    // Source distribution
    expect(result.source_distribution).toEqual({
      tech_media: 2,
      official: 1,
    });

    // Sentiment distribution
    expect(result.sentiment_distribution).toEqual({
      positive: 1,
      negative: 1,
      neutral: 1,
    });

    // Risk distribution
    expect(result.risk_distribution).toEqual({
      none: 1,
      high: 1,
      low: 1,
    });

    // Top by significance: 8, 7, 4
    expect(result.top_by_significance).toHaveLength(3);
    expect(result.top_by_significance[0].id).toBe('test-001');
    expect(result.top_by_significance[1].id).toBe('test-002');
    expect(result.top_by_significance[2].id).toBe('test-003');

    // Entity co-occurrence: OpenAI-Microsoft pair (appears in test-002, weight=1)
    expect(result.entity_co_occurrence).toHaveLength(1);
    expect(result.entity_co_occurrence[0].source).toBe('Microsoft');
    expect(result.entity_co_occurrence[0].target).toBe('OpenAI');
    expect(result.entity_co_occurrence[0].weight).toBe(1);
  });

  // -----------------------------------------------------------------------
  // needs_review items
  // -----------------------------------------------------------------------

  test('12. needs_review=true items are still included in statistics', () => {
    const items = [
      makeItem({
        id: 'test-001',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.9 }],
        needs_review: true,
        review_reason: 'Low confidence extraction',
      }),
      makeItem({
        id: 'test-002',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.9 }],
      }),
    ];

    const result = aggregator.aggregate(items);
    // needs_review items should still be counted
    expect(result.topic_frequency).toEqual({ AI: 2 });
    expect(result.top_by_significance).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Topic label case sensitivity
  // -----------------------------------------------------------------------

  test('13. topic labels are case-sensitive (no normalization)', () => {
    const items = [
      makeItem({
        id: 'test-001',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.9 }],
      }),
      makeItem({
        id: 'test-002',
        topics: [{ label: 'ai', category: 'technology', confidence: 0.8 }],
      }),
      makeItem({
        id: 'test-003',
        topics: [{ label: 'AI', category: 'technology', confidence: 0.7 }],
      }),
    ];

    const result = aggregator.aggregate(items);
    // 'ai' and 'AI' are different labels
    expect(result.topic_frequency).toEqual({ AI: 2, ai: 1 });
  });

  // -----------------------------------------------------------------------
  // Items with no companies
  // -----------------------------------------------------------------------

  test('14. items with no companies yield empty entity_co_occurrence', () => {
    const items = [
      makeItem({
        id: 'test-001',
        entities: { companies: [], products: [], people: [], technologies: [] },
      }),
    ];

    const result = aggregator.aggregate(items);
    expect(result.entity_co_occurrence).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Single company yields no co-occurrence pairs
  // -----------------------------------------------------------------------

  test('15. single company per item yields no co-occurrence pairs', () => {
    const items = [
      makeItem({
        id: 'test-001',
        entities: { companies: [{ name: 'OpenAI', confidence: 1.0 }], products: [], people: [], technologies: [] },
      }),
      makeItem({
        id: 'test-002',
        entities: { companies: [{ name: 'OpenAI', confidence: 1.0 }], products: [], people: [], technologies: [] },
      }),
    ];

    const result = aggregator.aggregate(items);
    // Only one company across all items, so no pairs
    expect(result.entity_co_occurrence).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Multiple companies across items
  // -----------------------------------------------------------------------

  test('16. companies across multiple items build co-occurrence correctly', () => {
    const items = [
      makeItem({
        id: 'test-001',
        entities: {
          companies: [
            { name: 'OpenAI', confidence: 1.0 },
            { name: 'Microsoft', confidence: 1.0 },
          ],
          products: [],
          people: [],
          technologies: [],
        },
      }),
      makeItem({
        id: 'test-002',
        entities: {
          companies: [
            { name: 'OpenAI', confidence: 1.0 },
            { name: 'Google', confidence: 1.0 },
          ],
          products: [],
          people: [],
          technologies: [],
        },
      }),
    ];

    const result = aggregator.aggregate(items);

    // Pairs: OpenAI-Microsoft (weight 1), OpenAI-Google (weight 1)
    // No Microsoft-Google pair (they never appear together in the same article)
    expect(result.entity_co_occurrence).toHaveLength(2);

    const pairMap = new Map(result.entity_co_occurrence.map((p) => [`${p.source}-${p.target}`, p.weight]));
    expect(pairMap.get('Microsoft-OpenAI')).toBe(1);
    expect(pairMap.get('Google-OpenAI')).toBe(1);
  });
});
