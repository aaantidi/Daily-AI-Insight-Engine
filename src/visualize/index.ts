import { SvgGenerator } from './svg-generator';
import type { SvgOptions } from './svg-generator';
import { MermaidGenerator } from './mermaid-generator';
import { HtmlBuilder } from './html-builder';
import { Logger } from '../logger';
import type { AggregationStats, TrendAnalysis, StructuredInsightItem } from '../schema/types';

const log = new Logger('VISUALIZE');

export { SvgGenerator, MermaidGenerator, HtmlBuilder };
export type { SvgOptions };

// =============================================================================
// Integration
// =============================================================================

export interface GeneratedCharts {
  topicSummary: string;
  sentimentDonut: string;
  trendRadar: string;
  eventTimeline: string;
}

/**
 * Convenience function: generate all required charts in one call.
 */
export function generateAllCharts(
  stats: AggregationStats,
  trends: TrendAnalysis,
  items: StructuredInsightItem[],
  date: string,
  options?: SvgOptions,
): GeneratedCharts {
  log.info(`generateAllCharts invoked for ${date}`);

  const svgGen = new SvgGenerator(options);
  const mermaidGen = new MermaidGenerator();

  return {
    topicSummary: svgGen.generateTopicSummary(items, date),
    sentimentDonut: svgGen.generateSentimentDonut(stats.sentiment_distribution, date),
    trendRadar: svgGen.generateTrendRadar(trends, date),
    eventTimeline: mermaidGen.generateTimeline(stats.top_by_significance, date),
  };
}
