import { Router, type IRouter } from "express";
import { db, vendorsTable, businessesTable, billsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusiness(businessId: number, userId: number) {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return b ?? null;
}

async function getVendorForUser(vendorId: number, userId: number) {
  const [row] = await db
    .select({ vendor: vendorsTable, business: businessesTable })
    .from(vendorsTable)
    .innerJoin(businessesTable, eq(vendorsTable.businessId, businessesTable.id))
    .where(and(eq(vendorsTable.id, vendorId), eq(businessesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

const VendorInput = z.object({
  businessId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  paymentTerms: z.coerce.number().int().optional().nullable(),
  defaultExpenseAccountId: z.coerce.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ─── GET /api/vendors?businessId=X ────────────────────────────────────────────
router.get("/vendors", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const vendors = await db.select().from(vendorsTable)
    .where(eq(vendorsTable.businessId, businessId))
    .orderBy(vendorsTable.name);

  // Annotate each vendor with bill counts / balance summary
  const bills = await db.select({
    vendorId: billsTable.vendorId,
    status: billsTable.status,
    balanceDue: billsTable.balanceDue,
    total: billsTable.total,
  }).from(billsTable).where(eq(billsTable.businessId, businessId));

  const billMap: Record<number, { unpaidCount: number; totalOwed: number; totalBilled: number }> = {};
  for (const b of bills) {
    if (!b.vendorId) continue;
    if (!billMap[b.vendorId]) billMap[b.vendorId] = { unpaidCount: 0, totalOwed: 0, totalBilled: 0 };
    const m = billMap[b.vendorId]!;
    m.totalBilled += parseFloat(b.total);
    if (b.status === "unpaid" || b.status === "partial" || b.status === "overdue") {
      m.unpaidCount++;
      m.totalOwed += parseFloat(b.balanceDue);
    }
  }

  res.json(vendors.map((v) => ({
    ...v,
    billSummary: billMap[v.id] ?? { unpaidCount: 0, totalOwed: 0, totalBilled: 0 },
  })));
});

// ─── POST /api/vendors ─────────────────────────────────────────────────────────
router.post("/vendors", async (req: AuthRequest, res): Promise<void> => {
  const body = VendorInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const businessId = body.data.businessId;
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const { businessId: _biz, ...data } = body.data;
  const [vendor] = await db.insert(vendorsTable).values({ ...data, businessId }).returning();
  res.status(201).json(vendor);
});

// ─── GET /api/vendors/:id ──────────────────────────────────────────────────────
router.get("/vendors/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getVendorForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(row.vendor);
});

// ─── PATCH /api/vendors/:id ────────────────────────────────────────────────────
router.patch("/vendors/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getVendorForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Vendor not found" }); return; }
  const body = VendorInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { businessId: _biz, ...data } = body.data;
  const [vendor] = await db.update(vendorsTable).set(data).where(eq(vendorsTable.id, id)).returning();
  res.json(vendor);
});

// ─── DELETE /api/vendors/:id ───────────────────────────────────────────────────
router.delete("/vendors/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getVendorForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Vendor not found" }); return; }
  await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
  res.json({ success: true });
});

export default router;
