#!/bin/sh
export PATH="/nix/store/s41bqqrym7dlk8m3nk74fx26kgrx0kv8-replit-runtime-path/bin:$PATH"
cd /home/runner/workspace

echo "Step 1: Writing correct versions of conflicted files..."

cat > railway.toml << 'EOF'
[build]
buildCommand = "pnpm install --no-frozen-lockfile && BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/clearledger run build && pnpm --filter @workspace/api-server run build"

[deploy]
startCommand = "sh scripts/start.sh"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[environments.production]
NODE_ENV = "production"
DATABASE_URL = "${{Postgres.DATABASE_URL}}"
SESSION_SECRET = "${{SESSION_SECRET}}"
EOF

cat > artifacts/api-server/src/routes/health.ts << 'EOF'
import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Must respond immediately — Railway checks this before DB migrations finish
router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", ts: Date.now() });
});

router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", ts: Date.now() });
});

export default router;
EOF

echo "Step 2: Staging resolved files..."
git add -A

echo "Step 3: Completing merge commit..."
git commit -m "merge: resolve conflicts - keep Railway deployment config"

echo "Step 4: Pushing to GitHub..."
git push origin main

echo ""
echo "SUCCESS! Railway will now redeploy automatically."
