import { Router, type IRouter } from "express";
import { db, transactionsTable, accountsTable, businessesTable } from "@workspace/db";
import { eq, and, sql, ilike, desc } from "drizzle-orm";
import {
  ListTransactionsParams,
  ListTransactionsQueryParams,
  CreateTransactionParams,
  CreateTransactionBody,
  UpdateTransactionParams,
  UpdateTransactionBody,
  DeleteTransactionParams,
  BulkCategorizeTransactionsParams,
  BulkCategorizeTransactionsBody,
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

router.get("/businesses/:businessId/transactions", async (req: AuthRequest, res): Promise<void> => {
  const params = ListTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const query = ListTransactionsQueryParams.safeParse(req.query);
  const page = query.success ? (query.data.page ?? 1) : 1;
  const limit = query.success ? (query.data.limit ?? 50) : 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(transactionsTable.businessId, params.data.businessId)];

  if (query.success) {
    if (query.data.accountId) {
      conditions.push(eq(transactionsTable.accountId, query.data.accountId));
    }
    if (query.data.reconciled !== undefined) {
      conditions.push(eq(transactionsTable.reconciled, query.data.reconciled));
    }
    if (query.data.search) {
      conditions.push(ilike(transactionsTable.description, `%${query.data.search}%`));
    }
    if (query.data.startDate) {
      conditions.push(sql`${transactionsTable.date} >= ${query.data.startDate}`);
    }
    if (query.data.endDate) {
      conditions.push(sql`${transactionsTable.date} <= ${query.data.endDate}`);
    }
  }

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(and(...conditions));
  const total = Number(totalResult[0].count);

  const rows = await db
    .select({
      id: transactionsTable.id,
      businessId: transactionsTable.businessId,
      date: transactionsTable.date,
      description: transactionsTable.description,
      amount: transactionsTable.amount,
      type: transactionsTable.type,
      accountId: transactionsTable.accountId,
      accountName: accountsTable.name,
      source: transactionsTable.source,
      reconciled: transactionsTable.reconciled,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .leftJoin(accountsTable, eq(transactionsTable.accountId, accountsTable.id))
    .where(and(...conditions))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    transactions: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  });
});

router.post("/businesses/:businessId/transactions", async (req: AuthRequest, res): Promise<void> => {
  const params = CreateTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      businessId: params.data.businessId,
      date: parsed.data.date,
      description: parsed.data.description,
      amount: String(parsed.data.amount),
      type: parsed.data.type,
      accountId: parsed.data.accountId ?? null,
      source: parsed.data.source ?? "manual",
    })
    .returning();

  res.status(201).json({
    ...tx,
    amount: Number(tx.amount),
    createdAt: tx.createdAt.toISOString(),
  });
});

router.patch("/businesses/:businessId/transactions/:transactionId", async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.date !== undefined) updateData.date = parsed.data.date;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);
  if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
  if (parsed.data.accountId !== undefined) updateData.accountId = parsed.data.accountId;
  if (parsed.data.reconciled !== undefined) updateData.reconciled = parsed.data.reconciled;

  const [tx] = await db
    .update(transactionsTable)
    .set(updateData)
    .where(and(eq(transactionsTable.id, params.data.transactionId), eq(transactionsTable.businessId, params.data.businessId)))
    .returning();

  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.json({
    ...tx,
    amount: Number(tx.amount),
    createdAt: tx.createdAt.toISOString(),
  });
});

router.delete("/businesses/:businessId/transactions/:transactionId", async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  await db
    .delete(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.transactionId), eq(transactionsTable.businessId, params.data.businessId)));

  res.sendStatus(204);
});

router.post("/businesses/:businessId/transactions/bulk-categorize", async (req: AuthRequest, res): Promise<void> => {
  const params = BulkCategorizeTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = BulkCategorizeTransactionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let updated = 0;
  for (const txId of parsed.data.transactionIds) {
    const result = await db
      .update(transactionsTable)
      .set({ accountId: parsed.data.accountId })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.businessId, params.data.businessId)))
      .returning();
    if (result.length > 0) updated++;
  }

  res.json({ updated });
});

export default router;
