import { Router, type IRouter } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import crypto from "crypto";

const router: IRouter = Router();
router.use(authMiddleware as any);

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

router.get("/api-keys", async (req: AuthRequest, res) => {
  try {
    const businessId = Number(req.query.businessId);
    if (!businessId) return res.status(400).json({ error: "businessId required" });
    const keys = await db.select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      scopes: apiKeysTable.scopes,
      isActive: apiKeysTable.isActive,
      lastUsedAt: apiKeysTable.lastUsedAt,
      expiresAt: apiKeysTable.expiresAt,
      createdAt: apiKeysTable.createdAt,
    }).from(apiKeysTable).where(eq(apiKeysTable.businessId, businessId));
    res.json(keys);
  } catch {
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
});

router.post("/api-keys", async (req: AuthRequest, res) => {
  try {
    const { businessId, name, scopes, expiresAt } = req.body;
    if (!businessId || !name) return res.status(400).json({ error: "businessId and name required" });
    const rawKey = `clk_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);
    const [key] = await db.insert(apiKeysTable).values({
      businessId: Number(businessId),
      name,
      keyHash,
      keyPrefix,
      scopes: scopes || "read",
      isActive: true,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    }).returning({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      scopes: apiKeysTable.scopes,
      isActive: apiKeysTable.isActive,
      createdAt: apiKeysTable.createdAt,
    });
    // Return raw key only once
    res.status(201).json({ ...key, rawKey });
  } catch {
    res.status(500).json({ error: "Failed to create API key" });
  }
});

router.patch("/api-keys/:id", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive, name } = req.body;
    const [key] = await db.update(apiKeysTable)
      .set({ isActive, name })
      .where(eq(apiKeysTable.id, id))
      .returning();
    res.json(key);
  } catch {
    res.status(500).json({ error: "Failed to update API key" });
  }
});

router.delete("/api-keys/:id", async (req: AuthRequest, res) => {
  try {
    await db.delete(apiKeysTable).where(eq(apiKeysTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

export default router;
