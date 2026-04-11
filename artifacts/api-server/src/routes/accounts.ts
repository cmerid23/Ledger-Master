import { Router, type IRouter } from "express";
import { db, accountsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListAccountsParams,
  CreateAccountParams,
  CreateAccountBody,
  UpdateAccountParams,
  UpdateAccountBody,
  DeleteAccountParams,
} from "@workspace/api-zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusinessOwnership(businessId: number, userId: number): Promise<boolean> {
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
    .limit(1);
  return !!business;
}

router.get("/businesses/:businessId/accounts", async (req: AuthRequest, res): Promise<void> => {
  const params = ListAccountsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.businessId, params.data.businessId));

  res.json(accounts);
});

router.post("/businesses/:businessId/accounts", async (req: AuthRequest, res): Promise<void> => {
  const params = CreateAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [account] = await db
    .insert(accountsTable)
    .values({ ...parsed.data, businessId: params.data.businessId, isActive: true })
    .returning();

  res.status(201).json(account);
});

router.patch("/businesses/:businessId/accounts/:accountId", async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [account] = await db
    .update(accountsTable)
    .set(parsed.data)
    .where(and(eq(accountsTable.id, params.data.accountId), eq(accountsTable.businessId, params.data.businessId)))
    .returning();

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  res.json(account);
});

router.delete("/businesses/:businessId/accounts/:accountId", async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  // Archive instead of hard delete
  await db
    .update(accountsTable)
    .set({ isActive: false })
    .where(and(eq(accountsTable.id, params.data.accountId), eq(accountsTable.businessId, params.data.businessId)));

  res.sendStatus(204);
});

export default router;
