import { Logger } from '../logger';
import { NewsReader } from './reader';
import { NewsValidator, ValidationResult } from './validator';

// =============================================================================
// M1 Ingest — Pipeline Entry Point
// =============================================================================

export type { ReaderOptions } from './reader';
export type { ValidationOptions, ValidationResult } from './validator';
export { NewsReader } from './reader';
export { NewsValidator } from './validator';

export interface IngestOptions {
  /** Directory containing raw .json news files. Defaults to "data/raw". */
  dataDir?: string;
  /** Date string (YYYY-MM-DD) for the ingest summary. Defaults to today. */
  date?: string;
}

/**
 * Execute the complete INGEST pipeline:
 *
 * 1. Read all .json files from the data directory (NewsReader)
 * 2. Validate, deduplicate, and compile statistics (NewsValidator)
 * 3. Return the validation result with summary
 *
 * Progress is logged at each stage using the "INGEST" logger module.
 *
 * @param options - Optional pipeline configuration.
 * @returns A ValidationResult containing valid items, skipped items, and summary.
 */
export async function runIngest(options?: IngestOptions): Promise<ValidationResult> {
  const logger = new Logger('INGEST');

  logger.info('Starting INGEST pipeline');

  // ── Phase 1: Read ─────────────────────────────────────────────────────
  logger.info('Phase 1: Reading news files', options?.dataDir ? { dataDir: options.dataDir } : undefined);
  const reader = new NewsReader({ dataDir: options?.dataDir });
  const items = await reader.loadAll();
  logger.info(`Phase 1 complete: Loaded ${items.length} raw item(s) from reader`);

  // ── Phase 2: Validate ─────────────────────────────────────────────────
  logger.info('Phase 2: Validating and cleaning data');
  const validator = new NewsValidator({ date: options?.date });
  const result = validator.validate(items);

  // ── Phase 3: Summary ──────────────────────────────────────────────────
  logger.info(
    `Phase 2 complete: ${result.summary.validated} valid, ${result.summary.skipped} skipped (of ${result.summary.total_input} total)`,
  );

  logger.info('INGEST pipeline finished successfully');

  return result;
}
