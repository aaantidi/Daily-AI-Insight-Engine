import path from 'path';
import fs from 'fs';
import os from 'os';

import { NewsReader } from '../../src/ingest/reader.js';
import { RawNewsItem } from '../../src/schema/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce a minimal valid RawNewsItem for temp-file helpers. */
function makeItem(id: string): RawNewsItem {
  return {
    id,
    title: `Test News Item ${id}`,
    content: 'This is a test news item with enough content to pass the minimum length validation rule of fifty characters for proper testing purposes.',
    source: {
      name: 'Test Source',
      type: 'tech_media',
      url: `https://example.com/${id}`,
    },
    published_at: '2026-06-01T09:00:00Z',
    language: 'en',
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NewsReader', () => {
  const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // loadFile
  // -----------------------------------------------------------------------

  test('loadFile reads a valid fixture file and returns RawNewsItem[]', async () => {
    const reader = new NewsReader();
    const filePath = path.join(FIXTURES_DIR, 'valid-news.json');
    const items = await reader.loadFile(filePath);

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(10);
    expect(items[0]).toHaveProperty('id', 'tc-20260601-001');
    expect(items[0]).toHaveProperty('title');
    expect(items[0]).toHaveProperty('content');
    expect(items[0]).toHaveProperty('source');
    expect(items[0]).toHaveProperty('published_at');
    expect(items[0]).toHaveProperty('language');
  });

  test('loadFile auto-wraps a single JSON object into an array', async () => {
    const singleObjPath = path.join(tempDir, 'single.json');
    const singleObj = makeItem('single-001');
    fs.writeFileSync(singleObjPath, JSON.stringify(singleObj));

    const reader = new NewsReader();
    const items = await reader.loadFile(singleObjPath);
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('single-001');
  });

  // -----------------------------------------------------------------------
  // loadAll
  // -----------------------------------------------------------------------

  test('loadAll merges items from multiple .json files', async () => {
    fs.writeFileSync(path.join(tempDir, 'a.json'), JSON.stringify([makeItem('a-001')]));
    fs.writeFileSync(path.join(tempDir, 'b.json'), JSON.stringify([makeItem('b-001')]));

    const reader = new NewsReader({ dataDir: tempDir });
    const items = await reader.loadAll();
    expect(items.length).toBe(2);
    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual(['a-001', 'b-001']);
  });

  test('loadAll returns empty array when directory has no .json files', async () => {
    const reader = new NewsReader({ dataDir: tempDir });
    const items = await reader.loadAll();
    expect(items).toEqual([]);
  });

  test('loadAll skips files with invalid JSON gracefully', async () => {
    fs.writeFileSync(path.join(tempDir, 'bad.json'), 'not valid json');
    const reader = new NewsReader({ dataDir: tempDir });
    const items = await reader.loadAll();
    expect(items).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // listFiles
  // -----------------------------------------------------------------------

  test('listFiles returns only .json file paths', () => {
    fs.writeFileSync(path.join(tempDir, 'a.json'), '[]');
    fs.writeFileSync(path.join(tempDir, 'b.json'), '[]');
    fs.writeFileSync(path.join(tempDir, 'c.txt'), 'not json');
    fs.writeFileSync(path.join(tempDir, 'd.ts'), 'not json');

    const reader = new NewsReader({ dataDir: tempDir });
    const files = reader.listFiles();
    expect(files.length).toBe(2);
    files.forEach((f) => {
      expect(f.endsWith('.json')).toBe(true);
      expect(path.isAbsolute(f)).toBe(true);
    });
  });

  test('listFiles returns empty array for non-existent directory', () => {
    const missingDir = path.join(tempDir, 'does-not-exist');
    const reader = new NewsReader({ dataDir: missingDir });
    const files = reader.listFiles();
    expect(files).toEqual([]);
  });
});
