import { Router, type IRouter } from "express";
import { db, businessesTable, accountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateBusinessBody,
  UpdateBusinessBody,
  GetBusinessParams,
  UpdateBusinessParams,
  DeleteBusinessParams,
} from "@workspace/api-zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Standard Chart of Accounts — spec-compliant with normalBalance, subtype, isSystem
// Two-pass insert: first parents (no parentCode), then children (with parentCode)
const DEFAULT_COA: Array<{
  code: string;
  name: string;
  type: string;
  subtype?: string;
  normalBalance: string;
  parentCode?: string;
  isSystem?: boolean;
  description?: string;
}> = [
  // ── ASSETS ──────────────────────────────────────────────
  { code: "1000", name: "Cash and Cash Equivalents",            type: "asset", subtype: "bank",                 normalBalance: "debit", isSystem: true  },
  { code: "1010", name: "Checking Account",                     type: "asset", subtype: "bank",                 normalBalance: "debit", parentCode: "1000" },
  { code: "1020", name: "Savings Account",                      type: "asset", subtype: "bank",                 normalBalance: "debit", parentCode: "1000" },
  { code: "1100", name: "Accounts Receivable",                  type: "asset", subtype: "accounts_receivable",  normalBalance: "debit", isSystem: true  },
  { code: "1200", name: "Inventory",                            type: "asset", subtype: "current_asset",        normalBalance: "debit" },
  { code: "1300", name: "Prepaid Expenses",                     type: "asset", subtype: "current_asset",        normalBalance: "debit" },
  { code: "1500", name: "Equipment",                            type: "asset", subtype: "fixed_asset",          normalBalance: "debit" },
  { code: "1510", name: "Less: Accumulated Depreciation",       type: "asset", subtype: "fixed_asset",          normalBalance: "credit", parentCode: "1500", description: "Contra account" },
  { code: "1600", name: "Vehicles",                             type: "asset", subtype: "fixed_asset",          normalBalance: "debit" },
  { code: "1610", name: "Less: Accumulated Depreciation - Vehicles", type: "asset", subtype: "fixed_asset",    normalBalance: "credit", parentCode: "1600", description: "Contra account" },
  // ── LIABILITIES ─────────────────────────────────────────
  { code: "2000", name: "Accounts Payable",                     type: "liability", subtype: "accounts_payable",    normalBalance: "credit", isSystem: true },
  { code: "2100", name: "Credit Card Payable",                  type: "liability", subtype: "credit_card",         normalBalance: "credit" },
  { code: "2200", name: "Sales Tax Payable",                    type: "liability", subtype: "current_liability",   normalBalance: "credit" },
  { code: "2300", name: "Accrued Liabilities",                  type: "liability", subtype: "current_liability",   normalBalance: "credit" },
  { code: "2500", name: "Loans Payable",                        type: "liability", subtype: "long_term_liability",  normalBalance: "credit" },
  // ── EQUITY ──────────────────────────────────────────────
  { code: "3000", name: "Owner's Equity",                       type: "equity", normalBalance: "credit", isSystem: true },
  { code: "3100", name: "Owner's Draw",                         type: "equity", normalBalance: "debit",  parentCode: "3000" },
  { code: "3200", name: "Retained Earnings",                    type: "equity", normalBalance: "credit", isSystem: true },
  // ── INCOME ──────────────────────────────────────────────
  { code: "4000", name: "Revenue",                              type: "income", subtype: "operating_income",  normalBalance: "credit", isSystem: true },
  { code: "4010", name: "Service Revenue",                      type: "income", subtype: "operating_income",  normalBalance: "credit", parentCode: "4000" },
  { code: "4020", name: "Product Sales",                        type: "income", subtype: "operating_income",  normalBalance: "credit", parentCode: "4000" },
  { code: "4030", name: "Consulting Revenue",                   type: "income", subtype: "operating_income",  normalBalance: "credit", parentCode: "4000" },
  { code: "4500", name: "Other Income",                         type: "income", subtype: "other_income",      normalBalance: "credit" },
  { code: "4510", name: "Interest Income",                      type: "income", subtype: "other_income",      normalBalance: "credit", parentCode: "4500" },
  // ── COGS ────────────────────────────────────────────────
  { code: "5000", name: "Cost of Goods Sold",                   type: "cogs",  normalBalance: "debit" },
  { code: "5010", name: "Materials and Supplies",               type: "cogs",  normalBalance: "debit", parentCode: "5000" },
  { code: "5020", name: "Direct Labor",                         type: "cogs",  normalBalance: "debit", parentCode: "5000" },
  { code: "5030", name: "Subcontractors",                       type: "cogs",  normalBalance: "debit", parentCode: "5000" },
  // ── EXPENSES ─────────────────────────────────────────────
  { code: "6000", name: "Operating Expenses",                   type: "expense", subtype: "operating_expense", normalBalance: "debit" },
  { code: "6010", name: "Advertising and Marketing",            type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6020", name: "Bank Fees and Charges",                type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6030", name: "Communication (Phone, Internet)",      type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6040", name: "Depreciation",                         type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6050", name: "Fuel and Oil",                         type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6060", name: "Insurance",                            type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6070", name: "Meals and Entertainment",              type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6080", name: "Office Supplies",                      type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6090", name: "Professional Services",                type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6100", name: "Rent and Lease",                       type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6110", name: "Repairs and Maintenance",              type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6120", name: "Salaries and Wages",                   type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6130", name: "Taxes and Licenses",                   type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6140", name: "Travel",                               type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6150", name: "Utilities",                            type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6160", name: "Vehicle Expenses",                     type: "expense", subtype: "operating_expense", normalBalance: "debit", parentCode: "6000" },
  { code: "6900", name: "Other Expenses",                       type: "expense", subtype: "other_expense",     normalBalance: "debit" },
];

async function seedChartOfAccounts(businessId: number) {
  const codeToId = new Map<string, number>();
  // Pass 1: parents
  for (const acct of DEFAULT_COA.filter((a) => !a.parentCode)) {
    const [ins] = await db.insert(accountsTable).values({
      businessId, name: acct.name, type: acct.type,
      subtype: acct.subtype ?? null, normalBalance: acct.normalBalance,
      code: acct.code, description: acct.description ?? null,
      isActive: true, isSystem: acct.isSystem ?? false,
    }).returning();
    codeToId.set(acct.code, ins.id);
  }
  // Pass 2: children
  for (const acct of DEFAULT_COA.filter((a) => !!a.parentCode)) {
    const parentId = acct.parentCode ? (codeToId.get(acct.parentCode) ?? null) : null;
    const [ins] = await db.insert(accountsTable).values({
      businessId, name: acct.name, type: acct.type,
      subtype: acct.subtype ?? null, normalBalance: acct.normalBalance,
      code: acct.code, description: acct.description ?? null,
      parentAccountId: parentId, isActive: true, isSystem: acct.isSystem ?? false,
    }).returning();
    codeToId.set(acct.code, ins.id);
  }
}

router.use(authMiddleware);

router.get("/businesses", async (req: AuthRequest, res): Promise<void> => {
  const businesses = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.userId, req.userId!));
  res.json(
    businesses.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
    }))
  );
});

router.post("/businesses", async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [business] = await db
    .insert(businessesTable)
    .values({ ...parsed.data, userId: req.userId! })
    .returning();

  await seedChartOfAccounts(business.id);

  res.status(201).json({ ...business, createdAt: business.createdAt.toISOString() });
});

// Re-seed the standard chart of accounts for an existing business (adds missing accounts only)
router.post("/businesses/:businessId/seed-coa", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid businessId" }); return; }

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, req.userId!)))
    .limit(1);
  if (!business) { res.status(404).json({ error: "Business not found" }); return; }

  const existing = await db.select({ code: accountsTable.code }).from(accountsTable).where(eq(accountsTable.businessId, businessId));
  const existingCodes = new Set(existing.map((a) => a.code));

  const codeToId = new Map<string, number>();
  const existingRows = await db.select({ id: accountsTable.id, code: accountsTable.code }).from(accountsTable).where(eq(accountsTable.businessId, businessId));
  for (const r of existingRows) if (r.code) codeToId.set(r.code, r.id);

  let added = 0;
  for (const acct of DEFAULT_COA.filter((a) => !a.parentCode)) {
    if (existingCodes.has(acct.code)) continue;
    const [ins] = await db.insert(accountsTable).values({
      businessId, name: acct.name, type: acct.type,
      subtype: acct.subtype ?? null, normalBalance: acct.normalBalance,
      code: acct.code, description: acct.description ?? null,
      isActive: true, isSystem: acct.isSystem ?? false,
    }).returning();
    codeToId.set(acct.code, ins.id);
    added++;
  }
  for (const acct of DEFAULT_COA.filter((a) => !!a.parentCode)) {
    if (existingCodes.has(acct.code)) continue;
    const parentId = acct.parentCode ? (codeToId.get(acct.parentCode) ?? null) : null;
    await db.insert(accountsTable).values({
      businessId, name: acct.name, type: acct.type,
      subtype: acct.subtype ?? null, normalBalance: acct.normalBalance,
      code: acct.code, description: acct.description ?? null,
      parentAccountId: parentId, isActive: true, isSystem: acct.isSystem ?? false,
    });
    added++;
  }

  res.json({ added, message: `Added ${added} missing standard accounts` });
});

router.get("/businesses/:businessId", async (req: AuthRequest, res): Promise<void> => {
  const params = GetBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.id, params.data.businessId), eq(businessesTable.userId, req.userId!)))
    .limit(1);

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({ ...business, createdAt: business.createdAt.toISOString() });
});

router.patch("/businesses/:businessId", async (req: AuthRequest, res): Promise<void> => {
  const params = UpdateBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [business] = await db
    .update(businessesTable)
    .set(parsed.data)
    .where(and(eq(businessesTable.id, params.data.businessId), eq(businessesTable.userId, req.userId!)))
    .returning();

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({ ...business, createdAt: business.createdAt.toISOString() });
});

router.delete("/businesses/:businessId", async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteBusinessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(businessesTable)
    .where(and(eq(businessesTable.id, params.data.businessId), eq(businessesTable.userId, req.userId!)));

  res.sendStatus(204);
});

export default router;
