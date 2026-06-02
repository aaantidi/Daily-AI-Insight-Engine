#!/usr/bin/env bash
# ============================================================
# signal-writer.sh — Jest Signal Source with Physical Debounce
# ============================================================
# Mounted on: Stop (fires when conversation turn ends)
#
# Behavior:
#   1. Acquire atomic lock (mkdir) to prevent concurrent runs
#   2. Sleep 3 seconds (debounce window, then release)
#   3. Strip sensitive environment keys
#   4. Run jest silently, output JSON to .claude/runtime/test_output.json
#   5. Print success/failure signal for the main agent
# ============================================================

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUNTIME_DIR="${PROJECT_DIR}/.claude/runtime"
LOCK_DIR="${RUNTIME_DIR}/debounce.lock"
TEST_OUTPUT="${RUNTIME_DIR}/test_output.json"
TEST_LOG="${RUNTIME_DIR}/test_output.log"
FAIL_COUNT_FILE="${RUNTIME_DIR}/fail_count.txt"

# --- Phase 1: Atomic Lock Acquisition ---
# mkdir is atomic on all platforms — if it fails, another instance is running
mkdir "${LOCK_DIR}" 2>/dev/null || {
    # Another signal-writer is already running — silently exit
    exit 0
}

# --- Phase 2: Debounce Sleep ---
# Wait 3 seconds to coalesce rapid Stop events, then release lock
sleep 3
rmdir "${LOCK_DIR}" 2>/dev/null

# --- Phase 3: Strip Sensitive Environment ---
# Preserve only essential system variables
# Use env -u to clean API keys while keeping APPDATA/USERPROFILE/LANG etc.
CLEAN_ENV=()
for _var in ANTHROPIC_API_KEY CLAUDE_API_KEY OPENAI_API_KEY; do
    CLEAN_ENV+=("env" "-u" "${_var}")
done
unset _var

# --- Phase 4: Run Jest ---
# Run silently; capture both JSON and human-readable log
cd "${PROJECT_DIR}" || exit 1

# Check if tests directory has any test files
if [ ! -d "tests" ] || [ -z "$(ls tests/*.test.ts tests/*.spec.ts 2>/dev/null)" ]; then
    # No test files found — nothing to do
    exit 0
fi

# Run jest with cleaned environment, capture output
JEST_EXIT_CODE=0
env -u ANTHROPIC_API_KEY -u CLAUDE_API_KEY -u OPENAI_API_KEY \
    npx jest --json --outputFile="${TEST_OUTPUT}" > "${TEST_LOG}" 2>&1 || JEST_EXIT_CODE=$?

# --- Phase 5: Signal ---
if [ "${JEST_EXIT_CODE}" -ne 0 ]; then
    # Track consecutive failures
    FAIL_COUNT=1
    if [ -f "${FAIL_COUNT_FILE}" ]; then
        FAIL_COUNT=$(cat "${FAIL_COUNT_FILE}")
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    echo "${FAIL_COUNT}" > "${FAIL_COUNT_FILE}"

    # Print failure signal
    echo ""
    echo "=============================================="
    echo "🚨 [TDD] Tests FAILED (consecutive failures: ${FAIL_COUNT})"
    echo "=============================================="
    echo ""
    echo "ACTION: Run '/workflow tdd-cycle' to auto-fix failures."
    echo "See details: ${TEST_OUTPUT}"
    echo ""

    if [ "${FAIL_COUNT}" -ge 3 ]; then
        echo "⚠️  WARNING: 3+ consecutive failures detected."
        echo "The auto-fix cycle may be stuck. Consider manual intervention."
        echo ""
    fi
else
    # Reset fail count on success
    rm -f "${FAIL_COUNT_FILE}"

    # Print success signal
    echo ""
    echo "=============================================="
    echo "✅ [TDD] Tests PASSED"
    echo "=============================================="
    echo ""
    echo "ACTION: Run '/workflow tdd-cycle' to trigger Auto-CR (code review)."
    echo ""
fi

exit 0
