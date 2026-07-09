#!/bin/bash
# PreToolUse hook: fires before any Bash tool call.
# If the command is a git commit, require that CONTEXT.md was read recently
# (sentinel file touched within the last 6 hours = roughly "this session").
# If not, deny the commit and tell Claude to read CONTEXT.md first, then retry.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE 'git commit'; then
  SENTINEL="$(dirname "$0")/../.context-read-sentinel"
  MAX_AGE_SECONDS=$((6 * 60 * 60))  # 6 hours

  if [[ ! -f "$SENTINEL" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Read CONTEXT.md in the project root before committing, then retry the commit. It explains this project'"'"'s intent and standing decisions so commit messages and judgment calls reflect that, not just the diff."}}'
    exit 0
  fi

  NOW=$(date +%s)
  LAST_READ=$(cat "$SENTINEL")
  AGE=$((NOW - LAST_READ))

  if [[ "$AGE" -gt "$MAX_AGE_SECONDS" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"CONTEXT.md was last read more than 6 hours ago. Re-read it before committing, then retry."}}'
    exit 0
  fi
fi

exit 0
