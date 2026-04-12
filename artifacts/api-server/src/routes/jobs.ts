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

function computeProfit(actualRevenue: string, actualCost: string) {
  const rev = parseFloat(actualRevenue || "0");
  const cost = parseFloat(actualCost || "0");
  const profit = rev - cost;
  const margin = rev > 0 ? ((profit / rev) * 100).toFixed(2) : "0.00";
  return { profit: profit.toFixed(2), profitMargin: margin };
}

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

// ─── GET /api/jobs?businessId=X ───────────────────────────────────────────────
router.get("/jobs", async (req: AuthRequest, res): Promise<void> => {
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
  res.json(jobs);
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

// ─── GET /api/jobs/:id ─────────────────────────────────────────────────────────
router.get("/jobs/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getJobForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Job not found" }); return; }
  const expenses = await db.select().from(jobExpensesTable)
    .where(eq(jobExpensesTable.jobId, id)).orderBy(desc(jobExpensesTable.createdAt));
  res.json({ ...row.job, customerName: row.customerName, expenses });
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

  // Auto-set completedAt if status changes to completed
  const completedAt = data.status === "completed" && currentJob.status !== "completed"
    ? new Date()
    : (data.status && data.status !== "completed" ? null : currentJob.completedAt);

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

  // Recompute job actual_cost from all expenses
  const allExpenses = await db.select().from(jobExpensesTable).where(eq(jobExpensesTable.jobId, id));
  const totalCost = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
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
  const totalCost = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
  const profitData = computeProfit(String(row.job.actualRevenue), totalCost.toFixed(2));
  await db.update(jobsTable).set({ actualCost: totalCost.toFixed(2), ...profitData }).where(eq(jobsTable.id, id));

  res.json({ success: true, totalCost: totalCost.toFixed(2) });
});

export default router;
