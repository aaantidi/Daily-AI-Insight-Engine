import { RawNewsItem, IngestSummary, SkippedItem } from '../schema/types';
import { RawNewsItemSchema } from '../schema/schemas';

// =============================================================================
// M1 Ingest — Data Validator
// =============================================================================

export interface ValidationOptions {
  /** Current date for the summary, defaults to today's date (YYYY-MM-DD). */
  date?: string;
  /**
   * Minimum content length in characters. Items with content shorter than this
   * are skipped with reason "content too short". Defaults to 50, matching the
   * schema's built-in minimum.
   */
  minContentLength?: number;
}

export interface ValidationResult {
  /** Items that passed all validation checks. */
  valid: RawNewsItem[];
  /** Items that were skipped, along with their skip reasons. */
  skipped: SkippedItem[];
  /** Aggregate summary of the validation run. */
  summary: IngestSummary;
}

/**
 * NewsValidator — validates, cleans, and deduplicates RawNewsItem[] data.
 *
 * Validation pipeline for each item:
 * 1. Schema validation via RawNewsItemSchema.safeParse()
 * 2. Content length check against minContentLength
 * 3. Duplicate ID detection
 *
 * Items that fail any check are added to the `skipped` list with a reason.
 */
export class NewsValidator {
  private options: Required<ValidationOptions>;

  constructor(options?: ValidationOptions) {
    this.options = {
      date: options?.date ?? todayStr(),
      minContentLength: options?.minContentLength ?? 50,
    };
  }

  /**
   * Validate a batch of RawNewsItem objects.
   *
   * @param items - The raw items to validate.
   * @returns A ValidationResult containing the valid items, skipped items,
   *          and an aggregate summary.
   */
  validate(items: RawNewsItem[]): ValidationResult {
    const seenIds = new Set<string>();
    const valid: RawNewsItem[] = [];
    const skipped: SkippedItem[] = [];
    const sourceDist: Record<string, number> = {};
    const minContentLength = this.options.minContentLength;

    for (const item of items) {
      // ── Step 1: Schema validation ────────────────────────────────────
      const parseResult = RawNewsItemSchema.safeParse(item);
      if (!parseResult.success) {
        const reason = formatZodErrors(parseResult.error);
        skipped.push({ id: item.id ?? '(missing)', reason });
        continue;
      }

      // ── Step 2: Content length check ─────────────────────────────────
      // This catches items that pass the schema's built-in min(50) but fail
      // a stricter (configurable) threshold.
      if (item.content.length < minContentLength) {
        skipped.push({ id: item.id, reason: 'content too short' });
        continue;
      }

      // ── Step 3: Duplicate ID detection ───────────────────────────────
      if (seenIds.has(item.id)) {
        skipped.push({ id: item.id, reason: 'duplicate id' });
        continue;
      }

      // ── All checks passed ────────────────────────────────────────────
      seenIds.add(item.id);
      valid.push(item);

      // Track source distribution
      const sourceType = item.source.type;
      sourceDist[sourceType] = (sourceDist[sourceType] ?? 0) + 1;
    }

    const summary: IngestSummary = {
      date: this.options.date,
      total_input: items.length,
      validated: valid.length,
      skipped: skipped.length,
      skipped_reasons: skipped,
      source_distribution: sourceDist,
    };

    return { valid, skipped, summary };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get today's date as YYYY-MM-DD.
 */
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Format Zod validation errors into a human-readable string.
 *
 * Example output: "title: Title must not be empty; content: Content must be at least 50 characters long"
 */
function formatZodErrors(error: { issues: Array<{ path: (string | number | symbol)[]; message: string }> }): string {
  return error.issues
    .map((e) => {
      const pathStr = e.path.length > 0 ? e.path.map(String).join('.') : '(root)';
      return `${pathStr}: ${e.message}`;
    })
    .join('; ');
}
