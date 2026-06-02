// =============================================================================
// M3 SYNTHESIZE — InsightAnalyzer: AI 分析（热点识别 + 深度分析 + 趋势 + 机会风险）
// =============================================================================

import { LLMClient } from '../llm-client';
import {
  StructuredInsightItem, TopEvent, DeepAnalysis, TrendAnalysis,
  RiskOpportunityPanel,
} from '../schema/types';

// =============================================================================
// Types
// =============================================================================

export interface AnalyzerOptions {
  llmClient: LLMClient;
}

export interface TopEventInput {
  topicFrequency: Record<string, number>;
  topBySignificance: StructuredInsightItem[];
}

// =============================================================================
// JSON parsing utility
// =============================================================================

/**
 * 清理 LLM 输出文本并解析为 JSON
 * - 移除 ```json 和 ``` 标记
 * - 移除前后空白
 * - 用 JSON.parse 解析
 */
export function cleanAndParseJson<T>(text: string): T {
  const cleaned = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// =============================================================================
// Prompt builders
// =============================================================================

function buildTopEventsPrompt(stats: TopEventInput): string {
  return `你是一个 AI 日报分析助手。请基于以下统计数据，识别 Top-3 焦点事件。

## 话题频次分布
${JSON.stringify(stats.topicFrequency, null, 2)}

## 高显著性条目
${JSON.stringify(
    stats.topBySignificance.map((item) => ({
      id: item.id,
      title: item.title,
      significance: item.impact.significance_score,
      topics: item.topics.map((t) => t.label),
      entities: item.entities.companies.map((c) => c.name),
      sentiment: item.sentiment.overall,
    })),
    null,
    2,
  )}

请严格按以下 JSON 格式返回 3 个热点事件（rank 从 1 开始）:
[
  {
    "rank": 1,
    "title": "事件标题",
    "item_ids": ["关联文章 ID"],
    "significance": 重要性分数 (1-10),
    "why_important": "为何重要",
    "key_entities": ["关联实体"],
    "sentiment_summary": "情感总结"
  }
]`;
}

function buildAnalyzeEventPrompt(event: TopEvent, relatedItems: StructuredInsightItem[]): string {
  return `你是一个 AI 日报分析助手。请对以下事件进行深度分析。

## 事件
- 标题: ${event.title}
- 重要性: ${event.significance}/10
- 关键实体: ${event.key_entities.join(', ')}
- 情感: ${event.sentiment_summary}
- 为何重要: ${event.why_important}

## 相关信息
${JSON.stringify(
    relatedItems.map((item) => ({
      id: item.id,
      title: item.title,
      abstract: item.abstract,
      entities: item.entities.companies.map((c) => c.name),
    })),
    null,
    2,
  )}

请严格按以下 JSON 格式返回深度分析:
{
  "event_title": "${event.title}",
  "background": "事件背景 (2-3句话)",
  "key_developments": ["关键进展1", "关键进展2"],
  "impact_analysis": {
    "short_term": "短期影响",
    "medium_term": "中期影响",
    "affected_parties": ["受影响方1", "受影响方2"]
  },
  "related_events": ["关联事件"],
  "expert_perspective": "专家视角 (2-3句话)",
  "references": ["参考文章ID"]
}`;
}

function buildTrendsPrompt(
  allItems: StructuredInsightItem[],
  topEvents: TopEvent[],
): string {
  return `你是一个 AI 日报分析助手。请基于以下数据，进行四维趋势推演。

## Top 热点事件
${JSON.stringify(
    topEvents.map((e) => ({
      rank: e.rank,
      title: e.title,
      significance: e.significance,
      entities: e.key_entities,
      sentiment: e.sentiment_summary,
    })),
    null,
    2,
  )}

## 全部条目摘要
${JSON.stringify(
    allItems.map((item) => ({
      id: item.id,
      title: item.title,
      topics: item.topics.map((t) => t.label),
      category: item.category.primary,
      sentiment: item.sentiment.overall,
      entities: item.entities.companies.map((c) => c.name),
      significance: item.impact.significance_score,
    })),
    null,
    2,
  )}

请严格按以下 JSON 格式返回四维趋势推演:
{
  "technology": {
    "trend": "技术趋势描述",
    "confidence": 0.0-1.0,
    "supporting_items": ["支撑条目ID"],
    "signals": ["信号1", "信号2"]
  },
  "application": {
    "trend": "应用趋势描述",
    "confidence": 0.0-1.0,
    "supporting_items": ["支撑条目ID"],
    "signals": ["信号1", "信号2"]
  },
  "policy": {
    "trend": "政策趋势描述",
    "confidence": 0.0-1.0,
    "supporting_items": ["支撑条目ID"],
    "signals": ["信号1", "信号2"]
  },
  "capital": {
    "trend": "资本趋势描述",
    "confidence": 0.0-1.0,
    "supporting_items": ["支撑条目ID"],
    "signals": ["信号1", "信号2"]
  },
  "overall_narrative": "整体叙事",
  "uncertainties": ["不确定性1", "不确定性2"]
}`;
}

function buildRisksOpportunitiesPrompt(
  allItems: StructuredInsightItem[],
  trends: TrendAnalysis,
): string {
  return `你是一个 AI 日报分析助手。请基于以下数据，识别机会与风险。

## 趋势推演
${JSON.stringify(trends, null, 2)}

## 全部条目摘要
${JSON.stringify(
    allItems
      .filter((item) => item.risk_level === 'medium' || item.risk_level === 'high' || item.risk_level === 'critical')
      .map((item) => ({
        id: item.id,
        title: item.title,
        risk_level: item.risk_level,
        risk_rationale: item.risk_rationale,
        entities: item.entities.companies.map((c) => c.name),
      })),
    null,
    2,
  )}

请严格按以下 JSON 格式返回机会与风险分析:
{
  "risks": [
    {
      "description": "风险描述",
      "level": "medium|high|critical",
      "probability": "low|medium|high",
      "type": "quantifiable|systemic",
      "related_items": ["关联条目ID"],
      "suggested_action": "建议行动"
    }
  ],
  "opportunities": [
    {
      "description": "机会描述",
      "category": "technology|business|policy",
      "time_window": "immediate|short_term|medium_term",
      "related_items": ["关联条目ID"],
      "rationale": "理由"
    }
  ],
  "overall_risk_assessment": "整体风险评估"
}`;
}

// =============================================================================
// InsightAnalyzer
// =============================================================================

/**
 * InsightAnalyzer — 基于 LLM 的洞察分析
 *
 * 所有方法接收结构化数据，构造 prompt 调用 LLM，解析 JSON 输出。
 */
export class InsightAnalyzer {
  constructor(private readonly options: AnalyzerOptions) {}

  private get llm(): LLMClient {
    return this.options.llmClient;
  }

  // =========================================================================
  // Phase B: 基于统计数据识别 Top-3 热点
  // =========================================================================

  async identifyTopEvents(stats: TopEventInput): Promise<TopEvent[]> {
    try {
      const prompt = buildTopEventsPrompt(stats);
      const response = await this.llm.send(prompt);
      const parsed = cleanAndParseJson<TopEvent[]>(response.content);
      return parsed;
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Phase C: 对单个热点进行深度分析
  // =========================================================================

  async analyzeEvent(
    event: TopEvent,
    relatedItems: StructuredInsightItem[],
  ): Promise<DeepAnalysis> {
    try {
      const prompt = buildAnalyzeEventPrompt(event, relatedItems);
      const response = await this.llm.send(prompt);
      const parsed = cleanAndParseJson<DeepAnalysis>(response.content);
      return parsed;
    } catch {
      // 返回带事件标题的 fallback
      return {
        event_title: event.title,
        background: '',
        key_developments: [],
        impact_analysis: {
          short_term: '',
          medium_term: '',
          affected_parties: [],
        },
        related_events: [],
        expert_perspective: '',
        references: [],
      };
    }
  }

  // =========================================================================
  // Phase D: 四维趋势推演
  // =========================================================================

  async analyzeTrends(
    allItems: StructuredInsightItem[],
    topEvents: TopEvent[],
  ): Promise<TrendAnalysis> {
    try {
      const prompt = buildTrendsPrompt(allItems, topEvents);
      const response = await this.llm.send(prompt);
      const parsed = cleanAndParseJson<TrendAnalysis>(response.content);
      return parsed;
    } catch {
      return {
        technology: { trend: '', confidence: 0, supporting_items: [], signals: [] },
        application: { trend: '', confidence: 0, supporting_items: [], signals: [] },
        policy: { trend: '', confidence: 0, supporting_items: [], signals: [] },
        capital: { trend: '', confidence: 0, supporting_items: [], signals: [] },
        overall_narrative: '',
        uncertainties: [],
      };
    }
  }

  // =========================================================================
  // Phase E: 机会与风险识别
  // =========================================================================

  async identifyRisksAndOpportunities(
    allItems: StructuredInsightItem[],
    trends: TrendAnalysis,
  ): Promise<RiskOpportunityPanel> {
    try {
      const prompt = buildRisksOpportunitiesPrompt(allItems, trends);
      const response = await this.llm.send(prompt);
      const parsed = cleanAndParseJson<RiskOpportunityPanel>(response.content);
      return parsed;
    } catch {
      return {
        risks: [],
        opportunities: [],
        overall_risk_assessment: '无法生成风险评估。',
      };
    }
  }
}
