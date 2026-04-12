import { Router, type IRouter } from "express";
import { db, invoicesTable, invoiceLineItemsTable, invoicePaymentsTable, customersTable, businessesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusinessOwnership(businessId: number, userId: number): Promise<boolean> {
  const [business] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return !!business;
}

const BusinessParams = z.object({ businessId: z.coerce.number().int().positive() });
const InvoiceParams = z.object({ businessId: z.coerce.number().int().positive(), invoiceId: z.coerce.number().int().positive() });

const LineItemBody = z.object({
  description: z.string().min(1),
  quantity: z.string().or(z.number()).transform(String),
  unit: z.string().optional().nullable(),
  rate: z.string().or(z.number()).transform(String),
  amount: z.string().or(z.number()).transform(String),
  accountId: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const InvoiceBody = z.object({
  customerId: z.number().int().optional().nullable(),
  invoiceNumber: z.string().min(1),
  status: z.enum(["draft", "sent", "viewed", "partial", "paid", "overdue", "cancelled"]).optional().default("draft"),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  taxRate: z.string().or(z.number()).transform(String).optional().default("0"),
  discountAmount: z.string().or(z.number()).transform(String).optional().default("0"),
  currency: z.string().optional().default("USD"),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurringInterval: z.string().optional().nullable(),
  nextInvoiceDate: z.string().optional().nullable(),
  lineItems: z.array(LineItemBody).optional().default([]),
});

const PaymentBody = z.object({
  amount: z.string().or(z.number()).transform(String),
  paymentDate: z.string().min(1),
  paymentMethod: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  transactionId: z.number().int().optional().nullable(),
});

function computeTotals(lineItems: { amount: string }[], taxRate: string, discountAmount: string) {
  const subtotal = lineItems.reduce((sum, li) => sum + parseFloat(li.amount || "0"), 0);
  const tax = subtotal * (parseFloat(taxRate || "0") / 100);
  const discount = parseFloat(discountAmount || "0");
  const total = subtotal + tax - discount;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: tax.toFixed(2),
    total: total.toFixed(2),
  };
}

// List invoices
router.get("/businesses/:businessId/invoices", async (req: AuthRequest, res): Promise<void> => {
  const params = BusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid businessId" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const invoices = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    status: invoicesTable.status,
    issueDate: invoicesTable.issueDate,
    dueDate: invoicesTable.dueDate,
    total: invoicesTable.total,
    amountPaid: invoicesTable.amountPaid,
    balanceDue: invoicesTable.balanceDue,
    currency: invoicesTable.currency,
    createdAt: invoicesTable.createdAt,
    customerId: invoicesTable.customerId,
    customerName: customersTable.name,
  }).from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.businessId, params.data.businessId))
    .orderBy(desc(invoicesTable.createdAt));

  res.json(invoices);
});

// Get single invoice with line items and payments
router.get("/businesses/:businessId/invoices/:invoiceId", async (req: AuthRequest, res): Promise<void> => {
  const params = InvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const [invoice] = await db.select({
    id: invoicesTable.id,
    businessId: invoicesTable.businessId,
    customerId: invoicesTable.customerId,
    customerName: customersTable.name,
    invoiceNumber: invoicesTable.invoiceNumber,
    status: invoicesTable.status,
    issueDate: invoicesTable.issueDate,
    dueDate: invoicesTable.dueDate,
    subtotal: invoicesTable.subtotal,
    taxRate: invoicesTable.taxRate,
    taxAmount: invoicesTable.taxAmount,
    discountAmount: invoicesTable.discountAmount,
    total: invoicesTable.total,
    amountPaid: invoicesTable.amountPaid,
    balanceDue: invoicesTable.balanceDue,
    currency: invoicesTable.currency,
    notes: invoicesTable.notes,
    terms: invoicesTable.terms,
    isRecurring: invoicesTable.isRecurring,
    recurringInterval: invoicesTable.recurringInterval,
    nextInvoiceDate: invoicesTable.nextInvoiceDate,
    createdAt: invoicesTable.createdAt,
    sentAt: invoicesTable.sentAt,
    paidAt: invoicesTable.paidAt,
  }).from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, params.data.invoiceId), eq(invoicesTable.businessId, params.data.businessId)))
    .limit(1);

  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const lineItems = await db.select().from(invoiceLineItemsTable)
    .where(eq(invoiceLineItemsTable.invoiceId, params.data.invoiceId))
    .orderBy(invoiceLineItemsTable.sortOrder);

  const payments = await db.select().from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, params.data.invoiceId))
    .orderBy(desc(invoicePaymentsTable.paymentDate));

  res.json({ ...invoice, lineItems, payments });
});

// Create invoice
router.post("/businesses/:businessId/invoices", async (req: AuthRequest, res): Promise<void> => {
  const params = BusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid businessId" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = InvoiceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { lineItems, ...invoiceData } = body.data;
  const totals = computeTotals(lineItems, invoiceData.taxRate!, invoiceData.discountAmount!);

  const [invoice] = await db.insert(invoicesTable).values({
    ...invoiceData,
    businessId: params.data.businessId,
    ...totals,
    balanceDue: totals.total,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(
      lineItems.map((li, i) => ({ ...li, invoiceId: invoice.id, sortOrder: li.sortOrder ?? i }))
    );
  }

  const full = await db.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, invoice.id));
  res.status(201).json({ ...invoice, lineItems: full, payments: [] });
});

// Update invoice
router.put("/businesses/:businessId/invoices/:invoiceId", async (req: AuthRequest, res): Promise<void> => {
  const params = InvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = InvoiceBody.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { lineItems, ...invoiceData } = body.data;

  // Recompute totals if line items provided
  let updateData: Record<string, unknown> = { ...invoiceData };
  if (lineItems !== undefined) {
    const existing = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, params.data.invoiceId));
    const amountPaid = existing.reduce((s, p) => s + parseFloat(p.amount), 0);
    const totals = computeTotals(lineItems, String(invoiceData.taxRate ?? "0"), String(invoiceData.discountAmount ?? "0"));
    updateData = { ...updateData, ...totals, amountPaid: amountPaid.toFixed(2), balanceDue: (parseFloat(totals.total) - amountPaid).toFixed(2) };

    await db.delete(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, params.data.invoiceId));
    if (lineItems.length > 0) {
      await db.insert(invoiceLineItemsTable).values(
        lineItems.map((li, i) => ({ ...li, invoiceId: params.data.invoiceId, sortOrder: li.sortOrder ?? i }))
      );
    }
  }

  const [invoice] = await db.update(invoicesTable)
    .set(updateData)
    .where(and(eq(invoicesTable.id, params.data.invoiceId), eq(invoicesTable.businessId, params.data.businessId)))
    .returning();
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});

// Record payment
router.post("/businesses/:businessId/invoices/:invoiceId/payments", async (req: AuthRequest, res): Promise<void> => {
  const params = InvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = PaymentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [payment] = await db.insert(invoicePaymentsTable).values({
    ...body.data,
    invoiceId: params.data.invoiceId,
  }).returning();

  // Update invoice amountPaid / balanceDue / status
  const allPayments = await db.select().from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, params.data.invoiceId));
  const totalPaid = allPayments.reduce((s, p) => s + parseFloat(p.amount), 0);

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.invoiceId)).limit(1);
  const total = parseFloat(inv?.total ?? "0");
  const balanceDue = Math.max(0, total - totalPaid).toFixed(2);
  let status = inv?.status ?? "sent";
  if (totalPaid >= total) status = "paid";
  else if (totalPaid > 0) status = "partial";

  await db.update(invoicesTable).set({
    amountPaid: totalPaid.toFixed(2),
    balanceDue,
    status,
    paidAt: totalPaid >= total ? new Date() : null,
  }).where(eq(invoicesTable.id, params.data.invoiceId));

  res.status(201).json(payment);
});

// Update status (e.g. mark as sent, cancelled)
router.patch("/businesses/:businessId/invoices/:invoiceId/status", async (req: AuthRequest, res): Promise<void> => {
  const params = InvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = z.object({ status: z.enum(["draft", "sent", "viewed", "partial", "paid", "overdue", "cancelled"]) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const sentAt = body.data.status === "sent" ? new Date() : undefined;
  const [invoice] = await db.update(invoicesTable)
    .set({ status: body.data.status, ...(sentAt ? { sentAt } : {}) })
    .where(and(eq(invoicesTable.id, params.data.invoiceId), eq(invoicesTable.businessId, params.data.businessId)))
    .returning();
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});

// Delete invoice
router.delete("/businesses/:businessId/invoices/:invoiceId", async (req: AuthRequest, res): Promise<void> => {
  const params = InvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  await db.delete(invoicesTable)
    .where(and(eq(invoicesTable.id, params.data.invoiceId), eq(invoicesTable.businessId, params.data.businessId)));
  res.json({ success: true });
});

export default router;
