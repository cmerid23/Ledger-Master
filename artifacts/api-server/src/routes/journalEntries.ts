import { Router, type IRouter } from "express";
import { db, journalEntriesTable, journalLinesTable, accountsTable, businessesTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  ListJournalEntriesParams,
  ListJournalEntriesQueryParams,
  CreateJournalEntryParams,
  CreateJournalEntryBody,
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

async function getEntryWithLines(entryId: number) {
  const [entry] = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.id, entryId))
    .limit(1);

  if (!entry) return null;

  const lines = await db
    .select({
      id: journalLinesTable.id,
      journalEntryId: journalLinesTable.journalEntryId,
      accountId: journalLinesTable.accountId,
      accountName: accountsTable.name,
      debitAmount: journalLinesTable.debitAmount,
      creditAmount: journalLinesTable.creditAmount,
    })
    .from(journalLinesTable)
    .leftJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.journalEntryId, entryId));

  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    lines: lines.map((l) => ({
      ...l,
      debitAmount: Number(l.debitAmount),
      creditAmount: Number(l.creditAmount),
    })),
  };
}

router.get("/businesses/:businessId/journal-entries", async (req: AuthRequest, res): Promise<void> => {
  const params = ListJournalEntriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const query = ListJournalEntriesQueryParams.safeParse(req.query);

  const conditions = [eq(journalEntriesTable.businessId, params.data.businessId)];
  if (query.success && query.data.startDate) {
    conditions.push(sql`${journalEntriesTable.date} >= ${query.data.startDate}`);
  }
  if (query.success && query.data.endDate) {
    conditions.push(sql`${journalEntriesTable.date} <= ${query.data.endDate}`);
  }

  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(journalEntriesTable.date), desc(journalEntriesTable.createdAt));

  const result = await Promise.all(entries.map((e) => getEntryWithLines(e.id)));
  res.json(result.filter(Boolean));
});

router.post("/businesses/:businessId/journal-entries", async (req: AuthRequest, res): Promise<void> => {
  const params = CreateJournalEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = CreateJournalEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate debits = credits
  const totalDebits = parsed.data.lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredits = parsed.data.lines.reduce((sum, l) => sum + l.creditAmount, 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    res.status(400).json({ error: "Debits must equal credits" });
    return;
  }

  const [entry] = await db
    .insert(journalEntriesTable)
    .values({
      businessId: params.data.businessId,
      date: parsed.data.date,
      memo: parsed.data.memo ?? null,
    })
    .returning();

  await db.insert(journalLinesTable).values(
    parsed.data.lines.map((l) => ({
      journalEntryId: entry.id,
      accountId: l.accountId,
      debitAmount: String(l.debitAmount),
      creditAmount: String(l.creditAmount),
    }))
  );

  const result = await getEntryWithLines(entry.id);
  res.status(201).json(result);
});

export default router;
