import { Router, type IRouter } from "express";
import { db, transactionsTable, accountsTable, journalLinesTable, journalEntriesTable, businessesTable } from "@workspace/db";
import { eq, and, sql, lte, isNull, gte } from "drizzle-orm";
import {
  GetProfitLossReportParams,
  GetProfitLossReportQueryParams,
  GetBalanceSheetReportParams,
  GetBalanceSheetReportQueryParams,
  GetTrialBalanceReportParams,
  GetTrialBalanceReportQueryParams,
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

router.get("/businesses/:businessId/reports/profit-loss", async (req: AuthRequest, res): Promise<void> => {
  const params = GetProfitLossReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const query = GetProfitLossReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { startDate, endDate } = query.data;
  const businessId = params.data.businessId;

  const accounts = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.isActive, true)));

  const incomeAccounts = accounts.filter((a) => a.type === "income");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  async function getAccountTotal(accountId: number): Promise<number> {
    const result = await db
      .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.businessId, businessId),
          eq(transactionsTable.accountId, accountId),
          sql`${transactionsTable.date} >= ${startDate}`,
          sql`${transactionsTable.date} <= ${endDate}`
        )
      );
    return Number(result[0]?.total ?? 0);
  }

  const incomeItems = await Promise.all(
    incomeAccounts.map(async (a) => ({
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      amount: await getAccountTotal(a.id),
    }))
  );

  const expenseItems = await Promise.all(
    expenseAccounts.map(async (a) => ({
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      amount: await getAccountTotal(a.id),
    }))
  );

  // Also pull in unassigned transactions (bank uploads with no account mapping)
  // so the P&L is populated immediately after a statement import.
  const unassignedCreditResult = await db
    .select({ total: sql<number>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), 0)` })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.businessId, businessId),
      isNull(transactionsTable.accountId),
      eq(transactionsTable.type, "credit"),
      gte(transactionsTable.date, startDate),
      lte(transactionsTable.date, endDate),
    ));

  const unassignedDebitResult = await db
    .select({ total: sql<number>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), 0)` })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.businessId, businessId),
      isNull(transactionsTable.accountId),
      eq(transactionsTable.type, "debit"),
      gte(transactionsTable.date, startDate),
      lte(transactionsTable.date, endDate),
    ));

  const unassignedCreditTotal = Number(unassignedCreditResult[0]?.total ?? 0);
  const unassignedDebitTotal  = Number(unassignedDebitResult[0]?.total ?? 0);

  if (unassignedCreditTotal > 0) {
    incomeItems.push({ accountId: -1, accountName: "Bank Deposits (Unassigned)", accountCode: "", amount: unassignedCreditTotal });
  }
  if (unassignedDebitTotal > 0) {
    expenseItems.push({ accountId: -1, accountName: "Bank Withdrawals (Unassigned)", accountCode: "", amount: unassignedDebitTotal });
  }

  const totalIncome = incomeItems.reduce((sum, i) => sum + i.amount, 0);
  const totalExpenses = expenseItems.reduce((sum, i) => sum + i.amount, 0);

  res.json({
    startDate,
    endDate,
    income: { title: "Income", items: incomeItems, total: totalIncome },
    expenses: { title: "Expenses", items: expenseItems, total: totalExpenses },
    netProfit: totalIncome - totalExpenses,
  });
});

router.get("/businesses/:businessId/reports/balance-sheet", async (req: AuthRequest, res): Promise<void> => {
  const params = GetBalanceSheetReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const query = GetBalanceSheetReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { asOfDate } = query.data;
  const businessId = params.data.businessId;

  const accounts = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.isActive, true)));

  async function getAccountBalance(accountId: number): Promise<number> {
    const result = await db
      .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.businessId, businessId),
          eq(transactionsTable.accountId, accountId),
          lte(transactionsTable.date, asOfDate)
        )
      );
    return Number(result[0]?.total ?? 0);
  }

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const liabilityAccounts = accounts.filter((a) => a.type === "liability");
  const equityAccounts = accounts.filter((a) => a.type === "equity");

  const assetItems = await Promise.all(
    assetAccounts.map(async (a) => ({
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      amount: await getAccountBalance(a.id),
    }))
  );

  const liabilityItems = await Promise.all(
    liabilityAccounts.map(async (a) => ({
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      amount: await getAccountBalance(a.id),
    }))
  );

  const equityItems = await Promise.all(
    equityAccounts.map(async (a) => ({
      accountId: a.id,
      accountName: a.name,
      accountCode: a.code,
      amount: await getAccountBalance(a.id),
    }))
  );

  const totalAssets = assetItems.reduce((sum, i) => sum + i.amount, 0);
  const totalLiabilities = liabilityItems.reduce((sum, i) => sum + i.amount, 0);
  const totalEquity = equityItems.reduce((sum, i) => sum + i.amount, 0);

  res.json({
    asOfDate,
    assets: { title: "Assets", items: assetItems, total: totalAssets },
    liabilities: { title: "Liabilities", items: liabilityItems, total: totalLiabilities },
    equity: { title: "Equity", items: equityItems, total: totalEquity },
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
  });
});

router.get("/businesses/:businessId/reports/trial-balance", async (req: AuthRequest, res): Promise<void> => {
  const params = GetTrialBalanceReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const query = GetTrialBalanceReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { asOfDate } = query.data;
  const businessId = params.data.businessId;

  const accounts = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.isActive, true)));

  const items = await Promise.all(
    accounts.map(async (account) => {
      const debitsResult = await db
        .select({ total: sql<number>`coalesce(sum(${journalLinesTable.debitAmount}), 0)` })
        .from(journalLinesTable)
        .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
        .where(
          and(
            eq(journalLinesTable.accountId, account.id),
            eq(journalEntriesTable.businessId, businessId),
            lte(journalEntriesTable.date, asOfDate)
          )
        );

      const creditsResult = await db
        .select({ total: sql<number>`coalesce(sum(${journalLinesTable.creditAmount}), 0)` })
        .from(journalLinesTable)
        .innerJoin(journalEntriesTable, eq(journalLinesTable.journalEntryId, journalEntriesTable.id))
        .where(
          and(
            eq(journalLinesTable.accountId, account.id),
            eq(journalEntriesTable.businessId, businessId),
            lte(journalEntriesTable.date, asOfDate)
          )
        );

      return {
        accountId: account.id,
        accountName: account.name,
        accountCode: account.code,
        accountType: account.type,
        debit: Number(debitsResult[0]?.total ?? 0),
        credit: Number(creditsResult[0]?.total ?? 0),
      };
    })
  );

  const totalDebits = items.reduce((sum, i) => sum + i.debit, 0);
  const totalCredits = items.reduce((sum, i) => sum + i.credit, 0);

  res.json({
    asOfDate,
    items,
    totalDebits,
    totalCredits,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
  });
});

// ── Monthly Cash-Basis P&L ────────────────────────────────────────────────────
// Groups ALL transactions (assigned + unassigned) by month → great for quick
// analysis right after a bank statement import.

router.get("/businesses/:businessId/reports/monthly", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }

  const owned = await verifyBusinessOwnership(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const startDate = (req.query.startDate as string) || "2020-01-01";
  const endDate   = (req.query.endDate   as string) || new Date().toISOString().slice(0, 10);

  // Get all transactions grouped by month and type
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactionsTable.date}::date, 'YYYY-MM')`,
      type:  transactionsTable.type,
      total: sql<number>`sum(cast(${transactionsTable.amount} as numeric))`,
    })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.businessId, businessId),
      gte(transactionsTable.date, startDate),
      lte(transactionsTable.date, endDate),
    ))
    .groupBy(
      sql`to_char(${transactionsTable.date}::date, 'YYYY-MM')`,
      transactionsTable.type,
    )
    .orderBy(sql`to_char(${transactionsTable.date}::date, 'YYYY-MM')`);

  // Pivot into month objects
  const byMonth: Record<string, { month: string; income: number; expenses: number; net: number }> = {};
  for (const row of rows) {
    const m = row.month;
    if (!byMonth[m]) byMonth[m] = { month: m, income: 0, expenses: 0, net: 0 };
    const amt = Number(row.total ?? 0);
    if (row.type === "credit") byMonth[m].income += amt;
    else byMonth[m].expenses += amt;
  }
  const months = Object.values(byMonth).map(m => ({ ...m, net: m.income - m.expenses }));

  const totalIncome   = months.reduce((s, m) => s + m.income,   0);
  const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);

  res.json({ months, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses });
});

export default router;
