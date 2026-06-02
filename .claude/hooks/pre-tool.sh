#!/usr/bin/env bash
# ============================================================
# pre-tool.sh — Two-Tier Orchestration Interceptor
# ============================================================
# Mounted on: PreToolUse (Edit|Write)
# Exit codes: 0 = allow, 1 = block (with message to stderr)
#
# Environment variables set by Claude Code hook system:
#   CLAUDE_EVENT_TYPE       — "PreToolUse"
#   CLAUDE_PROJECT_DIR      — project root
#   CLAUDE_TOOL_NAME        — tool being invoked (Edit/Write)
#
# Tier logic:
#   TIER 1 (normal):   Block writes to src/, tests/, .specs/feature/
#   TIER 2 (subprocess): Allow src/, block tests/
#   BYPASS:             CLAUDE_TDD_BYPASS=1 allows everything
# ============================================================

# --- Emergency Bypass ---
if [ "${CLAUDE_TDD_BYPASS}" = "1" ]; then
    exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUNTIME_DIR="${PROJECT_DIR}/.claude/runtime"

# --- Read tool call JSON from stdin ---
# Claude Code passes tool call details via stdin
TOOL_JSON=""
if [ -t 0 ]; then
    # No stdin available (should not happen in hook context)
    exit 0
else
    TOOL_JSON=$(cat)
fi

# --- Determine if we're in subprocess mode ---
IS_SUBPROCESS=0
if [ "${CLAUDE_TDD_MODE}" = "subprocess" ]; then
    IS_SUBPROCESS=1
elif [ -f "${RUNTIME_DIR}/tdd_subprocess.flag" ]; then
    IS_SUBPROCESS=1
fi

# --- Extract file path from tool call JSON ---
# The file_path field contains the target file being edited
TARGET_FILE=$(echo "${TOOL_JSON}" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# If no file_path found, try old_string pattern (Edit tool on existing files)
if [ -z "${TARGET_FILE}" ]; then
    # For Edit tool, the content matching old_string implies the target
    # Allow by default if we can't determine the file
    exit 0
fi

# --- Normalize path for comparison ---
# Strip PROJECT_DIR prefix and convert to relative
REL_PATH="${TARGET_FILE}"
if echo "${TARGET_FILE}" | grep -q "^${PROJECT_DIR}"; then
    REL_PATH="${TARGET_FILE#${PROJECT_DIR}/}"
fi

# --- TIER 2: Subprocess Mode ---
if [ "${IS_SUBPROCESS}" -eq 1 ]; then
    # Allow src/ writes, still block tests/ and .specs/feature/
    if echo "${REL_PATH}" | grep -qE '^tests/'; then
        echo "[HOOK] BLOCKED (TIER 2): Sub-agents must not modify tests/. Use /workflow tdd-cycle to coordinate test changes." >&2
        exit 1
    fi
    if echo "${REL_PATH}" | grep -qE '^.specs/feature/'; then
        echo "[HOOK] BLOCKED (TIER 2): Sub-agents must not modify spec files directly." >&2
        exit 1
    fi
    # Allow src/ modifications
    exit 0
fi

# --- TIER 1: Normal Mode (Main Agent) ---
# Block writes to protected code directories
if echo "${REL_PATH}" | grep -qE '^(src/|tests/|.specs/feature/)'; then
    echo "[HOOK] BLOCKED (TIER 1): Main Agent must not directly write code files (${REL_PATH})." >&2
    echo "[HOOK] ACTION REQUIRED: Spawn a sub-agent via the Agent tool to write code. See CLAUDE.md §0." >&2
    exit 1
fi

# Allow all other writes (config files, docs, etc.)
exit 0
