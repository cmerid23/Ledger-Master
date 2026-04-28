import { Router, type IRouter } from "express";
import { db, bankRulesTable, businessesTable, accountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusiness(businessId: number, userId: number): Promise<boolean> {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return !!b;
}

// GET /businesses/:businessId/bank-rules
router.get("/businesses/:businessId/bank-rules", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const rules = await db.select().from(bankRulesTable)
    .where(eq(bankRulesTable.businessId, businessId))
    .orderBy(bankRulesTable.priority);

  res.json(rules.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// POST /businesses/:businessId/bank-rules
router.post("/businesses/:businessId/bank-rules", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const { name, conditionField, conditionOperator, conditionValue, transactionType, accountId, priority, isActive, autoApply } = req.body;
  if (!name || !conditionOperator || !conditionValue) {
    res.status(400).json({ error: "name, conditionOperator, and conditionValue are required" }); return;
  }

  const [rule] = await db.insert(bankRulesTable).values({
    businessId,
    name,
    conditionField: conditionField ?? "description",
    conditionOperator,
    conditionValue,
    transactionType: transactionType ?? "both",
    accountId: accountId ? Number(accountId) : null,
    priority: priority ?? 0,
    isActive: isActive !== false,
    autoApply: autoApply !== false,
  }).returning();

  res.status(201).json({ ...rule, createdAt: rule.createdAt.toISOString() });
});

// PATCH /businesses/:businessId/bank-rules/:id
router.patch("/businesses/:businessId/bank-rules/:id", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const id = Number(req.params.id);
  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const allowed = ["name", "conditionField", "conditionOperator", "conditionValue", "transactionType", "accountId", "priority", "isActive", "autoApply"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }

  const [rule] = await db.update(bankRulesTable)
    .set(update)
    .where(and(eq(bankRulesTable.id, id), eq(bankRulesTable.businessId, businessId)))
    .returning();

  if (!rule) { res.status(404).json({ error: "Rule not found" }); return; }
  res.json({ ...rule, createdAt: rule.createdAt.toISOString() });
});

// DELETE /businesses/:businessId/bank-rules/:id
router.delete("/businesses/:businessId/bank-rules/:id", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const id = Number(req.params.id);
  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  await db.delete(bankRulesTable)
    .where(and(eq(bankRulesTable.id, id), eq(bankRulesTable.businessId, businessId)));
  res.sendStatus(204);
});

// POST /businesses/:businessId/bank-rules/test — test rules against a description
router.post("/businesses/:businessId/bank-rules/test", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const { description, amount } = req.body as { description: string; amount?: number };
  const rules = await db.select().from(bankRulesTable)
    .where(and(eq(bankRulesTable.businessId, businessId), eq(bankRulesTable.isActive, true)))
    .orderBy(bankRulesTable.priority);

  for (const rule of rules) {
    const field = description ?? "";
    let match = false;
    switch (rule.conditionOperator) {
      case "contains":    match = field.toLowerCase().includes(rule.conditionValue.toLowerCase()); break;
      case "starts_with": match = field.toLowerCase().startsWith(rule.conditionValue.toLowerCase()); break;
      case "ends_with":   match = field.toLowerCase().endsWith(rule.conditionValue.toLowerCase()); break;
      case "equals":      match = field.toLowerCase() === rule.conditionValue.toLowerCase(); break;
      case "greater_than": match = Math.abs(amount ?? 0) > parseFloat(rule.conditionValue); break;
      case "less_than":   match = Math.abs(amount ?? 0) < parseFloat(rule.conditionValue); break;
    }
    if (match) {
      let acctName: string | null = null;
      if (rule.accountId) {
        const [acct] = await db.select({ name: accountsTable.name }).from(accountsTable).where(eq(accountsTable.id, rule.accountId)).limit(1);
        acctName = acct?.name ?? null;
      }
      res.json({ matched: true, rule: rule.name, accountId: rule.accountId, accountName: acctName });
      return;
    }
  }
  res.json({ matched: false });
});

export default router;
