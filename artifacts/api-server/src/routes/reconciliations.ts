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

// Character-based similarity (ported from reconcileEngine.js)
function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s1 || !s2) return 0;
  let matches = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matches++;
  }
  return matches / Math.max(s1.length, s2.length);
}

function dateDiffDays(d1: string, d2: string): number {
  const diff = Math.abs(new Date(d1).getTime() - new Date(d2).getTime());
  return diff / (1000 * 60 * 60 * 24);
}

// Weighted score: amount 50%, date 30%, description 20%
function matchScore(bankAmount: number, bankDate: string, bankDesc: string, journalAmount: number, journalDate: string, journalMemo: string): number {
  const amountMatch = Math.abs(bankAmount - journalAmount) < 0.01 ? 0.5 : 0;
  const dateMatch = dateDiffDays(bankDate, journalDate) <= 3 ? 0.3 : 0;
  const descScore = similarity(bankDesc, journalMemo) * 0.2;
  return amountMatch + dateMatch + descScore;
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

  // ── Reconciliation engine (ported from reconcileEngine.js) ──
  type MatchedPair = { bankTransaction: object; journalEntry: object; confidence: "high" | "low" };
  const matched: MatchedPair[] = [];
  const needsReview: MatchedPair[] = [];
  const matchedBankIds = new Set<number>();
  const remainingJournal = [...journalWithLines];

  for (const bankTx of bankTxns) {
    const bankAmount = Number(bankTx.amount);
    let bestScore = 0;
    let bestMatch: (typeof journalWithLines)[number] | null = null;

    for (const journalEntry of remainingJournal) {
      const journalTotal = journalEntry.lines.reduce((sum, l) => sum + l.debitAmount, 0);
      const score = matchScore(bankAmount, bankTx.date, bankTx.description, journalTotal, journalEntry.date, journalEntry.memo ?? "");
      if (score > bestScore) { bestScore = score; bestMatch = journalEntry; }
    }

    const serializedBank = { ...bankTx, amount: bankAmount, createdAt: bankTx.createdAt.toISOString() };

    if (bestScore >= 0.8 && bestMatch) {
      matched.push({ bankTransaction: serializedBank, journalEntry: bestMatch, confidence: "high" });
      matchedBankIds.add(bankTx.id);
      remainingJournal.splice(remainingJournal.indexOf(bestMatch), 1);
    } else if (bestScore >= 0.5 && bestMatch) {
      needsReview.push({ bankTransaction: serializedBank, journalEntry: bestMatch, confidence: "low" });
      matchedBankIds.add(bankTx.id);
      remainingJournal.splice(remainingJournal.indexOf(bestMatch), 1);
    }
    // else: stays in unmatchedBank (not added to matchedBankIds)
  }

  // Auto-mark only HIGH-confidence matches as reconciled
  for (const pair of matched) {
    const bt = pair.bankTransaction as { id: number };
    await db.update(transactionsTable).set({ reconciled: true }).where(eq(transactionsTable.id, bt.id));
  }

  const unmatchedBank = bankTxns
    .filter((tx) => !matchedBankIds.has(tx.id))
    .map((tx) => ({ ...tx, amount: Number(tx.amount), createdAt: tx.createdAt.toISOString() }));

  const unmatchedJournal = remainingJournal;

  const openingBal = Number(reconciliation.openingBalance);
  const closingBal = Number(reconciliation.closingBalance);

  res.json({
    matched,
    needsReview,
    unmatchedBank,
    unmatchedJournal,
    summary: {
      total: bankTxns.length,
      autoReconciled: matched.length,
      reviewNeeded: needsReview.length,
      unmatched: unmatchedBank.length,
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
