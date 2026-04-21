#!/bin/sh
export PATH="/nix/store/s41bqqrym7dlk8m3nk74fx26kgrx0kv8-replit-runtime-path/bin:$PATH"
cd /home/runner/workspace

echo "Force pushing to GitHub (our local branch has all changes merged)..."
git push --force-with-lease origin main

echo ""
echo "SUCCESS! Check Railway for your new deployment."
