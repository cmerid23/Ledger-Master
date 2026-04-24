import { Router, type IRouter } from "express";
import { db, timeEntriesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();
router.use(authMiddleware as any);

const entrySchema = z.object({
  customerId: z.number().nullable().optional(),
  jobId: z.number().nullable().optional(),
  description: z.string().min(1),
  date: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  hours: z.string(),
  ratePerHour: z.string().default("0"),
  amount: z.string().optional(),
  billable: z.boolean().default(true),
  billed: z.boolean().default(false),
  notes: z.string().optional(),
});

router.get("/time-entries", async (req: AuthRequest, res) => {
  try {
    const businessId = Number(req.query.businessId);
    if (!businessId) return res.status(400).json({ error: "businessId required" });
    const entries = await db.query.timeEntriesTable.findMany({
      where: eq(timeEntriesTable.businessId, businessId),
      orderBy: [desc(timeEntriesTable.date), desc(timeEntriesTable.createdAt)],
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch time entries" });
  }
});

router.post("/time-entries", async (req: AuthRequest, res) => {
  try {
    const businessId = Number(req.body.businessId);
    if (!businessId) return res.status(400).json({ error: "businessId required" });
    const parsed = entrySchema.parse(req.body);
    const hours = parseFloat(parsed.hours);
    const rate = parseFloat(parsed.ratePerHour);
    const amount = (hours * rate).toFixed(2);
    const [entry] = await db.insert(timeEntriesTable).values({
      businessId,
      ...parsed,
      hours: parsed.hours,
      ratePerHour: parsed.ratePerHour,
      amount,
    }).returning();
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: "Failed to create time entry" });
  }
});

router.put("/time-entries/:id", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = entrySchema.partial().parse(req.body);
    let amount = parsed.amount;
    if (parsed.hours && parsed.ratePerHour) {
      amount = (parseFloat(parsed.hours) * parseFloat(parsed.ratePerHour)).toFixed(2);
    }
    const [entry] = await db.update(timeEntriesTable)
      .set({ ...parsed, amount })
      .where(eq(timeEntriesTable.id, id))
      .returning();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: "Failed to update time entry" });
  }
});

router.delete("/time-entries/:id", async (req: AuthRequest, res) => {
  try {
    await db.delete(timeEntriesTable).where(eq(timeEntriesTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete time entry" });
  }
});

export default router;
