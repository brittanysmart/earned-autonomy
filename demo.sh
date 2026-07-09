#!/bin/bash
# Single-command entry point for the demo: regenerates flags.json from the
# snapshot data, starts the UI dev server, and opens it once it's actually
# ready — meant to be safe to run cold in front of someone.
#
# audit.py itself is NOT run here — ui/package.json's own `predev` hook runs it
# through this same .venv right before `npm run dev` starts. Calling it here too
# would just run the (slow, LLM-calling) audit twice for every launch.
set -e
cd "$(dirname "$0")"

BOLD='\033[1m'; DIM='\033[2m'; GREEN='\033[32m'; YELLOW='\033[33m'; RESET='\033[0m'

wait_for_url() {
  # Poll a URL until it responds or the attempt budget runs out (one try/sec).
  local url=$1 attempts=$2
  for i in $(seq 1 "$attempts"); do
    curl -s -o /dev/null --max-time 2 "$url" && return 0
    sleep 1
  done
  return 1
}

echo -e "${BOLD}Earned Autonomy${RESET}${DIM} — starting demo${RESET}"

# Clear out any dev server left running from a previous/crashed run first —
# otherwise a stale process already on :3000 could satisfy the readiness
# check below and this script would call it "Ready" without ever having
# started a new one.
pkill -f "next dev" 2>/dev/null || true

if ! curl -s -o /dev/null --max-time 2 http://localhost:11434; then
  echo -e "${YELLOW}Ollama isn't running — starting it...${RESET}"
  if ! brew services start ollama >/dev/null 2>&1; then
    echo "Couldn't start Ollama automatically. Start it yourself, then re-run this script."
    exit 1
  fi
  if ! wait_for_url http://localhost:11434 15; then
    echo -e "${YELLOW}Ollama still isn't responding after 15s — continuing, but scoring may fail.${RESET}"
  fi
fi

if [ ! -d .venv ]; then
  echo -e "${DIM}First run — setting up the Python environment (uv)...${RESET}"
  uv venv --quiet
fi
uv pip install --quiet --python .venv/bin/python -r requirements.txt

cd ui
echo -e "${DIM}Scoring docs with the local model, then starting the UI...${RESET}"
npm run dev > /tmp/earned-autonomy-dev.log 2>&1 &
DEV_PID=$!
# Left active for the rest of the script, including the final `wait` below —
# an earlier version cleared this trap right before waiting, which meant
# Ctrl+C during the actual demo (the normal way to end it) orphaned the dev
# server on port 3000 instead of cleaning it up. Also kills by process name,
# not just $DEV_PID, since npm forks next.js as a child process that
# `kill $DEV_PID` alone wouldn't reach.
trap 'kill $DEV_PID 2>/dev/null; pkill -f "next dev" 2>/dev/null' EXIT

if wait_for_url http://localhost:3000 60; then
  echo -e "${GREEN}Ready${RESET} → http://localhost:3000"
  open http://localhost:3000 2>/dev/null || true
  wait $DEV_PID
else
  echo "Still not responding after 60s — check /tmp/earned-autonomy-dev.log"
  cat /tmp/earned-autonomy-dev.log
  exit 1
fi
