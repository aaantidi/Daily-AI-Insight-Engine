import { readFileSync } from 'fs';
import { join } from 'path';

import { RawNewsItem } from '../../src/schema/types';

/**
 * Load a test fixture JSON file and parse it as RawNewsItem[].
 *
 * The fixture file is resolved relative to this module's directory.
 *
 * @param name - The fixture file name (e.g. "valid-news", "empty").
 *               The ".json" extension may be omitted.
 * @returns The parsed array of raw news items.
 */
export function loadFixture(name: string): RawNewsItem[] {
  const fixturePath = join(__dirname, `${name.replace(/\.json$/, '')}.json`);
  const raw = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw) as RawNewsItem[];
}
