#!/bin/sh
export PATH="/nix/store/s41bqqrym7dlk8m3nk74fx26kgrx0kv8-replit-runtime-path/bin:$PATH"
cd /home/runner/workspace

echo "Pulling from GitHub (auto-resolving conflicts with our versions)..."
git pull origin main --no-rebase -X ours

echo "Pushing to GitHub..."
git push origin main

echo "Done! Railway will now redeploy."
