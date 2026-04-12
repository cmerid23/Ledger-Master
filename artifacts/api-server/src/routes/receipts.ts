import { Router, type IRouter } from "express";
import { db, receiptsTable, businessesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusiness(businessId: number, userId: number): Promise<boolean> {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return !!b;
}

function serializeReceipt(r: typeof receiptsTable.$inferSelect) {
  return {
    ...r,
    receiptAmount: r.receiptAmount !== null ? Number(r.receiptAmount) : null,
    uploadedAt: r.uploadedAt.toISOString(),
  };
}

const CreateReceiptBody = z.object({
  transactionId: z.number().int().optional().nullable(),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileType: z.string().optional().nullable(),
  fileSizeBytes: z.number().int().optional().nullable(),
  vendorName: z.string().optional().nullable(),
  receiptAmount: z.number().optional().nullable(),
  receiptDate: z.string().optional().nullable(),
  expenseCategory: z.string().optional().nullable(),
  taxDeductible: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const UpdateReceiptBody = CreateReceiptBody.partial();

// GET /businesses/:businessId/receipts
router.get("/businesses/:businessId/receipts", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid businessId" }); return; }

  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const receipts = await db.select().from(receiptsTable)
    .where(eq(receiptsTable.businessId, businessId))
    .orderBy(desc(receiptsTable.uploadedAt));

  res.json(receipts.map(serializeReceipt));
});

// POST /businesses/:businessId/receipts
router.post("/businesses/:businessId/receipts", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  if (!businessId) { res.status(400).json({ error: "Invalid businessId" }); return; }

  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { receiptAmount, ...rest } = parsed.data;
  const [receipt] = await db.insert(receiptsTable).values({
    businessId,
    ...rest,
    receiptAmount: receiptAmount !== undefined && receiptAmount !== null ? String(receiptAmount) : null,
  }).returning();

  res.status(201).json(serializeReceipt(receipt));
});

// PATCH /businesses/:businessId/receipts/:receiptId
router.patch("/businesses/:businessId/receipts/:receiptId", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  const receiptId = parseInt(req.params.receiptId);
  if (!businessId || !receiptId) { res.status(400).json({ error: "Invalid params" }); return; }

  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const parsed = UpdateReceiptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { receiptAmount, ...rest } = parsed.data;
  const updates: Partial<typeof receiptsTable.$inferInsert> = { ...rest };
  if (receiptAmount !== undefined) {
    updates.receiptAmount = receiptAmount !== null ? String(receiptAmount) : null;
  }

  const [receipt] = await db.update(receiptsTable)
    .set(updates)
    .where(and(eq(receiptsTable.id, receiptId), eq(receiptsTable.businessId, businessId)))
    .returning();

  if (!receipt) { res.status(404).json({ error: "Receipt not found" }); return; }
  res.json(serializeReceipt(receipt));
});

// DELETE /businesses/:businessId/receipts/:receiptId
router.delete("/businesses/:businessId/receipts/:receiptId", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  const receiptId = parseInt(req.params.receiptId);
  if (!businessId || !receiptId) { res.status(400).json({ error: "Invalid params" }); return; }

  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  await db.delete(receiptsTable)
    .where(and(eq(receiptsTable.id, receiptId), eq(receiptsTable.businessId, businessId)));

  res.status(204).end();
});

export default router;
