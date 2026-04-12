import { Router, type IRouter } from "express";
import { db, quotesTable, quoteLineItemsTable, invoicesTable, invoiceLineItemsTable, customersTable, businessesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";
import { sendQuoteEmail as sendQuoteEmailResend } from "../lib/email";
import { generateQuotePdfBuffer } from "../lib/pdfHelpers";

const router: IRouter = Router();
router.use(authMiddleware);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function verifyBusiness(businessId: number, userId: number) {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return b ?? null;
}

async function getQuoteForUser(quoteId: number, userId: number) {
  const [row] = await db
    .select({ quote: quotesTable, business: businessesTable, customerName: customersTable.name, customerEmail: customersTable.email })
    .from(quotesTable)
    .innerJoin(businessesTable, eq(quotesTable.businessId, businessesTable.id))
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(and(eq(quotesTable.id, quoteId), eq(businessesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function getQuoteWithItems(quoteId: number, userId: number) {
  const row = await getQuoteForUser(quoteId, userId);
  if (!row) return null;
  const lineItems = await db.select().from(quoteLineItemsTable)
    .where(eq(quoteLineItemsTable.quoteId, quoteId)).orderBy(quoteLineItemsTable.sortOrder);
  return { ...row.quote, businessName: row.business.name, customerName: row.customerName, customerEmail: row.customerEmail, lineItems };
}

function computeTotals(lineItems: { amount: string }[], taxRate: string) {
  const subtotal = lineItems.reduce((s, li) => s + parseFloat(li.amount || "0"), 0);
  const tax = subtotal * (parseFloat(taxRate || "0") / 100);
  return { subtotal: subtotal.toFixed(2), taxAmount: tax.toFixed(2), total: (subtotal + tax).toFixed(2) };
}


const LineItemInput = z.object({
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().optional().nullable(),
  rate: z.union([z.string(), z.number()]).transform(String),
  amount: z.union([z.string(), z.number()]).transform(String),
  sortOrder: z.number().int().optional().default(0),
});

const QuoteInput = z.object({
  businessId: z.coerce.number().int().positive().optional(),
  customerId: z.number().int().optional().nullable(),
  quoteNumber: z.string().min(1),
  status: z.enum(["draft", "sent", "accepted", "declined", "expired", "converted"]).optional().default("draft"),
  issueDate: z.string().min(1),
  expiryDate: z.string().optional().nullable(),
  taxRate: z.union([z.string(), z.number()]).transform(String).optional().default("0"),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lineItems: z.array(LineItemInput).optional().default([]),
});

// ─── GET /api/quotes?businessId=X ─────────────────────────────────────────────
router.get("/quotes", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId query param required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const quotes = await db.select({
    id: quotesTable.id,
    quoteNumber: quotesTable.quoteNumber,
    status: quotesTable.status,
    issueDate: quotesTable.issueDate,
    expiryDate: quotesTable.expiryDate,
    total: quotesTable.total,
    createdAt: quotesTable.createdAt,
    customerId: quotesTable.customerId,
    customerName: customersTable.name,
    convertedToInvoiceId: quotesTable.convertedToInvoiceId,
  }).from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(eq(quotesTable.businessId, businessId))
    .orderBy(desc(quotesTable.createdAt));
  res.json(quotes);
});

// ─── POST /api/quotes ──────────────────────────────────────────────────────────
router.post("/quotes", async (req: AuthRequest, res): Promise<void> => {
  const body = QuoteInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const businessId = body.data.businessId;
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const { lineItems, businessId: _biz, ...quoteData } = body.data;
  const totals = computeTotals(lineItems, quoteData.taxRate!);
  const [quote] = await db.insert(quotesTable).values({ ...quoteData, businessId, ...totals }).returning();
  if (lineItems.length > 0) {
    await db.insert(quoteLineItemsTable).values(lineItems.map((li, i) => ({ ...li, quoteId: quote.id, sortOrder: li.sortOrder ?? i })));
  }
  const full = await getQuoteWithItems(quote.id, req.userId!);
  res.status(201).json(full);
});

// ─── GET /api/quotes/:id ───────────────────────────────────────────────────────
router.get("/quotes/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const quote = await getQuoteWithItems(id, req.userId!);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(quote);
});

// ─── PATCH /api/quotes/:id ────────────────────────────────────────────────────
router.patch("/quotes/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getQuoteForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  const body = QuoteInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { lineItems, businessId: _biz, ...quoteData } = body.data;
  let updateData: Record<string, unknown> = { ...quoteData };

  if (lineItems !== undefined) {
    const totals = computeTotals(lineItems, String(quoteData.taxRate ?? "0"));
    updateData = { ...updateData, ...totals };
    await db.delete(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, id));
    if (lineItems.length > 0) {
      await db.insert(quoteLineItemsTable).values(lineItems.map((li, i) => ({ ...li, quoteId: id, sortOrder: li.sortOrder ?? i })));
    }
  }

  const [quote] = await db.update(quotesTable).set(updateData).where(eq(quotesTable.id, id)).returning();
  res.json(quote);
});

// ─── GET /api/quotes/:id/pdf ──────────────────────────────────────────────────
router.get("/quotes/:id/pdf", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const quote = await getQuoteWithItems(id, req.userId!);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  const buf = await generateQuotePdfBuffer(quote);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="quote-${quote.quoteNumber}.pdf"`);
  res.send(buf);
});

// ─── POST /api/quotes/:id/send ────────────────────────────────────────────────
router.post("/quotes/:id/send", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const quote = await getQuoteWithItems(id, req.userId!);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  let emailSent = false;
  const toEmail = (req.body as { email?: string }).email ?? quote.customerEmail;
  if (toEmail) {
    try {
      const pdfBuffer = await generateQuotePdfBuffer(quote);
      emailSent = await sendQuoteEmailResend({
        to: toEmail,
        customerName: quote.customerName ?? "Customer",
        businessName: quote.businessName ?? "Your Business",
        quoteNumber: quote.quoteNumber,
        expiryDate: quote.expiryDate,
        total: quote.total ?? "0",
        pdfBuffer,
      });
    } catch { /* email optional — mark sent regardless */ }
  }

  const [updated] = await db.update(quotesTable).set({ status: "sent" }).where(eq(quotesTable.id, id)).returning();
  res.json({ quote: updated, emailSent, emailTo: toEmail ?? null });
});

// ─── POST /api/quotes/:id/accept ──────────────────────────────────────────────
router.post("/quotes/:id/accept", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getQuoteForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  if (row.quote.status === "converted") { res.status(400).json({ error: "Quote already converted" }); return; }
  const [quote] = await db.update(quotesTable).set({ status: "accepted" }).where(eq(quotesTable.id, id)).returning();
  res.json(quote);
});

// ─── POST /api/quotes/:id/convert ─────────────────────────────────────────────
router.post("/quotes/:id/convert", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getQuoteForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  if (row.quote.convertedToInvoiceId) { res.status(400).json({ error: "Quote already converted" }); return; }

  const lineItems = await db.select().from(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, id));
  const count = await db.select().from(invoicesTable).where(eq(invoicesTable.businessId, row.quote.businessId));
  const today = new Date().toISOString().split("T")[0]!;

  const [invoice] = await db.insert(invoicesTable).values({
    businessId: row.quote.businessId,
    customerId: row.quote.customerId,
    invoiceNumber: `INV-${String(count.length + 1).padStart(4, "0")}`,
    status: "draft",
    issueDate: today,
    subtotal: row.quote.subtotal,
    taxRate: row.quote.taxRate,
    taxAmount: row.quote.taxAmount,
    discountAmount: "0",
    total: row.quote.total,
    amountPaid: "0",
    balanceDue: row.quote.total,
    notes: row.quote.notes,
    terms: row.quote.terms,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(
      lineItems.map((li) => ({ invoiceId: invoice.id, description: li.description, quantity: li.quantity, unit: li.unit, rate: li.rate, amount: li.amount, sortOrder: li.sortOrder }))
    );
  }

  await db.update(quotesTable).set({ status: "converted", convertedToInvoiceId: invoice.id }).where(eq(quotesTable.id, id));
  res.status(201).json(invoice);
});

// ─── legacy: /businesses/:businessId/quotes/* ─────────────────────────────────
router.get("/businesses/:businessId/quotes", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const quotes = await db.select({ id: quotesTable.id, quoteNumber: quotesTable.quoteNumber, status: quotesTable.status, issueDate: quotesTable.issueDate, expiryDate: quotesTable.expiryDate, total: quotesTable.total, createdAt: quotesTable.createdAt, customerId: quotesTable.customerId, customerName: customersTable.name, convertedToInvoiceId: quotesTable.convertedToInvoiceId })
    .from(quotesTable).leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(eq(quotesTable.businessId, businessId)).orderBy(desc(quotesTable.createdAt));
  res.json(quotes);
});
router.get("/businesses/:businessId/quotes/:quoteId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["quoteId"]);
  const quote = await getQuoteWithItems(id, req.userId!);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(quote);
});
router.post("/businesses/:businessId/quotes", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const body = QuoteInput.safeParse({ ...req.body, businessId });
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { lineItems, businessId: _biz, ...quoteData } = body.data;
  const totals = computeTotals(lineItems, quoteData.taxRate!);
  const [quote] = await db.insert(quotesTable).values({ ...quoteData, businessId, ...totals }).returning();
  if (lineItems.length > 0) await db.insert(quoteLineItemsTable).values(lineItems.map((li, i) => ({ ...li, quoteId: quote.id, sortOrder: li.sortOrder ?? i })));
  const full = await getQuoteWithItems(quote.id, req.userId!);
  res.status(201).json(full);
});
router.put("/businesses/:businessId/quotes/:quoteId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["quoteId"]);
  const row = await getQuoteForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  const body = QuoteInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { lineItems, businessId: _biz, ...quoteData } = body.data;
  let updateData: Record<string, unknown> = { ...quoteData };
  if (lineItems !== undefined) {
    const totals = computeTotals(lineItems, String(quoteData.taxRate ?? "0"));
    updateData = { ...updateData, ...totals };
    await db.delete(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, id));
    if (lineItems.length > 0) await db.insert(quoteLineItemsTable).values(lineItems.map((li, i) => ({ ...li, quoteId: id, sortOrder: li.sortOrder ?? i })));
  }
  const [quote] = await db.update(quotesTable).set(updateData).where(eq(quotesTable.id, id)).returning();
  res.json(quote);
});
router.patch("/businesses/:businessId/quotes/:quoteId/status", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["quoteId"]);
  const row = await getQuoteForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  const body = z.object({ status: z.enum(["draft","sent","accepted","declined","expired","converted"]) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const [quote] = await db.update(quotesTable).set({ status: body.data.status }).where(eq(quotesTable.id, id)).returning();
  res.json(quote);
});
router.delete("/businesses/:businessId/quotes/:quoteId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["quoteId"]);
  const row = await getQuoteForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  await db.delete(quotesTable).where(eq(quotesTable.id, id));
  res.json({ success: true });
});
router.post("/businesses/:businessId/quotes/:quoteId/convert", async (req: AuthRequest, res): Promise<void> => {
  res.redirect(307, `/api/quotes/${req.params["quoteId"]}/convert`);
});

export default router;
