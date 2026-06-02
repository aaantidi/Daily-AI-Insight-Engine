// =============================================================================
// M5 Pipeline — PipelineOrchestrator: M1→M2→M3→M4 端到端管道编排
// =============================================================================

import * as fs from 'fs';
import { LLMClient } from '../llm-client';
import { Logger } from '../logger';
import { runIngest } from '../ingest/index';
import type { ValidationResult } from '../ingest/index';
import { NewsExtractor } from '../extract/index';
import type { ExtractorOptions } from '../extract/index';
import { StatsAggregator, InsightAnalyzer, ReportBuilder } from '../synthesize/index';
import { generateAllCharts, HtmlBuilder } from '../visualize/index';
import type { GeneratedCharts } from '../visualize/index';
import type { StructuredInsightItem, ExtractionSummary, AggregationStats, TrendAnalysis, DailyReport, DeepAnalysis } from '../schema/types';

// =============================================================================
// Public types
// =============================================================================

export interface PipelineOptions {
  /** 包含 raw .json 文件的目录，默认 "data/raw" */
  dataDir?: string;
  /** 处理日期 (YYYY-MM-DD)，默认今天 */
  date?: string;
  /** 注入 LLMClient（不提供则从环境变量创建） */
  llmClient?: LLMClient;
  /** 从哪个阶段开始执行 */
  stage?: 'ingest' | 'extract' | 'synthesize' | 'visualize';
  /** M2 并发数，默认 3 */
  maxParallel?: number;
  /** 注入 Logger 实例 */
  logger?: Logger;
}

export interface StageResultBase {
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface IngestStageResult extends StageResultBase {
  result?: ValidationResult;
}

export interface ExtractStageResult extends StageResultBase {
  itemCount?: number;
  summary?: ExtractionSummary;
}

export interface SynthesizeStageResult extends StageResultBase {
  report?: DailyReport;
}

export interface VisualizeStageResult extends StageResultBase {
  charts?: GeneratedCharts;
}

export interface PipelineResult {
  success: boolean;
  date: string;
  stages: {
    ingest: IngestStageResult;
    extract: ExtractStageResult;
    synthesize: SynthesizeStageResult;
    visualize: VisualizeStageResult;
  };
  totalDurationMs: number;
}

// =============================================================================
// Defaults
// =============================================================================

const STAGE_ORDER = ['ingest', 'extract', 'synthesize', 'visualize'] as const;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// =============================================================================
// PipelineOrchestrator
// =============================================================================

export class PipelineOrchestrator {
  private readonly options: Required<Omit<PipelineOptions, 'llmClient'>>;
  private readonly logger: Logger;
  private llmClientInstance?: LLMClient;

  constructor(options?: PipelineOptions) {
    this.options = {
      dataDir: options?.dataDir ?? 'data/raw',
      date: options?.date ?? todayStr(),
      stage: options?.stage ?? 'ingest',
      maxParallel: options?.maxParallel ?? 3,
      logger: options?.logger ?? new Logger('PIPELINE'),
    };
    if (options?.llmClient) {
      this.llmClientInstance = options.llmClient;
    }
    this.logger = this.options.logger;
  }

  // =========================================================================
  // run — 执行完整管道
  // =========================================================================

  /**
   * 延迟获取 LLMClient：优先返回构造时注入的实例，否则在首次需要时创建。
   * 仅当需要 LLM 的阶段（extract/synthesize）运行时才会初始化。
   */
  private getLLMClient(): LLMClient {
    if (this.llmClientInstance) {
      return this.llmClientInstance;
    }
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing API key. Set DEEPSEEK_API_KEY environment variable.\n' +
        '  Example: export DEEPSEEK_API_KEY="sk-..."',
      );
    }
    this.llmClientInstance = new LLMClient({ apiKey });
    this.logger.info('LLMClient initialized (lazy)');
    return this.llmClientInstance;
  }

  async run(): Promise<PipelineResult> {
    const startTime = Date.now();
    const date = this.options.date;
    const stageIdx = STAGE_ORDER.indexOf(this.options.stage);

    this.logger.info(`Pipeline started (stage=${this.options.stage}, date=${date})`);

    // ── Accumulated state ──────────────────────────────────────────────
    let ingestResult: ValidationResult | undefined;
    let extractedItems: StructuredInsightItem[] = [];
    let extractionSummary: ExtractionSummary | undefined;
    let stats: AggregationStats = {
      topic_frequency: {},
      source_distribution: {},
      sentiment_distribution: {},
      risk_distribution: {},
      top_by_significance: [],
      entity_co_occurrence: [],
    };
    let trends: TrendAnalysis = {
      technology: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      application: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      policy: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      capital: { trend: '', confidence: 0, supporting_items: [], signals: [] },
      overall_narrative: '',
      uncertainties: [],
    };
    let report: DailyReport | undefined;
    let charts: GeneratedCharts | undefined;
    let reportMarkdown = '';

    // ── Stage result accumulators ──────────────────────────────────────
    const ingestStage: IngestStageResult = { status: 'skipped' };
    const extractStage: ExtractStageResult = { status: 'skipped' };
    const synthesizeStage: SynthesizeStageResult = { status: 'skipped' };
    const visualizeStage: VisualizeStageResult = { status: 'skipped' };

    // ===================================================================
    // Phase 1: INGEST
    // ===================================================================
    if (stageIdx <= 0) {
      this.logger.info('Starting INGEST stage');
      try {
        ingestResult = await runIngest({
          dataDir: this.options.dataDir,
          date,
        });

        ingestStage.status = 'success';
        ingestStage.result = ingestResult;
        this.logger.info(`INGEST stage completed: ${ingestResult.valid.length} valid items`);
      } catch (err) {
        this.logger.error('INGEST stage failed', { error: String(err) });
        ingestStage.status = 'failed';
        ingestStage.error = String(err);
        const totalDurationMs = Date.now() - startTime;
        this.logger.info(`Pipeline finished in ${totalDurationMs}ms — success=false`);
        return {
          success: false,
          date,
          stages: { ingest: ingestStage, extract: extractStage, synthesize: synthesizeStage, visualize: visualizeStage },
          totalDurationMs,
        };
      }
    }

    // ===================================================================
    // Phase 2: EXTRACT
    // ===================================================================
    if (stageIdx <= 1) {
      this.logger.info('Starting EXTRACT stage');
      try {
        const validItems = ingestResult?.valid ?? [];

        const extractor = new NewsExtractor({
          llmClient: this.getLLMClient(),
          maxParallel: this.options.maxParallel,
        } as ExtractorOptions);

        const extractResult = await extractor.extractBatch(validItems);
        extractedItems = extractResult.items;
        extractionSummary = extractResult.summary;

        extractStage.status = 'success';
        extractStage.itemCount = extractedItems.length;
        extractStage.summary = extractionSummary;
        this.logger.info(
          `EXTRACT stage completed: ${extractedItems.length}/${validItems.length} items extracted`,
        );
      } catch (err) {
        this.logger.error('EXTRACT stage failed', { error: String(err) });
        extractStage.status = 'failed';
        extractStage.error = String(err);
        extractStage.itemCount = 0;
        // Continue with empty items — partial failure
        extractedItems = [];
      }
    }

    // ===================================================================
    // Phase 3: SYNTHESIZE
    // ===================================================================
    if (stageIdx <= 2) {
      this.logger.info('Starting SYNTHESIZE stage');
      try {
        // Phase A: Aggregate statistics
        this.logger.info('SYNTHESIZE Phase A: Aggregating statistics');
        const aggregator = new StatsAggregator();
        stats = aggregator.aggregate(extractedItems);

        // Phase B: Identify top events
        this.logger.info('SYNTHESIZE Phase B: Identifying top events');
        const analyzer = new InsightAnalyzer({ llmClient: this.getLLMClient() });
        const topEvents = await analyzer.identifyTopEvents({
          topicFrequency: stats.topic_frequency,
          topBySignificance: extractedItems.filter(
            (item) => stats.top_by_significance.some((t) => t.id === item.id),
          ),
        });

        // Phase C: Deep analysis for each event
        this.logger.info(`SYNTHESIZE Phase C: Analyzing ${topEvents.length} event(s) in depth`);
        const deepAnalyses: DeepAnalysis[] = [];
        for (const event of topEvents) {
          const relatedItems = extractedItems.filter(
            (item) => event.item_ids.includes(item.id),
          );
          const deepAnalysis = await analyzer.analyzeEvent(event, relatedItems);
          deepAnalyses.push(deepAnalysis);
        }

        // Phase D: Trend analysis
        this.logger.info('SYNTHESIZE Phase D: Analyzing trends');
        trends = await analyzer.analyzeTrends(extractedItems, topEvents);

        // Phase E: Risk and opportunity identification
        this.logger.info('SYNTHESIZE Phase E: Identifying risks and opportunities');
        const riskOpp = await analyzer.identifyRisksAndOpportunities(extractedItems, trends);

        // Phase F: Build report
        this.logger.info('SYNTHESIZE Phase F: Building report');
        const builder = new ReportBuilder();
        report = builder.buildReport(date, stats, topEvents, deepAnalyses, trends, riskOpp, extractedItems);
        reportMarkdown = builder.toMarkdown(report);

        synthesizeStage.status = 'success';
        synthesizeStage.report = report;
        this.logger.info('SYNTHESIZE stage completed');
      } catch (err) {
        this.logger.error('SYNTHESIZE stage failed', { error: String(err) });
        synthesizeStage.status = 'failed';
        synthesizeStage.error = String(err);
      }
    }

    // ===================================================================
    // Phase 4: VISUALIZE
    // ===================================================================
    if (stageIdx <= 3) {
      this.logger.info('Starting VISUALIZE stage');
      try {
        charts = generateAllCharts(stats, trends, extractedItems, date);
        visualizeStage.status = 'success';
        visualizeStage.charts = charts;
        this.logger.info('VISUALIZE stage completed');
      } catch (err) {
        this.logger.error('VISUALIZE stage failed', { error: String(err) });
        visualizeStage.status = 'failed';
        visualizeStage.error = String(err);
        visualizeStage.charts = {
          topicSummary: '',
          sentimentDonut: '',
          trendRadar: '',
          eventTimeline: '',
        };
      }
    }

    // 将话题摘要注入日报正文（在 Top 3 焦点事件之前）
    if (charts?.topicSummary) {
      reportMarkdown = reportMarkdown.replace(
        '## Top 3 焦点事件',
        `${charts.topicSummary}\n\n## Top 3 焦点事件`,
      );
    }

    // ===================================================================
    // Write output files
    // ===================================================================
    if (reportMarkdown && charts) {
      const outputDir = `data/reports/${date}`;
      const assetsDir = `${outputDir}/assets`;

      try {
        await fs.promises.mkdir(assetsDir, { recursive: true });

        await fs.promises.writeFile(`${outputDir}/report.md`, reportMarkdown, 'utf-8');
        this.logger.info(`Report saved to ${outputDir}/report.md`);

        await fs.promises.writeFile(`${assetsDir}/topic_summary.md`, charts.topicSummary, 'utf-8');
        await fs.promises.writeFile(`${assetsDir}/sentiment_donut.svg`, charts.sentimentDonut, 'utf-8');
        await fs.promises.writeFile(`${assetsDir}/trend_radar.svg`, charts.trendRadar, 'utf-8');

        await fs.promises.writeFile(`${assetsDir}/event_timeline.mmd`, charts.eventTimeline, 'utf-8');
        this.logger.info(`Charts saved to ${assetsDir}/`);

        // Generate and write the self-contained HTML report
        if (report) {
          const htmlBuilder = new HtmlBuilder();
          const html = htmlBuilder.buildHtml(report, charts, date);
          await fs.promises.writeFile(`${outputDir}/index.html`, html, 'utf-8');
          this.logger.info(`HTML report saved to ${outputDir}/index.html`);
        }
      } catch (err) {
        this.logger.error(`Failed to write output files`, { error: String(err) });
      }
    }

    // ===================================================================
    // Final result
    // ===================================================================
    const totalDurationMs = Date.now() - startTime;

    // Pipeline is successful if none of the required stages explicitly failed
    // and at least one stage actually ran
    const hasRunningStage = STAGE_ORDER.slice(stageIdx).some((s) => {
      switch (s) {
        case 'ingest': return ingestStage.status !== 'skipped';
        case 'extract': return extractStage.status !== 'skipped';
        case 'synthesize': return synthesizeStage.status !== 'skipped';
        case 'visualize': return visualizeStage.status !== 'skipped';
      }
      return false;
    });

    // Determine success: all required stages must not be 'failed'
    const allRequiredSucceeded = STAGE_ORDER.slice(stageIdx).every((s) => {
      switch (s) {
        case 'ingest': return ingestStage.status !== 'failed';
        case 'extract': return extractStage.status !== 'failed';
        case 'synthesize': return synthesizeStage.status !== 'failed';
        case 'visualize': return visualizeStage.status !== 'failed';
      }
      return true;
    });

    // EXTRACT failure is non-blocking (pipeline continues), so don't fail overall for it
    // Only INGEST and SYNTHESIZE failures make the overall pipeline fail
    const success = hasRunningStage && allRequiredSucceeded;

    this.logger.info(
      `Pipeline finished in ${totalDurationMs}ms — success=${success}`,
    );

    return {
      success,
      date,
      stages: {
        ingest: ingestStage,
        extract: extractStage,
        synthesize: synthesizeStage,
        visualize: visualizeStage,
      },
      totalDurationMs,
    };
  }
}
