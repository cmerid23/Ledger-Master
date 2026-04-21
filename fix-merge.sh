#!/bin/sh
export PATH="/nix/store/s41bqqrym7dlk8m3nk74fx26kgrx0kv8-replit-runtime-path/bin:$PATH"
cd /home/runner/workspace
echo "Staging resolved files..."
git add railway.toml artifacts/api-server/src/routes/health.ts
echo "Completing merge commit..."
git commit -m "merge: resolve conflicts, keep Railway fixes + Claude Code features"
echo "Pushing to GitHub..."
git push origin main
echo "Done! Check Railway for your new deployment."
