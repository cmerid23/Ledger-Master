import { Router, type IRouter } from "express";
import { db, transactionsTable, accountsTable, businessesTable, receiptsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import archiver, { type Archiver } from "archiver";
import { PassThrough } from "stream";
import path from "path";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

const router: IRouter = Router();
router.use(authMiddleware);
const objectStorage = new ObjectStorageService();

// ─── Types ────────────────────────────────────────────────────────────────────

type ReceiptRow = typeof receiptsTable.$inferSelect;

type TxRow = {
  id: number;
  date: string;
  description: string;
  amount: string;
  type: string;
  accountId: number | null;
  accountName: string | null;
  accountType: string | null;
  reconciled: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyBusiness(businessId: number, userId: number) {
  const [b] = await db.select({ id: businessesTable.id, name: businessesTable.name })
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return b ?? null;
}

function yearRange(year: number) {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function csvRow(fields: (string | number | boolean | null | undefined)[]) {
  return fields.map((f) => {
    const s = f == null ? "" : String(f);
    return `"${s.replace(/"/g, '""')}"`;
  }).join(",");
}

async function getTransactionRows(businessId: number, startDate: string, endDate: string): Promise<TxRow[]> {
  const rows = await db
    .select({
      id: transactionsTable.id,
      date: transactionsTable.date,
      description: transactionsTable.description,
      amount: transactionsTable.amount,
      type: transactionsTable.type,
      accountId: transactionsTable.accountId,
      accountName: accountsTable.name,
      accountType: accountsTable.type,
      reconciled: transactionsTable.reconciled,
    })
    .from(transactionsTable)
    .leftJoin(accountsTable, eq(transactionsTable.accountId, accountsTable.id))
    .where(and(
      eq(transactionsTable.businessId, businessId),
      gte(transactionsTable.date, startDate),
      lte(transactionsTable.date, endDate),
    ))
    .orderBy(transactionsTable.date);
  return rows as TxRow[];
}

async function getReceiptsForBusiness(businessId: number): Promise<ReceiptRow[]> {
  return db.select().from(receiptsTable).where(eq(receiptsTable.businessId, businessId));
}

async function getPLData(businessId: number, startDate: string, endDate: string) {
  const accounts = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.isActive, true)));

  async function getTotal(accountId: number) {
    const [r] = await db.select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable).where(and(
        eq(transactionsTable.businessId, businessId),
        eq(transactionsTable.accountId, accountId),
        gte(transactionsTable.date, startDate),
        lte(transactionsTable.date, endDate),
      ));
    return Number(r?.total ?? 0);
  }

  const income = await Promise.all(
    accounts.filter((a) => a.type === "income").map(async (a) => ({ name: a.name, code: a.code, amount: await getTotal(a.id) }))
  );
  const expenses = await Promise.all(
    accounts.filter((a) => a.type === "expense").map(async (a) => ({ name: a.name, code: a.code, amount: await getTotal(a.id) }))
  );

  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, i) => s + i.amount, 0);
  return { startDate, endDate, income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
}

async function getBSData(businessId: number, asOfDate: string) {
  const accounts = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.isActive, true)));

  async function getBalance(accountId: number) {
    const [r] = await db.select({ total: sql<number>`coalesce(sum(${transactionsTable.amount}), 0)` })
      .from(transactionsTable).where(and(
        eq(transactionsTable.businessId, businessId),
        eq(transactionsTable.accountId, accountId),
        lte(transactionsTable.date, asOfDate),
      ));
    return Number(r?.total ?? 0);
  }

  const assetItems = await Promise.all(accounts.filter((a) => a.type === "asset").map(async (a) => ({ name: a.name, code: a.code, amount: await getBalance(a.id) })));
  const liabilityItems = await Promise.all(accounts.filter((a) => a.type === "liability").map(async (a) => ({ name: a.name, code: a.code, amount: await getBalance(a.id) })));
  const equityItems = await Promise.all(accounts.filter((a) => a.type === "equity").map(async (a) => ({ name: a.name, code: a.code, amount: await getBalance(a.id) })));

  return {
    asOfDate,
    assets: assetItems, totalAssets: assetItems.reduce((s, i) => s + i.amount, 0),
    liabilities: liabilityItems, totalLiabilities: liabilityItems.reduce((s, i) => s + i.amount, 0),
    equity: equityItems, totalEquity: equityItems.reduce((s, i) => s + i.amount, 0),
  };
}

// ─── PDF generators ────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function generatePLPdf(data: Awaited<ReturnType<typeof getPLData>>, businessName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: "LETTER", margin: 50, compress: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 512, COL = 370;

    doc.fontSize(18).fillColor("#111").text("Profit & Loss Statement", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#555").text(businessName, { align: "center" });
    doc.fontSize(10).fillColor("#777").text(`${data.startDate}  –  ${data.endDate}`, { align: "center" });
    doc.moveDown(1.2);

    function section(title: string, items: { name: string; code: string | null; amount: number }[], total: number, color: string) {
      doc.fontSize(12).fillColor(color).font("Helvetica-Bold").text(title);
      doc.font("Helvetica").moveDown(0.3);
      for (const item of items) {
        const label = item.code ? `${item.code}  ${item.name}` : item.name;
        const y = doc.y;
        doc.fontSize(10).fillColor("#333").text(label, 50, y, { width: COL });
        doc.text(fmt(item.amount), 50 + COL, y, { width: W - COL, align: "right" });
        doc.moveDown(0.3);
      }
      doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.2);
      const y2 = doc.y;
      doc.font("Helvetica-Bold").fillColor("#111").text(`Total ${title}`, 50, y2, { width: COL });
      doc.text(fmt(total), 50 + COL, y2, { width: W - COL, align: "right" });
      doc.font("Helvetica").moveDown(0.8);
    }

    section("Income", data.income, data.totalIncome, "#1a7a4a");
    section("Expenses", data.expenses, data.totalExpenses, "#c0392b");

    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#bbb").lineWidth(1.5).stroke();
    doc.moveDown(0.4);
    const npColor = data.netProfit >= 0 ? "#1a7a4a" : "#c0392b";
    const y3 = doc.y;
    doc.fontSize(13).fillColor(npColor).font("Helvetica-Bold").text("Net Profit / (Loss)", 50, y3, { width: COL });
    doc.text(fmt(data.netProfit), 50 + COL, y3, { width: W - COL, align: "right" });
    doc.end();
  });
}

function generateBSPdf(data: Awaited<ReturnType<typeof getBSData>>, businessName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: "LETTER", margin: 50, compress: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 512, COL = 370;

    doc.fontSize(18).fillColor("#111").text("Balance Sheet", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#555").text(businessName, { align: "center" });
    doc.fontSize(10).fillColor("#777").text(`As of ${data.asOfDate}`, { align: "center" });
    doc.moveDown(1.2);

    function section(title: string, items: { name: string; code: string | null; amount: number }[], total: number, color: string) {
      doc.fontSize(12).fillColor(color).font("Helvetica-Bold").text(title);
      doc.font("Helvetica").moveDown(0.3);
      for (const item of items) {
        const label = item.code ? `${item.code}  ${item.name}` : item.name;
        const y = doc.y;
        doc.fontSize(10).fillColor("#333").text(label, 50, y, { width: COL });
        doc.text(fmt(item.amount), 50 + COL, y, { width: W - COL, align: "right" });
        doc.moveDown(0.3);
      }
      doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.2);
      const y2 = doc.y;
      doc.font("Helvetica-Bold").fillColor("#111").text(`Total ${title}`, 50, y2, { width: COL });
      doc.text(fmt(total), 50 + COL, y2, { width: W - COL, align: "right" });
      doc.font("Helvetica").moveDown(0.8);
    }

    section("Assets", data.assets, data.totalAssets, "#1e3a6e");
    section("Liabilities", data.liabilities, data.totalLiabilities, "#6e1e1e");
    section("Equity", data.equity, data.totalEquity, "#1e5e1e");

    doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#bbb").lineWidth(1.5).stroke();
    doc.moveDown(0.4);
    const y3 = doc.y;
    doc.fontSize(13).fillColor("#111").font("Helvetica-Bold")
      .text("Total Liabilities + Equity", 50, y3, { width: COL });
    doc.text(fmt(data.totalLiabilities + data.totalEquity), 50 + COL, y3, { width: W - COL, align: "right" });
    doc.end();
  });
}

// ─── Archive content builder ───────────────────────────────────────────────────
// Adds all files to an existing archiver instance (caller manages pipe + finalize)

async function addTaxPackEntries(
  archive: Archiver,
  businessId: number,
  businessName: string,
  year: number,
  transactions: TxRow[],
  allReceipts: ReceiptRow[]
) {
  const folder = `tax-pack-${year}`;
  const { startDate, endDate } = yearRange(year);

  const receiptsByTxId = new Map<number, ReceiptRow[]>();
  allReceipts.forEach((r) => {
    if (r.transactionId != null) {
      const arr = receiptsByTxId.get(r.transactionId) ?? [];
      arr.push(r);
      receiptsByTxId.set(r.transactionId, arr);
    }
  });

  // ── summary.csv ──
  const summaryLines = [
    csvRow(["Date", "Description", "Type", "Amount", "Account", "Has Receipt", "Category", "Tax Deductible", "Reconciled"]),
    ...transactions.map((tx) => {
      const txR = receiptsByTxId.get(tx.id) ?? [];
      return csvRow([
        tx.date, tx.description, tx.type, tx.amount, tx.accountName,
        txR.length > 0 ? "Yes" : "No",
        txR[0]?.expenseCategory || tx.accountName || "Uncategorized",
        txR.some((r) => r.taxDeductible) ? "Yes" : "No",
        tx.reconciled ? "Yes" : "No",
      ]);
    }),
  ];
  archive.append(summaryLines.join("\n"), { name: `${folder}/summary.csv` });

  // ── receipts-index.csv ──
  const receiptLines = [
    csvRow(["ID", "Transaction ID", "Vendor", "Amount", "Date", "Category", "Tax Deductible", "File Name", "Uploaded At"]),
    ...allReceipts.map((r) =>
      csvRow([r.id, r.transactionId, r.vendorName, r.receiptAmount, r.receiptDate, r.expenseCategory, r.taxDeductible ? "Yes" : "No", r.fileName, r.uploadedAt.toISOString()])
    ),
  ];
  archive.append(receiptLines.join("\n"), { name: `${folder}/receipts-index.csv` });

  // ── receipt files ──
  for (const r of allReceipts) {
    if (!r.fileUrl?.startsWith("/objects/")) continue;
    try {
      const ext = path.extname(r.fileName) || "";
      const vendor = (r.vendorName || "receipt").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 40);
      const dateStr = r.receiptDate || r.uploadedAt.toISOString().slice(0, 10);
      const amtStr = r.receiptAmount ? `_$${r.receiptAmount}` : "";
      const entryName = `${folder}/receipts/${dateStr}_${vendor}${amtStr}${ext}`;
      const file = await objectStorage.getObjectEntityFile(r.fileUrl);
      archive.append(file.createReadStream(), { name: entryName });
    } catch (err) {
      if (!(err instanceof ObjectNotFoundError)) {
        console.warn(`Could not include receipt ${r.id} in ZIP:`, err);
      }
    }
  }

  // ── PDFs ──
  const [plData, bsData] = await Promise.all([
    getPLData(businessId, startDate, endDate),
    getBSData(businessId, endDate),
  ]);
  const [plPdf, bsPdf] = await Promise.all([
    generatePLPdf(plData, businessName),
    generateBSPdf(bsData, businessName),
  ]);
  archive.append(plPdf, { name: `${folder}/profit-loss.pdf` });
  archive.append(bsPdf, { name: `${folder}/balance-sheet.pdf` });
}

function buildZipBuffer(
  businessId: number,
  businessName: string,
  year: number,
  transactions: TxRow[],
  allReceipts: ReceiptRow[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pt = new PassThrough();
    const chunks: Buffer[] = [];
    pt.on("data", (c: Buffer) => chunks.push(c));
    pt.on("end", () => resolve(Buffer.concat(chunks)));
    pt.on("error", reject);

    const arc = archiver("zip", { zlib: { level: 6 } });
    arc.on("error", reject);
    arc.pipe(pt);

    addTaxPackEntries(arc, businessId, businessName, year, transactions, allReceipts)
      .then(() => arc.finalize())
      .catch(reject);
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /businesses/:businessId/tax-summary?year=2025
router.get("/businesses/:businessId/tax-summary", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid businessId" }); return; }

  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
  const { startDate, endDate } = yearRange(year);

  const [transactions, allReceipts] = await Promise.all([
    getTransactionRows(businessId, startDate, endDate),
    getReceiptsForBusiness(businessId),
  ]);

  const receiptsByTxId = new Map<number, ReceiptRow[]>();
  allReceipts.forEach((r) => {
    if (r.transactionId != null) {
      const arr = receiptsByTxId.get(r.transactionId) ?? [];
      arr.push(r);
      receiptsByTxId.set(r.transactionId, arr);
    }
  });

  const enriched = transactions.map((tx) => {
    const txR = receiptsByTxId.get(tx.id) ?? [];
    const hasReceipts = txR.length > 0;
    const category = txR[0]?.expenseCategory || tx.accountName || "Uncategorized";
    const taxDeductible = hasReceipts && txR.some((r) => r.taxDeductible);
    const amount = parseFloat(String(tx.amount));
    return { ...tx, amount, hasReceipts, category, taxDeductible };
  });

  const catMap = new Map<string, { totalAmount: number; taxDeductibleAmount: number; nonDeductibleAmount: number; transactionCount: number; withReceiptsCount: number }>();
  for (const tx of enriched) {
    if (!catMap.has(tx.category)) catMap.set(tx.category, { totalAmount: 0, taxDeductibleAmount: 0, nonDeductibleAmount: 0, transactionCount: 0, withReceiptsCount: 0 });
    const entry = catMap.get(tx.category)!;
    entry.totalAmount += tx.amount;
    entry.transactionCount++;
    if (tx.hasReceipts) entry.withReceiptsCount++;
    if (tx.taxDeductible) entry.taxDeductibleAmount += tx.amount;
    else entry.nonDeductibleAmount += tx.amount;
  }

  const accMap = new Map<string, { accountId: number | null; accountName: string; totalAmount: number; transactionCount: number }>();
  for (const tx of enriched) {
    const key = String(tx.accountId ?? "none");
    if (!accMap.has(key)) accMap.set(key, { accountId: tx.accountId, accountName: tx.accountName ?? "Uncategorized", totalAmount: 0, transactionCount: 0 });
    const entry = accMap.get(key)!;
    entry.totalAmount += tx.amount;
    entry.transactionCount++;
  }

  const missing = enriched.filter((t) => !t.hasReceipts);

  res.json({
    year,
    businessName: biz.name,
    totalTransactions: transactions.length,
    totalWithReceipts: enriched.filter((t) => t.hasReceipts).length,
    totalMissingReceipts: missing.length,
    totalTaxDeductible: enriched.filter((t) => t.taxDeductible).reduce((s, t) => s + t.amount, 0),
    totalNonDeductible: enriched.filter((t) => !t.taxDeductible).reduce((s, t) => s + t.amount, 0),
    totalAmount: enriched.reduce((s, t) => s + t.amount, 0),
    categoryBreakdown: Array.from(catMap.entries())
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    accountBreakdown: Array.from(accMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    missingReceiptTransactions: missing.slice(0, 200).map(({ hasReceipts: _, taxDeductible: __, category: ___, ...rest }) => rest),
  });
});

// GET /businesses/:businessId/tax-pack?year=2025 — stream ZIP
router.get("/businesses/:businessId/tax-pack", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid businessId" }); return; }

  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
  const { startDate, endDate } = yearRange(year);

  const [transactions, allReceipts] = await Promise.all([
    getTransactionRows(businessId, startDate, endDate),
    getReceiptsForBusiness(businessId),
  ]);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="tax-pack-${year}.zip"`);

  const arc = archiver("zip", { zlib: { level: 6 } });
  arc.on("error", (err) => {
    console.error("Archive error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Archive generation failed" });
  });
  arc.pipe(res);

  await addTaxPackEntries(arc, businessId, biz.name, year, transactions, allReceipts);
  await arc.finalize();
});

// POST /businesses/:businessId/email-tax-pack
router.post("/businesses/:businessId/email-tax-pack", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid businessId" }); return; }

  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const { toEmail, year: yearRaw } = req.body as { toEmail?: string; year?: number };
  if (!toEmail) { res.status(400).json({ error: "toEmail is required" }); return; }

  const year = yearRaw ? parseInt(String(yearRaw)) : new Date().getFullYear();

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    res.status(503).json({
      error: "SMTP not configured",
      details: "Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables to enable email sending.",
    });
    return;
  }

  const { startDate, endDate } = yearRange(year);
  const [transactions, allReceipts] = await Promise.all([
    getTransactionRows(businessId, startDate, endDate),
    getReceiptsForBusiness(businessId),
  ]);

  let zipBuffer: Buffer;
  try {
    zipBuffer = await buildZipBuffer(businessId, biz.name, year, transactions, allReceipts);
  } catch (err) {
    console.error("Failed to build ZIP for email:", err);
    res.status(500).json({ error: "Failed to generate tax pack ZIP" });
    return;
  }

  try {
    const transporter = (nodemailer as any).createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"${biz.name}" <${smtpFrom}>`,
      to: toEmail,
      subject: `Tax Pack ${year} — ${biz.name}`,
      text: [
        `Please find attached the ${year} tax pack for ${biz.name}.`,
        "",
        "This package includes:",
        "  • summary.csv — all transactions with receipt status, category, and amounts",
        "  • receipts-index.csv — receipt details (vendor, date, amount, category)",
        "  • /receipts/ — receipt files renamed by date, vendor, and amount",
        "  • profit-loss.pdf — Profit & Loss statement for the year",
        "  • balance-sheet.pdf — Balance Sheet at year-end",
        "",
        "Generated by ClearLedger.",
      ].join("\n"),
      attachments: [{ filename: `tax-pack-${year}.zip`, content: zipBuffer, contentType: "application/zip" }],
    });

    res.json({ success: true, message: `Tax pack sent to ${toEmail}` });
  } catch (err: unknown) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Failed to send email", details: (err as Error).message });
  }
});

export default router;
