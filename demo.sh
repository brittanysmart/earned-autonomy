#!/bin/bash
# Single-command entry point for the portfolio demo: regenerates flags.json
# from the snapshot data, then starts the UI dev server.
set -e
cd "$(dirname "$0")"
python3 audit.py
cd ui
npm run dev
