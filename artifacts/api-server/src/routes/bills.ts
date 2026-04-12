import { Router, type IRouter } from "express";
import { db, billsTable, billLineItemsTable, billPaymentsTable, vendorsTable, businessesTable } from "@workspace/db";
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

async function getBillForUser(billId: number, userId: number) {
  const [row] = await db
    .select({ bill: billsTable, business: businessesTable, vendorName: vendorsTable.name })
    .from(billsTable)
    .innerJoin(businessesTable, eq(billsTable.businessId, businessesTable.id))
    .leftJoin(vendorsTable, eq(billsTable.vendorId, vendorsTable.id))
    .where(and(eq(billsTable.id, billId), eq(businessesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

function n(v: string | null | undefined) { return parseFloat(v || "0"); }

function recalcTotals(lineItems: { amount: string }[], taxRate: string) {
  const subtotal = lineItems.reduce((s, li) => s + n(li.amount), 0);
  const taxAmount = subtotal * (n(taxRate) / 100);
  const total = subtotal + taxAmount;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
  };
}

function recalcBalance(total: string, amountPaid: string) {
  const balanceDue = Math.max(0, n(total) - n(amountPaid)).toFixed(2);
  return { balanceDue };
}

function deriveStatus(total: string, amountPaid: string, dueDate: string | null, currentStatus: string): string {
  if (currentStatus === "cancelled") return "cancelled";
  const paid = n(amountPaid);
  const tot = n(total);
  if (tot <= 0) return currentStatus;
  if (paid >= tot) return "paid";
  if (paid > 0) return "partial";
  if (dueDate && new Date(dueDate) < new Date()) return "overdue";
  return "unpaid";
}

// ─── schemas ──────────────────────────────────────────────────────────────────

const LineItemInput = z.object({
  id: z.number().int().optional(),
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).transform(String).default("1"),
  rate: z.union([z.string(), z.number()]).transform(String).default("0"),
  amount: z.union([z.string(), z.number()]).transform(String).default("0"),
  accountId: z.coerce.number().int().optional().nullable(),
  jobId: z.coerce.number().int().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const BillInput = z.object({
  businessId: z.coerce.number().int().positive().optional(),
  vendorId: z.coerce.number().int().optional().nullable(),
  billNumber: z.string().optional().nullable(),
  jobId: z.coerce.number().int().optional().nullable(),
  status: z.enum(["unpaid", "partial", "paid", "overdue", "cancelled"]).optional().default("unpaid"),
  billDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  taxRate: z.union([z.string(), z.number()]).transform(String).optional().default("0"),
  notes: z.string().optional().nullable(),
  lineItems: z.array(LineItemInput).optional().default([]),
});

const PaymentInput = z.object({
  amount: z.union([z.string(), z.number()]).transform(String),
  paymentDate: z.string(),
  paymentMethod: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  transactionId: z.coerce.number().int().optional().nullable(),
});

// ─── GET /api/bills?businessId=X  ─────────────────────────────────────────────
router.get("/bills", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const statusFilter = req.query["status"] as string | undefined;
  const vendorFilter = req.query["vendorId"] ? Number(req.query["vendorId"]) : undefined;

  const bills = await db.select({
    id: billsTable.id,
    billNumber: billsTable.billNumber,
    vendorId: billsTable.vendorId,
    vendorName: vendorsTable.name,
    jobId: billsTable.jobId,
    status: billsTable.status,
    billDate: billsTable.billDate,
    dueDate: billsTable.dueDate,
    subtotal: billsTable.subtotal,
    taxAmount: billsTable.taxAmount,
    total: billsTable.total,
    amountPaid: billsTable.amountPaid,
    balanceDue: billsTable.balanceDue,
    createdAt: billsTable.createdAt,
    paidAt: billsTable.paidAt,
  }).from(billsTable)
    .leftJoin(vendorsTable, eq(billsTable.vendorId, vendorsTable.id))
    .where(eq(billsTable.businessId, businessId))
    .orderBy(desc(billsTable.createdAt));

  const filtered = bills.filter((b) => {
    if (statusFilter && b.status !== statusFilter) return false;
    if (vendorFilter && b.vendorId !== vendorFilter) return false;
    return true;
  });

  // Summary across all (unfiltered)
  let totalUnpaid = 0, totalOverdue = 0, totalPaid = 0, totalBilled = 0;
  for (const b of bills) {
    totalBilled += n(b.total);
    if (b.status === "paid") totalPaid += n(b.amountPaid);
    if (b.status === "unpaid" || b.status === "partial") totalUnpaid += n(b.balanceDue);
    if (b.status === "overdue") totalOverdue += n(b.balanceDue);
  }

  res.json({
    bills: filtered,
    summary: {
      totalBills: bills.length,
      totalBilled: totalBilled.toFixed(2),
      totalUnpaid: totalUnpaid.toFixed(2),
      totalOverdue: totalOverdue.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
    },
  });
});

// ─── POST /api/bills  ──────────────────────────────────────────────────────────
router.post("/bills", async (req: AuthRequest, res): Promise<void> => {
  const body = BillInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const businessId = body.data.businessId;
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const { businessId: _biz, lineItems, ...data } = body.data;
  const totals = recalcTotals(lineItems, data.taxRate);
  const status = deriveStatus(totals.total, "0", data.dueDate ?? null, data.status);

  const [bill] = await db.insert(billsTable).values({
    ...data, businessId, ...totals, amountPaid: "0", balanceDue: totals.total, status,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(billLineItemsTable).values(
      lineItems.map((li, i) => ({ ...li, billId: bill.id, sortOrder: i }))
    );
  }

  const items = await db.select().from(billLineItemsTable).where(eq(billLineItemsTable.billId, bill.id));
  res.status(201).json({ ...bill, lineItems: items, payments: [] });
});

// ─── GET /api/bills/summary  ← MUST be before /:id ────────────────────────────
router.get("/bills/summary", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const bills = await db.select({
    vendorId: billsTable.vendorId,
    vendorName: vendorsTable.name,
    status: billsTable.status,
    total: billsTable.total,
    amountPaid: billsTable.amountPaid,
    balanceDue: billsTable.balanceDue,
    dueDate: billsTable.dueDate,
  }).from(billsTable)
    .leftJoin(vendorsTable, eq(billsTable.vendorId, vendorsTable.id))
    .where(eq(billsTable.businessId, businessId));

  const byVendor: Record<string, { vendorId: number | null; name: string; totalBilled: number; totalOwed: number; billCount: number }> = {};
  const byStatus: Record<string, { count: number; total: number }> = {};
  let grandTotal = 0, grandOwed = 0;

  for (const b of bills) {
    grandTotal += n(b.total);
    grandOwed += n(b.balanceDue);

    const vKey = String(b.vendorId ?? "unassigned");
    if (!byVendor[vKey]) byVendor[vKey] = { vendorId: b.vendorId, name: b.vendorName ?? "Unassigned", totalBilled: 0, totalOwed: 0, billCount: 0 };
    byVendor[vKey]!.totalBilled += n(b.total);
    byVendor[vKey]!.totalOwed += n(b.balanceDue);
    byVendor[vKey]!.billCount++;

    if (!byStatus[b.status]) byStatus[b.status] = { count: 0, total: 0 };
    byStatus[b.status]!.count++;
    byStatus[b.status]!.total += n(b.balanceDue);
  }

  res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      billCount: bills.length,
      totalBilled: grandTotal.toFixed(2),
      totalOwed: grandOwed.toFixed(2),
    },
    byStatus: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, { count: v.count, total: v.total.toFixed(2) }])),
    byVendor: Object.values(byVendor)
      .sort((a, b) => b.totalOwed - a.totalOwed)
      .map((v) => ({ ...v, totalBilled: v.totalBilled.toFixed(2), totalOwed: v.totalOwed.toFixed(2) })),
  });
});

// ─── GET /api/bills/:id ────────────────────────────────────────────────────────
router.get("/bills/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getBillForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Bill not found" }); return; }

  const [lineItems, payments] = await Promise.all([
    db.select().from(billLineItemsTable).where(eq(billLineItemsTable.billId, id)).orderBy(billLineItemsTable.sortOrder),
    db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id)).orderBy(desc(billPaymentsTable.createdAt)),
  ]);

  res.json({ ...row.bill, vendorName: row.vendorName, lineItems, payments });
});

// ─── PATCH /api/bills/:id ──────────────────────────────────────────────────────
router.patch("/bills/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getBillForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Bill not found" }); return; }

  const body = BillInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { businessId: _biz, lineItems, ...data } = body.data;
  const currentBill = row.bill;

  // If line items provided, replace them all
  let totals: { subtotal: string; taxAmount: string; total: string } | undefined;
  if (lineItems !== undefined) {
    await db.delete(billLineItemsTable).where(eq(billLineItemsTable.billId, id));
    if (lineItems.length > 0) {
      await db.insert(billLineItemsTable).values(
        lineItems.map((li, i) => ({ ...li, billId: id, sortOrder: i }))
      );
    }
    totals = recalcTotals(lineItems, data.taxRate ?? String(currentBill.taxRate));
  }

  const newTotal = totals?.total ?? String(currentBill.total);
  const newAmountPaid = String(currentBill.amountPaid);
  const { balanceDue } = recalcBalance(newTotal, newAmountPaid);

  const newStatus = data.status === "cancelled" ? "cancelled"
    : deriveStatus(newTotal, newAmountPaid, data.dueDate ?? currentBill.dueDate, data.status ?? currentBill.status);

  const paidAt = newStatus === "paid" && currentBill.status !== "paid" ? new Date() : currentBill.paidAt;

  const [bill] = await db.update(billsTable).set({
    ...data,
    ...(totals ?? {}),
    balanceDue,
    status: newStatus,
    paidAt,
  }).where(eq(billsTable.id, id)).returning();

  const [updatedItems, payments] = await Promise.all([
    db.select().from(billLineItemsTable).where(eq(billLineItemsTable.billId, id)).orderBy(billLineItemsTable.sortOrder),
    db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id)).orderBy(desc(billPaymentsTable.createdAt)),
  ]);

  res.json({ ...bill, vendorName: row.vendorName, lineItems: updatedItems, payments });
});

// ─── DELETE /api/bills/:id ─────────────────────────────────────────────────────
router.delete("/bills/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getBillForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Bill not found" }); return; }
  await db.delete(billsTable).where(eq(billsTable.id, id));
  res.json({ success: true });
});

// ─── POST /api/bills/:id/payments ──────────────────────────────────────────────
router.post("/bills/:id/payments", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getBillForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Bill not found" }); return; }

  const body = PaymentInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [payment] = await db.insert(billPaymentsTable).values({ ...body.data, billId: id }).returning();

  // Recompute amountPaid from all payments
  const allPayments = await db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id));
  const totalPaid = allPayments.reduce((s, p) => s + n(p.amount), 0);
  const { balanceDue } = recalcBalance(String(row.bill.total), totalPaid.toFixed(2));
  const newStatus = deriveStatus(String(row.bill.total), totalPaid.toFixed(2), row.bill.dueDate, row.bill.status);
  const paidAt = newStatus === "paid" && row.bill.status !== "paid" ? new Date() : row.bill.paidAt;

  const [bill] = await db.update(billsTable).set({
    amountPaid: totalPaid.toFixed(2), balanceDue, status: newStatus, paidAt,
  }).where(eq(billsTable.id, id)).returning();

  res.status(201).json({ payment, bill });
});

// ─── DELETE /api/bills/:id/payments/:paymentId ────────────────────────────────
router.delete("/bills/:id/payments/:paymentId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const paymentId = Number(req.params["paymentId"]);
  if (!id || !paymentId) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getBillForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Bill not found" }); return; }

  await db.delete(billPaymentsTable)
    .where(and(eq(billPaymentsTable.id, paymentId), eq(billPaymentsTable.billId, id)));

  const allPayments = await db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id));
  const totalPaid = allPayments.reduce((s, p) => s + n(p.amount), 0);
  const { balanceDue } = recalcBalance(String(row.bill.total), totalPaid.toFixed(2));
  const newStatus = deriveStatus(String(row.bill.total), totalPaid.toFixed(2), row.bill.dueDate, row.bill.status);

  await db.update(billsTable).set({
    amountPaid: totalPaid.toFixed(2), balanceDue, status: newStatus,
    paidAt: newStatus !== "paid" ? null : row.bill.paidAt,
  }).where(eq(billsTable.id, id));

  res.json({ success: true });
});

export default router;
