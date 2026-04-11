import { Router, type IRouter } from "express";
import { db, reconciliationsTable, transactionsTable, journalEntriesTable, journalLinesTable, accountsTable, businessesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListReconciliationsParams,
  CreateReconciliationParams,
  CreateReconciliationBody,
  RunReconciliationParams,
  CompleteReconciliationParams,
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

function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;

  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function dateDiffDays(d1: string, d2: string): number {
  const diff = Math.abs(new Date(d1).getTime() - new Date(d2).getTime());
  return diff / (1000 * 60 * 60 * 24);
}

router.get("/businesses/:businessId/reconciliations", async (req: AuthRequest, res): Promise<void> => {
  const params = ListReconciliationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const reconciliations = await db
    .select()
    .from(reconciliationsTable)
    .where(eq(reconciliationsTable.businessId, params.data.businessId))
    .orderBy(desc(reconciliationsTable.createdAt));

  res.json(
    reconciliations.map((r) => ({
      ...r,
      openingBalance: Number(r.openingBalance),
      closingBalance: Number(r.closingBalance),
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.post("/businesses/:businessId/reconciliations", async (req: AuthRequest, res): Promise<void> => {
  const params = CreateReconciliationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = CreateReconciliationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [reconciliation] = await db
    .insert(reconciliationsTable)
    .values({
      businessId: params.data.businessId,
      bankAccountName: parsed.data.bankAccountName,
      statementDate: parsed.data.statementDate,
      openingBalance: String(parsed.data.openingBalance),
      closingBalance: String(parsed.data.closingBalance),
      status: "pending",
    })
    .returning();

  res.status(201).json({
    ...reconciliation,
    openingBalance: Number(reconciliation.openingBalance),
    closingBalance: Number(reconciliation.closingBalance),
    createdAt: reconciliation.createdAt.toISOString(),
  });
});

router.post("/businesses/:businessId/reconciliations/:reconciliationId/run", async (req: AuthRequest, res): Promise<void> => {
  const params = RunReconciliationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const [reconciliation] = await db
    .select()
    .from(reconciliationsTable)
    .where(and(eq(reconciliationsTable.id, params.data.reconciliationId), eq(reconciliationsTable.businessId, params.data.businessId)))
    .limit(1);

  if (!reconciliation) {
    res.status(404).json({ error: "Reconciliation not found" });
    return;
  }

  // Update status to in_progress
  await db
    .update(reconciliationsTable)
    .set({ status: "in_progress" })
    .where(eq(reconciliationsTable.id, reconciliation.id));

  // Get unreconciled bank transactions
  const bankTxns = await db
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
    .where(and(eq(transactionsTable.businessId, params.data.businessId), eq(transactionsTable.reconciled, false)));

  // Get journal entries
  const journalEntries = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.businessId, params.data.businessId));

  const journalWithLines = await Promise.all(
    journalEntries.map(async (entry) => {
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
        .where(eq(journalLinesTable.journalEntryId, entry.id));
      return {
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        lines: lines.map((l) => ({
          ...l,
          debitAmount: Number(l.debitAmount),
          creditAmount: Number(l.creditAmount),
        })),
      };
    })
  );

  // Reconciliation algorithm
  const matched: Array<{ bankTransaction: object; journalEntry: object }> = [];
  const matchedBankIds = new Set<number>();
  const matchedJournalIds = new Set<number>();

  for (const bankTx of bankTxns) {
    const bankAmount = Number(bankTx.amount);
    for (const journalEntry of journalWithLines) {
      if (matchedJournalIds.has(journalEntry.id)) continue;

      const journalTotal = journalEntry.lines.reduce((sum, l) => sum + l.debitAmount, 0);
      const amountMatch = Math.abs(bankAmount - journalTotal) < 0.01;
      const dateDiff = dateDiffDays(bankTx.date, journalEntry.date);
      const descSimilarity = stringSimilarity(bankTx.description, journalEntry.memo || "");

      if (amountMatch && dateDiff <= 3 && descSimilarity > 0.3) {
        matched.push({
          bankTransaction: {
            ...bankTx,
            amount: bankAmount,
            createdAt: bankTx.createdAt.toISOString(),
          },
          journalEntry,
        });
        matchedBankIds.add(bankTx.id);
        matchedJournalIds.add(journalEntry.id);
        break;
      }
    }
  }

  // Auto-mark matched bank transactions as reconciled
  for (const id of matchedBankIds) {
    await db.update(transactionsTable).set({ reconciled: true }).where(eq(transactionsTable.id, id));
  }

  const unmatchedBank = bankTxns
    .filter((tx) => !matchedBankIds.has(tx.id))
    .map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
      createdAt: tx.createdAt.toISOString(),
    }));

  const unmatchedJournal = journalWithLines.filter((e) => !matchedJournalIds.has(e.id));

  const openingBal = Number(reconciliation.openingBalance);
  const closingBal = Number(reconciliation.closingBalance);

  res.json({
    matched,
    unmatchedBank,
    unmatchedJournal,
    summary: {
      totalMatched: matched.length,
      totalUnmatchedBank: unmatchedBank.length,
      totalUnmatchedJournal: unmatchedJournal.length,
      openingBalance: openingBal,
      closingBalance: closingBal,
      difference: closingBal - openingBal,
    },
  });
});

router.post("/businesses/:businessId/reconciliations/:reconciliationId/complete", async (req: AuthRequest, res): Promise<void> => {
  const params = CompleteReconciliationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const [reconciliation] = await db
    .update(reconciliationsTable)
    .set({ status: "completed" })
    .where(and(eq(reconciliationsTable.id, params.data.reconciliationId), eq(reconciliationsTable.businessId, params.data.businessId)))
    .returning();

  if (!reconciliation) {
    res.status(404).json({ error: "Reconciliation not found" });
    return;
  }

  res.json({
    ...reconciliation,
    openingBalance: Number(reconciliation.openingBalance),
    closingBalance: Number(reconciliation.closingBalance),
    createdAt: reconciliation.createdAt.toISOString(),
  });
});

export default router;
