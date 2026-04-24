import { Router, type IRouter } from "express";
import { db, recurringSchedulesTable, invoicesTable, invoiceLineItemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware as any);

function nextDate(from: string, frequency: string): string {
  const d = new Date(from);
  switch (frequency) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split("T")[0];
}

router.get("/recurring", async (req: AuthRequest, res) => {
  try {
    const businessId = Number(req.query.businessId);
    if (!businessId) return res.status(400).json({ error: "businessId required" });
    const schedules = await db.select().from(recurringSchedulesTable)
      .where(eq(recurringSchedulesTable.businessId, businessId))
      .orderBy(desc(recurringSchedulesTable.createdAt));
    res.json(schedules);
  } catch {
    res.status(500).json({ error: "Failed to fetch recurring schedules" });
  }
});

router.post("/recurring", async (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const [schedule] = await db.insert(recurringSchedulesTable).values({
      ...data,
      businessId: Number(data.businessId),
      customerId: data.customerId ? Number(data.customerId) : null,
      dayOfMonth: Number(data.dayOfMonth || 1),
      dueAfterDays: Number(data.dueAfterDays || 30),
      templateLineItems: typeof data.templateLineItems === "string"
        ? data.templateLineItems
        : JSON.stringify(data.templateLineItems || []),
    }).returning();
    res.status(201).json(schedule);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create recurring schedule", detail: e?.message });
  }
});

router.put("/recurring/:id", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const data = { ...req.body };
    if (data.templateLineItems && typeof data.templateLineItems !== "string") {
      data.templateLineItems = JSON.stringify(data.templateLineItems);
    }
    const [schedule] = await db.update(recurringSchedulesTable).set(data).where(eq(recurringSchedulesTable.id, id)).returning();
    res.json(schedule);
  } catch {
    res.status(500).json({ error: "Failed to update recurring schedule" });
  }
});

router.delete("/recurring/:id", async (req: AuthRequest, res) => {
  try {
    await db.delete(recurringSchedulesTable).where(eq(recurringSchedulesTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete recurring schedule" });
  }
});

// Manually run a schedule (generate invoice now)
router.post("/recurring/:id/run", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schedule = await db.query.recurringSchedulesTable.findFirst({ where: eq(recurringSchedulesTable.id, id) });
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    const today = new Date().toISOString().split("T")[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + schedule.dueAfterDays);
    const invNum = `REC-${Date.now().toString().slice(-8)}`;

    const [invoice] = await db.insert(invoicesTable).values({
      businessId: schedule.businessId,
      customerId: schedule.customerId,
      invoiceNumber: invNum,
      status: schedule.autoSend ? "sent" : "draft",
      issueDate: today,
      dueDate: dueDate.toISOString().split("T")[0],
      subtotal: schedule.templateSubtotal,
      taxRate: schedule.templateTaxRate,
      taxAmount: (parseFloat(schedule.templateSubtotal) * parseFloat(schedule.templateTaxRate) / 100).toFixed(2),
      discountAmount: "0",
      total: schedule.templateTotal,
      amountPaid: "0",
      balanceDue: schedule.templateTotal,
      currency: schedule.templateCurrency,
      notes: schedule.templateNotes || `Auto-generated from recurring schedule: ${schedule.name}`,
    }).returning();

    const lineItems = JSON.parse(schedule.templateLineItems);
    if (lineItems.length) {
      await db.insert(invoiceLineItemsTable).values(
        lineItems.map((li: any, i: number) => ({ ...li, invoiceId: invoice.id, sortOrder: i }))
      );
    }

    // Update schedule
    const nd = nextDate(schedule.nextRunDate, schedule.frequency);
    await db.update(recurringSchedulesTable).set({
      lastRunDate: today,
      nextRunDate: nd,
      totalRuns: (schedule.totalRuns || 0) + 1,
    }).where(eq(recurringSchedulesTable.id, id));

    res.json({ invoice });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to run schedule", detail: e?.message });
  }
});

export default router;
