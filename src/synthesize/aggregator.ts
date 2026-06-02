// =============================================================================
// M3 SYNTHESIZE — StatsAggregator: 纯统计聚合（无 AI）
// =============================================================================

import { StructuredInsightItem, AggregationStats } from '../schema/types';

/**
 * StatsAggregator — 对结构化洞察数据进行统计聚合
 *
 * 所有计算均为纯 TypeScript，禁止调用任何 AI/LLM。
 */
export class StatsAggregator {
  /**
   * 单次调用: 对所有结构化数据进行统计聚合
   */
  aggregate(items: StructuredInsightItem[]): AggregationStats {
    return {
      topic_frequency: this.countTopics(items),
      source_distribution: this.countSources(items),
      sentiment_distribution: this.countSentiments(items),
      risk_distribution: this.countRisks(items),
      top_by_significance: this.topByScore(items),
      entity_co_occurrence: this.coOccurrence(items),
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * 话题频次 — 遍历 items 中所有 topics，按 label 聚合计数
   */
  private countTopics(items: StructuredInsightItem[]): Record<string, number> {
    const freq: Record<string, number> = {};
    for (const item of items) {
      for (const topic of item.topics) {
        const label = topic.label;
        freq[label] = (freq[label] ?? 0) + 1;
      }
    }
    return freq;
  }

  /**
   * 来源分布 — 按 source.type 聚合
   */
  private countSources(items: StructuredInsightItem[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const item of items) {
      const type = item.source.type;
      dist[type] = (dist[type] ?? 0) + 1;
    }
    return dist;
  }

  /**
   * 情感分布 — 按 sentiment.overall 聚合
   */
  private countSentiments(items: StructuredInsightItem[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const item of items) {
      const overall = item.sentiment.overall;
      dist[overall] = (dist[overall] ?? 0) + 1;
    }
    return dist;
  }

  /**
   * 风险分布 — 按 risk_level 聚合
   */
  private countRisks(items: StructuredInsightItem[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const item of items) {
      const level = item.risk_level;
      dist[level] = (dist[level] ?? 0) + 1;
    }
    return dist;
  }

  /**
   * 显著性 Top-10 — 按 impact.significance_score 降序排列，取前 10
   */
  private topByScore(
    items: StructuredInsightItem[],
  ): Array<{ id: string; title: string; score: number; published_at: string }> {
    return items
      .slice()
      .sort((a, b) => b.impact.significance_score - a.impact.significance_score)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        title: item.title,
        score: item.impact.significance_score,
        published_at: item.ingested_at,
      }));
  }

  /**
   * 实体共现 — 基于 entities.companies，构建共现对（同一 news 中出现的两两配对）
   * weight 为共同出现次数。对按 source-target 字母序排列。
   */
  private coOccurrence(
    items: StructuredInsightItem[],
  ): Array<{ source: string; target: string; weight: number }> {
    const pairMap = new Map<string, number>();

    for (const item of items) {
      const companies = item.entities.companies.map((c) => c.name).sort();
      // 只有 >= 2 个公司时才会产生共现对
      for (let i = 0; i < companies.length; i++) {
        for (let j = i + 1; j < companies.length; j++) {
          const key = `${companies[i]}||${companies[j]}`;
          pairMap.set(key, (pairMap.get(key) ?? 0) + 1);
        }
      }
    }

    // 转成输出格式，按字母序排列
    const result = Array.from(pairMap.entries())
      .map(([key, weight]) => {
        const [source, target] = key.split('||');
        return { source, target, weight };
      })
      .sort((a, b) => {
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        return a.target.localeCompare(b.target);
      });

    return result;
  }
}
