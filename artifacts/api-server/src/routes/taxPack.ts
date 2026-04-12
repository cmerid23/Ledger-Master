import { Router, type IRouter } from "express";
import {
  db, transactionsTable, accountsTable, businessesTable, receiptsTable,
  invoicesTable, customersTable, jobsTable, jobExpensesTable,
} from "@workspace/db";
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

// ─── IRS Mileage Rates ────────────────────────────────────────────────────────

const IRS_MILEAGE_RATES: Record<number, number> = {
  2024: 0.67,
  2025: 0.70,
};
const DEFAULT_IRS_RATE = 0.67;

// ─── Federal Tax Brackets (single filer, 2024) ────────────────────────────────
// [rate, upToIncome] — last entry has no cap

const FED_BRACKETS_2024 = [
  { rate: 0.10, upTo: 11600 },
  { rate: 0.12, upTo: 47150 },
  { rate: 0.22, upTo: 100525 },
  { rate: 0.24, upTo: 191950 },
  { rate: 0.32, upTo: 243725 },
  { rate: 0.35, upTo: 609350 },
  { rate: 0.37, upTo: Infinity },
];

const STANDARD_DEDUCTION_2024 = 14600;
const STANDARD_DEDUCTION_2025 = 15000;

function standardDeduction(year: number) {
  return year >= 2025 ? STANDARD_DEDUCTION_2025 : STANDARD_DEDUCTION_2024;
}

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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

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

// ─── New data helpers ──────────────────────────────────────────────────────────

async function getIncomeSummary(businessId: number, startDate: string, endDate: string) {
  const invoices = await db
    .select({
      id: invoicesTable.id,
      total: invoicesTable.total,
      amountPaid: invoicesTable.amountPaid,
      balanceDue: invoicesTable.balanceDue,
      status: invoicesTable.status,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(
      eq(invoicesTable.businessId, businessId),
      gte(invoicesTable.issueDate, startDate),
      lte(invoicesTable.issueDate, endDate),
    ));

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
  const totalCollected = invoices.reduce((s, i) => s + Number(i.amountPaid), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balanceDue), 0);

  const byCustomerMap = new Map<string, { invoiced: number; collected: number; outstanding: number; count: number }>();
  for (const inv of invoices) {
    const key = inv.customerName ?? "Unknown Customer";
    if (!byCustomerMap.has(key)) byCustomerMap.set(key, { invoiced: 0, collected: 0, outstanding: 0, count: 0 });
    const e = byCustomerMap.get(key)!;
    e.invoiced += Number(inv.total);
    e.collected += Number(inv.amountPaid);
    e.outstanding += Number(inv.balanceDue);
    e.count++;
  }

  return {
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    invoiceCount: invoices.length,
    byCustomer: Array.from(byCustomerMap.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.invoiced - a.invoiced),
  };
}

async function getMileageAndVehicle(businessId: number, startDate: string, endDate: string, year: number) {
  const jobs = await db
    .select({ actualMiles: jobsTable.actualMiles, startDate: jobsTable.startDate, endDate: jobsTable.endDate })
    .from(jobsTable)
    .where(and(
      eq(jobsTable.businessId, businessId),
      gte(jobsTable.startDate, startDate),
      lte(jobsTable.startDate, endDate),
    ));

  const totalMiles = jobs.reduce((s, j) => s + (j.actualMiles ? Number(j.actualMiles) : 0), 0);
  const irsRate = IRS_MILEAGE_RATES[year] ?? DEFAULT_IRS_RATE;
  const mileageDeduction = totalMiles * irsRate;

  const vehicleExpenseTypes = ["fuel_oil", "maintenance", "tires", "truck_lease", "insurance"];
  const jobExpenses = await db
    .select({ expenseType: jobExpensesTable.expenseType, amount: jobExpensesTable.amount, date: jobExpensesTable.date })
    .from(jobExpensesTable)
    .innerJoin(jobsTable, eq(jobExpensesTable.jobId, jobsTable.id))
    .where(and(
      eq(jobsTable.businessId, businessId),
      gte(jobExpensesTable.date, startDate),
      lte(jobExpensesTable.date, endDate),
    ));

  const vehicleMap = new Map<string, number>();
  for (const exp of jobExpenses) {
    if (!exp.expenseType) continue;
    const prev = vehicleMap.get(exp.expenseType) ?? 0;
    vehicleMap.set(exp.expenseType, prev + Number(exp.amount));
  }

  const vehicleBreakdown: { type: string; label: string; total: number }[] = [
    { type: "fuel_oil", label: "Fuel & Oil", total: vehicleMap.get("fuel_oil") ?? 0 },
    { type: "maintenance", label: "Maintenance & Repairs", total: vehicleMap.get("maintenance") ?? 0 },
    { type: "tires", label: "Tires", total: vehicleMap.get("tires") ?? 0 },
    { type: "truck_lease", label: "Lease / Loan Payments", total: vehicleMap.get("truck_lease") ?? 0 },
    { type: "insurance", label: "Insurance", total: vehicleMap.get("insurance") ?? 0 },
  ];

  const vehicleTotal = vehicleBreakdown.reduce((s, v) => s + v.total, 0);

  return { totalMiles, irsRate, mileageDeduction, vehicleBreakdown, vehicleTotal };
}

function getQuarterlyBreakdown(enriched: { date: string; amount: number; accountType: string | null }[]) {
  const quarters = [
    { label: "Q1", months: [1, 2, 3], income: 0, expenses: 0 },
    { label: "Q2", months: [4, 5, 6], income: 0, expenses: 0 },
    { label: "Q3", months: [7, 8, 9], income: 0, expenses: 0 },
    { label: "Q4", months: [10, 11, 12], income: 0, expenses: 0 },
  ];

  for (const tx of enriched) {
    const month = new Date(tx.date).getMonth() + 1;
    const q = quarters.find((q) => q.months.includes(month));
    if (!q) continue;
    if (tx.accountType === "income") q.income += Math.abs(tx.amount);
    else if (tx.accountType === "expense") q.expenses += Math.abs(tx.amount);
  }

  return quarters.map((q) => ({
    label: q.label,
    income: q.income,
    expenses: q.expenses,
    profit: q.income - q.expenses,
  }));
}

function computeEstimatedTax(netProfit: number, mileageDeduction: number, year: number) {
  if (netProfit <= 0) {
    return {
      netProfit,
      mileageDeduction,
      adjustedProfit: 0,
      seTaxBase: 0,
      seTax: 0,
      seTaxDeduction: 0,
      standardDeduction: standardDeduction(year),
      federalTaxableIncome: 0,
      federalTax: 0,
      totalEstimatedTax: 0,
      effectiveRate: 0,
      brackets: [] as { rate: number; upTo: number; taxableAmount: number; tax: number }[],
    };
  }

  const adjustedProfit = Math.max(0, netProfit - mileageDeduction);
  const seTaxBase = adjustedProfit * 0.9235;
  const seTax = seTaxBase * 0.153;
  const seTaxDeduction = seTax * 0.5;
  const stdDed = standardDeduction(year);
  const federalTaxableIncome = Math.max(0, adjustedProfit - seTaxDeduction - stdDed);

  let federalTax = 0;
  let prev = 0;
  const brackets: { rate: number; upTo: number; taxableAmount: number; tax: number }[] = [];
  for (const bracket of FED_BRACKETS_2024) {
    const taxableInBracket = Math.min(Math.max(0, federalTaxableIncome - prev), bracket.upTo - prev);
    const tax = taxableInBracket * bracket.rate;
    brackets.push({ rate: bracket.rate, upTo: bracket.upTo, taxableAmount: taxableInBracket, tax });
    federalTax += tax;
    prev = bracket.upTo === Infinity ? federalTaxableIncome : bracket.upTo;
    if (prev >= federalTaxableIncome) break;
  }

  const totalEstimatedTax = seTax + federalTax;
  const effectiveRate = adjustedProfit > 0 ? totalEstimatedTax / adjustedProfit : 0;

  return {
    netProfit,
    mileageDeduction,
    adjustedProfit,
    seTaxBase,
    seTax,
    seTaxDeduction,
    standardDeduction: stdDed,
    federalTaxableIncome,
    federalTax,
    totalEstimatedTax,
    effectiveRate,
    brackets: brackets.filter((b) => b.taxableAmount > 0),
  };
}

// ─── PDF generators ────────────────────────────────────────────────────────────

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

function generateTaxSummaryPdf(
  summary: {
    year: number;
    businessName: string;
    incomeSummary: { totalInvoiced: number; totalCollected: number; totalOutstanding: number; invoiceCount: number; byCustomer: { name: string; invoiced: number; collected: number; outstanding: number; count: number }[] };
    totalTaxDeductible: number;
    totalNonDeductible: number;
    totalMissingReceipts: number;
    totalWithReceipts: number;
    totalTransactions: number;
    mileage: { totalMiles: number; irsRate: number; mileageDeduction: number };
    vehicleExpenses: { vehicleBreakdown: { label: string; total: number }[]; vehicleTotal: number };
    estimatedTax: ReturnType<typeof computeEstimatedTax>;
    quarterlyBreakdown: { label: string; income: number; expenses: number; profit: number }[];
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: "LETTER", margin: 50, compress: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 512, COL = 340;

    function header(text: string, color = "#1e3a6e") {
      doc.moveDown(0.6);
      doc.fontSize(13).fillColor(color).font("Helvetica-Bold").text(text);
      doc.font("Helvetica").moveDown(0.3);
    }

    function row(label: string, value: string, bold = false) {
      const y = doc.y;
      doc.fontSize(10).fillColor("#333").font(bold ? "Helvetica-Bold" : "Helvetica").text(label, 50, y, { width: COL });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").text(value, 50 + COL, y, { width: W - COL, align: "right" });
      doc.font("Helvetica").moveDown(0.3);
    }

    function divider() {
      doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.3);
    }

    // Title
    doc.fontSize(20).fillColor("#111").font("Helvetica-Bold").text(`${summary.year} Tax Summary`, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#555").font("Helvetica").text(summary.businessName, { align: "center" });
    doc.fontSize(9).fillColor("#888").text("This is an estimate only — consult your accountant", { align: "center" });
    doc.moveDown(1.2);

    // 1. Income
    header("1. Income Summary", "#1a7a4a");
    row("Total Invoiced", fmt(summary.incomeSummary.totalInvoiced));
    row("Total Collected", fmt(summary.incomeSummary.totalCollected));
    row("Outstanding (Uncollected)", fmt(summary.incomeSummary.totalOutstanding));
    row("Invoices Issued", String(summary.incomeSummary.invoiceCount));
    divider();
    if (summary.incomeSummary.byCustomer.length > 0) {
      doc.fontSize(10).fillColor("#555").text("By Customer:", 50).moveDown(0.2);
      for (const c of summary.incomeSummary.byCustomer.slice(0, 10)) {
        row(`  ${c.name}`, fmt(c.invoiced));
      }
    }

    // 2. Expenses
    header("2. Expense Summary", "#c0392b");
    row("Total Tax Deductible", fmt(summary.totalTaxDeductible));
    row("Total Non-Deductible", fmt(summary.totalNonDeductible));
    row("Receipts Attached", `${summary.totalWithReceipts} of ${summary.totalTransactions} transactions`);
    if (summary.totalMissingReceipts > 0) row("Missing Receipts", `${summary.totalMissingReceipts} transactions`);

    // 3. Mileage
    header("3. Mileage Deduction");
    row("Total Business Miles", summary.mileage.totalMiles.toLocaleString("en-US", { maximumFractionDigits: 0 }));
    row(`IRS Rate (${summary.year})`, `$${summary.mileage.irsRate.toFixed(3)}/mile`);
    row("Mileage Deduction Value", fmt(summary.mileage.mileageDeduction), true);

    // 4. Vehicle Expenses
    header("4. Vehicle & Asset Expenses");
    for (const v of summary.vehicleExpenses.vehicleBreakdown) {
      row(v.label, fmt(v.total));
    }
    divider();
    row("Total Vehicle Expenses", fmt(summary.vehicleExpenses.vehicleTotal), true);

    // 5. Estimated Tax
    header("5. Estimated Tax Liability", "#7b2d00");
    const et = summary.estimatedTax;
    row("Net Profit (P&L)", fmt(et.netProfit));
    row("Less: Mileage Deduction", `(${fmt(et.mileageDeduction)})`);
    row("Adjusted Net Profit", fmt(et.adjustedProfit), true);
    divider();
    row("Self-Employment Tax (15.3%)", fmt(et.seTax));
    row("SE Tax Deduction (½ of SE Tax)", `(${fmt(et.seTaxDeduction)})`);
    row("Standard Deduction", `(${fmt(et.standardDeduction)})`);
    row("Federal Taxable Income", fmt(et.federalTaxableIncome));
    divider();
    for (const b of et.brackets) {
      row(`  Federal ${(b.rate * 100).toFixed(0)}% bracket`, fmt(b.tax));
    }
    row("Total Federal Income Tax", fmt(et.federalTax));
    row("Total SE Tax", fmt(et.seTax));
    divider();
    row("TOTAL ESTIMATED TAX DUE", fmt(et.totalEstimatedTax), true);
    row("Effective Rate", `${(et.effectiveRate * 100).toFixed(1)}%`);
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor("#888").text(
      "DISCLAIMER: This is an estimate only and does not constitute tax advice. Brackets shown are 2024 single-filer rates. " +
      "Consult a qualified tax professional before filing. Quarterly estimated payments may be required.",
      50, doc.y, { width: W }
    );

    // 6. Quarterly
    doc.moveDown(0.8);
    header("6. Quarterly Breakdown");
    const qy = doc.y;
    doc.fontSize(10).fillColor("#555").font("Helvetica-Bold")
      .text("Quarter", 50, qy, { width: 60 })
      .text("Income", 110, qy, { width: 120, align: "right" })
      .text("Expenses", 230, qy, { width: 120, align: "right" })
      .text("Profit", 350, qy, { width: 120, align: "right" });
    doc.font("Helvetica").moveDown(0.4);
    divider();
    for (const q of summary.quarterlyBreakdown) {
      const ry = doc.y;
      const pColor = q.profit >= 0 ? "#1a7a4a" : "#c0392b";
      doc.fontSize(10).fillColor("#333")
        .text(q.label, 50, ry, { width: 60 })
        .text(fmt(q.income), 110, ry, { width: 120, align: "right" })
        .text(fmt(q.expenses), 230, ry, { width: 120, align: "right" });
      doc.fillColor(pColor).text(fmt(q.profit), 350, ry, { width: 120, align: "right" });
      doc.fillColor("#333").moveDown(0.35);
    }

    doc.end();
  });
}

// ─── Archive content builder ───────────────────────────────────────────────────

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
  const enrichedForQ = transactions.map((tx) => ({
    date: tx.date,
    amount: parseFloat(String(tx.amount)),
    accountType: tx.accountType,
  }));

  const [plData, bsData, incomeSummary, mileageVehicle] = await Promise.all([
    getPLData(businessId, startDate, endDate),
    getBSData(businessId, endDate),
    getIncomeSummary(businessId, startDate, endDate),
    getMileageAndVehicle(businessId, startDate, endDate, year),
  ]);

  const enriched = transactions.map((tx) => {
    const txR = receiptsByTxId.get(tx.id) ?? [];
    const hasReceipts = txR.length > 0;
    const taxDeductible = hasReceipts && txR.some((r) => r.taxDeductible);
    return { ...tx, amount: parseFloat(String(tx.amount)), hasReceipts, taxDeductible };
  });

  const totalTaxDeductible = enriched.filter((t) => t.taxDeductible).reduce((s, t) => s + t.amount, 0);
  const totalNonDeductible = enriched.filter((t) => !t.taxDeductible).reduce((s, t) => s + t.amount, 0);
  const totalWithReceipts = enriched.filter((t) => t.hasReceipts).length;
  const totalMissingReceipts = enriched.filter((t) => !t.hasReceipts).length;
  const quarterlyBreakdown = getQuarterlyBreakdown(enrichedForQ);
  const estimatedTax = computeEstimatedTax(plData.netProfit, mileageVehicle.mileageDeduction, year);

  const [plPdf, bsPdf, taxSummaryPdf] = await Promise.all([
    generatePLPdf(plData, businessName),
    generateBSPdf(bsData, businessName),
    generateTaxSummaryPdf({
      year,
      businessName,
      incomeSummary,
      totalTaxDeductible,
      totalNonDeductible,
      totalMissingReceipts,
      totalWithReceipts,
      totalTransactions: transactions.length,
      mileage: {
        totalMiles: mileageVehicle.totalMiles,
        irsRate: mileageVehicle.irsRate,
        mileageDeduction: mileageVehicle.mileageDeduction,
      },
      vehicleExpenses: {
        vehicleBreakdown: mileageVehicle.vehicleBreakdown,
        vehicleTotal: mileageVehicle.vehicleTotal,
      },
      estimatedTax,
      quarterlyBreakdown,
    }),
  ]);

  archive.append(plPdf, { name: `${folder}/profit-loss.pdf` });
  archive.append(bsPdf, { name: `${folder}/balance-sheet.pdf` });
  archive.append(taxSummaryPdf, { name: `${folder}/tax-summary.pdf` });
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

  const [transactions, allReceipts, incomeSummary, mileageVehicle] = await Promise.all([
    getTransactionRows(businessId, startDate, endDate),
    getReceiptsForBusiness(businessId),
    getIncomeSummary(businessId, startDate, endDate),
    getMileageAndVehicle(businessId, startDate, endDate, year),
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
  const totalTaxDeductible = enriched.filter((t) => t.taxDeductible).reduce((s, t) => s + t.amount, 0);
  const totalNonDeductible = enriched.filter((t) => !t.taxDeductible).reduce((s, t) => s + t.amount, 0);

  // P&L net profit for tax estimate
  const plData = await getPLData(businessId, startDate, endDate);
  const quarterlyBreakdown = getQuarterlyBreakdown(enriched.map((t) => ({ date: t.date, amount: t.amount, accountType: t.accountType })));
  const estimatedTax = computeEstimatedTax(plData.netProfit, mileageVehicle.mileageDeduction, year);

  res.json({
    year,
    businessName: biz.name,
    totalTransactions: transactions.length,
    totalWithReceipts: enriched.filter((t) => t.hasReceipts).length,
    totalMissingReceipts: missing.length,
    totalTaxDeductible,
    totalNonDeductible,
    totalAmount: enriched.reduce((s, t) => s + t.amount, 0),
    categoryBreakdown: Array.from(catMap.entries())
      .map(([category, d]) => ({ category, ...d }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    accountBreakdown: Array.from(accMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    missingReceiptTransactions: missing.slice(0, 200).map(({ hasReceipts: _, taxDeductible: __, category: ___, ...rest }) => rest),
    // ── New fields ──
    incomeSummary,
    mileage: {
      totalMiles: mileageVehicle.totalMiles,
      irsRate: mileageVehicle.irsRate,
      mileageDeduction: mileageVehicle.mileageDeduction,
    },
    vehicleExpenses: {
      vehicleBreakdown: mileageVehicle.vehicleBreakdown,
      vehicleTotal: mileageVehicle.vehicleTotal,
    },
    estimatedTax,
    quarterlyBreakdown,
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
        "  • tax-summary.pdf — Full tax summary with income, mileage, vehicle expenses, estimated tax, and quarterly breakdown",
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
