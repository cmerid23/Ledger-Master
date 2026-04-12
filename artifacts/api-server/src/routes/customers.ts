import { Router, type IRouter } from "express";
import { db, customersTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

async function getCustomerForUser(customerId: number, userId: number) {
  const [row] = await db
    .select({ customer: customersTable, businessId: businessesTable.id })
    .from(customersTable)
    .innerJoin(businessesTable, eq(customersTable.businessId, businessesTable.id))
    .where(and(eq(customersTable.id, customerId), eq(businessesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

const CustomerBody = z.object({
  businessId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  country: z.string().optional().default("US"),
  paymentTerms: z.number().int().optional().default(30),
  notes: z.string().optional().nullable(),
});

// ─── GET /api/customers?businessId=X ──────────────────────────────────────────
router.get("/customers", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) {
    res.status(400).json({ error: "businessId query param required" });
    return;
  }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const customers = await db.select().from(customersTable)
    .where(eq(customersTable.businessId, businessId))
    .orderBy(customersTable.name);
  res.json(customers);
});

// ─── POST /api/customers ───────────────────────────────────────────────────────
router.post("/customers", async (req: AuthRequest, res): Promise<void> => {
  const body = CustomerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const businessId = body.data.businessId;
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const { businessId: _biz, ...data } = body.data;
  const [customer] = await db.insert(customersTable).values({ ...data, businessId }).returning();
  res.status(201).json(customer);
});

// ─── PATCH /api/customers/:id ─────────────────────────────────────────────────
router.patch("/customers/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getCustomerForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  const body = CustomerBody.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { businessId: _biz, ...data } = body.data;
  const [customer] = await db.update(customersTable).set(data).where(eq(customersTable.id, id)).returning();
  res.json(customer);
});

// ─── DELETE /api/customers/:id ────────────────────────────────────────────────
router.delete("/customers/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getCustomerForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.json({ success: true });
});

// ─── legacy compat: keep old /businesses/:businessId/customers routes ──────────
router.get("/businesses/:businessId/customers", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const customers = await db.select().from(customersTable)
    .where(eq(customersTable.businessId, businessId)).orderBy(customersTable.name);
  res.json(customers);
});
router.post("/businesses/:businessId/customers", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const body = CustomerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { businessId: _biz, ...data } = body.data;
  const [customer] = await db.insert(customersTable).values({ ...data, businessId }).returning();
  res.status(201).json(customer);
});
router.put("/businesses/:businessId/customers/:customerId", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const id = Number(req.params["customerId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const body = CustomerBody.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { businessId: _biz, ...data } = body.data;
  const [customer] = await db.update(customersTable).set(data)
    .where(and(eq(customersTable.id, id), eq(customersTable.businessId, businessId))).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(customer);
});
router.delete("/businesses/:businessId/customers/:customerId", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const id = Number(req.params["customerId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  await db.delete(customersTable).where(and(eq(customersTable.id, id), eq(customersTable.businessId, businessId)));
  res.json({ success: true });
});

export default router;
