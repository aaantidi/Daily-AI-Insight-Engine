// ============================================================
// tdd-cycle.js — TDD Closed-Loop Workflow Engine
// ============================================================
// Purpose: Orchestrate the full TDD cycle (Test -> Fix -> Verify -> CR)
// Sandbox: No fs, no Date.now() — use agent() for all I/O
// ============================================================

export const meta = {
  name: 'tdd-cycle',
  description: 'Full TDD closed-loop: run tests, auto-fix failures, verify, and code review',
  phases: [
    { title: 'Test & State Check', detail: 'Run Jest and assess test state' },
    { title: 'Fix', detail: 'Sub-agent fixes source code to pass tests' },
    { title: 'Verify Fix', detail: 'Re-run tests to confirm fix' },
    { title: 'Code Review & Verify', detail: 'Sub-agent refactors and final verification' },
  ],
};

// ============================================================
// Phase 1: Test & State Check
// ============================================================
phase('Test & State Check');

log('Running Jest test suite...');
const testResult = await agent(
  'Run the command: npx jest --json --outputFile=.claude/runtime/test_output.json 2>.claude/runtime/test_output.log. Report the exit code and any error output.',
  { label: 'run-jest' }
);
log('Jest run complete.');

// Read test output JSON
const testJsonRaw = await agent(
  'Read the file .claude/runtime/test_output.json and return its contents verbatim.',
  { label: 'read-test-json' }
);

// Read fail count
const failCountRaw = await agent(
  'Read the file .claude/runtime/fail_count.txt and return ONLY the number inside. If the file does not exist, return "0".',
  { label: 'read-fail-count' }
);

let failCount = 0;
try {
  const parsed = parseInt((failCountRaw || '0').trim(), 10);
  failCount = isNaN(parsed) ? 0 : parsed;
} catch (_) {
  failCount = 0;
}

// Parse test results
let testsPassed = false;
let numFailed = 0;
try {
  const result = JSON.parse(testJsonRaw || '{}');
  numFailed = result.numFailedTests || 0;
  testsPassed = result.success === true && numFailed === 0;
} catch (_) {
  testsPassed = !!(testJsonRaw && testJsonRaw.includes('"success": true'));
}

log('Tests passed: ' + testsPassed + ', Failed: ' + numFailed + ', Consecutive failures: ' + failCount);

// --- Abort check: 3+ consecutive failures ---
if (!testsPassed && failCount >= 3) {
  log('ABORT: 3+ consecutive test failures detected. Manual intervention required.');
  const abortReport = await agent(
    'You are in tdd-abort mode. Tests have failed 3+ consecutive times. Read .claude/runtime/test_output.json for failure details. Provide: 1) Root cause analysis, 2) Whether tests might be incorrectly specified, 3) Recommended next steps.',
    { label: 'abort-analysis' }
  );
  log('Abort report: ' + abortReport);
  return { status: 'aborted', reason: '3+ consecutive failures', report: abortReport };
}

// --- All tests passing: reset counter, proceed to CR ---
if (testsPassed) {
  log('All tests passing. Resetting fail counter and proceeding to Code Review.');
  await agent(
    'Delete the file .claude/runtime/fail_count.txt if it exists.',
    { label: 'reset-fail-count' }
  );
  failCount = 0;
}

// ============================================================
// Phase 2: Fix (Safe Penetration)
// ============================================================
if (!testsPassed) {
  phase('Fix');

  log('Tests failed. Preparing sub-agent fix environment...');

  const tsResult = await agent(
    'Run: date +%s and return ONLY the number.',
    { label: 'get-timestamp' }
  );
  const timestamp = (tsResult || '').trim();
  log('Fix cycle timestamp: ' + timestamp);

  // Write subprocess flag to penetrate TIER 2 sandbox
  await agent(
    'Create the file .claude/runtime/tdd_subprocess.flag with the content "1".',
    { label: 'write-flag' }
  );
  log('Subprocess flag written for sandbox penetration.');

  // Read test failures
  const testFailures = await agent(
    'Read the file .claude/runtime/test_output.json and extract: 1) Which test suites failed, 2) What assertion messages were shown, 3) The full list of failing test names. Return a structured summary.',
    { label: 'analyze-failures' }
  );

  // Read current sources
  const sourceCode = await agent(
    'List all files in src/ directory, then read each .ts file. Return their full contents.',
    { label: 'read-sources' }
  );

  // Read test files
  const testCode = await agent(
    'List all files in tests/ directory, then read each .test.ts or .spec.ts file. Return their full contents.',
    { label: 'read-tests' }
  );

  // Spawn Coder sub-agent
  log('Spawning Coder sub-agent to fix source code...');
  const fixPrompt = [
    'You are a TDD fixer (Coder sub-agent). Fix the source code in src/ to make failing tests pass.',
    '',
    'RULES:',
    '1. You CAN modify files in src/',
    '2. You MUST NEVER modify files in tests/',
    '3. Make MINIMAL changes',
    '4. Do NOT add new features',
    '',
    'TEST FAILURES:',
    testFailures,
    '',
    'CURRENT SOURCE CODE:',
    sourceCode,
    '',
    'TEST CODE (for reference, DO NOT MODIFY):',
    testCode,
  ].join('\n');

  const fixResult = await agent(
    fixPrompt,
    { label: 'coder-fix', schema: {
      type: 'object',
      properties: {
        filesModified: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
      required: ['filesModified', 'summary'],
    }}
  );
  log('Coder fix complete: ' + JSON.stringify(fixResult));

  // Clean up flag
  await agent(
    'Delete the file .claude/runtime/tdd_subprocess.flag.',
    { label: 'delete-flag' }
  );
  log('Subprocess flag cleaned up.');

  // ============================================================
  // Phase 3: Verify Fix
  // ============================================================
  phase('Verify Fix');

  log('Re-running tests to verify the fix...');
  await agent(
    'Run: npx jest --json --outputFile=.claude/runtime/test_output.json 2>.claude/runtime/test_output.log. Report the exit code.',
    { label: 'verify-jest' }
  );

  const verifyJsonRaw = await agent(
    'Read the file .claude/runtime/test_output.json and return its contents verbatim.',
    { label: 'read-verify-json' }
  );

  let verifyPassed = false;
  let verifyFailed = 0;
  try {
    const result = JSON.parse(verifyJsonRaw || '{}');
    verifyFailed = result.numFailedTests || 0;
    verifyPassed = result.success === true && verifyFailed === 0;
  } catch (_) {
    verifyPassed = false;
  }

  if (!verifyPassed) {
    const newFailCount = failCount + 1;
    await agent(
      'Write "' + newFailCount + '" to the file .claude/runtime/fail_count.txt.',
      { label: 'increment-fail-count' }
    );
    log('Fix verification FAILED. Fail count: ' + newFailCount);
    return { status: 'fix_failed', failCount: newFailCount, failedTests: verifyFailed };
  }

  log('Fix verified - all tests pass.');
}

// ============================================================
// Phase 4: Code Review & Verify
// ============================================================
phase('Code Review & Verify');

log('Starting Code Review phase...');

const crTsResult = await agent(
  'Run: date +%s and return ONLY the number.',
  { label: 'get-cr-timestamp' }
);
const crTimestamp = (crTsResult || '').trim();

// Create git backup snapshot
log('Creating git backup snapshot...');
await agent(
  'Run these commands in sequence: 1) git add -A 2) git commit -m "AUTO-CR-BACKUP" --allow-empty 3) git tag AUTO-CR-BACKUP-' + crTimestamp + ' 4) echo "BACKUP_CREATED"',
  { label: 'create-backup' }
);
log('Backup created: AUTO-CR-BACKUP-' + crTimestamp);

// Read current sources
const currentSources = await agent(
  'List and read all files in src/ directory. Return their full contents.',
  { label: 'read-current-sources' }
);

// Spawn Reviewer sub-agent
log('Spawning Reviewer sub-agent for code quality review...');
const reviewPrompt = [
  'You are a Code Reviewer sub-agent. All tests pass. Review and refactor source code for quality.',
  '',
  'RULES:',
  '1. Focus on code quality: naming, structure, DRY, readability',
  '2. You CAN modify src/',
  '3. After refactoring, run: npx jest to verify',
  '4. If ANY test fails, report it for rollback',
  '5. Do NOT modify tests/',
  '',
  'CURRENT SOURCE CODE:',
  currentSources,
].join('\n');

const reviewResult = await agent(
  reviewPrompt,
  { label: 'reviewer-refactor', schema: {
    type: 'object',
    properties: {
      filesModified: { type: 'array', items: { type: 'string' } },
      refactoringSummary: { type: 'string' },
      testsStillPass: { type: 'boolean' },
      issues: { type: 'array', items: { type: 'string' } },
    },
    required: ['filesModified', 'refactoringSummary', 'testsStillPass'],
  }}
);
log('Review result: ' + JSON.stringify(reviewResult));

// Final verification after CR
log('Running final verification after Code Review...');
await agent(
  'Run: npx jest --json --outputFile=.claude/runtime/test_output.json 2>.claude/runtime/test_output.log. Report exit code and failures.',
  { label: 'final-jest' }
);

const finalJsonRaw = await agent(
  'Read the file .claude/runtime/test_output.json and return its contents verbatim.',
  { label: 'read-final-json' }
);

let finalPassed = false;
try {
  const result = JSON.parse(finalJsonRaw || '{}');
  finalPassed = result.success === true && (result.numFailedTests || 0) === 0;
} catch (_) {
  finalPassed = false;
}

if (!finalPassed) {
  log('Tests FAILED after code review. Initiating ROLLBACK...');
  await agent(
    'Run these commands to rollback: 1) git reset --hard AUTO-CR-BACKUP-' + crTimestamp + ' 2) git clean -fd 3) git tag -d AUTO-CR-BACKUP-' + crTimestamp + ' 4) echo "ROLLBACK_COMPLETE"',
    { label: 'rollback' }
  );
  log('Rollback completed.');
  return {
    status: 'cr_failed_rolled_back',
    backupTag: 'AUTO-CR-BACKUP-' + crTimestamp,
    reviewSummary: reviewResult,
    rollback: 'successful',
  };
}

// Success
log('Code Review complete - all tests still pass.');
await agent(
  'Run: git tag -d AUTO-CR-BACKUP-' + crTimestamp + ' 2>/dev/null; echo "TAG_CLEANED"',
  { label: 'cleanup-tag' }
);

log('TDD Cycle complete: ALL GREEN + CODE REVIEWED.');

return {
  status: 'success',
  testsPassed: true,
  reviewSummary: reviewResult,
  backupTag: 'AUTO-CR-BACKUP-' + crTimestamp,
};
