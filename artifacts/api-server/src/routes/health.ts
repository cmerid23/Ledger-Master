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
