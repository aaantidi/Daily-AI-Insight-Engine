/**
 * Logger — 分级日志工具
 *
 * Provides 5 log levels (DEBUG, INFO, WARN, ERROR, FATAL) with
 * global level control, stdout/stderr routing, and structured data support.
 */

/**
 * Log levels ordered by severity (lower number = more verbose).
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/**
 * Represents a single structured log entry.
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Optional configuration for Logger constructor.
 */
export interface LoggerOptions {
  // Reserved for future options (e.g., custom output stream, formatting)
}

/**
 * Mapping from LogLevel enum to display name strings.
 */
const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
};

/**
 * Parse a log level string from environment variable or config.
 * Returns null for invalid / unrecognized values.
 */
function parseLogLevel(value: string | undefined): LogLevel | null {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  for (const [key, val] of Object.entries(LogLevel)) {
    if (typeof val === 'number' && key === upper) {
      return val as LogLevel;
    }
  }
  return null;
}

/**
 * Current global log level. All log entries below this threshold are suppressed.
 * Initialized from the LOG_LEVEL environment variable, defaulting to INFO.
 */
let globalLevel: LogLevel =
  parseLogLevel(
    typeof process !== 'undefined' ? process.env.LOG_LEVEL : undefined,
  ) ?? LogLevel.INFO;

/**
 * Generate an ISO 8601 timestamp (UTC).
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Logger — a lightweight structured logger with global level control.
 *
 * @example
 *   const log = new Logger('INGEST');
 *   log.info('Document received', { docId: 42 });
 *   log.error('Processing failed', { error: err.message });
 */
export class Logger {
  private readonly moduleName: string;

  /**
   * Create a new Logger instance bound to the given module name.
   *
   * @param module  Module identifier (e.g. "INGEST", "EXTRACT", "PIPELINE")
   * @param _options  Optional logger configuration (reserved)
   */
  constructor(module: string, _options?: LoggerOptions) {
    this.moduleName = module;
  }

  // ─── Instance methods ────────────────────────────────────────

  /** Log a DEBUG message (lowest severity). */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /** Log an INFO message. */
  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /** Log a WARN message. */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /** Log an ERROR message (routed to stderr). */
  error(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /** Log a FATAL message (routed to stderr, highest severity). */
  fatal(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, data);
  }

  // ─── Static methods ──────────────────────────────────────────

  /**
   * Override the global log level at runtime.
   * All loggers share this threshold.
   */
  static setGlobalLevel(level: LogLevel): void {
    globalLevel = level;
  }

  /**
   * Read the current global log level.
   */
  static getGlobalLevel(): LogLevel {
    return globalLevel;
  }

  // ─── Private helpers ─────────────────────────────────────────

  /**
   * Core log method: filters by global level, formats the message,
   * and writes to stdout or stderr.
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Skip messages below the global threshold
    if (level < globalLevel) {
      return;
    }

    const timestamp = formatTimestamp();
    const levelName = LEVEL_NAMES[level];
    let output = `[${timestamp}] [${levelName}] [${this.moduleName}] ${message}`;

    // Append structured data as JSON when provided
    if (data !== undefined) {
      output += ` ${JSON.stringify(data)}`;
    }

    output += '\n';

    // Route ERROR and FATAL to stderr, everything else to stdout
    if (level >= LogLevel.ERROR) {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }
}
