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

const DEFAULT_COA = [
  // Assets
  { name: "Cash and Cash Equivalents", type: "asset", code: "1000" },
  { name: "Checking Account", type: "asset", code: "1010" },
  { name: "Savings Account", type: "asset", code: "1020" },
  { name: "Accounts Receivable", type: "asset", code: "1100" },
  { name: "Inventory", type: "asset", code: "1200" },
  { name: "Prepaid Expenses", type: "asset", code: "1300" },
  { name: "Property and Equipment", type: "asset", code: "1500" },
  // Liabilities
  { name: "Accounts Payable", type: "liability", code: "2000" },
  { name: "Credit Card Payable", type: "liability", code: "2100" },
  { name: "Accrued Liabilities", type: "liability", code: "2200" },
  { name: "Short-term Loans", type: "liability", code: "2300" },
  { name: "Long-term Debt", type: "liability", code: "2500" },
  // Equity
  { name: "Owner's Equity", type: "equity", code: "3000" },
  { name: "Retained Earnings", type: "equity", code: "3100" },
  // Income
  { name: "Sales Revenue", type: "income", code: "4000" },
  { name: "Service Revenue", type: "income", code: "4100" },
  { name: "Other Income", type: "income", code: "4900" },
  // Expenses
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

  // Seed default COA
  for (const account of DEFAULT_COA) {
    await db.insert(accountsTable).values({
      businessId: business.id,
      name: account.name,
      type: account.type,
      code: account.code,
      isActive: true,
    });
  }

  res.status(201).json({ ...business, createdAt: business.createdAt.toISOString() });
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
