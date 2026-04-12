import { Router, type IRouter } from "express";
import { db, quotesTable, quoteLineItemsTable, invoicesTable, invoiceLineItemsTable, customersTable, businessesTable } from "@workspace/db";
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
const QuoteParams = z.object({ businessId: z.coerce.number().int().positive(), quoteId: z.coerce.number().int().positive() });

const LineItemBody = z.object({
  description: z.string().min(1),
  quantity: z.string().or(z.number()).transform(String),
  unit: z.string().optional().nullable(),
  rate: z.string().or(z.number()).transform(String),
  amount: z.string().or(z.number()).transform(String),
  sortOrder: z.number().int().optional().default(0),
});

const QuoteBody = z.object({
  customerId: z.number().int().optional().nullable(),
  quoteNumber: z.string().min(1),
  status: z.enum(["draft", "sent", "accepted", "declined", "expired", "converted"]).optional().default("draft"),
  issueDate: z.string().min(1),
  expiryDate: z.string().optional().nullable(),
  taxRate: z.string().or(z.number()).transform(String).optional().default("0"),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lineItems: z.array(LineItemBody).optional().default([]),
});

function computeTotals(lineItems: { amount: string }[], taxRate: string) {
  const subtotal = lineItems.reduce((sum, li) => sum + parseFloat(li.amount || "0"), 0);
  const tax = subtotal * (parseFloat(taxRate || "0") / 100);
  const total = subtotal + tax;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: tax.toFixed(2),
    total: total.toFixed(2),
  };
}

// List quotes
router.get("/businesses/:businessId/quotes", async (req: AuthRequest, res): Promise<void> => {
  const params = BusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid businessId" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const quotes = await db.select({
    id: quotesTable.id,
    quoteNumber: quotesTable.quoteNumber,
    status: quotesTable.status,
    issueDate: quotesTable.issueDate,
    expiryDate: quotesTable.expiryDate,
    total: quotesTable.total,
    currency: quotesTable.businessId,
    createdAt: quotesTable.createdAt,
    customerId: quotesTable.customerId,
    customerName: customersTable.name,
    convertedToInvoiceId: quotesTable.convertedToInvoiceId,
  }).from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(eq(quotesTable.businessId, params.data.businessId))
    .orderBy(desc(quotesTable.createdAt));

  res.json(quotes);
});

// Get single quote
router.get("/businesses/:businessId/quotes/:quoteId", async (req: AuthRequest, res): Promise<void> => {
  const params = QuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const [quote] = await db.select({
    id: quotesTable.id,
    businessId: quotesTable.businessId,
    customerId: quotesTable.customerId,
    customerName: customersTable.name,
    quoteNumber: quotesTable.quoteNumber,
    status: quotesTable.status,
    issueDate: quotesTable.issueDate,
    expiryDate: quotesTable.expiryDate,
    subtotal: quotesTable.subtotal,
    taxRate: quotesTable.taxRate,
    taxAmount: quotesTable.taxAmount,
    total: quotesTable.total,
    notes: quotesTable.notes,
    terms: quotesTable.terms,
    convertedToInvoiceId: quotesTable.convertedToInvoiceId,
    createdAt: quotesTable.createdAt,
  }).from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(and(eq(quotesTable.id, params.data.quoteId), eq(quotesTable.businessId, params.data.businessId)))
    .limit(1);

  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  const lineItems = await db.select().from(quoteLineItemsTable)
    .where(eq(quoteLineItemsTable.quoteId, params.data.quoteId))
    .orderBy(quoteLineItemsTable.sortOrder);

  res.json({ ...quote, lineItems });
});

// Create quote
router.post("/businesses/:businessId/quotes", async (req: AuthRequest, res): Promise<void> => {
  const params = BusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid businessId" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = QuoteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { lineItems, ...quoteData } = body.data;
  const totals = computeTotals(lineItems, quoteData.taxRate!);

  const [quote] = await db.insert(quotesTable).values({
    ...quoteData,
    businessId: params.data.businessId,
    ...totals,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(quoteLineItemsTable).values(
      lineItems.map((li, i) => ({ ...li, quoteId: quote.id, sortOrder: li.sortOrder ?? i }))
    );
  }

  const full = await db.select().from(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, quote.id));
  res.status(201).json({ ...quote, lineItems: full });
});

// Update quote
router.put("/businesses/:businessId/quotes/:quoteId", async (req: AuthRequest, res): Promise<void> => {
  const params = QuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = QuoteBody.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { lineItems, ...quoteData } = body.data;
  let updateData: Record<string, unknown> = { ...quoteData };

  if (lineItems !== undefined) {
    const totals = computeTotals(lineItems, String(quoteData.taxRate ?? "0"));
    updateData = { ...updateData, ...totals };
    await db.delete(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, params.data.quoteId));
    if (lineItems.length > 0) {
      await db.insert(quoteLineItemsTable).values(
        lineItems.map((li, i) => ({ ...li, quoteId: params.data.quoteId, sortOrder: li.sortOrder ?? i }))
      );
    }
  }

  const [quote] = await db.update(quotesTable)
    .set(updateData)
    .where(and(eq(quotesTable.id, params.data.quoteId), eq(quotesTable.businessId, params.data.businessId)))
    .returning();
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(quote);
});

// Convert quote to invoice
router.post("/businesses/:businessId/quotes/:quoteId/convert", async (req: AuthRequest, res): Promise<void> => {
  const params = QuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const [quote] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, params.data.quoteId), eq(quotesTable.businessId, params.data.businessId))).limit(1);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  if (quote.convertedToInvoiceId) { res.status(400).json({ error: "Quote already converted" }); return; }

  const lineItems = await db.select().from(quoteLineItemsTable)
    .where(eq(quoteLineItemsTable.quoteId, params.data.quoteId));

  // Generate invoice number
  const invoiceCount = await db.select().from(invoicesTable).where(eq(invoicesTable.businessId, params.data.businessId));
  const invNumber = `INV-${String(invoiceCount.length + 1).padStart(4, "0")}`;
  const today = new Date().toISOString().split("T")[0]!;

  const [invoice] = await db.insert(invoicesTable).values({
    businessId: params.data.businessId,
    customerId: quote.customerId,
    invoiceNumber: invNumber,
    status: "draft",
    issueDate: today,
    subtotal: quote.subtotal,
    taxRate: quote.taxRate,
    taxAmount: quote.taxAmount,
    discountAmount: "0",
    total: quote.total,
    amountPaid: "0",
    balanceDue: quote.total,
    notes: quote.notes,
    terms: quote.terms,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(
      lineItems.map((li) => ({
        invoiceId: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        rate: li.rate,
        amount: li.amount,
        sortOrder: li.sortOrder,
      }))
    );
  }

  await db.update(quotesTable).set({ status: "converted", convertedToInvoiceId: invoice.id })
    .where(eq(quotesTable.id, params.data.quoteId));

  res.status(201).json(invoice);
});

// Update status
router.patch("/businesses/:businessId/quotes/:quoteId/status", async (req: AuthRequest, res): Promise<void> => {
  const params = QuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = z.object({ status: z.enum(["draft", "sent", "accepted", "declined", "expired", "converted"]) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const [quote] = await db.update(quotesTable).set({ status: body.data.status })
    .where(and(eq(quotesTable.id, params.data.quoteId), eq(quotesTable.businessId, params.data.businessId)))
    .returning();
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(quote);
});

// Delete quote
router.delete("/businesses/:businessId/quotes/:quoteId", async (req: AuthRequest, res): Promise<void> => {
  const params = QuoteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  await db.delete(quotesTable)
    .where(and(eq(quotesTable.id, params.data.quoteId), eq(quotesTable.businessId, params.data.businessId)));
  res.json({ success: true });
});

export default router;
