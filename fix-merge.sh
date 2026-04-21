#!/bin/sh
export PATH="/nix/store/s41bqqrym7dlk8m3nk74fx26kgrx0kv8-replit-runtime-path/bin:$PATH"
cd /home/runner/workspace
echo "Pulling latest from GitHub..."
git pull origin main --no-rebase
echo "Pushing to GitHub..."
git push origin main
echo "Done! Check Railway for your new deployment."
