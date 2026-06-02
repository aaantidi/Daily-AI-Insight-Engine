// =============================================================================
// Tests for HtmlBuilder
// =============================================================================

import { HtmlBuilder } from '../../src/visualize/html-builder.js';
import type { DailyReport, TopEvent, DeepAnalysis, TrendAnalysis, RiskOpportunityPanel } from '../../src/schema/types.js';
import type { GeneratedCharts } from '../../src/visualize/index.js';

// =============================================================================
// Helper — build sample DailyReport for tests
// =============================================================================

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

function makeSampleRiskOpportunity(): RiskOpportunityPanel {
  return {
    risks: [
      {
        description: 'AI 安全漏洞风险增加',
        level: 'high',
        probability: 'medium',
        type: 'systemic',
        related_items: ['test-005'],
        suggested_action: '加强代码审查流程',
      },
    ],
    opportunities: [
      {
        description: 'AI 编程助手市场快速增长',
        category: 'business',
        time_window: 'short_term',
        related_items: ['test-002'],
        rationale: '开发者采用率持续上升',
      },
    ],
    overall_risk_assessment: '整体风险可控，但需关注安全漏洞',
  };
}

function makeSampleTopEvents(): TopEvent[] {
  return [
    {
      rank: 1,
      title: 'OpenAI 发布 GPT-5',
      item_ids: ['1'],
      significance: 9,
      why_important: '标志着大语言模型进入新阶段，推理能力大幅提升',
      key_entities: ['OpenAI', 'GPT-5'],
      sentiment_summary: '正面',
    },
    {
      rank: 2,
      title: 'Anthropic 完成 650 亿美元 H 轮融资',
      item_ids: ['2'],
      significance: 7,
      why_important: 'AI 行业最大融资，估值超越 OpenAI',
      key_entities: ['Anthropic'],
      sentiment_summary: '正面',
    },
    {
      rank: 3,
      title: '欧盟通过新 AI 监管法案修正案',
      item_ids: ['3'],
      significance: 6,
      why_important: '将影响全球 AI 产业合规方向',
      key_entities: ['欧盟'],
      sentiment_summary: '中性',
    },
  ];
}

function makeSampleDeepAnalyses(): DeepAnalysis[] {
  return [
    {
      event_title: 'OpenAI 发布 GPT-5',
      background: 'OpenAI 于 2026 年 6 月 1 日发布了新一代大语言模型 GPT-5',
      key_developments: [
        '推理能力相比 GPT-4 提升 300%',
        '支持多模态输入输出',
        'API 价格降低 50%',
      ],
      impact_analysis: {
        short_term: '竞争对手面临巨大压力，加速产品迭代',
        medium_term: '企业级 AI 应用成本大幅降低',
        affected_parties: ['Google', 'Anthropic', 'AI 应用开发者'],
      },
      related_events: ['Google 推出 Gemini 3', 'MiniMax 发布 M3'],
      expert_perspective: '这是 AI 领域的里程碑事件',
      references: ['https://openai.com/blog/gpt-5'],
    },
  ];
}

function makeSampleReport(): DailyReport {
  return {
    date: '2026-06-01',
    generated_at: '2026-06-01T23:59:00Z',
    dashboard: {
      total_items: 20,
      sentiment_distribution: { positive: 12, neutral: 5, negative: 3 },
      risk_count: 1,
      top_topics: ['大语言模型', 'AI监管', '自动驾驶', 'AI芯片'],
    },
    top_events: makeSampleTopEvents(),
    deep_analyses: makeSampleDeepAnalyses(),
    trend_analysis: makeSampleTrends(),
    risk_opportunity: makeSampleRiskOpportunity(),
    references_index: [
      { id: '1', title: 'OpenAI 发布 GPT-5', source_name: 'OpenAI', source_url: 'https://openai.com/blog/gpt-5' },
      { id: '2', title: 'Anthropic 完成 H 轮融资', source_name: 'TechCrunch', source_url: 'https://techcrunch.com/anthropic-h-round' },
      { id: '3', title: '欧盟 AI 法案修正案', source_name: 'Reuters', source_url: 'https://reuters.com/eu-ai-act-amendment' },
    ],
  };
}

function makeSampleCharts(): GeneratedCharts {
  return {
    topicSummary: `## 📊 今日 AI 话题热度 Top 3 — 2026-06-01

### 🥇 No.1: OpenAI 发布 GPT-5 (显著性: 9/10)
**来源**: OpenAI Blog | **情感**: 正面 | **话题**: 模型发布
**摘要**: OpenAI 发布 GPT-5，推理能力大幅提升
**实体**: OpenAI, GPT-5`,
    sentimentDonut: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500"><text x="300" y="40" text-anchor="middle">情感分布 — 2026-06-01</text></svg>',
    trendRadar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><text x="300" y="40" text-anchor="middle">四维趋势雷达 — 2026-06-01</text></svg>',
    eventTimeline: `timeline
    title 今日 AI 显著事件时间线 — 2026-06-01
    09:00 : 🔴 OpenAI 发布 GPT-5 (9/10)`,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('HtmlBuilder', () => {
  const builder = new HtmlBuilder();
  const report = makeSampleReport();
  const charts = makeSampleCharts();
  const date = '2026-06-01';

  test('buildHtml returns a string starting with <!DOCTYPE html>', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  test('does not contain removed topicSummary elements', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).not.toContain('topic-summary');
    expect(html).not.toContain('topic-content');
  });

  test('contains the date in the title tag', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('<title>AI 分析日报 — 2026-06-01</title>');
  });

  test('contains the dashboard div with 4 cards', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('<div class="dashboard">');
    // Should contain all 4 dash-card values
    expect(html).toContain('20');        // total_items
    expect(html).toContain('12+5+3');    // sentiment distribution
    expect(html).toContain('1');         // risk_count
    expect(html).toContain('4');         // topic_count (top_topics.length)
  });

  test('contains Top 3 focus event cards with rank classes', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('class="top-event rank-1"');
    expect(html).toContain('class="top-event rank-2"');
    expect(html).toContain('class="top-event rank-3"');
    // Event titles should be present
    expect(html).toContain('OpenAI 发布 GPT-5');
    expect(html).toContain('Anthropic 完成 650 亿美元 H 轮融资');
    expect(html).toContain('欧盟通过新 AI 监管法案修正案');
    // Significance scores
    expect(html).toContain('重要性: 9/10');
    expect(html).toContain('重要性: 7/10');
    // Why important
    expect(html).toContain('标志着大语言模型进入新阶段');
  });

  test('contains inline SVG charts', () => {
    const html = builder.buildHtml(report, charts, date);
    // sentimentDonut SVG should be inlined
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500"><text');
    expect(html).toContain('情感分布 — 2026-06-01');
    // trendRadar SVG should be inlined
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><text');
    expect(html).toContain('四维趋势雷达 — 2026-06-01');
  });

  test('empty top_events and deep_analyses does not crash', () => {
    const emptyReport: DailyReport = {
      date: '2026-06-01',
      generated_at: '2026-06-01T23:59:00Z',
      dashboard: {
        total_items: 0,
        sentiment_distribution: { positive: 0, neutral: 0, negative: 0 },
        risk_count: 0,
        top_topics: [],
      },
      top_events: [],
      deep_analyses: [],
      trend_analysis: makeSampleTrends(),
      risk_opportunity: {
        risks: [],
        opportunities: [],
        overall_risk_assessment: '',
      },
      references_index: [],
    };
    const emptyCharts: GeneratedCharts = {
      topicSummary: '',
      sentimentDonut: '',
      trendRadar: '',
      eventTimeline: '',
    };

    const html = builder.buildHtml(emptyReport, emptyCharts, date);
    // Verify graceful fallback text
    expect(html).toContain('暂无焦点事件数据');
    expect(html).toContain('暂无深度分析数据');
    expect(html).toContain('暂无风险数据');
    expect(html).toContain('暂无机会数据');
    expect(html).toContain('暂无引用数据');
    // Must still be a valid HTML shell
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.endsWith('</html>')).toBe(true);
  });

  test('HTML ends with </html>', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html.endsWith('</html>')).toBe(true);
  });

  test('contains trend grid with 4 dimension cards', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('class="trend-grid"');
    // Dimension labels
    expect(html).toContain('技术');
    expect(html).toContain('应用');
    expect(html).toContain('政策');
    expect(html).toContain('资本');
    // Overall narrative
    expect(html).toContain('AI行业呈现多维度快速发展态势');
  });

  test('contains risk and opportunity sections with Chinese labels', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('AI 安全漏洞风险增加');
    expect(html).toContain('AI 编程助手市场快速增长');
    expect(html).toContain('[HIGH]');
    // Chinese translation for probability
    expect(html).toContain('概率: 中');
    // Chinese translation for risk type
    expect(html).toContain('类型: 系统性');
    // Chinese translation for opportunity category
    expect(html).toContain('类别: 商业');
    // Chinese translation for time window
    expect(html).toContain('时间窗口: 短期');
  });

  test('contains appendix table with reference data (2 columns: title, source)', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>标题</th>');
    expect(html).toContain('<th>来源</th>');
    expect(html).not.toContain('<th>ID</th>');
    expect(html).not.toContain('<th>链接</th>');
    expect(html).toContain('OpenAI 发布 GPT-5');
    expect(html).toContain('Anthropic 完成 H 轮融资');
    // Source URL should appear as clickable link in href attribute
    expect(html).toContain('href="https://openai.com/blog/gpt-5"');
    expect(html).toContain('href="https://techcrunch.com/anthropic-h-round"');
    // Link text is source_name, not URL
    expect(html).toContain('>OpenAI</a>');
    expect(html).toContain('>TechCrunch</a>');
  });

  test('contains footer', () => {
    const html = builder.buildHtml(report, charts, date);
    expect(html).toContain('class="footer"');
    expect(html).toContain('Daily AI Insight Engine');
  });
});
