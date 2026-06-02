import { Logger, LogLevel } from '../src/logger.js';

describe('Logger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeAll(() => {
    // Remove env var so it doesn't interfere with default tests
    delete process.env.LOG_LEVEL;
  });

  beforeEach(() => {
    // Reset global level to default INFO
    Logger.setGlobalLevel(LogLevel.INFO);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    // Restore original env var
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  // Test 1: Basic INFO logging to stdout
  test('should output INFO message to stdout', () => {
    const logger = new Logger('TEST');
    logger.info('hello world');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('[INFO]');
    expect(output).toContain('[TEST]');
    expect(output).toContain('hello world');
  });

  // Test 2: ERROR/FATAL output to stderr
  test('should output ERROR message to stderr', () => {
    const logger = new Logger('TEST');
    logger.error('error message');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[ERROR]');
    expect(output).toContain('error message');
  });

  test('should output FATAL message to stderr', () => {
    const logger = new Logger('TEST');
    logger.fatal('fatal message');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('[FATAL]');
    expect(output).toContain('fatal message');
  });

  // Test 3: DEBUG level not output by default (global level = INFO)
  test('should NOT output DEBUG message when global level is INFO (default)', () => {
    Logger.setGlobalLevel(LogLevel.INFO);
    const logger = new Logger('TEST');
    logger.debug('debug message');
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  // Test 3b: WARN is output (it's >= INFO)
  test('should output WARN message when global level is INFO', () => {
    const logger = new Logger('TEST');
    logger.warn('warn message');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('[WARN]');
  });

  // Test 4: Setting global level to DEBUG enables DEBUG output
  test('should output DEBUG message when global level is set to DEBUG', () => {
    Logger.setGlobalLevel(LogLevel.DEBUG);
    const logger = new Logger('TEST');
    logger.debug('debug message');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('[DEBUG]');
    expect(output).toContain('debug message');
  });

  // Test 5: Setting global level to ERROR - only ERROR and FATAL output
  test('should only output ERROR and FATAL when global level is ERROR', () => {
    Logger.setGlobalLevel(LogLevel.ERROR);
    const logger = new Logger('TEST');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    logger.fatal('fatal');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(2);

    const errorCall = stderrSpy.mock.calls[0][0] as string;
    const fatalCall = stderrSpy.mock.calls[1][0] as string;
    expect(errorCall).toContain('[ERROR]');
    expect(fatalCall).toContain('[FATAL]');
  });

  // Test 6: Environment variable LOG_LEVEL affects global level
  test('should read LOG_LEVEL from environment variable on module load', () => {
    // Save current module state and env
    const previousEnv = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'DEBUG';

    // Reset module cache and re-import to trigger env var reading
    jest.resetModules();
    const { Logger: LoggerReloaded, LogLevel: LogLevelReloaded } = require('../src/logger.js');

    expect(LoggerReloaded.getGlobalLevel()).toBe(LogLevelReloaded.DEBUG);

    // Clean up
    if (previousEnv !== undefined) {
      process.env.LOG_LEVEL = previousEnv;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  test('should read LOG_LEVEL=ERROR from environment variable', () => {
    const previousEnv = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'ERROR';

    jest.resetModules();
    const { Logger: LoggerReloaded, LogLevel: LogLevelReloaded } = require('../src/logger.js');

    expect(LoggerReloaded.getGlobalLevel()).toBe(LogLevelReloaded.ERROR);

    if (previousEnv !== undefined) {
      process.env.LOG_LEVEL = previousEnv;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  test('should ignore invalid LOG_LEVEL env var and default to INFO', () => {
    const previousEnv = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'INVALID_LEVEL';

    jest.resetModules();
    const { Logger: LoggerReloaded, LogLevel: LogLevelReloaded } = require('../src/logger.js');

    expect(LoggerReloaded.getGlobalLevel()).toBe(LogLevelReloaded.INFO);

    if (previousEnv !== undefined) {
      process.env.LOG_LEVEL = previousEnv;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  // Test 7: Logger instance binds correct module name
  test('should bind the correct module name', () => {
    const logger = new Logger('INGEST');
    logger.info('ingest message');
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('[INGEST]');
  });

  test('multiple loggers should have different module names', () => {
    const ingestLogger = new Logger('INGEST');
    const extractLogger = new Logger('EXTRACT');

    ingestLogger.info('ingest msg');
    extractLogger.info('extract msg');

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(stdoutSpy.mock.calls[0][0] as string).toContain('[INGEST]');
    expect(stdoutSpy.mock.calls[1][0] as string).toContain('[EXTRACT]');
  });

  // Test 8: Output format validation
  test('should output in the correct format: [timestamp] [LEVEL] [MODULE] message', () => {
    const logger = new Logger('TEST');
    logger.info('hello world');
    const output = stdoutSpy.mock.calls[0][0] as string;

    // Format: [ISO timestamp] [LEVEL] [MODULE] message\n
    expect(output).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] \[TEST\] hello world\n$/);
  });

  // Test 9: Data parameter as JSON
  test('should include data as JSON when provided', () => {
    const logger = new Logger('TEST');
    logger.info('with data', { key: 'value', num: 42 });
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('{"key":"value","num":42}');
  });

  test('should not append data when not provided', () => {
    const logger = new Logger('TEST');
    logger.info('no data');
    const output = stdoutSpy.mock.calls[0][0] as string;
    // Should end with "no data\n" and no JSON
    expect(output).toMatch(/no data\n$/);
  });

  test('should handle empty data object', () => {
    const logger = new Logger('TEST');
    logger.info('empty data', {});
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('{}');
  });

  // Test 10: Different Logger instances share global level
  test('different Logger instances should share global level', () => {
    Logger.setGlobalLevel(LogLevel.WARN);

    const logger1 = new Logger('MOD1');
    const logger2 = new Logger('MOD2');

    logger1.info('should not appear');
    logger2.warn('should appear');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = stdoutSpy.mock.calls[0][0] as string;
    expect(output).toContain('[WARN]');
    expect(output).toContain('[MOD2]');
  });

  // Test 11: getGlobalLevel returns current level
  test('getGlobalLevel should return the current global level', () => {
    Logger.setGlobalLevel(LogLevel.DEBUG);
    expect(Logger.getGlobalLevel()).toBe(LogLevel.DEBUG);

    Logger.setGlobalLevel(LogLevel.ERROR);
    expect(Logger.getGlobalLevel()).toBe(LogLevel.ERROR);
  });

  // Test 12: DEBUG to stdout
  test('should output DEBUG message to stdout', () => {
    Logger.setGlobalLevel(LogLevel.DEBUG);
    const logger = new Logger('TEST');
    logger.debug('debug to stdout');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  // Test 13: WARN to stdout
  test('should output WARN message to stdout', () => {
    const logger = new Logger('TEST');
    logger.warn('warn to stdout');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });
});
