import { Router, type IRouter } from "express";
import { db, usersTable, businessesTable, accountsTable, transactionsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { generateToken } from "../middlewares/auth";

const router: IRouter = Router();

const DEMO_EMAIL = "demo@clearledger.com";
const DEMO_PASSWORD = "demo123";
const DEMO_NAME = "Demo User";

const DEFAULT_COA = [
  { name: "Cash and Cash Equivalents", type: "asset", code: "1000" },
  { name: "Checking Account", type: "asset", code: "1010" },
  { name: "Savings Account", type: "asset", code: "1020" },
  { name: "Accounts Receivable", type: "asset", code: "1100" },
  { name: "Inventory", type: "asset", code: "1200" },
  { name: "Prepaid Expenses", type: "asset", code: "1300" },
  { name: "Property and Equipment", type: "asset", code: "1500" },
  { name: "Accounts Payable", type: "liability", code: "2000" },
  { name: "Credit Card Payable", type: "liability", code: "2100" },
  { name: "Accrued Liabilities", type: "liability", code: "2200" },
  { name: "Short-term Loans", type: "liability", code: "2300" },
  { name: "Long-term Debt", type: "liability", code: "2500" },
  { name: "Owner's Equity", type: "equity", code: "3000" },
  { name: "Retained Earnings", type: "equity", code: "3100" },
  { name: "Sales Revenue", type: "income", code: "4000" },
  { name: "Service Revenue", type: "income", code: "4100" },
  { name: "Other Income", type: "income", code: "4900" },
  { name: "Cost of Goods Sold", type: "expense", code: "5000" },
  { name: "Operating Expenses", type: "expense", code: "6000" },
  { name: "Rent Expense", type: "expense", code: "6100" },
  { name: "Utilities Expense", type: "expense", code: "6200" },
  { name: "Salaries and Wages", type: "expense", code: "6300" },
  { name: "Marketing and Advertising", type: "expense", code: "6400" },
  { name: "Office Supplies", type: "expense", code: "6500" },
  { name: "Professional Services", type: "expense", code: "6600" },
  { name: "Depreciation Expense", type: "expense", code: "6700" },
  { name: "Interest Expense", type: "expense", code: "6800" },
  { name: "Income Tax Expense", type: "expense", code: "6900" },
];

// Returns a date string YYYY-MM-DD relative to today minus daysAgo
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// POST /api/demo/login
// Creates demo account + seeds data on first call, then returns JWT
router.post("/demo/login", async (_req, res): Promise<void> => {
  // ── 1. Find or create demo user ──────────────────────────────
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, DEMO_EMAIL)).limit(1);

  if (!user) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    [user] = await db
      .insert(usersTable)
      .values({ email: DEMO_EMAIL, passwordHash, name: DEMO_NAME, role: "user" })
      .returning();
  }

  // ── 2. Find or create demo business ──────────────────────────
  let [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.userId, user.id))
    .limit(1);

  if (!business) {
    [business] = await db
      .insert(businessesTable)
      .values({ userId: user.id, name: "Acme Corp", currency: "USD", fiscalYearStart: 1 })
      .returning();

    // ── 3. Seed Chart of Accounts ─────────────────────────────
    const insertedAccounts: Array<{ id: number; code: string | null }> = [];
    for (const acct of DEFAULT_COA) {
      const [a] = await db
        .insert(accountsTable)
        .values({ businessId: business.id, ...acct, isActive: true })
        .returning();
      insertedAccounts.push({ id: a.id, code: a.code });
    }

    const byCode = (code: string) => insertedAccounts.find((a) => a.code === code)?.id ?? null;

    const salesId = byCode("4000");
    const serviceId = byCode("4100");
    const rentId = byCode("6100");
    const utilitiesId = byCode("6200");
    const salariesId = byCode("6300");
    const marketingId = byCode("6400");
    const officeId = byCode("6500");
    const cogsId = byCode("5000");
    const checkingId = byCode("1010");
    const arId = byCode("1100");

    // ── 4. Seed realistic transactions ────────────────────────
    const txns = [
      // Income — service & sales revenue
      { date: daysAgo(170), description: "Client A — Monthly Retainer", amount: 4500, type: "credit" as const, accountId: serviceId },
      { date: daysAgo(165), description: "Product Sales — Batch #12", amount: 8200, type: "credit" as const, accountId: salesId },
      { date: daysAgo(140), description: "Client B — Project Milestone", amount: 6000, type: "credit" as const, accountId: serviceId },
      { date: daysAgo(135), description: "Online Store Revenue", amount: 3400, type: "credit" as const, accountId: salesId },
      { date: daysAgo(110), description: "Client A — Monthly Retainer", amount: 4500, type: "credit" as const, accountId: serviceId },
      { date: daysAgo(105), description: "Product Sales — Batch #13", amount: 9100, type: "credit" as const, accountId: salesId },
      { date: daysAgo(80),  description: "Client C — Consulting Invoice", amount: 7800, type: "credit" as const, accountId: serviceId },
      { date: daysAgo(75),  description: "Online Store Revenue", amount: 4200, type: "credit" as const, accountId: salesId },
      { date: daysAgo(50),  description: "Client A — Monthly Retainer", amount: 4500, type: "credit" as const, accountId: serviceId },
      { date: daysAgo(45),  description: "Product Sales — Batch #14", amount: 11500, type: "credit" as const, accountId: salesId },
      { date: daysAgo(20),  description: "Client D — Annual Contract", amount: 15000, type: "credit" as const, accountId: serviceId },
      { date: daysAgo(10),  description: "Online Store Revenue", amount: 5600, type: "credit" as const, accountId: salesId },
      // Expenses
      { date: daysAgo(168), description: "Office Rent — March", amount: 2800, type: "debit" as const, accountId: rentId },
      { date: daysAgo(163), description: "Electricity & Internet", amount: 320, type: "debit" as const, accountId: utilitiesId },
      { date: daysAgo(160), description: "Staff Salaries — March", amount: 12000, type: "debit" as const, accountId: salariesId },
      { date: daysAgo(155), description: "Google Ads Campaign", amount: 950, type: "debit" as const, accountId: marketingId },
      { date: daysAgo(138), description: "Office Rent — April", amount: 2800, type: "debit" as const, accountId: rentId },
      { date: daysAgo(133), description: "Electricity & Internet", amount: 290, type: "debit" as const, accountId: utilitiesId },
      { date: daysAgo(130), description: "Staff Salaries — April", amount: 12000, type: "debit" as const, accountId: salariesId },
      { date: daysAgo(128), description: "Office Supplies & Equipment", amount: 640, type: "debit" as const, accountId: officeId },
      { date: daysAgo(125), description: "LinkedIn Ads", amount: 700, type: "debit" as const, accountId: marketingId },
      { date: daysAgo(108), description: "Office Rent — May", amount: 2800, type: "debit" as const, accountId: rentId },
      { date: daysAgo(103), description: "Electricity & Internet", amount: 310, type: "debit" as const, accountId: utilitiesId },
      { date: daysAgo(100), description: "Staff Salaries — May", amount: 12500, type: "debit" as const, accountId: salariesId },
      { date: daysAgo(95),  description: "Cost of Goods — Batch #13", amount: 4200, type: "debit" as const, accountId: cogsId },
      { date: daysAgo(90),  description: "Legal & Accounting Fees", amount: 1200, type: "debit" as const, accountId: byCode("6600") },
      { date: daysAgo(78),  description: "Office Rent — June", amount: 2800, type: "debit" as const, accountId: rentId },
      { date: daysAgo(73),  description: "Electricity & Internet", amount: 295, type: "debit" as const, accountId: utilitiesId },
      { date: daysAgo(70),  description: "Staff Salaries — June", amount: 12500, type: "debit" as const, accountId: salariesId },
      { date: daysAgo(65),  description: "Cost of Goods — Batch #14", amount: 5100, type: "debit" as const, accountId: cogsId },
      { date: daysAgo(60),  description: "Trade Show Sponsorship", amount: 2000, type: "debit" as const, accountId: marketingId },
      { date: daysAgo(48),  description: "Office Rent — July", amount: 2800, type: "debit" as const, accountId: rentId },
      { date: daysAgo(43),  description: "Electricity & Internet", amount: 305, type: "debit" as const, accountId: utilitiesId },
      { date: daysAgo(40),  description: "Staff Salaries — July", amount: 13000, type: "debit" as const, accountId: salariesId },
      { date: daysAgo(35),  description: "Office Supplies", amount: 420, type: "debit" as const, accountId: officeId },
      { date: daysAgo(18),  description: "Office Rent — August", amount: 2800, type: "debit" as const, accountId: rentId },
      { date: daysAgo(13),  description: "Electricity & Internet", amount: 315, type: "debit" as const, accountId: utilitiesId },
      { date: daysAgo(10),  description: "Staff Salaries — August", amount: 13000, type: "debit" as const, accountId: salariesId },
      { date: daysAgo(7),   description: "Cost of Goods — Batch #15", amount: 5800, type: "debit" as const, accountId: cogsId },
      { date: daysAgo(5),   description: "SaaS Tools (Figma, Notion, Slack)", amount: 480, type: "debit" as const, accountId: officeId },
    ];

    for (const tx of txns) {
      await db.insert(transactionsTable).values({
        businessId: business.id,
        ...tx,
        source: "manual",
        reconciled: false,
      });
    }

    // ── 5. Seed a couple of journal entries ───────────────────
    if (checkingId && arId && salesId) {
      // Entry 1: Record a sale on credit
      const [entry1] = await db
        .insert(journalEntriesTable)
        .values({ businessId: business.id, date: daysAgo(120), memo: "Sale to Client B on account" })
        .returning();

      await db.insert(journalLinesTable).values([
        { journalEntryId: entry1.id, accountId: arId, debitAmount: "6000", creditAmount: "0" },
        { journalEntryId: entry1.id, accountId: salesId, debitAmount: "0", creditAmount: "6000" },
      ]);

      // Entry 2: Collect payment from client
      const [entry2] = await db
        .insert(journalEntriesTable)
        .values({ businessId: business.id, date: daysAgo(110), memo: "Received payment from Client B" })
        .returning();

      await db.insert(journalLinesTable).values([
        { journalEntryId: entry2.id, accountId: checkingId, debitAmount: "6000", creditAmount: "0" },
        { journalEntryId: entry2.id, accountId: arId, debitAmount: "0", creditAmount: "6000" },
      ]);
    }
  }

  // ── 6. Return JWT ─────────────────────────────────────────────
  const token = generateToken(user.id, false);
  res.json({
    token,
    isAdmin: false,
    businessId: business.id,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

export default router;
