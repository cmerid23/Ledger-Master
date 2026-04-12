import { Router, type IRouter } from "express";
import { db, invoicesTable, invoiceLineItemsTable, invoicePaymentsTable, quotesTable, quoteLineItemsTable, customersTable, businessesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

const router: IRouter = Router();
router.use(authMiddleware);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function verifyBusiness(businessId: number, userId: number) {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return b ?? null;
}

async function getInvoiceForUser(invoiceId: number, userId: number) {
  const [row] = await db
    .select({ invoice: invoicesTable, business: businessesTable, customerName: customersTable.name, customerEmail: customersTable.email })
    .from(invoicesTable)
    .innerJoin(businessesTable, eq(invoicesTable.businessId, businessesTable.id))
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, invoiceId), eq(businessesTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function getInvoiceWithItems(invoiceId: number, userId: number) {
  const row = await getInvoiceForUser(invoiceId, userId);
  if (!row) return null;
  const lineItems = await db.select().from(invoiceLineItemsTable)
    .where(eq(invoiceLineItemsTable.invoiceId, invoiceId)).orderBy(invoiceLineItemsTable.sortOrder);
  const payments = await db.select().from(invoicePaymentsTable)
    .where(eq(invoicePaymentsTable.invoiceId, invoiceId)).orderBy(desc(invoicePaymentsTable.paymentDate));
  return { ...row.invoice, businessName: row.business.name, customerName: row.customerName, customerEmail: row.customerEmail, lineItems, payments };
}

function computeTotals(lineItems: { amount: string }[], taxRate: string, discountAmount: string) {
  const subtotal = lineItems.reduce((s, li) => s + parseFloat(li.amount || "0"), 0);
  const tax = subtotal * (parseFloat(taxRate || "0") / 100);
  const discount = parseFloat(discountAmount || "0");
  const total = subtotal + tax - discount;
  return { subtotal: subtotal.toFixed(2), taxAmount: tax.toFixed(2), total: total.toFixed(2) };
}

async function sendInvoiceEmail(to: string, invoice: { invoiceNumber: string; total: string; dueDate?: string | null; businessName: string }) {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !user || !pass) return false;
  const transporter = nodemailer.createTransport({ host, port: 587, auth: { user, pass } });
  await transporter.sendMail({
    from: user,
    to,
    subject: `Invoice ${invoice.invoiceNumber} from ${invoice.businessName}`,
    text: `Dear customer,\n\nPlease find attached invoice ${invoice.invoiceNumber} for $${invoice.total}${invoice.dueDate ? `, due ${invoice.dueDate}` : ""}.\n\nThank you,\n${invoice.businessName}`,
  });
  return true;
}

const LineItemInput = z.object({
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().optional().nullable(),
  rate: z.union([z.string(), z.number()]).transform(String),
  amount: z.union([z.string(), z.number()]).transform(String),
  accountId: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const InvoiceInput = z.object({
  businessId: z.coerce.number().int().positive().optional(),
  customerId: z.number().int().optional().nullable(),
  invoiceNumber: z.string().min(1),
  status: z.enum(["draft", "sent", "viewed", "partial", "paid", "overdue", "cancelled"]).optional().default("draft"),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  taxRate: z.union([z.string(), z.number()]).transform(String).optional().default("0"),
  discountAmount: z.union([z.string(), z.number()]).transform(String).optional().default("0"),
  currency: z.string().optional().default("USD"),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurringInterval: z.string().optional().nullable(),
  nextInvoiceDate: z.string().optional().nullable(),
  lineItems: z.array(LineItemInput).optional().default([]),
});

const PaymentInput = z.object({
  amount: z.union([z.string(), z.number()]).transform(String),
  paymentDate: z.string().min(1),
  paymentMethod: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  transactionId: z.number().int().optional().nullable(),
});

// ─── GET /api/invoices?businessId=X ───────────────────────────────────────────
router.get("/invoices", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.query["businessId"]);
  if (!businessId || isNaN(businessId)) { res.status(400).json({ error: "businessId query param required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

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
    .where(eq(invoicesTable.businessId, businessId))
    .orderBy(desc(invoicesTable.createdAt));
  res.json(invoices);
});

// ─── POST /api/invoices ────────────────────────────────────────────────────────
router.post("/invoices", async (req: AuthRequest, res): Promise<void> => {
  const body = InvoiceInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const businessId = body.data.businessId;
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const { lineItems, businessId: _biz, ...invoiceData } = body.data;
  const totals = computeTotals(lineItems, invoiceData.taxRate!, invoiceData.discountAmount!);
  const [invoice] = await db.insert(invoicesTable).values({ ...invoiceData, businessId, ...totals, balanceDue: totals.total }).returning();
  if (lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(lineItems.map((li, i) => ({ ...li, invoiceId: invoice.id, sortOrder: li.sortOrder ?? i })));
  }
  const full = await getInvoiceWithItems(invoice.id, req.userId!);
  res.status(201).json(full);
});

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────
router.get("/invoices/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoice = await getInvoiceWithItems(id, req.userId!);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});

// ─── PATCH /api/invoices/:id ──────────────────────────────────────────────────
router.patch("/invoices/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const body = InvoiceInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { lineItems, businessId: _biz, ...invoiceData } = body.data;
  let updateData: Record<string, unknown> = { ...invoiceData };

  if (lineItems !== undefined) {
    const allPay = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));
    const amountPaid = allPay.reduce((s, p) => s + parseFloat(p.amount), 0);
    const totals = computeTotals(lineItems, String(invoiceData.taxRate ?? "0"), String(invoiceData.discountAmount ?? "0"));
    updateData = { ...updateData, ...totals, amountPaid: amountPaid.toFixed(2), balanceDue: (parseFloat(totals.total) - amountPaid).toFixed(2) };
    await db.delete(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));
    if (lineItems.length > 0) {
      await db.insert(invoiceLineItemsTable).values(lineItems.map((li, i) => ({ ...li, invoiceId: id, sortOrder: li.sortOrder ?? i })));
    }
  }

  const [invoice] = await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id)).returning();
  res.json(invoice);
});

// ─── DELETE /api/invoices/:id ─────────────────────────────────────────────────
router.delete("/invoices/:id", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (row.invoice.status !== "draft" && req.query["force"] !== "1") {
    res.status(400).json({ error: "Only draft invoices can be deleted. Use ?force=1 to override." });
    return;
  }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.json({ success: true });
});

// ─── POST /api/invoices/:id/send ──────────────────────────────────────────────
router.post("/invoices/:id/send", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoice = await getInvoiceWithItems(id, req.userId!);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  let emailSent = false;
  const toEmail = (req.body as { email?: string }).email ?? invoice.customerEmail;
  if (toEmail) {
    try {
      emailSent = await sendInvoiceEmail(toEmail, {
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        dueDate: invoice.dueDate,
        businessName: invoice.businessName,
      });
    } catch { /* email optional */ }
  }

  const [updated] = await db.update(invoicesTable)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(invoicesTable.id, id))
    .returning();
  res.json({ invoice: updated, emailSent, emailTo: toEmail ?? null });
});

// ─── POST /api/invoices/:id/payments ─────────────────────────────────────────
router.post("/invoices/:id/payments", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const body = PaymentInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [payment] = await db.insert(invoicePaymentsTable).values({ ...body.data, invoiceId: id }).returning();

  const allPay = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));
  const totalPaid = allPay.reduce((s, p) => s + parseFloat(p.amount), 0);
  const total = parseFloat(row.invoice.total ?? "0");
  const balanceDue = Math.max(0, total - totalPaid).toFixed(2);
  const status = totalPaid >= total ? "paid" : totalPaid > 0 ? "partial" : row.invoice.status;
  await db.update(invoicesTable).set({ amountPaid: totalPaid.toFixed(2), balanceDue, status, paidAt: totalPaid >= total ? new Date() : null })
    .where(eq(invoicesTable.id, id));

  res.status(201).json({ payment, totalPaid: totalPaid.toFixed(2), balanceDue, status });
});

// ─── GET /api/invoices/:id/pdf ────────────────────────────────────────────────
router.get("/invoices/:id/pdf", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoice = await getInvoiceWithItems(id, req.userId!);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const GREEN = "#10B981";
  const DARK = "#0F172A";
  const GRAY = "#64748B";
  const LIGHT = "#F8FAFC";

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
  doc.pipe(res);

  // Header band
  doc.rect(0, 0, doc.page.width, 120).fill(DARK);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(26).text(invoice.businessName || "Invoice", 50, 35);
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(14).text("INVOICE", 50, 68);
  doc.fillColor("#94A3B8").font("Helvetica").fontSize(10).text(invoice.invoiceNumber, 50, 86);

  // Status badge (top right)
  const statusText = (invoice.status ?? "draft").toUpperCase();
  doc.roundedRect(doc.page.width - 120, 40, 80, 26, 5).fill(GREEN);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text(statusText, doc.page.width - 120, 50, { width: 80, align: "center" });

  doc.fillColor(DARK);
  let y = 140;

  // Billing info row
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("BILLED TO", 50, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("ISSUE DATE", 300, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("DUE DATE", 420, y);
  y += 14;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(invoice.customerName ?? "—", 50, y);
  doc.font("Helvetica").fontSize(11).fillColor(DARK).text(invoice.issueDate, 300, y);
  doc.font("Helvetica").fontSize(11).fillColor(DARK).text(invoice.dueDate ?? "—", 420, y);

  y += 40;

  // Line items table header
  doc.rect(50, y, doc.page.width - 100, 24).fill(LIGHT);
  doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(9);
  doc.text("DESCRIPTION", 58, y + 7);
  doc.text("QTY", 330, y + 7, { width: 50, align: "right" });
  doc.text("UNIT", 385, y + 7, { width: 40, align: "center" });
  doc.text("RATE", 430, y + 7, { width: 60, align: "right" });
  doc.text("AMOUNT", doc.page.width - 100 - 60 + 50, y + 7, { width: 60, align: "right" });
  y += 24;

  // Line items
  doc.font("Helvetica").fontSize(10).fillColor(DARK);
  for (const li of invoice.lineItems ?? []) {
    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
    doc.text(li.description, 58, y + 5, { width: 265 });
    doc.text(String(li.quantity), 330, y + 5, { width: 50, align: "right" });
    doc.text(li.unit ?? "", 385, y + 5, { width: 40, align: "center" });
    doc.text(`$${parseFloat(String(li.rate)).toFixed(2)}`, 430, y + 5, { width: 60, align: "right" });
    doc.text(`$${parseFloat(String(li.amount)).toFixed(2)}`, doc.page.width - 100 - 60 + 50, y + 5, { width: 60, align: "right" });
    y += 22;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
  }

  y += 16;

  // Totals block
  const totalsX = 350;
  const totalsW = doc.page.width - 50 - totalsX;
  function totRow(label: string, value: string, bold = false, color = DARK) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor(bold ? color : GRAY);
    doc.text(label, totalsX, y);
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
    doc.text(value, totalsX, y, { width: totalsW, align: "right" });
    y += bold ? 20 : 16;
  }
  totRow("Subtotal", `$${parseFloat(invoice.subtotal ?? "0").toFixed(2)}`);
  if (parseFloat(invoice.taxRate ?? "0") > 0) {
    totRow(`Tax (${invoice.taxRate}%)`, `$${parseFloat(invoice.taxAmount ?? "0").toFixed(2)}`);
  }
  if (parseFloat(invoice.discountAmount ?? "0") > 0) {
    totRow("Discount", `-$${parseFloat(invoice.discountAmount ?? "0").toFixed(2)}`);
  }
  doc.moveTo(totalsX, y).lineTo(doc.page.width - 50, y).strokeColor(GREEN).lineWidth(1).stroke();
  y += 8;
  totRow("Total", `$${parseFloat(invoice.total ?? "0").toFixed(2)}`, true, DARK);
  if (parseFloat(invoice.amountPaid ?? "0") > 0) {
    totRow("Amount Paid", `-$${parseFloat(invoice.amountPaid ?? "0").toFixed(2)}`);
    totRow("Balance Due", `$${parseFloat(invoice.balanceDue ?? "0").toFixed(2)}`, true, parseFloat(invoice.balanceDue ?? "0") > 0 ? "#EF4444" : GREEN);
  }

  // Notes / Terms
  if (invoice.notes || invoice.terms) {
    y += 20;
    if (invoice.notes) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("NOTES", 50, y);
      y += 14;
      doc.font("Helvetica").fontSize(10).fillColor(DARK).text(invoice.notes, 50, y, { width: 400 });
      y += doc.heightOfString(invoice.notes, { width: 400 }) + 10;
    }
    if (invoice.terms) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("TERMS", 50, y);
      y += 14;
      doc.font("Helvetica").fontSize(10).fillColor(DARK).text(invoice.terms, 50, y, { width: 400 });
    }
  }

  // Footer
  const footerY = doc.page.height - 50;
  doc.moveTo(50, footerY - 10).lineTo(doc.page.width - 50, footerY - 10).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
  doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Generated by ClearLedger", 50, footerY, { align: "center", width: doc.page.width - 100 });

  doc.end();
});

// ─── POST /api/invoices/:id/duplicate ─────────────────────────────────────────
router.post("/invoices/:id/duplicate", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoice = await getInvoiceWithItems(id, req.userId!);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const today = new Date().toISOString().split("T")[0]!;
  const count = await db.select().from(invoicesTable).where(eq(invoicesTable.businessId, invoice.businessId));
  const newNumber = `${invoice.invoiceNumber}-COPY-${count.length + 1}`;

  const [dup] = await db.insert(invoicesTable).values({
    businessId: invoice.businessId,
    customerId: invoice.customerId,
    invoiceNumber: newNumber,
    status: "draft",
    issueDate: today,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    discountAmount: invoice.discountAmount,
    total: invoice.total,
    amountPaid: "0",
    balanceDue: invoice.total,
    currency: invoice.currency,
    notes: invoice.notes,
    terms: invoice.terms,
    isRecurring: false,
  }).returning();

  if (invoice.lineItems && invoice.lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(
      invoice.lineItems.map((li) => ({ invoiceId: dup.id, description: li.description, quantity: String(li.quantity), unit: li.unit, rate: String(li.rate), amount: String(li.amount), sortOrder: li.sortOrder }))
    );
  }

  const full = await getInvoiceWithItems(dup.id, req.userId!);
  res.status(201).json(full);
});

// ─── POST /api/invoices/:id/convert-quote  (id = quoteId) ────────────────────
router.post("/invoices/:id/convert-quote", async (req: AuthRequest, res): Promise<void> => {
  const quoteId = Number(req.params["id"]);
  if (!quoteId) { res.status(400).json({ error: "Invalid quoteId" }); return; }

  const [quoteRow] = await db.select({ quote: quotesTable, business: businessesTable })
    .from(quotesTable)
    .innerJoin(businessesTable, eq(quotesTable.businessId, businessesTable.id))
    .where(and(eq(quotesTable.id, quoteId), eq(businessesTable.userId, req.userId!)))
    .limit(1);
  if (!quoteRow) { res.status(404).json({ error: "Quote not found" }); return; }
  if (quoteRow.quote.convertedToInvoiceId) { res.status(400).json({ error: "Quote already converted" }); return; }

  const lineItems = await db.select().from(quoteLineItemsTable).where(eq(quoteLineItemsTable.quoteId, quoteId));
  const count = await db.select().from(invoicesTable).where(eq(invoicesTable.businessId, quoteRow.quote.businessId));
  const today = new Date().toISOString().split("T")[0]!;

  const [invoice] = await db.insert(invoicesTable).values({
    businessId: quoteRow.quote.businessId,
    customerId: quoteRow.quote.customerId,
    invoiceNumber: `INV-${String(count.length + 1).padStart(4, "0")}`,
    status: "draft",
    issueDate: today,
    subtotal: quoteRow.quote.subtotal,
    taxRate: quoteRow.quote.taxRate,
    taxAmount: quoteRow.quote.taxAmount,
    discountAmount: "0",
    total: quoteRow.quote.total,
    amountPaid: "0",
    balanceDue: quoteRow.quote.total,
    notes: quoteRow.quote.notes,
    terms: quoteRow.quote.terms,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(
      lineItems.map((li) => ({ invoiceId: invoice.id, description: li.description, quantity: li.quantity, unit: li.unit, rate: li.rate, amount: li.amount, sortOrder: li.sortOrder }))
    );
  }

  await db.update(quotesTable).set({ status: "converted", convertedToInvoiceId: invoice.id }).where(eq(quotesTable.id, quoteId));
  const full = await getInvoiceWithItems(invoice.id, req.userId!);
  res.status(201).json(full);
});

// ─── legacy: /businesses/:businessId/invoices/* ───────────────────────────────
router.get("/businesses/:businessId/invoices", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const invoices = await db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, status: invoicesTable.status, issueDate: invoicesTable.issueDate, dueDate: invoicesTable.dueDate, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, balanceDue: invoicesTable.balanceDue, currency: invoicesTable.currency, createdAt: invoicesTable.createdAt, customerId: invoicesTable.customerId, customerName: customersTable.name })
    .from(invoicesTable).leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.businessId, businessId)).orderBy(desc(invoicesTable.createdAt));
  res.json(invoices);
});
router.get("/businesses/:businessId/invoices/:invoiceId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["invoiceId"]);
  const invoice = await getInvoiceWithItems(id, req.userId!);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});
router.post("/businesses/:businessId/invoices", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params["businessId"]);
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  const body = InvoiceInput.safeParse({ ...req.body, businessId });
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { lineItems, businessId: _biz, ...invoiceData } = body.data;
  const totals = computeTotals(lineItems, invoiceData.taxRate!, invoiceData.discountAmount!);
  const [invoice] = await db.insert(invoicesTable).values({ ...invoiceData, businessId, ...totals, balanceDue: totals.total }).returning();
  if (lineItems.length > 0) await db.insert(invoiceLineItemsTable).values(lineItems.map((li, i) => ({ ...li, invoiceId: invoice.id, sortOrder: li.sortOrder ?? i })));
  const full = await getInvoiceWithItems(invoice.id, req.userId!);
  res.status(201).json(full);
});
router.put("/businesses/:businessId/invoices/:invoiceId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["invoiceId"]);
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const body = InvoiceInput.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const { lineItems, businessId: _biz, ...invoiceData } = body.data;
  let updateData: Record<string, unknown> = { ...invoiceData };
  if (lineItems !== undefined) {
    const totals = computeTotals(lineItems, String(invoiceData.taxRate ?? "0"), String(invoiceData.discountAmount ?? "0"));
    updateData = { ...updateData, ...totals, balanceDue: totals.total };
    await db.delete(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));
    if (lineItems.length > 0) await db.insert(invoiceLineItemsTable).values(lineItems.map((li, i) => ({ ...li, invoiceId: id, sortOrder: li.sortOrder ?? i })));
  }
  const [invoice] = await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, id)).returning();
  res.json(invoice);
});
router.post("/businesses/:businessId/invoices/:invoiceId/payments", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["invoiceId"]);
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const body = PaymentInput.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [payment] = await db.insert(invoicePaymentsTable).values({ ...body.data, invoiceId: id }).returning();
  const allPay = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id));
  const totalPaid = allPay.reduce((s, p) => s + parseFloat(p.amount), 0);
  const total = parseFloat(row.invoice.total ?? "0");
  const balanceDue = Math.max(0, total - totalPaid).toFixed(2);
  const status = totalPaid >= total ? "paid" : totalPaid > 0 ? "partial" : row.invoice.status;
  await db.update(invoicesTable).set({ amountPaid: totalPaid.toFixed(2), balanceDue, status, paidAt: totalPaid >= total ? new Date() : null }).where(eq(invoicesTable.id, id));
  res.status(201).json(payment);
});
router.patch("/businesses/:businessId/invoices/:invoiceId/status", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["invoiceId"]);
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const body = z.object({ status: z.enum(["draft","sent","viewed","partial","paid","overdue","cancelled"]) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid status" }); return; }
  const [invoice] = await db.update(invoicesTable).set({ status: body.data.status, ...(body.data.status === "sent" ? { sentAt: new Date() } : {}) }).where(eq(invoicesTable.id, id)).returning();
  res.json(invoice);
});
router.delete("/businesses/:businessId/invoices/:invoiceId", async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params["invoiceId"]);
  const row = await getInvoiceForUser(id, req.userId!);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.json({ success: true });
});
router.post("/businesses/:businessId/quotes/:quoteId/convert", async (req: AuthRequest, res): Promise<void> => {
  // legacy convert handled below
  res.redirect(307, `/api/invoices/${req.params["quoteId"]}/convert-quote`);
});

export default router;
