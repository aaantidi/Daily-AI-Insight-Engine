import path from 'path';
import fs from 'fs';
import os from 'os';

import { runIngest, NewsReader, NewsValidator, ValidationResult } from '../../src/ingest/index.js';
import { IngestSummarySchema } from '../../src/schema/schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('runIngest (pipeline integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // mixed-news fixture
  // -----------------------------------------------------------------------

  test('runIngest with mixed-news fixture returns a complete ValidationResult', async () => {
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-06-01' });

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.valid)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(result.summary).toHaveProperty('date');
    expect(result.summary).toHaveProperty('total_input');
    expect(result.summary).toHaveProperty('validated');
    expect(result.summary).toHaveProperty('skipped');
    expect(result.summary).toHaveProperty('skipped_reasons');
    expect(result.summary).toHaveProperty('source_distribution');
  });

  test('mixed-news fixture: valid count is correct (accounting for cross-file duplicates)', async () => {
    // 36 items total loaded from 6 fixture files.
    // After schema validation + duplicate ID detection:
    //   valid-news (10 valid) + mixed-news (5 unique valid, 3 dup, 2 invalid)
    //   + en-only-news (4 unique valid, 1 dup) + high-risk-news (3 valid)
    //   = 10 + 5 + 4 + 3 = 22 valid
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-06-01' });
    expect(result.summary.validated).toBe(22);
  });

  test('mixed-news fixture: skipped count reflects invalid items and duplicates', async () => {
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-06-01' });
    // skipped = 36 total - 22 valid = 14
    // invalid-news (8 schema fail) + mixed-news (2 schema fail + 3 dup) + en-only-news (1 dup) = 14
    expect(result.summary.skipped).toBe(14);
  });

  test('total_input = validated + skipped', async () => {
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-06-01' });
    expect(result.summary.total_input).toBe(result.summary.validated + result.summary.skipped);
  });

  // -----------------------------------------------------------------------
  // empty fixture
  // -----------------------------------------------------------------------

  test('empty.json fixture (single empty file) results in empty output', async () => {
    // Point directly to a temp dir with only empty.json
    const emptyFixture = path.join(FIXTURES_DIR, 'empty.json');
    fs.copyFileSync(emptyFixture, path.join(tempDir, 'empty.json'));

    const result = await runIngest({ dataDir: tempDir, date: '2026-06-01' });
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.summary.total_input).toBe(0);
    expect(result.summary.validated).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.source_distribution).toEqual({});
  });

  // -----------------------------------------------------------------------
  // valid-news fixture
  // -----------------------------------------------------------------------

  test('valid-news fixture: all items pass validation', async () => {
    const validPath = path.join(FIXTURES_DIR, 'valid-news.json');
    fs.copyFileSync(validPath, path.join(tempDir, 'valid-news.json'));

    const result = await runIngest({ dataDir: tempDir, date: '2026-06-01' });
    expect(result.summary.validated).toBe(10);
    expect(result.summary.skipped).toBe(0);
    expect(result.valid.length).toBe(10);
  });

  // -----------------------------------------------------------------------
  // Summary field integrity
  // -----------------------------------------------------------------------

  test('summary.date matches the provided date option', async () => {
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-07-01' });
    expect(result.summary.date).toBe('2026-07-01');
  });

  test('summary.source_distribution is a populated record', async () => {
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-06-01' });
    const dist = result.summary.source_distribution;
    expect(typeof dist).toBe('object');
    expect(Object.keys(dist).length).toBeGreaterThan(0);
    // Should have keys for source types present in the data
    Object.values(dist).forEach((count) => {
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test('result summary conforms to IngestSummarySchema', async () => {
    const result = await runIngest({ dataDir: FIXTURES_DIR, date: '2026-06-01' });
    const parseResult = IngestSummarySchema.safeParse(result.summary);
    expect(parseResult.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Non-existent directory
  // -----------------------------------------------------------------------

  test('non-existent data directory returns empty result', async () => {
    const missingDir = path.join(tempDir, 'does-not-exist');
    const result = await runIngest({ dataDir: missingDir, date: '2026-06-01' });
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.summary.total_input).toBe(0);
    expect(result.summary.validated).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Strict content threshold via pipeline
  // -----------------------------------------------------------------------

  test('pipeline respects stricter minContentLength when set on validator', async () => {
    const item = {
      id: 'strict-test',
      title: 'Strict Content Threshold Test',
      content: 'A'.repeat(60),  // passes schema min (50), but below custom threshold
      source: { name: 'Test', type: 'tech_media', url: 'https://example.com/strict' },
      published_at: '2026-06-01T00:00:00Z',
      language: 'en',
    };
    fs.writeFileSync(path.join(tempDir, 'strict.json'), JSON.stringify([item]));

    // Use the pipeline default (no minContentLength option on runIngest)
    // The validator defaults to 50, so content of 60 should pass
    const defaultResult = await runIngest({ dataDir: tempDir, date: '2026-06-01' });
    expect(defaultResult.summary.validated).toBe(1);

    // Now use a validator directly with higher threshold
    const reader = new NewsReader({ dataDir: tempDir });
    const rawItems = await reader.loadAll();
    const strictValidator = new NewsValidator({ minContentLength: 100, date: '2026-06-01' });
    const strictResult = strictValidator.validate(rawItems);
    expect(strictResult.summary.validated).toBe(0);
    expect(strictResult.summary.skipped).toBe(1);
    expect(strictResult.skipped[0].reason).toBe('content too short');
  });
});
