import { loadFixture } from '../fixtures/index.js';
import { buildExtractionPrompt, buildRemedialPrompt } from '../../src/extract/prompt-builder.js';
import { RawNewsItem } from '../../src/schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const allItems = loadFixture('valid-news');

function findItem(predicate: (item: RawNewsItem) => boolean): RawNewsItem {
  const item = allItems.find(predicate);
  if (!item) throw new Error('Fixture item not found');
  return item;
}

const enItem = findItem((i) => i.language === 'en');
const zhItem = findItem((i) => i.language === 'zh');

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('buildExtractionPrompt', () => {
  // 1. Returns a prompt containing the original title
  test('contains the original title', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain(enItem.title);
  });

  // 2. Returns a prompt containing the source name
  test('contains the source name', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain(enItem.source.name);
  });

  // 3. Returns a prompt containing the content
  test('contains the content', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain(enItem.content);
  });

  // 4. Returns a prompt containing expected JSON Schema fields
  test('contains the expected JSON Schema fields', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain('"id"');
    expect(prompt).toContain('"title_zh"');
    expect(prompt).toContain('"entities"');
    expect(prompt).toContain('"topics"');
    expect(prompt).toContain('"sentiment"');
    expect(prompt).toContain('"impact"');
    expect(prompt).toContain('"extraction_confidence"');
    expect(prompt).toContain('"needs_review"');
    expect(prompt).toContain('"review_reason"');
  });

  // 5. Contains field extraction guide sections
  test('contains the field extraction guide', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain('entities');
    expect(prompt).toContain('category');
    expect(prompt).toContain('sentiment');
    expect(prompt).toContain('risk_level');
    expect(prompt).toContain('significance_score');
  });

  // 6. For a Chinese-language item, the prompt still contains title_zh in the schema
  test('for Chinese item, prompt contains title_zh in JSON schema', () => {
    const prompt = buildExtractionPrompt(zhItem);
    expect(prompt).toContain('"title_zh"');
    expect(prompt).toContain('...或null');
  });

  // 7. Prompt contains the role description
  test('contains the role description', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain('结构化抽取');
  });

  // 8. Prompt contains the input data section
  test('contains the input data section with item ID and source type', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain(enItem.id);
    expect(prompt).toContain(enItem.source.type);
    expect(prompt).toContain(enItem.language);
  });

  // 9. Prompt contains the "只输出纯 JSON" instruction
  test('instructs LLM to output only JSON', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt).toContain('只输出纯 JSON');
  });

  // 10. Prompt length is within reasonable range
  test('prompt length is reasonable (< 5000 chars)', () => {
    const prompt = buildExtractionPrompt(enItem);
    expect(prompt.length).toBeLessThan(5000);
    expect(prompt.length).toBeGreaterThan(200);
  });
});

describe('buildRemedialPrompt', () => {
  // 7. Contains the original prompt content
  test('contains the original extraction prompt content', () => {
    const original = buildExtractionPrompt(enItem);
    const remedial = buildRemedialPrompt(enItem, 0.35, 'low confidence');
    // The remedial prompt should contain the original prompt as a prefix
    expect(remedial).toContain(original.slice(0, 100));
  });

  // 8. Contains the previous confidence value
  test('contains the previous confidence value', () => {
    const remedial = buildRemedialPrompt(enItem, 0.35, 'low confidence');
    expect(remedial).toContain('0.35');
  });

  // 9. Contains the review reason
  test('contains the review reason', () => {
    const remedial = buildRemedialPrompt(enItem, 0.35, 'low confidence');
    expect(remedial).toContain('low confidence');
  });

  // 10. Contains the special reminder section
  test('contains the special reminder section heading', () => {
    const remedial = buildRemedialPrompt(enItem, 0.35, 'low confidence');
    expect(remedial).toContain('特别提醒');
  });

  // 11. Contains instruction to re-read the original article
  test('contains instruction to re-read the original article', () => {
    const remedial = buildRemedialPrompt(enItem, 0.35, 'low confidence');
    expect(remedial).toContain('重新仔细阅读原文');
  });

  // 12. The remedial prompt is longer than the original prompt
  test('is longer than the extraction prompt', () => {
    const original = buildExtractionPrompt(enItem);
    const remedial = buildRemedialPrompt(enItem, 0.35, 'low confidence');
    expect(remedial.length).toBeGreaterThan(original.length);
  });
});
