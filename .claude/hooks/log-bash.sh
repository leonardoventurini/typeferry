#!/usr/bin/env bash
# Logs every Bash/command tool call result to .claude/hooks/bash.log

set -euo pipefail

LOG_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/bash.log"
INPUT=$(cat)

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // .tool_input.description // "n/a"')
RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // empty' 2>/dev/null | head -c 4000)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

{
  echo "=== [$TIMESTAMP] $TOOL ==="
  echo "$ $COMMAND"
  echo "---"
  echo "$RESPONSE"
  echo ""
} >> "$LOG_FILE"

exit 0
