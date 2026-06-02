import { NewsValidator, ValidationResult } from '../../src/ingest/validator.js';
import { RawNewsItem, IngestSummary } from '../../src/schema/types.js';
import { IngestSummarySchema } from '../../src/schema/schemas.js';
import { loadFixture } from '../fixtures/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid RawNewsItem to use as a base for mutation tests. */
function makeValidItem(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    id: 'test-001',
    title: 'Test News Item Title',
    content: 'This is a test news item with enough content to pass the minimum length validation rule of fifty characters for proper testing purposes.',
    source: {
      name: 'Test Source',
      type: 'tech_media',
      url: 'https://example.com/test-001',
    },
    published_at: '2026-06-01T09:00:00Z',
    language: 'en',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NewsValidator', () => {
  let validator: NewsValidator;

  beforeEach(() => {
    validator = new NewsValidator({ date: '2026-06-01' });
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  test('all valid items pass validation', () => {
    const items = [makeValidItem(), makeValidItem({ id: 'test-002' })];
    const result = validator.validate(items);
    expect(result.valid.length).toBe(2);
    expect(result.skipped.length).toBe(0);
    expect(result.summary.total_input).toBe(2);
    expect(result.summary.validated).toBe(2);
    expect(result.summary.skipped).toBe(0);
  });

  test('valid items loaded from valid-news fixture are all accepted', () => {
    const items = loadFixture('valid-news');
    const result = validator.validate(items);
    expect(result.valid.length).toBe(items.length);
    expect(result.skipped.length).toBe(0);
    expect(result.summary.validated).toBe(items.length);
  });

  // -----------------------------------------------------------------------
  // Schema-level validation failures
  // -----------------------------------------------------------------------

  test('missing title → skip', () => {
    const { title, ...rest } = makeValidItem();
    const result = validator.validate([rest as RawNewsItem]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toContain('title');
  });

  test('empty title → skip', () => {
    const result = validator.validate([makeValidItem({ title: '' })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  test('missing id → skip', () => {
    const { id, ...rest } = makeValidItem();
    const result = validator.validate([rest as RawNewsItem]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toContain('id');
  });

  test('invalid source type → skip', () => {
    const result = validator.validate([
      makeValidItem({
        source: { name: 'Bad', type: 'invalid_type' as any, url: 'https://example.com' },
      }),
    ]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toContain('source.type');
  });

  test('missing source url → skip', () => {
    const result = validator.validate([
      makeValidItem({
        source: { name: 'Bad', type: 'tech_media' } as any,
      }),
    ]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toContain('source.url');
  });

  test('null source → skip', () => {
    const result = validator.validate([makeValidItem({ source: null as any })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  test('invalid published_at (not ISO 8601) → skip', () => {
    const result = validator.validate([makeValidItem({ published_at: 'not-a-date' })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toContain('published_at');
  });

  test('invalid language → skip', () => {
    const result = validator.validate([makeValidItem({ language: 'de' as any })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toContain('language');
  });

  test('missing content → skip', () => {
    const { content, ...rest } = makeValidItem();
    const result = validator.validate([rest as RawNewsItem]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  test('empty content → skip', () => {
    const result = validator.validate([makeValidItem({ content: '' })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Business-rule validation (content length threshold)
  // -----------------------------------------------------------------------

  test('content below schema minimum (50 chars) is rejected', () => {
    const result = validator.validate([makeValidItem({ content: 'Too short.' })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  test('content below custom minContentLength threshold is skipped with clear reason', () => {
    const strictValidator = new NewsValidator({ minContentLength: 200, date: '2026-06-01' });
    // 104 chars passes schema (>=50) but fails custom threshold (<200)
    const mediumContent = 'A'.repeat(104);
    const result = strictValidator.validate([makeValidItem({ content: mediumContent })]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].reason).toBe('content too short');
  });

  // -----------------------------------------------------------------------
  // Duplicate ID detection
  // -----------------------------------------------------------------------

  test('duplicate id → second occurrence is skipped', () => {
    const items = [
      makeValidItem({ id: 'dup-001' }),
      makeValidItem({ id: 'dup-001' }),
    ];
    const result = validator.validate(items);
    expect(result.valid.length).toBe(1);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0].id).toBe('dup-001');
    expect(result.skipped[0].reason).toBe('duplicate id');
  });

  test('multiple duplicates: only first occurrence of each id is kept', () => {
    const items = [
      makeValidItem({ id: 'dup-a' }),
      makeValidItem({ id: 'dup-b' }),
      makeValidItem({ id: 'dup-a' }),  // duplicate
      makeValidItem({ id: 'dup-b' }),  // duplicate
      makeValidItem({ id: 'dup-c' }),
      makeValidItem({ id: 'dup-a' }),  // triple duplicate
    ];
    const result = validator.validate(items);
    expect(result.valid.length).toBe(3);  // a, b, c
    expect(result.skipped.length).toBe(3); // a(2nd), b(2nd), a(3rd)
    result.skipped.forEach((s) => {
      expect(s.reason).toBe('duplicate id');
    });
  });

  // -----------------------------------------------------------------------
  // Source distribution
  // -----------------------------------------------------------------------

  test('source_distribution counts are correct', () => {
    const items = [
      makeValidItem({ id: '1', source: { ...makeValidItem().source, type: 'tech_media' } }),
      makeValidItem({ id: '2', source: { ...makeValidItem().source, type: 'tech_media' } }),
      makeValidItem({ id: '3', source: { ...makeValidItem().source, type: 'official' } }),
      makeValidItem({ id: '4', source: { ...makeValidItem().source, type: 'social_media' } }),
      makeValidItem({ id: '5', source: { ...makeValidItem().source, type: 'aggregator' } }),
    ];
    const result = validator.validate(items);
    expect(result.summary.source_distribution).toEqual({
      tech_media: 2,
      official: 1,
      social_media: 1,
      aggregator: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Empty / edge-case inputs
  // -----------------------------------------------------------------------

  test('empty input → total_input=0, valid=[], skipped=[]', () => {
    const result = validator.validate([]);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.summary.total_input).toBe(0);
    expect(result.summary.validated).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.source_distribution).toEqual({});
  });

  test('all items invalid → valid=[], skipped=N', () => {
    const items = [
      makeValidItem({ id: 'bad-1', title: '' }),
      makeValidItem({ id: 'bad-2', content: 'too short.' }),
      makeValidItem({ id: 'bad-3', language: 'de' as any }),
    ];
    const result = validator.validate(items);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(3);
    expect(result.summary.validated).toBe(0);
    expect(result.summary.skipped).toBe(3);
  });

  test('mixed valid and invalid → correct counts', () => {
    const items = [
      makeValidItem({ id: 'good-1' }),
      makeValidItem({ id: 'good-2' }),
      makeValidItem({ id: 'bad-1', title: '' }),
      makeValidItem({ id: 'bad-2', language: 'de' as any }),
      makeValidItem({ id: 'good-3' }),
      makeValidItem({ id: 'good-4' }),
    ];
    const result = validator.validate(items);
    expect(result.valid.length).toBe(4);
    expect(result.skipped.length).toBe(2);
    expect(result.summary.validated).toBe(4);
    expect(result.summary.skipped).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Valid-array integrity
  // -----------------------------------------------------------------------

  test('valid array does NOT contain any skipped item', () => {
    const items = [
      makeValidItem({ id: 'keep-1' }),
      makeValidItem({ id: 'bad', title: '' }),
      makeValidItem({ id: 'keep-2' }),
      makeValidItem({ id: 'bad', content: 'short' }), // duplicate id too
    ];
    const result = validator.validate(items);
    const validIds = result.valid.map((i) => i.id);
    expect(validIds).toEqual(['keep-1', 'keep-2']);
    result.skipped.forEach((s) => {
      expect(validIds).not.toContain(s.id);
    });
  });

  // -----------------------------------------------------------------------
  // Summary structure validation
  // -----------------------------------------------------------------------

  test('result summary matches IngestSummarySchema', () => {
    const items = loadFixture('mixed-news');
    const result = validator.validate(items);
    const parseResult = IngestSummarySchema.safeParse(result.summary);
    expect(parseResult.success).toBe(true);
  });

  test('summary.date respects the date option', () => {
    const customValidator = new NewsValidator({ date: '2026-06-15' });
    const result = customValidator.validate([makeValidItem()]);
    expect(result.summary.date).toBe('2026-06-15');
  });

  // -----------------------------------------------------------------------
  // Skipped reason readability
  // -----------------------------------------------------------------------

  test('skipped reasons are human-readable strings (not empty or truncated)', () => {
    const items = [
      makeValidItem({ id: 'no-title', title: '' }),
      makeValidItem({ id: 'bad-lang', language: 'fr' as any }),
      makeValidItem({ id: 'no-date', published_at: 'not-iso' }),
    ];
    const result = validator.validate(items);
    result.skipped.forEach((s) => {
      expect(typeof s.reason).toBe('string');
      expect(s.reason.length).toBeGreaterThan(5);
    });
  });

  // -----------------------------------------------------------------------
  // Fixture-based integration
  // -----------------------------------------------------------------------

  test('invalid-news fixture → all items are skipped', () => {
    const items = loadFixture('invalid-news');
    const result = validator.validate(items);
    // All 8 items in invalid-news have schema violations
    expect(result.valid.length).toBe(0);
    expect(result.skipped.length).toBe(items.length);
  });
});
