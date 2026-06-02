// =============================================================================
// M2 EXTRACT — 批量结构化抽取编排器
// =============================================================================

import { LLMClient, LLMOptions, LLMResponse } from '../llm-client';
import { Logger } from '../logger';
import {
  RawNewsItem,
  StructuredInsightItem,
  ExtractionSummary,
} from '../schema/types';
import { StructuredInsightItemSchema } from '../schema/schemas';
import { buildExtractionPrompt, buildRemedialPrompt } from './prompt-builder';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExtractorOptions {
  /** LLM 客户端实例（依赖注入） */
  llmClient: LLMClient;
  /** 最大并发数，默认 3 */
  maxParallel?: number;
  /** 补救重试次数（默认 1，即尝试一次补救） */
  maxRetries?: number;
  /** 最小置信度阈值，低于此触发补救重试，默认 0.4 */
  minConfidence?: number;
  /** 低于此置信度标记 needs_review，默认 0.6 */
  minConfidenceForReview?: number;
  /** 传给 LLMClient.send 的额外选项 */
  llmOptions?: LLMOptions;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_PARALLEL = 3;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_MIN_CONFIDENCE = 0.4;
const DEFAULT_MIN_CONFIDENCE_FOR_REVIEW = 0.6;

// ---------------------------------------------------------------------------
// NewsExtractor
// ---------------------------------------------------------------------------

export class NewsExtractor {
  private readonly logger: Logger;

  constructor(private readonly options: ExtractorOptions) {
    this.logger = new Logger('EXTRACT');
  }

  // ── Private option accessors ──────────────────────────────────────────

  private get maxParallel(): number {
    return this.options.maxParallel ?? DEFAULT_MAX_PARALLEL;
  }

  private get maxRetries(): number {
    return this.options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  private get minConfidence(): number {
    return this.options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  }

  private get minConfidenceForReview(): number {
    return this.options.minConfidenceForReview ?? DEFAULT_MIN_CONFIDENCE_FOR_REVIEW;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * 逐条处理 RawNewsItem[]，返回结构化结果及统计摘要。
   *
   * 使用简单的批次并发控制：每批最多 maxParallel 条，通过 Promise.all 并行处理。
   */
  async extractBatch(items: RawNewsItem[]): Promise<{
    items: StructuredInsightItem[];
    summary: ExtractionSummary;
  }> {
    const startTime = Date.now();

    this.logger.info(`Starting EXTRACT batch: ${items.length} item(s)`);

    if (items.length === 0) {
      return {
        items: [],
        summary: this.buildSummary([], startTime),
      };
    }

    const allResults: (StructuredInsightItem | null)[] = [];

    // Batch-based concurrency control
    for (let i = 0; i < items.length; i += this.maxParallel) {
      const batch = items.slice(i, i + this.maxParallel);
      this.logger.info(
        `Processing batch ${Math.floor(i / this.maxParallel) + 1}/${Math.ceil(items.length / this.maxParallel)} (${batch.length} item(s))`,
      );

      const batchResults = await Promise.all(
        batch.map((item) => this.extractOne(item)),
      );

      allResults.push(...batchResults);
    }

    const successful = allResults.filter(
      (r): r is StructuredInsightItem => r !== null,
    );

    this.logger.info(
      `EXTRACT batch complete: ${successful.length}/${items.length} extracted successfully`,
    );

    return {
      items: successful,
      summary: this.buildSummary(allResults, startTime),
    };
  }

  // ── Private: 单条抽取 ────────────────────────────────────────────────

  /**
   * 处理单条新闻：抽取 + 校验 + 可能的补救重试。
   * 返回 StructuredInsightItem 或 null（失败时）。
   */
  private async extractOne(
    item: RawNewsItem,
  ): Promise<StructuredInsightItem | null> {
    const llmOptions = this.options.llmOptions;

    // ── First attempt ────────────────────────────────────────────────
    const prompt = buildExtractionPrompt(item);
    const response = await this.options.llmClient.send(prompt, llmOptions);
    const result = this.tryParseAndValidate(response.content);

    if (result) {
      // Check if confidence meets the threshold
      if (result.extraction_confidence >= this.minConfidence) {
        this.setReviewFlags(result);
        return result;
      }
    }

    // ── Remedial attempt ─────────────────────────────────────────────
    if (this.maxRetries > 0) {
      const prevConfidence = result?.extraction_confidence ?? 0;
      const reason = result
        ? `low extraction confidence (${prevConfidence})`
        : 'schema validation failed';

      this.logger.info(
        `Remedial retry for ${item.id}: confidence=${prevConfidence}, reason=${reason}`,
      );

      const remedialPrompt = buildRemedialPrompt(
        item,
        prevConfidence,
        reason,
      );
      const remedialResponse = await this.options.llmClient.send(
        remedialPrompt,
        llmOptions,
      );
      const remedialResult = this.tryParseAndValidate(
        remedialResponse.content,
      );

      if (remedialResult) {
        if (remedialResult.extraction_confidence >= this.minConfidence) {
          this.setReviewFlags(remedialResult);
          return remedialResult;
        }
      }

      this.logger.error(
        `Remedial extraction failed for ${item.id}`,
        remedialResult
          ? { confidence: remedialResult.extraction_confidence }
          : { reason: 'parse or validation failed' },
      );
    }

    this.logger.error(
      `Extraction failed for ${item.id}`,
      result
        ? { confidence: result.extraction_confidence }
        : { reason: 'initial parse or validation failed' },
    );

    return null;
  }

  // ── Private: 解析与校验 ──────────────────────────────────────────────

  /**
   * 尝试解析 LLM 返回的 JSON 并进行 Zod 校验。
   * 返回解析并校验通过的对象，或 null。
   */
  private tryParseAndValidate(
    responseText: string,
  ): StructuredInsightItem | null {
    let parsed: unknown;
    try {
      const cleaned = this.cleanJsonResponse(responseText);
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }

    const parsedResult = StructuredInsightItemSchema.safeParse(parsed);
    if (!parsedResult.success) {
      return null;
    }

    return parsedResult.data;
  }

  /**
   * 清理 LLM 输出中的 Markdown 代码块标记，返回纯 JSON 字符串。
   */
  private cleanJsonResponse(text: string): string {
    let cleaned = text.trim();

    // Remove leading ```json or ``` markers
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }

    // Remove trailing ``` markers
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }

  // ── Private: 审核标记 ────────────────────────────────────────────────

  /**
   * 根据 extraction_confidence 设置 needs_review 和 review_reason。
   */
  private setReviewFlags(item: StructuredInsightItem): void {
    item.needs_review =
      item.extraction_confidence < this.minConfidenceForReview;
    if (item.needs_review && !item.review_reason) {
      item.review_reason = `low extraction confidence (${item.extraction_confidence})`;
    }
  }

  // ── Private: 统计摘要 ────────────────────────────────────────────────

  /**
   * 根据所有抽取结果构建 ExtractionSummary。
   */
  private buildSummary(
    results: (StructuredInsightItem | null)[],
    startTime: number,
  ): ExtractionSummary {
    const successful = results.filter(
      (r): r is StructuredInsightItem => r !== null,
    );
    const needsReview = successful.filter((r) => r.needs_review);
    const totalItems = results.length;
    const skipped = results.filter((r) => r === null).length;

    const avgConfidence =
      successful.length > 0
        ? successful.reduce((sum, r) => sum + r.extraction_confidence, 0) /
          successful.length
        : 0;

    return {
      date: new Date().toISOString().slice(0, 10),
      total_items: totalItems,
      extracted_successfully: successful.length,
      needs_review: needsReview.length,
      skipped,
      average_confidence: avgConfidence,
      extraction_duration_seconds: (Date.now() - startTime) / 1000,
    };
  }
}
