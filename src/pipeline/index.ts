import 'dotenv/config';

// =============================================================================
// M5 Pipeline — CLI 入口 + 统一导出
// =============================================================================

import { PipelineOrchestrator } from './orchestrator';
import type { PipelineOptions, PipelineResult } from './orchestrator';

export { PipelineOrchestrator };
export type { PipelineOptions, PipelineResult };

// =============================================================================
// CLI 入口函数
// =============================================================================

/**
 * 简单的命令行参数解析器。
 * 支持 --key=value 和 --key value 两种格式。
 */
function parseArgv(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    // --key=value form
    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = arg.slice(2, eqIdx);
      const value = arg.slice(eqIdx + 1);
      args[key] = value;
      continue;
    }

    // --key value form
    if (arg.startsWith('--') && i + 1 < argv.length) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      args[key] = value;
      i++; // skip next arg (the value)
    }
  }
  return args;
}

/**
 * CLI 入口 — 解析命令行参数并执行管道。
 *
 * 用法:
 *   ts-node src/pipeline/index.ts
 *   ts-node src/pipeline/index.ts --date=2026-06-01
 *   ts-node src/pipeline/index.ts --date=2026-06-01 --stage=extract
 *   ts-node src/pipeline/index.ts --data-dir=./my-data --parallel=5
 *
 * 命令行参数:
 *   --date=YYYY-MM-DD    处理日期
 *   --stage=阶段         起始阶段 (ingest|extract|synthesize|visualize)
 *   --data-dir=<path>    data/raw 目录路径
 *   --parallel=<n>       M2 并发数
 */
export async function main(args?: string[]): Promise<void> {
  const argv = args ?? process.argv;
  const parsed = parseArgv(argv);

  const options: PipelineOptions = {};

  if (parsed.date) {
    options.date = parsed.date;
  }

  if (parsed.stage) {
    const validStages = ['ingest', 'extract', 'synthesize', 'visualize'];
    if (validStages.includes(parsed.stage)) {
      options.stage = parsed.stage as PipelineOptions['stage'];
    } else {
      console.error(`[ERROR] Invalid stage: ${parsed.stage}. Must be one of: ${validStages.join(', ')}`);
      process.exit(1);
    }
  }

  if (parsed['data-dir']) {
    options.dataDir = parsed['data-dir'];
  }

  if (parsed.parallel) {
    const n = parseInt(parsed.parallel, 10);
    if (!isNaN(n) && n > 0) {
      options.maxParallel = n;
    } else {
      console.error(`[ERROR] Invalid parallel value: ${parsed.parallel}. Must be a positive number.`);
      process.exit(1);
    }
  }

  const orchestrator = new PipelineOrchestrator(options);
  const result = await orchestrator.run();

  // Output results
  console.log(JSON.stringify(result, null, 2));

  // Exit with error code on overall failure
  if (!result.success) {
    process.exit(1);
  }
}

// =============================================================================
// Self-execution when run directly
// =============================================================================

// Check if this script is being run directly (not imported)
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv.length >= 2 &&
  (process.argv[1] === __filename || process.argv[1]?.endsWith('/pipeline/index.ts') || process.argv[1]?.endsWith('\\pipeline\\index.ts'));

if (isMainModule) {
  main().catch((err) => {
    console.error('[FATAL] Pipeline crashed:', err);
    process.exit(1);
  });
}
