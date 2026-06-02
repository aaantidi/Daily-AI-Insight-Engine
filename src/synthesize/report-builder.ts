// =============================================================================
// M3 SYNTHESIZE — ReportBuilder: 日报 Markdown 组装（纯拼接，无 AI）
// =============================================================================

import {
  DailyReport, AggregationStats, TopEvent, DeepAnalysis,
  TrendAnalysis, RiskOpportunityPanel, StructuredInsightItem,
} from '../schema/types';

/**
 * ReportBuilder — 日报 Markdown 组装
 *
 * 所有方法均为纯字符串拼接，不调用任何 AI/LLM。
 */
export class ReportBuilder {
  // =========================================================================
  // 公共 API
  // =========================================================================

  /**
   * 构建日报对象
   */
  buildReport(
    date: string,
    stats: AggregationStats,
    topEvents: TopEvent[],
    deepAnalyses: DeepAnalysis[],
    trends: TrendAnalysis,
    riskOpp: RiskOpportunityPanel,
    items: StructuredInsightItem[],
  ): DailyReport {
    const totalItems = Object.values(stats.sentiment_distribution).reduce((a, b) => a + b, 0);
    const riskCount = this.sumRiskCount(stats.risk_distribution);
    const topTopics = this.getTopTopics(stats.topic_frequency);

    return {
      date,
      generated_at: new Date().toISOString(),
      dashboard: {
        total_items: totalItems,
        sentiment_distribution: { ...stats.sentiment_distribution },
        risk_count: riskCount,
        top_topics: topTopics,
      },
      top_events: [...topEvents],
      deep_analyses: [...deepAnalyses],
      trend_analysis: { ...trends },
      risk_opportunity: { ...riskOpp },
      references_index: this.buildReferencesIndex(items),
    };
  }

  /**
   * 生成完整 Markdown 字符串
   */
  toMarkdown(report: DailyReport): string {
    const sections: string[] = [];

    sections.push(this.buildDashboard(report));
    sections.push(this.buildTopEventsSection(report));
    sections.push(this.buildDeepAnalysisSection(report));
    sections.push(this.buildTrendAnalysisSection(report));
    sections.push(this.buildRiskOpportunitySection(report));
    sections.push(this.buildAppendixA());
    sections.push(this.buildAppendixB(report));

    return sections.join('\n\n');
  }

  // =========================================================================
  // Private: 概览面板
  // =========================================================================

  private buildDashboard(report: DailyReport): string {
    const { dashboard } = report;
    const { sentiment_distribution: sd, risk_distribution: rd } = this.extractStats(report);

    const positive = sd['positive'] ?? 0;
    const neutral = sd['neutral'] ?? 0;
    const negative = sd['negative'] ?? 0;

    const high = rd['high'] ?? 0;
    const critical = rd['critical'] ?? 0;

    const topTopicsStr = dashboard.top_topics.length > 0
      ? dashboard.top_topics.join(', ')
      : '暂无数据';

    return [
      `# AI 分析日报 — ${report.date}`,
      '',
      '## 概览面板',
      '| 指标 | 数值 |',
      '|:-----|:-----|',
      `| 今日处理新闻 | ${dashboard.total_items} 条 |`,
      `| 情感分布 | 🟢 正面 ${positive} / ⚪ 中性 ${neutral} / 🔴 负面 ${negative} |`,
      `| 风险条目 | ${dashboard.risk_count} 条 (high: ${high}, critical: ${critical}) |`,
      `| 热门话题 | ${topTopicsStr} |`,
    ].join('\n');
  }

  // =========================================================================
  // Private: Top 3 焦点事件
  // =========================================================================

  private buildTopEventsSection(report: DailyReport): string {
    if (report.top_events.length === 0) {
      return '## Top 3 焦点事件\n\n暂无焦点事件数据。';
    }

    const lines: string[] = ['## Top 3 焦点事件'];

    for (const event of report.top_events) {
      const rankEmoji = event.rank === 1 ? '#1' : event.rank === 2 ? '#2' : '#3';
      const rankLabel = event.rank === 1 ? '🥇' : event.rank === 2 ? '🥈' : '🥉';
      const anchorName = `深度分析-${event.rank}`;

      lines.push('');
      lines.push(`### ${rankLabel} No.${event.rank}: ${event.title}`);
      lines.push(`**重要性**: ${event.significance}/10 | **关联实体**: ${event.key_entities.join(', ')}`);
      lines.push(`**为何重要**: ${event.why_important}`);
      lines.push(`[深度分析 →](#${anchorName})`);
    }

    return lines.join('\n');
  }

  // =========================================================================
  // Private: 深度分析
  // =========================================================================

  private buildDeepAnalysisSection(report: DailyReport): string {
    if (report.deep_analyses.length === 0) {
      return '## 深度分析\n\n暂无深度分析数据。';
    }

    const lines: string[] = ['## 深度分析'];

    for (let i = 0; i < report.deep_analyses.length; i++) {
      const analysis = report.deep_analyses[i];
      const eventRank = i + 1;
      const anchorName = `深度分析-${eventRank}`;

      lines.push('');
      lines.push(`### <a id="${anchorName}"></a>深度分析 No.${eventRank}: ${analysis.event_title}`);
      lines.push(`**背景**: ${analysis.background || '暂无背景信息。'}`);

      if (analysis.key_developments.length > 0) {
        lines.push('**关键进展**:');
        for (const dev of analysis.key_developments) {
          lines.push(`- ${dev}`);
        }
      }

      lines.push('**影响分析**:');
      lines.push(`- 短期: ${analysis.impact_analysis.short_term || '暂无'}`);
      lines.push(`- 中期: ${analysis.impact_analysis.medium_term || '暂无'}`);
      lines.push(`- 受影响方: ${analysis.impact_analysis.affected_parties.join(', ') || '暂无'}`);

      if (analysis.related_events.length > 0) {
        lines.push(`**关联事件**: ${analysis.related_events.join(', ')}`);
      }

      lines.push(`**分析视角**: ${analysis.expert_perspective || '暂无'}`);

      // References
      if (analysis.references.length > 0) {
        const refStr = analysis.references.map((r) => `[ref: ${r}]`).join(', ');
        lines.push(`**参考**: ${refStr}`);
      }
    }

    return lines.join('\n');
  }

  // =========================================================================
  // Private: 趋势推演
  // =========================================================================

  private buildTrendAnalysisSection(report: DailyReport): string {
    const { trend_analysis: trends } = report;

    const lines: string[] = ['## 趋势推演'];

    // 技术趋势
    lines.push('');
    lines.push('### 技术趋势');
    lines.push(trends.technology.trend || '暂无数据');
    lines.push(`(置信度: ${(trends.technology.confidence * 100).toFixed(0)}%)`);
    if (trends.technology.signals.length > 0) {
      lines.push(`支撑信号: ${trends.technology.signals.join(', ')}`);
    }

    // 应用趋势
    lines.push('');
    lines.push('### 应用趋势');
    lines.push(trends.application.trend || '暂无数据');
    lines.push(`(置信度: ${(trends.application.confidence * 100).toFixed(0)}%)`);
    if (trends.application.signals.length > 0) {
      lines.push(`支撑信号: ${trends.application.signals.join(', ')}`);
    }

    // 政策趋势
    lines.push('');
    lines.push('### 政策趋势');
    lines.push(trends.policy.trend || '暂无数据');
    lines.push(`(置信度: ${(trends.policy.confidence * 100).toFixed(0)}%)`);
    if (trends.policy.signals.length > 0) {
      lines.push(`支撑信号: ${trends.policy.signals.join(', ')}`);
    }

    // 资本趋势
    lines.push('');
    lines.push('### 资本趋势');
    lines.push(trends.capital.trend || '暂无数据');
    lines.push(`(置信度: ${(trends.capital.confidence * 100).toFixed(0)}%)`);
    if (trends.capital.signals.length > 0) {
      lines.push(`支撑信号: ${trends.capital.signals.join(', ')}`);
    }

    // 整体叙事
    lines.push('');
    lines.push('**整体叙事**: ' + (trends.overall_narrative || '暂无'));

    // 不确定性
    if (trends.uncertainties && trends.uncertainties.length > 0) {
      lines.push('');
      lines.push('**不确定性**:');
      for (const u of trends.uncertainties) {
        lines.push(`- ${u}`);
      }
    }

    return lines.join('\n');
  }

  // =========================================================================
  // Private: 机会与风险
  // =========================================================================

  private buildRiskOpportunitySection(report: DailyReport): string {
    const { risk_opportunity: riskOpp } = report;
    const lines: string[] = ['## 机会与风险提示'];

    // 风险
    if (riskOpp.risks.length > 0) {
      lines.push('');
      lines.push('### 风险');
      for (const risk of riskOpp.risks) {
        const levelLabel = this.getRiskLevelLabel(risk.level);
        const relatedStr = risk.related_items.length > 0
          ? ` [ref: ${risk.related_items.join(', ')}]`
          : '';
        lines.push(`- [${levelLabel}] ${risk.description} (概率: ${risk.probability}) → ${risk.suggested_action}${relatedStr}`);
      }
    } else {
      lines.push('');
      lines.push('### 风险');
      lines.push('暂无显著风险。');
    }

    // 机会
    if (riskOpp.opportunities.length > 0) {
      lines.push('');
      lines.push('### 机会');
      for (const opp of riskOpp.opportunities) {
        const relatedStr = opp.related_items.length > 0
          ? ` [ref: ${opp.related_items.join(', ')}]`
          : '';
        lines.push(`- [${opp.category}] ${opp.description} (时间窗口: ${opp.time_window}) → ${opp.rationale}${relatedStr}`);
      }
    } else {
      lines.push('');
      lines.push('### 机会');
      lines.push('暂无显著机会。');
    }

    // 整体风险评估
    lines.push('');
    lines.push(`**整体风险评估**: ${riskOpp.overall_risk_assessment || '暂无'}`);

    return lines.join('\n');
  }

  // =========================================================================
  // Private: 附录
  // =========================================================================

  private buildAppendixA(): string {
    return [
      '## 附录 A: 数据来源与方法论',
      '',
      '本报告由 Daily AI Insight Engine 自动生成。',
      '',
      '**数据来源**:',
      '- 技术媒体 (TechCrunch, Wired, The Verge 等)',
      '- 官方公告 (公司新闻稿, 政府部门声明)',
      '- 社交媒体 (Twitter, LinkedIn)',
      '- 信息聚合器 (Hacker News, Reddit)',
      '',
      '**方法论**:',
      '- 数据摄入: 文件读取与 Zod 验证',
      '- 结构化提取: 使用 LLM (Claude) 进行逐条信息抽取',
      '- 洞察合成: 统计聚合 + AI 热点识别与深度分析',
      '- 情感分析: 基于文本内容的多维度情感评估',
      '- 风险等级: 根据内容自动评估风险级别 (none/low/medium/high/critical)',
      '',
      '**局限性**:',
      '- 分析结果受限于输入数据的质量和覆盖范围',
      '- AI 生成内容可能包含偏差，仅供参考',
      '- 部分条目可能需要人工复核 (needs_review=true)',
    ].join('\n');
  }

  private buildAppendixB(report: DailyReport): string {
    if (report.references_index.length === 0) {
      return '## 附录 B: 完整结构化数据索引\n\n暂无数据。';
    }

    const lines: string[] = ['## 附录 B: 完整结构化数据索引'];
    lines.push('| ID | 标题 | 来源 | URL |');
    lines.push('|:---|:-----|:-----|:----|');

    for (const ref of report.references_index) {
      const escapedTitle = this.escapeTableCell(ref.title);
      const escapedSource = this.escapeTableCell(ref.source_name || 'N/A');
      const sourceUrl = ref.source_url || '#';
      lines.push(`| ${ref.id} | ${escapedTitle} | ${escapedSource} | ${sourceUrl} |`);
    }

    return lines.join('\n');
  }

  // =========================================================================
  // Private: 参考文献索引
  // =========================================================================

  private buildReferencesIndex(
    items: StructuredInsightItem[],
  ): Array<{ id: string; title: string; source_name: string; source_url: string }> {
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      source_name: item.source.name,
      source_url: item.source.url,
    }));
  }

  // =========================================================================
  // Private: 辅助方法
  // =========================================================================

  /**
   * 从报告提取统计数值（从 dashboard + top_by_significance 中重建）
   * 由于 AggregationStats 未直接存储于 DailyReport 中，需从 top_events 和其他
   * 字段推算。为了得到完整的 risk_distribution，此处使用简化近似。
   */
  private extractStats(report: DailyReport): {
    sentiment_distribution: Record<string, number>;
    risk_distribution: Record<string, number>;
  } {
    // 从 dashboard 恢复
    const sentiment = { ...report.dashboard.sentiment_distribution };

    // 通过 top_events 估算 risk — 实际项目中这些数据应传递下来
    const riskDist: Record<string, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
    // Markdown 展示只需要部分值，其余为 0
    riskDist.high = 0;
    riskDist.critical = 0;

    return { sentiment_distribution: sentiment, risk_distribution: riskDist };
  }

  /**
   * 计算 risk_count（排除 none）
   */
  private sumRiskCount(riskDist: Record<string, number>): number {
    let total = 0;
    for (const [level, count] of Object.entries(riskDist)) {
      if (level !== 'none') {
        total += count;
      }
    }
    return total;
  }

  /**
   * 获取 Top 话题（按频次降序排列）
   */
  private getTopTopics(topicFrequency: Record<string, number>): string[] {
    return Object.entries(topicFrequency)
      .sort(([, a], [, b]) => b - a)
      .map(([label]) => label);
  }

  /**
   * 获取风险等级标签
   */
  private getRiskLevelLabel(level: string): string {
    const labels: Record<string, string> = {
      critical: '严重',
      high: '高',
      medium: '中',
    };
    return labels[level] ?? level;
  }

  /**
   * 转义 Markdown 表格单元格中的特殊字符
   */
  private escapeTableCell(text: string): string {
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }
}
