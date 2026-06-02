import { SvgGenerator } from '../../src/visualize/svg-generator.js';
import { MermaidGenerator } from '../../src/visualize/mermaid-generator.js';
import { generateAllCharts } from '../../src/visualize/index.js';
import type { AggregationStats, TrendAnalysis, StructuredInsightItem } from '../../src/schema/types.js';

// =============================================================================
// Helper — build sample data for tests
// =============================================================================

function makeSampleStats(): AggregationStats {
  return {
    topic_frequency: {
      '大语言模型': 8,
      'AI监管': 5,
      '自动驾驶': 4,
      'AI芯片': 3,
      '计算机视觉': 3,
      '自然语言处理': 2,
      'AI医疗': 2,
      'AI安全': 1,
      '边缘计算': 1,
      '机器人': 1,
      '量子计算': 1,
    },
    source_distribution: { tech_media: 10, official: 5, social_media: 3 },
    sentiment_distribution: { positive: 12, neutral: 5, negative: 3 },
    risk_distribution: { none: 10, low: 5, medium: 3, high: 1, critical: 1 },
    top_by_significance: [
      { id: '1', title: 'OpenAI 发布 GPT-5', score: 9, published_at: '2026-06-01T09:00:00Z' },
      { id: '2', title: 'Google 推出 Gemini 3', score: 6, published_at: '2026-06-01T10:30:00Z' },
      { id: '3', title: '某公司完成 A 轮融资', score: 3, published_at: '2026-06-01T14:00:00Z' },
    ],
    entity_co_occurrence: [
      { source: 'OpenAI', target: 'Microsoft', weight: 3 },
      { source: 'OpenAI', target: 'GPT-5', weight: 2 },
      { source: 'Microsoft', target: 'Azure', weight: 2 },
    ],
  };
}

function makeSampleTrends(): TrendAnalysis {
  return {
    technology: {
      trend: '多模态模型成为主流',
      confidence: 0.85,
      supporting_items: ['GPT-5 发布', 'Gemini 3 发布'],
      signals: ['越来越多的产品集成多模态能力'],
    },
    application: {
      trend: 'AI编程助手普及',
      confidence: 0.72,
      supporting_items: ['GitHub Copilot 升级'],
      signals: ['开发者采用率持续上升'],
    },
    policy: {
      trend: '全球AI监管加速',
      confidence: 0.63,
      supporting_items: ['EU AI Act 实施'],
      signals: ['多国发布AI监管草案'],
    },
    capital: {
      trend: 'AI基础设施投资激增',
      confidence: 0.78,
      supporting_items: ['数据中心投资增加'],
      signals: ['GPU需求旺盛'],
    },
    overall_narrative: '2026年6月，AI行业呈现多维度快速发展态势。',
    uncertainties: ['监管政策可能影响发展速度', '算力成本波动'],
  };
}

function makeSampleItems(): StructuredInsightItem[] {
  return [
    {
      id: 'test-001',
      ingested_at: '2026-06-01T08:00:00Z',
      source: { name: 'TechCrunch', type: 'tech_media' as const, url: 'https://techcrunch.com/test-001' },
      title: 'NVIDIA 发布 Nemotron 3 Ultra',
      title_zh: null,
      abstract: 'NVIDIA 在 Computex 2026 发布 Nemotron 3 Ultra，500-550B 参数，推理速度提升 5 倍。',
      entities: {
        companies: [{ name: 'NVIDIA', confidence: 1 }],
        products: [{ name: 'Nemotron 3 Ultra', confidence: 1 }],
        people: [{ name: 'Jensen Huang', confidence: 0.9 }],
        technologies: [{ name: 'NVFP4', confidence: 0.8 }, { name: 'MoE', confidence: 0.7 }],
      },
      topics: [
        { label: '模型发布', category: 'technology' as const, confidence: 1 },
        { label: '技术突破', category: 'technology' as const, confidence: 0.9 },
      ],
      category: { primary: 'technology', secondary: null, confidence: 0.95 },
      sentiment: { overall: 'positive' as const, score: 0.8, confidence: 0.9 },
      risk_level: 'none' as const,
      risk_rationale: null,
      impact: {
        scope: 'global' as const,
        time_horizon: 'short_term' as const,
        category: 'technology' as const,
        significance_score: 8,
        rationale: '重大技术突破',
      },
      extraction_confidence: 0.92,
      needs_review: false,
      review_reason: null,
    },
    {
      id: 'test-002',
      ingested_at: '2026-06-01T09:00:00Z',
      source: { name: 'AI 早报', type: 'tech_media' as const, url: 'https://example.com/test-002' },
      title: 'Anthropic 完成 650 亿美元 H 轮融资',
      title_zh: null,
      abstract: 'Anthropic 以 9650 亿美元估值完成 H 轮融资，超越 OpenAI 估值。',
      entities: {
        companies: [{ name: 'Anthropic', confidence: 1 }, { name: 'OpenAI', confidence: 0.8 }],
        products: [],
        people: [],
        technologies: [],
      },
      topics: [
        { label: '融资', category: 'capital' as const, confidence: 1 },
        { label: '估值竞争', category: 'capital' as const, confidence: 0.85 },
      ],
      category: { primary: 'capital', secondary: null, confidence: 0.9 },
      sentiment: { overall: 'positive' as const, score: 0.7, confidence: 0.85 },
      risk_level: 'low' as const,
      risk_rationale: null,
      impact: {
        scope: 'global' as const,
        time_horizon: 'medium_term' as const,
        category: 'capital' as const,
        significance_score: 9,
        rationale: 'AI 行业最大融资',
      },
      extraction_confidence: 0.88,
      needs_review: false,
      review_reason: null,
    },
    {
      id: 'test-003',
      ingested_at: '2026-06-01T10:00:00Z',
      source: { name: 'The Verge', type: 'tech_media' as const, url: 'https://example.com/test-003' },
      title: 'MiniMax 发布 M3 通用模型',
      title_zh: null,
      abstract: 'MiniMax 发布 M3 通用大模型，多项基准测试超越 GPT-4o。',
      entities: {
        companies: [{ name: 'MiniMax', confidence: 1 }],
        products: [{ name: 'M3', confidence: 1 }],
        people: [],
        technologies: [],
      },
      topics: [
        { label: '模型发布', category: 'technology' as const, confidence: 1 },
      ],
      category: { primary: 'technology', secondary: null, confidence: 0.92 },
      sentiment: { overall: 'positive' as const, score: 0.75, confidence: 0.88 },
      risk_level: 'none' as const,
      risk_rationale: null,
      impact: {
        scope: 'global' as const,
        time_horizon: 'short_term' as const,
        category: 'technology' as const,
        significance_score: 7,
        rationale: '国产模型重大突破',
      },
      extraction_confidence: 0.9,
      needs_review: false,
      review_reason: null,
    },
    {
      id: 'test-004',
      ingested_at: '2026-06-01T11:00:00Z',
      source: { name: 'Reuters', type: 'tech_media' as const, url: 'https://example.com/test-004' },
      title: '欧盟通过新 AI 监管法案修正案',
      title_zh: null,
      abstract: '欧盟议会通过 AI 法案修正案，加强对高风险 AI 系统的监管要求。',
      entities: {
        companies: [],
        products: [],
        people: [],
        technologies: [],
      },
      topics: [
        { label: 'AI监管', category: 'policy' as const, confidence: 1 },
        { label: '法规', category: 'policy' as const, confidence: 0.9 },
      ],
      category: { primary: 'policy', secondary: null, confidence: 0.85 },
      sentiment: { overall: 'neutral' as const, score: 0.1, confidence: 0.8 },
      risk_level: 'medium' as const,
      risk_rationale: '监管趋严可能影响行业发展',
      impact: {
        scope: 'regional' as const,
        time_horizon: 'long_term' as const,
        category: 'policy' as const,
        significance_score: 6,
        rationale: '影响欧洲 AI 产业',
      },
      extraction_confidence: 0.85,
      needs_review: false,
      review_reason: null,
    },
    {
      id: 'test-005',
      ingested_at: '2026-06-01T12:00:00Z',
      source: { name: 'Wired', type: 'tech_media' as const, url: 'https://example.com/test-005' },
      title: 'AI 生成代码引发安全漏洞担忧',
      title_zh: null,
      abstract: '研究发现 AI 辅助编程工具生成的代码中存在大量安全漏洞。',
      entities: {
        companies: [{ name: 'GitHub', confidence: 0.9 }],
        products: [{ name: 'Copilot', confidence: 0.95 }],
        people: [],
        technologies: [],
      },
      topics: [
        { label: 'AI安全', category: 'technology' as const, confidence: 1 },
        { label: '代码生成', category: 'application' as const, confidence: 0.85 },
      ],
      category: { primary: 'technology', secondary: 'application', confidence: 0.8 },
      sentiment: { overall: 'negative' as const, score: -0.6, confidence: 0.85 },
      risk_level: 'high' as const,
      risk_rationale: '广泛使用的工具存在安全隐患',
      impact: {
        scope: 'global' as const,
        time_horizon: 'immediate' as const,
        category: 'application' as const,
        significance_score: 5,
        rationale: '影响开发者生态系统',
      },
      extraction_confidence: 0.82,
      needs_review: false,
      review_reason: null,
    },
  ];
}

// =============================================================================
// SVG — generateTopicBarChart
// =============================================================================

describe.skip('SvgGenerator.generateTopicBarChart (legacy)', () => {
  const gen = new SvgGenerator();

  test('returns a valid SVG string starting with <svg and ending with </svg>', () => {
    const svg = gen.generateTopicBarChart({ '大语言模型': 8, 'AI监管': 5 }, '2026-06-01');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  test('SVG contains xmlns and viewBox attributes', () => {
    const svg = gen.generateTopicBarChart({ '大语言模型': 8 }, '2026-06-01');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="');
  });

  test('bar chart title contains the date', () => {
    const svg = gen.generateTopicBarChart({ '大语言模型': 8 }, '2026-06-01');
    expect(svg).toContain('2026-06-01');
  });

  test('bar chart contains data source note', () => {
    const svg = gen.generateTopicBarChart({ '大语言模型': 8 }, '2026-06-01');
    expect(svg).toContain('数据来源');
  });

  test('bars are sorted in descending order (first bar wider than second)', () => {
    const svg = gen.generateTopicBarChart({ '话题A': 10, '话题B': 5, '话题C': 2 }, '2026-06-01');
    // The first bar should have a larger width value than the second
    const barWidths: number[] = [];
    // Match width="..." in rect elements
    const rectRegex = /<rect[^>]*width="([\d.]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = rectRegex.exec(svg)) !== null) {
      barWidths.push(parseFloat(match[1]));
    }
    expect(barWidths.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < barWidths.length; i++) {
      expect(barWidths[i]).toBeLessThanOrEqual(barWidths[i - 1]);
    }
  });

  test('generates at least 5 bars when topN is default (10) and enough data exists', () => {
    const stats = makeSampleStats();
    const svg = gen.generateTopicBarChart(stats.topic_frequency, '2026-06-01');
    // Count rect elements (should have at least 5 for the data)
    const rectCount = (svg.match(/<rect[^>]*>/g) || []).length;
    // At least 5 bars plus possible grid lines — ensure enough rects exist
    expect(rectCount).toBeGreaterThanOrEqual(5);
  });

  test('empty data does not crash, returns valid SVG', () => {
    const svg = gen.generateTopicBarChart({}, '2026-06-01');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  test('when N < topN, displays actual number of bars', () => {
    const svg = gen.generateTopicBarChart({ '话题A': 5 }, '2026-06-01', 10);
    // Should have exactly 1 data bar
    const barMatch = svg.match(/role="bar"/g) || [];
    expect(barMatch.length).toBe(1);
  });

  test('topN parameter limits visible bars', () => {
    const data: Record<string, number> = {};
    for (let i = 1; i <= 15; i++) {
      data[`话题${i}`] = 16 - i;
    }
    const svg = gen.generateTopicBarChart(data, '2026-06-01', 5);
    const barMatch = svg.match(/role="bar"/g) || [];
    expect(barMatch.length).toBe(5);
  });
});

// =============================================================================
// Markdown — generateTopicSummary
// =============================================================================

describe('SvgGenerator.generateTopicSummary', () => {
  const gen = new SvgGenerator();

  test('returns a non-empty Markdown string starting with ##', () => {
    const items = makeSampleItems();
    const md = gen.generateTopicSummary(items, '2026-06-01');
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
    expect(md.startsWith('##')).toBe(true);
  });

  test('contains the date and Top 3 title', () => {
    const md = gen.generateTopicSummary(makeSampleItems(), '2026-06-01');
    expect(md).toContain('2026-06-01');
    expect(md).toContain('Top 3');
  });

  test('contains news titles and significance_score', () => {
    const md = gen.generateTopicSummary(makeSampleItems(), '2026-06-01');
    // Top item by significance (Anthropic 9, NVIDIA 8, MiniMax 7)
    expect(md).toContain('Anthropic 完成 650 亿美元 H 轮融资');
    expect(md).toContain('NVIDIA 发布 Nemotron 3 Ultra');
    expect(md).toContain('MiniMax 发布 M3 通用模型');
    expect(md).toContain('显著性: 9/10');
    expect(md).toContain('显著性: 8/10');
    expect(md).toContain('显著性: 7/10');
  });

  test('contains source, sentiment, and topic metadata', () => {
    const md = gen.generateTopicSummary(makeSampleItems(), '2026-06-01');
    expect(md).toContain('**来源**:');
    expect(md).toContain('TechCrunch');
    expect(md).toContain('**情感**:');
    expect(md).toContain('**话题**:');
    expect(md).toContain('模型发布');
  });

  test('contains abstract and entity information', () => {
    const md = gen.generateTopicSummary(makeSampleItems(), '2026-06-01');
    expect(md).toContain('**摘要**:');
    expect(md).toContain('**实体**:');
    expect(md).toContain('NVIDIA');
    expect(md).toContain('Anthropic');
  });

  test('empty array does not crash and returns valid empty state', () => {
    const md = gen.generateTopicSummary([], '2026-06-01');
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain('暂无话题数据');
  });

  test('when only 1 item is provided, shows exactly 1 item', () => {
    const items = makeSampleItems().slice(0, 1);
    const md = gen.generateTopicSummary(items, '2026-06-01');
    // Should not contain the second item's title
    expect(md).toContain('NVIDIA 发布 Nemotron 3 Ultra');
    expect(md).not.toContain('Anthropic');
    expect(md).toContain('Top 1');
  });

  test('topN parameter limits output to N items', () => {
    const md = gen.generateTopicSummary(makeSampleItems(), '2026-06-01', 2);
    expect(md).toContain('Top 2');
    // top 2 by significance: Anthropic (9), NVIDIA (8)
    expect(md).toContain('Anthropic 完成 650 亿美元 H 轮融资');
    expect(md).toContain('NVIDIA 发布 Nemotron 3 Ultra');
    expect(md).not.toContain('MiniMax 发布 M3 通用模型');
  });

  test('items are sorted by significance_score descending', () => {
    const md = gen.generateTopicSummary(makeSampleItems(), '2026-06-01');
    // Anthropic (score 9) should come before NVIDIA (score 8)
    const anthropicIdx = md.indexOf('Anthropic');
    const nvidiaIdx = md.indexOf('NVIDIA');
    expect(anthropicIdx).toBeLessThan(nvidiaIdx);
    // NVIDIA (score 8) should come before MiniMax (score 7)
    const minimaxIdx = md.indexOf('MiniMax');
    expect(nvidiaIdx).toBeLessThan(minimaxIdx);
  });
});

// =============================================================================
// SVG — generateSentimentDonut
// =============================================================================

describe('SvgGenerator.generateSentimentDonut', () => {
  const gen = new SvgGenerator();

  test('returns a valid SVG string', () => {
    const svg = gen.generateSentimentDonut({ positive: 10, neutral: 5, negative: 3 }, '2026-06-01');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  test('contains arc path (A command) for donut segments', () => {
    const svg = gen.generateSentimentDonut({ positive: 10, neutral: 5, negative: 3 }, '2026-06-01');
    // Arc path contains "A" command
    expect(svg).toContain(' A ');
  });

  test('uses correct colors for sentiment (positive=green, neutral=gray, negative=red)', () => {
    const svg = gen.generateSentimentDonut({ positive: 10, neutral: 5, negative: 3 }, '2026-06-01');
    expect(svg).toContain('#059669');
    expect(svg).toContain('#6B7280');
    expect(svg).toContain('#DC2626');
  });

  test('center displays total count (N=)', () => {
    const svg = gen.generateSentimentDonut({ positive: 10, neutral: 5, negative: 3 }, '2026-06-01');
    expect(svg).toContain('N=');
    // Total should be 10+5+3 = 18
    expect(svg).toContain('18');
  });

  test('handles zero-value category without crashing and shows legend entry', () => {
    const svg = gen.generateSentimentDonut({ positive: 19, neutral: 1, negative: 0 }, '2026-06-01');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Legend should still show the 0-value category
    expect(svg).toContain('负面 (0)');
    // Total should be 19+1+0 = 20
    expect(svg).toContain('N=20');
    // SVG should contain arc paths
    expect(svg).toContain(' A ');
  });
});

// =============================================================================
// SVG — generateTrendRadar
// =============================================================================

describe('SvgGenerator.generateTrendRadar', () => {
  const gen = new SvgGenerator();
  const trends = makeSampleTrends();

  test('returns a valid SVG string', () => {
    const svg = gen.generateTrendRadar(trends, '2026-06-01');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  test('contains four axis labels (技术, 应用, 政策, 资本)', () => {
    const svg = gen.generateTrendRadar(trends, '2026-06-01');
    expect(svg).toContain('技术');
    expect(svg).toContain('应用');
    expect(svg).toContain('政策');
    expect(svg).toContain('资本');
  });

  test('contains data-filled polygon', () => {
    const svg = gen.generateTrendRadar(trends, '2026-06-01');
    // Polygon with fill/stroke
    expect(svg).toContain('<polygon');
  });

  test('data points are positioned correctly with confidence values', () => {
    const svg = gen.generateTrendRadar(trends, '2026-06-01');
    // Should contain the confidence values as text
    expect(svg).toContain('0.85');
    expect(svg).toContain('0.72');
    expect(svg).toContain('0.63');
    expect(svg).toContain('0.78');
  });
});

// =============================================================================
// Mermaid — generateTimeline
// =============================================================================

describe('MermaidGenerator.generateTimeline', () => {
  const gen = new MermaidGenerator();

  test('returns Mermaid timeline code', () => {
    const mermaid = gen.generateTimeline(
      [
        { title: 'Event A', score: 9, published_at: '2026-06-01T09:00:00Z' },
      ],
      '2026-06-01',
    );
    expect(mermaid).toContain('timeline');
    expect(mermaid).toContain('title');
  });

  test('timeline contains event titles', () => {
    const events = makeSampleStats().top_by_significance;
    const mermaid = gen.generateTimeline(events, '2026-06-01');
    expect(mermaid).toContain('OpenAI 发布 GPT-5');
    expect(mermaid).toContain('Google 推出 Gemini 3');
  });

  test('uses correct event markers (🔴🟡🟢) based on score', () => {
    const events = [
      { title: 'High Score', score: 9, published_at: '2026-06-01T09:00:00Z', id: 'h' },
      { title: 'Mid Score', score: 5, published_at: '2026-06-01T10:00:00Z', id: 'm' },
      { title: 'Low Score', score: 2, published_at: '2026-06-01T11:00:00Z', id: 'l' },
    ];
    const mermaid = gen.generateTimeline(events, '2026-06-01');
    expect(mermaid).toContain('🔴');
    expect(mermaid).toContain('🟡');
    expect(mermaid).toContain('🟢');
  });

  test('timeline events are sorted by time', () => {
    const unsorted = [
      { title: 'Late', score: 3, published_at: '2026-06-01T14:00:00Z', id: 'l' },
      { title: 'Early', score: 9, published_at: '2026-06-01T09:00:00Z', id: 'e' },
    ];
    const mermaid = gen.generateTimeline(unsorted, '2026-06-01');
    // Early should appear before Late in the output
    const earlyIdx = mermaid.indexOf('Early');
    const lateIdx = mermaid.indexOf('Late');
    expect(earlyIdx).toBeLessThan(lateIdx);
  });

  test('empty events returns a valid timeline without crashing', () => {
    const mermaid = gen.generateTimeline([], '2026-06-01');
    expect(mermaid).toContain('timeline');
    expect(mermaid).toContain('title');
  });

  test('does not contain outer ```mermaid markers', () => {
    const events = [{ title: 'Test', score: 7, published_at: '2026-06-01T12:00:00Z', id: 't' }];
    const mermaid = gen.generateTimeline(events, '2026-06-01');
    expect(mermaid).not.toContain('```mermaid');
    expect(mermaid).not.toContain('```');
  });
});

// =============================================================================
// Mermaid — generateEntityGraph
// =============================================================================

describe('MermaidGenerator.generateEntityGraph', () => {
  const gen = new MermaidGenerator();

  test('returns Mermaid graph LR code', () => {
    const graph = gen.generateEntityGraph(
      [{ source: 'A', target: 'B', weight: 3 }],
      '2026-06-01',
    );
    expect(graph).toContain('graph LR');
  });

  test('weight >= 3 uses thick arrow ==>', () => {
    const graph = gen.generateEntityGraph(
      [{ source: 'A', target: 'B', weight: 3 }],
      '2026-06-01',
    );
    expect(graph).toContain('==>');
  });

  test('weight = 2 uses thin arrow -->', () => {
    const graph = gen.generateEntityGraph(
      [{ source: 'A', target: 'B', weight: 2 }],
      '2026-06-01',
    );
    expect(graph).toContain('-->');
  });

  test('edge has weight annotation', () => {
    const graph = gen.generateEntityGraph(
      [{ source: 'A', target: 'B', weight: 3 }],
      '2026-06-01',
    );
    expect(graph).toContain('|3次|');
  });

  test('empty co-occurrence returns valid graph', () => {
    const graph = gen.generateEntityGraph([], '2026-06-01');
    expect(graph).toContain('graph LR');
  });
});

// =============================================================================
// Integration — generateAllCharts
// =============================================================================

describe('generateAllCharts', () => {
  const stats = makeSampleStats();
  const trends = makeSampleTrends();
  const items = makeSampleItems();

  test('returns all 4 charts', () => {
    const result = generateAllCharts(stats, trends, items, '2026-06-01');
    expect(result).toHaveProperty('topicSummary');
    expect(result).toHaveProperty('sentimentDonut');
    expect(result).toHaveProperty('trendRadar');
    expect(result).toHaveProperty('eventTimeline');
  });

  test('all charts are non-empty strings', () => {
    const result = generateAllCharts(stats, trends, items, '2026-06-01');
    expect(typeof result.topicSummary).toBe('string');
    expect(result.topicSummary.length).toBeGreaterThan(0);
    expect(typeof result.sentimentDonut).toBe('string');
    expect(result.sentimentDonut.length).toBeGreaterThan(0);
    expect(typeof result.trendRadar).toBe('string');
    expect(result.trendRadar.length).toBeGreaterThan(0);
    expect(typeof result.eventTimeline).toBe('string');
    expect(result.eventTimeline.length).toBeGreaterThan(0);
  });
});
