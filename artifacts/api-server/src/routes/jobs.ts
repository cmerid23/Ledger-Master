import { Router, type IRouter } from "express";
import { db, jobsTable, jobExpensesTable, customersTable, businessesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();
router.use(authMiddleware);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function verifyBusiness(businessId: number, userId: number) {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return b ?? null;
}

async function getJobForUser(jobId: number, userId: number) {
  const [row] = await db
    .select({ job: jobsTable, business: businessesTable, customerName: customersTable.name })
    .from(jobsTable)
    .innerJoin(businessesTable, eq(jobsTable.businessId, businessesTable.id))
    .leftJoin(customersTable, eq(jobsTable.customerId, customersTable.id))
    .where(and(eq(jobsTable.id, jobId), eq(businessesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

function n(v: string | null | undefined) { return parseFloat(v || "0"); }

function computeProfit(actualRevenue: string, actualCost: string) {
  const rev = n(actualRevenue);
  const cost = n(actualCost);
  const profit = rev - cost;
  const margin = rev > 0 ? ((profit / rev) * 100).toFixed(2) : "0.00";
  return { profit: profit.toFixed(2), profitMargin: margin };
}

function variance(estimated: string | null, actual: string) {
  if (!estimated) return { variance: null, variancePct: null };
  const est = n(estimated);
  const act = n(actual);
  const diff = act - est;
  const pct = est !== 0 ? ((diff / est) * 100).toFixed(2) : "0.00";
  return { variance: diff.toFixed(2), variancePct: pct };
}

function expensesByType(expenses: { expenseType: string | null; amount: string }[]) {
  const byType: Record<string, number> = {};
  for (const e of expenses) {
    const t = e.expenseType ?? "other";
    byType[t] = (byType[t] ?? 0) + n(e.amount);
  }
  return Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.toFixed(2)]));
}

function buildPnL(job: typeof jobsTable.$inferSelect, expenses: typeof jobExpensesTable.$inferSelect[]) {
  const rev = { estimated: job.estimatedRevenue, actual: job.actualRevenue, ...variance(job.estimatedRevenue, job.actualRevenue) };
  const cost = { estimated: job.estimatedCost, actual: job.actualCost, ...variance(job.estimatedCost, job.actualCost), byType: expensesByType(expenses) };
  const gross = n(job.actualRevenue) - n(job.actualCost);
  const margin = n(job.actualRevenue) > 0 ? ((gross / n(job.actualRevenue)) * 100).toFixed(2) : "0.00";

  const mileage = (job.actualMiles || job.estimatedMiles) ? {
    estimated: job.estimatedMiles,
    actual: job.actualMiles,
    revenuePerMile: job.actualMiles && n(job.actualMiles) > 0 ? (n(job.actualRevenue) / n(job.actualMiles)).toFixed(4) : null,
    costPerMile: job.actualMiles && n(job.actualMiles) > 0 ? (n(job.actualCost) / n(job.actualMiles)).toFixed(4) : null,
    ratePerMile: job.ratePerMile,
  } : null;

  return { revenue: rev, cost, profit: { gross: gross.toFixed(2), margin }, mileage };
}

// ─── schemas ──────────────────────────────────────────────────────────────────

const JobInput = z.object({
  businessId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  jobNumber: z.string().optional().nullable(),
  customerId: z.number().int().optional().nullable(),
  status: z.enum(["active", "completed", "cancelled", "on-hold"]).optional().default("active"),
  jobType: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  estimatedMiles: z.union([z.string(), z.number()]).transform(v => v == null ? null : String(v)).optional().nullable(),
  actualMiles: z.union([z.string(), z.number()]).transform(v => v == null ? null : String(v)).optional().nullable(),
  ratePerMile: z.union([z.string(), z.number()]).transform(v => v == null ? null : String(v)).optional().nullable(),
  flatRate: z.union([z.string(), z.number()]).transform(v => v == null ? null : String(v)).optional().nullable(),
  estimatedRevenue: z.union([z.string(), z.number()]).transform(v => v == null ? null : String(v)).optional().nullable(),
  actualRevenue: z.union([z.string(), z.number()]).transform(String).optional().default("0"),
  estimatedCost: z.union([z.string(), z.number()]).transform(v => v == null ? null : String(v)).optional().nullable(),
  actualCost: z.union([z.string(), z.number()]).transform(String).optional().default("0"),
  notes: z.string().optional().nullable(),
});

const ExpenseInput = z.object({
  description: z.string().optional().nullable(),
  amount: z.union([z.string(), z.number()]).transform(String),
  expenseType: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  transactionId: z.number().int().optional().nullable(),
  receiptId: z.number().int().optional().nullable(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC routes must come BEFORE parameterized /:id routes
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/jobs?businessId=X  (list + profit summary) ──────────────────────
router.get("/jobs", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId query param required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const statusFilter = req.query["status"] as string | undefined;
  const typeFilter = req.query["jobType"] as string | undefined;

  let query = db.select({
    id: jobsTable.id,
    name: jobsTable.name,
    jobNumber: jobsTable.jobNumber,
    status: jobsTable.status,
    jobType: jobsTable.jobType,
    startDate: jobsTable.startDate,
    endDate: jobsTable.endDate,
    origin: jobsTable.origin,
    destination: jobsTable.destination,
    estimatedRevenue: jobsTable.estimatedRevenue,
    actualRevenue: jobsTable.actualRevenue,
    estimatedCost: jobsTable.estimatedCost,
    actualCost: jobsTable.actualCost,
    profit: jobsTable.profit,
    profitMargin: jobsTable.profitMargin,
    estimatedMiles: jobsTable.estimatedMiles,
    actualMiles: jobsTable.actualMiles,
    ratePerMile: jobsTable.ratePerMile,
    flatRate: jobsTable.flatRate,
    createdAt: jobsTable.createdAt,
    completedAt: jobsTable.completedAt,
    customerId: jobsTable.customerId,
    customerName: customersTable.name,
  }).from(jobsTable)
    .leftJoin(customersTable, eq(jobsTable.customerId, customersTable.id))
    .where(eq(jobsTable.businessId, businessId))
    .orderBy(desc(jobsTable.createdAt));

  const jobs = await query;

  // Apply in-memory filters (avoids complex conditional drizzle where chains)
  const filtered = jobs.filter((j) => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (typeFilter && j.jobType !== typeFilter) return false;
    return true;
  });

  // Build profit summary across ALL jobs (not filtered)
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalRevenue = 0, totalCost = 0, totalProfit = 0;
  let marginSum = 0, marginCount = 0;

  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    if (j.jobType) byType[j.jobType] = (byType[j.jobType] ?? 0) + 1;
    totalRevenue += n(j.actualRevenue);
    totalCost += n(j.actualCost);
    totalProfit += n(j.profit);
    if (j.profitMargin) { marginSum += n(j.profitMargin); marginCount++; }
  }

  const summary = {
    totalJobs: jobs.length,
    activeJobs: byStatus["active"] ?? 0,
    completedJobs: byStatus["completed"] ?? 0,
    totalRevenue: totalRevenue.toFixed(2),
    totalCost: totalCost.toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    avgMargin: marginCount > 0 ? (marginSum / marginCount).toFixed(2) : "0.00",
    overallMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0.00",
    byStatus,
    byType,
  };

  res.json({ jobs: filtered, summary });
});

// ─── POST /api/jobs ────────────────────────────────────────────────────────────
router.post("/jobs", async (req: AuthRequest, res): Promise<void> => {
  const body = JobInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const businessId = body.data.businessId;
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const { businessId: _biz, ...data } = body.data;
  const profitData = computeProfit(data.actualRevenue, data.actualCost);
  const [job] = await db.insert(jobsTable).values({ ...data, businessId, ...profitData }).returning();
  res.status(201).json(job);
});

// ─── GET /api/jobs/report/summary  ← MUST be before /jobs/:id ─────────────────
router.get("/jobs/report/summary", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId query param required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const jobs = await db.select({
    id: jobsTable.id,
    name: jobsTable.name,
    jobNumber: jobsTable.jobNumber,
    status: jobsTable.status,
    jobType: jobsTable.jobType,
    startDate: jobsTable.startDate,
    endDate: jobsTable.endDate,
    estimatedRevenue: jobsTable.estimatedRevenue,
    actualRevenue: jobsTable.actualRevenue,
    estimatedCost: jobsTable.estimatedCost,
    actualCost: jobsTable.actualCost,
    profit: jobsTable.profit,
    profitMargin: jobsTable.profitMargin,
    actualMiles: jobsTable.actualMiles,
    estimatedMiles: jobsTable.estimatedMiles,
    completedAt: jobsTable.completedAt,
    customerName: customersTable.name,
  }).from(jobsTable)
    .leftJoin(customersTable, eq(jobsTable.customerId, customersTable.id))
    .where(eq(jobsTable.businessId, businessId))
    .orderBy(desc(jobsTable.profit));

  // Aggregate totals
  let totalRevenue = 0, totalCost = 0, totalProfit = 0;
  let totalMiles = 0, miledJobs = 0;
  const byStatus: Record<string, { count: number; revenue: number; profit: number }> = {};
  const byType: Record<string, { count: number; revenue: number; profit: number }> = {};

  for (const j of jobs) {
    const rev = n(j.actualRevenue), cost = n(j.actualCost), profit = n(j.profit);
    totalRevenue += rev; totalCost += cost; totalProfit += profit;
    if (j.actualMiles) { totalMiles += n(j.actualMiles); miledJobs++; }

    // by status
    if (!byStatus[j.status]) byStatus[j.status] = { count: 0, revenue: 0, profit: 0 };
    byStatus[j.status]!.count++; byStatus[j.status]!.revenue += rev; byStatus[j.status]!.profit += profit;

    // by type
    const t = j.jobType ?? "other";
    if (!byType[t]) byType[t] = { count: 0, revenue: 0, profit: 0 };
    byType[t]!.count++; byType[t]!.revenue += rev; byType[t]!.profit += profit;
  }

  // Format aggregates
  const fmtGroup = (g: Record<string, { count: number; revenue: number; profit: number }>) =>
    Object.fromEntries(Object.entries(g).map(([k, v]) => [k, {
      count: v.count,
      revenue: v.revenue.toFixed(2),
      profit: v.profit.toFixed(2),
      margin: v.revenue > 0 ? ((v.profit / v.revenue) * 100).toFixed(2) : "0.00",
    }]));

  const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0.00";
  const avgRevenuePerMile = miledJobs > 0 && totalMiles > 0 ? (totalRevenue / totalMiles).toFixed(4) : null;

  const sorted = [...jobs].sort((a, b) => n(b.profit) - n(a.profit));
  const topPerformers = sorted.slice(0, 3).map((j) => ({ id: j.id, name: j.name, profit: j.profit, margin: j.profitMargin }));
  const bottomPerformers = sorted.slice(-3).reverse().map((j) => ({ id: j.id, name: j.name, profit: j.profit, margin: j.profitMargin }));

  res.json({
    generatedAt: new Date().toISOString(),
    period: { businessId },
    summary: {
      totalJobs: jobs.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalCost: totalCost.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      overallMargin,
      totalMiles: miledJobs > 0 ? totalMiles.toFixed(2) : null,
      avgRevenuePerMile,
    },
    byStatus: fmtGroup(byStatus),
    byType: fmtGroup(byType),
    topPerformers,
    bottomPerformers,
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      jobNumber: j.jobNumber,
      status: j.status,
      jobType: j.jobType,
      customerName: j.customerName,
      startDate: j.startDate,
      endDate: j.endDate,
      revenue: { estimated: j.estimatedRevenue, actual: j.actualRevenue, ...variance(j.estimatedRevenue, j.actualRevenue) },
      cost: { estimated: j.estimatedCost, actual: j.actualCost, ...variance(j.estimatedCost, j.actualCost) },
      profit: j.profit,
      margin: j.profitMargin,
      miles: { estimated: j.estimatedMiles, actual: j.actualMiles },
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED routes — must come AFTER all static sub-paths
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/jobs/:id  (job + P&L breakdown) ─────────────────────────────────
router.get("/jobs/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }

  const expenses = await db.select().from(jobExpensesTable)
    .where(eq(jobExpensesTable.jobId, id)).orderBy(desc(jobExpensesTable.createdAt));

  const pnl = buildPnL(row.job, expenses);
  res.json({ ...row.job, customerName: row.customerName, expenses, pnl });
});

// ─── PATCH /api/jobs/:id ───────────────────────────────────────────────────────
router.patch("/jobs/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }
  const body = JobInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { businessId: _biz, ...data } = body.data;

  const currentJob = row.job;
  const actualRevenue = data.actualRevenue ?? String(currentJob.actualRevenue);
  const actualCost = data.actualCost ?? String(currentJob.actualCost);
  const profitData = computeProfit(actualRevenue, actualCost);

  const completedAt =
    data.status === "completed" && currentJob.status !== "completed" ? new Date()
    : data.status && data.status !== "completed" ? null
    : currentJob.completedAt;

  const [job] = await db.update(jobsTable)
    .set({ ...data, ...profitData, ...(data.status !== undefined ? { completedAt } : {}) })
    .where(eq(jobsTable.id, id)).returning();
  res.json(job);
});

// ─── DELETE /api/jobs/:id ──────────────────────────────────────────────────────
router.delete("/jobs/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.json({ success: true });
});

// ─── GET /api/jobs/:id/profitability  (full P&L report) ───────────────────────
router.get("/jobs/:id/profitability", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }

  const expenses = await db.select().from(jobExpensesTable)
    .where(eq(jobExpensesTable.jobId, id)).orderBy(jobExpensesTable.date, desc(jobExpensesTable.createdAt));

  const job = row.job;
  const rev = n(job.actualRevenue);
  const cost = n(job.actualCost);
  const gross = rev - cost;
  const margin = rev > 0 ? ((gross / rev) * 100).toFixed(2) : "0.00";

  // Revenue vs cost variance
  const revVar = variance(job.estimatedRevenue, job.actualRevenue);
  const costVar = variance(job.estimatedCost, job.actualCost);

  // Expense breakdown by type with subtotals
  const byType: Record<string, { amount: number; count: number; items: typeof expenses }> = {};
  for (const e of expenses) {
    const t = e.expenseType ?? "other";
    if (!byType[t]) byType[t] = { amount: 0, count: 0, items: [] };
    byType[t]!.amount += n(e.amount);
    byType[t]!.count++;
    byType[t]!.items.push(e);
  }

  const costBreakdown = Object.fromEntries(
    Object.entries(byType).sort(([, a], [, b]) => b.amount - a.amount).map(([k, v]) => [k, {
      amount: v.amount.toFixed(2),
      count: v.count,
      pctOfTotalCost: cost > 0 ? ((v.amount / cost) * 100).toFixed(2) : "0.00",
      expenses: v.items,
    }])
  );

  // Mileage economics
  const mileage = (job.actualMiles || job.estimatedMiles) ? {
    estimated: job.estimatedMiles,
    actual: job.actualMiles,
    variance: job.actualMiles && job.estimatedMiles
      ? (n(job.actualMiles) - n(job.estimatedMiles)).toFixed(2) : null,
    ratePerMile: job.ratePerMile,
    revenuePerMile: job.actualMiles && n(job.actualMiles) > 0
      ? (rev / n(job.actualMiles)).toFixed(4) : null,
    costPerMile: job.actualMiles && n(job.actualMiles) > 0
      ? (cost / n(job.actualMiles)).toFixed(4) : null,
    profitPerMile: job.actualMiles && n(job.actualMiles) > 0
      ? (gross / n(job.actualMiles)).toFixed(4) : null,
  } : null;

  res.json({
    generatedAt: new Date().toISOString(),
    job: {
      id: job.id,
      name: job.name,
      jobNumber: job.jobNumber,
      status: job.status,
      jobType: job.jobType,
      customerName: row.customerName,
      startDate: job.startDate,
      endDate: job.endDate,
      completedAt: job.completedAt,
    },
    revenue: {
      estimated: job.estimatedRevenue,
      actual: job.actualRevenue,
      ...revVar,
    },
    cost: {
      estimated: job.estimatedCost,
      actual: job.actualCost,
      ...costVar,
      breakdown: costBreakdown,
    },
    profit: {
      gross: gross.toFixed(2),
      margin,
      vsEstimated: job.estimatedRevenue && job.estimatedCost
        ? (gross - (n(job.estimatedRevenue) - n(job.estimatedCost))).toFixed(2) : null,
    },
    mileage,
    expenses,
  });
});

// ─── GET /api/jobs/:id/expenses ────────────────────────────────────────────────
router.get("/jobs/:id/expenses", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }
  const expenses = await db.select().from(jobExpensesTable)
    .where(eq(jobExpensesTable.jobId, id)).orderBy(desc(jobExpensesTable.createdAt));
  res.json(expenses);
});

// ─── POST /api/jobs/:id/expenses ───────────────────────────────────────────────
router.post("/jobs/:id/expenses", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }
  const body = ExpenseInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [expense] = await db.insert(jobExpensesTable).values({ ...body.data, jobId: id }).returning();

  const allExpenses = await db.select().from(jobExpensesTable).where(eq(jobExpensesTable.jobId, id));
  const totalCost = allExpenses.reduce((s, e) => s + n(e.amount), 0);
  const profitData = computeProfit(String(row.job.actualRevenue), totalCost.toFixed(2));
  await db.update(jobsTable).set({ actualCost: totalCost.toFixed(2), ...profitData }).where(eq(jobsTable.id, id));

  res.status(201).json({ expense, totalCost: totalCost.toFixed(2), ...profitData });
});

// ─── DELETE /api/jobs/:id/expenses/:expenseId ──────────────────────────────────
router.delete("/jobs/:id/expenses/:expenseId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const expenseId = Number(req.params["expenseId"]);
  if (!id || !expenseId) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }

  await db.delete(jobExpensesTable)
    .where(and(eq(jobExpensesTable.id, expenseId), eq(jobExpensesTable.jobId, id)));

  const allExpenses = await db.select().from(jobExpensesTable).where(eq(jobExpensesTable.jobId, id));
  const totalCost = allExpenses.reduce((s, e) => s + n(e.amount), 0);
  const profitData = computeProfit(String(row.job.actualRevenue), totalCost.toFixed(2));
  await db.update(jobsTable).set({ actualCost: totalCost.toFixed(2), ...profitData }).where(eq(jobsTable.id, id));

  res.json({ success: true, totalCost: totalCost.toFixed(2) });
});

export default router;
