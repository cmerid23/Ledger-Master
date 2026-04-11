import { Router, type IRouter } from "express";
import { db, transactionsTable, accountsTable, reconciliationsTable, businessesTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { GetDashboardSummaryParams, GetRevenueChartParams, GetRecentTransactionsParams } from "@workspace/api-zod";
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

router.get("/businesses/:businessId/dashboard/summary", async (req: AuthRequest, res): Promise<void> => {
  const params = GetDashboardSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const businessId = params.data.businessId;
  const currentYear = new Date().getFullYear();
  const startDate = `${currentYear}-01-01`;
  const endDate = `${currentYear}-12-31`;

  // Get income accounts
  const incomeAccounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.type, "income"), eq(accountsTable.isActive, true)));

  // Get expense accounts
  const expenseAccounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.type, "expense"), eq(accountsTable.isActive, true)));

  // Get asset accounts (cash)
  const assetAccounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.type, "asset"), eq(accountsTable.isActive, true)));

  let totalRevenue = 0;
  for (const acc of incomeAccounts) {
    const result = await db
      .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.businessId, businessId),
          eq(transactionsTable.accountId, acc.id),
          sql`${transactionsTable.date} >= ${startDate}`,
          sql`${transactionsTable.date} <= ${endDate}`
        )
      );
    totalRevenue += Number(result[0]?.total ?? 0);
  }

  let totalExpenses = 0;
  for (const acc of expenseAccounts) {
    const result = await db
      .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.businessId, businessId),
          eq(transactionsTable.accountId, acc.id),
          sql`${transactionsTable.date} >= ${startDate}`,
          sql`${transactionsTable.date} <= ${endDate}`
        )
      );
    totalExpenses += Number(result[0]?.total ?? 0);
  }

  let cashBalance = 0;
  for (const acc of assetAccounts) {
    const result = await db
      .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.businessId, businessId), eq(transactionsTable.accountId, acc.id)));
    cashBalance += Number(result[0]?.total ?? 0);
  }

  const [transactionCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(eq(transactionsTable.businessId, businessId));

  // Check reconciliation status
  const [latestReconciliation] = await db
    .select()
    .from(reconciliationsTable)
    .where(eq(reconciliationsTable.businessId, businessId))
    .orderBy(desc(reconciliationsTable.createdAt))
    .limit(1);

  const reconciliationStatus =
    !latestReconciliation || latestReconciliation.status !== "completed" ? "needs_review" : "up_to_date";

  res.json({
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    cashBalance,
    reconciliationStatus,
    transactionCount: Number(transactionCount.count),
  });
});

router.get("/businesses/:businessId/dashboard/revenue-chart", async (req: AuthRequest, res): Promise<void> => {
  const params = GetRevenueChartParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const businessId = params.data.businessId;
  const months = [];
  const now = new Date();

  const incomeAccounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.type, "income"), eq(accountsTable.isActive, true)));

  const expenseAccounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.type, "expense"), eq(accountsTable.isActive, true)));

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;
    const monthLabel = d.toLocaleString("en-US", { month: "short", year: "2-digit" });

    let revenue = 0;
    for (const acc of incomeAccounts) {
      const result = await db
        .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.businessId, businessId),
            eq(transactionsTable.accountId, acc.id),
            sql`${transactionsTable.date} >= ${startDate}`,
            sql`${transactionsTable.date} <= ${endDate}`
          )
        );
      revenue += Number(result[0]?.total ?? 0);
    }

    let expenses = 0;
    for (const acc of expenseAccounts) {
      const result = await db
        .select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.businessId, businessId),
            eq(transactionsTable.accountId, acc.id),
            sql`${transactionsTable.date} >= ${startDate}`,
            sql`${transactionsTable.date} <= ${endDate}`
          )
        );
      expenses += Number(result[0]?.total ?? 0);
    }

    months.push({ month: monthLabel, revenue, expenses });
  }

  res.json(months);
});

router.get("/businesses/:businessId/dashboard/recent-transactions", async (req: AuthRequest, res): Promise<void> => {
  const params = GetRecentTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

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
    .where(eq(transactionsTable.businessId, params.data.businessId))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
    .limit(10);

  res.json(
    rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

export default router;
