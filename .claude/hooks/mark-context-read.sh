#!/bin/bash
# PostToolUse hook: fires after any Read tool call.
# If the file read was CONTEXT.md, touch a sentinel file recording when it was read.
# This is how the commit-blocking hook knows CONTEXT.md has actually been read this session.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == *CONTEXT.md ]]; then
  mkdir -p "$(dirname "$0")/.."
  date +%s > "$(dirname "$0")/../.context-read-sentinel"
fi

exit 0
