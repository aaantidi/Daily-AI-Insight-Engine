import fs from 'fs';
import path from 'path';
import { Logger } from '../logger';
import { RawNewsItem } from '../schema/types';

// =============================================================================
// M1 Ingest — File Reader
// =============================================================================

export interface ReaderOptions {
  /** Directory containing raw .json news files. Defaults to "data/raw". */
  dataDir?: string;
}

/**
 * Resolve the default data directory relative to the current working directory.
 */
function defaultDataDir(): string {
  return path.resolve(process.cwd(), 'data', 'raw');
}

/**
 * NewsReader — scans a directory for .json files and loads them as RawNewsItem[].
 *
 * Each file should contain either an array of RawNewsItem objects or a single
 * RawNewsItem object (which is automatically wrapped into an array).
 * Files that cannot be parsed or read are skipped with a WARN log.
 */
export class NewsReader {
  private dataDir: string;
  private _files: string[];
  private logger: Logger;

  constructor(options?: ReaderOptions) {
    this.dataDir = options?.dataDir ?? defaultDataDir();
    this._files = [];
    this.logger = new Logger('INGEST');
  }

  /**
   * Scan the configured directory and return all matching .json file paths.
   * Returns an empty array if the directory does not exist or cannot be read.
   */
  listFiles(): string[] {
    try {
      if (!fs.existsSync(this.dataDir)) {
        this.logger.warn(`Data directory does not exist: ${this.dataDir}`);
        this._files = [];
        return [];
      }

      const entries = fs.readdirSync(this.dataDir);
      this._files = entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(this.dataDir, f));

      if (this._files.length === 0) {
        this.logger.warn(`No .json files found in data directory: ${this.dataDir}`);
      }

      return [...this._files];
    } catch (err) {
      this.logger.warn(`Failed to list files in ${this.dataDir}`, { error: String(err) });
      this._files = [];
      return [];
    }
  }

  /**
   * Load all .json files from the configured directory and merge them into
   * a single flat array of RawNewsItem objects.
   *
   * Files that fail to parse are logged as WARN and skipped (they do not
   * interrupt the overall process).
   */
  async loadAll(): Promise<RawNewsItem[]> {
    const files = this.listFiles();
    if (files.length === 0) {
      return [];
    }

    const allItems: RawNewsItem[] = [];

    for (const filePath of files) {
      try {
        const items = await this.loadFile(filePath);
        allItems.push(...items);
      } catch (err) {
        this.logger.warn(`Skipping file ${filePath} due to error`, { error: String(err) });
      }
    }

    this.logger.info(`Loaded ${allItems.length} raw items from ${files.length} file(s)`);

    return allItems;
  }

  /**
   * Load and parse a single JSON file, returning RawNewsItem[].
   *
   * If the file contains a single object (not an array), it is automatically
   * wrapped in an array for uniform return type.
   *
   * @throws If the file cannot be read or JSON.parse fails.
   */
  async loadFile(filePath: string): Promise<RawNewsItem[]> {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed as RawNewsItem[];
    }

    // Single object — wrap in array
    return [parsed as RawNewsItem];
  }
}
