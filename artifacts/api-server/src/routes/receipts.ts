import { Router, type IRouter } from "express";
import { db, receiptsTable, businessesTable, transactionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import archiver from "archiver";
import path from "path";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
router.use(authMiddleware);

const objectStorage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
  transactionId: z.coerce.number().int().optional().nullable(),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileType: z.string().optional().nullable(),
  fileSizeBytes: z.coerce.number().int().optional().nullable(),
  vendorName: z.string().optional().nullable(),
  receiptAmount: z.coerce.number().optional().nullable(),
  receiptDate: z.string().optional().nullable(),
  expenseCategory: z.string().optional().nullable(),
  taxDeductible: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const UpdateReceiptBody = z.object({
  vendorName: z.string().optional().nullable(),
  receiptAmount: z.coerce.number().optional().nullable(),
  expenseCategory: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  taxDeductible: z.boolean().optional(),
  receiptDate: z.string().optional().nullable(),
  transactionId: z.coerce.number().int().optional().nullable(),
});

// ─── POST /api/receipts/upload ────────────────────────────────────────────────
// Multipart form upload: file + metadata fields
// Fields: businessId (required), transactionId?, vendorName?, receiptDate?,
//         expenseCategory?, notes?, taxDeductible?
router.post("/receipts/upload", upload.single("file"), async (req: AuthRequest, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded. Send a multipart/form-data request with a 'file' field." });
    return;
  }

  const businessId = parseInt(req.body.businessId);
  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }

  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const ext = path.extname(req.file.originalname).replace(".", "");
  let objectPath: string;
  try {
    objectPath = await objectStorage.uploadBuffer(req.file.buffer, req.file.mimetype, ext);
  } catch (err) {
    console.error("Storage upload failed:", err);
    res.status(500).json({ error: "Failed to upload file to storage" });
    return;
  }

  const transactionId = req.body.transactionId ? parseInt(req.body.transactionId) : null;
  const receiptAmount = req.body.receiptAmount ? parseFloat(req.body.receiptAmount) : null;
  const taxDeductible = req.body.taxDeductible === "false" ? false : true;

  const [receipt] = await db.insert(receiptsTable).values({
    businessId,
    transactionId: transactionId || null,
    fileName: req.file.originalname,
    fileUrl: objectPath,
    fileType: req.file.mimetype,
    fileSizeBytes: req.file.size,
    vendorName: req.body.vendorName || null,
    receiptAmount: receiptAmount !== null ? String(receiptAmount) : null,
    receiptDate: req.body.receiptDate || null,
    expenseCategory: req.body.expenseCategory || null,
    taxDeductible,
    notes: req.body.notes || null,
  }).returning();

  res.status(201).json(serializeReceipt(receipt));
});

// ─── GET /api/receipts/export/:businessId?year=2025 ──────────────────────────
// Export all receipts for a tax year as a ZIP archive.
// Must be BEFORE /receipts/:transactionId to avoid route conflict.
router.get("/receipts/export/:businessId", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.params.businessId);
  if (!businessId) {
    res.status(400).json({ error: "Invalid businessId" });
    return;
  }

  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

  // Fetch receipts for the tax year (match on receiptDate year or uploadedAt year)
  const receipts = await db.select().from(receiptsTable)
    .where(
      and(
        eq(receiptsTable.businessId, businessId),
        sql`(
          (${receiptsTable.receiptDate} IS NOT NULL AND EXTRACT(YEAR FROM ${receiptsTable.receiptDate}::date) = ${year})
          OR
          (${receiptsTable.receiptDate} IS NULL AND EXTRACT(YEAR FROM ${receiptsTable.uploadedAt}) = ${year})
        )`
      )
    )
    .orderBy(desc(receiptsTable.uploadedAt));

  if (receipts.length === 0) {
    res.status(404).json({ error: `No receipts found for tax year ${year}` });
    return;
  }

  const filename = `receipts-${year}-business-${businessId}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  archive.on("error", (err) => {
    console.error("Archive error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create ZIP archive" });
    }
  });

  // CSV manifest header
  const csvRows: string[] = [
    "id,fileName,vendorName,receiptDate,receiptAmount,expenseCategory,taxDeductible,transactionId,notes,uploadedAt"
  ];

  for (const receipt of receipts) {
    // Add CSV row
    const csvCols = [
      receipt.id,
      `"${(receipt.fileName || "").replace(/"/g, '""')}"`,
      `"${(receipt.vendorName || "").replace(/"/g, '""')}"`,
      receipt.receiptDate || "",
      receipt.receiptAmount || "",
      `"${(receipt.expenseCategory || "").replace(/"/g, '""')}"`,
      receipt.taxDeductible ? "Yes" : "No",
      receipt.transactionId || "",
      `"${(receipt.notes || "").replace(/"/g, '""')}"`,
      receipt.uploadedAt.toISOString(),
    ];
    csvRows.push(csvCols.join(","));

    // Try to include the file in the ZIP
    if (receipt.fileUrl && receipt.fileUrl.startsWith("/objects/")) {
      try {
        const file = await objectStorage.getObjectEntityFile(receipt.fileUrl);
        const nodeStream = file.createReadStream();
        const ext = path.extname(receipt.fileName) || "";
        const safeVendor = (receipt.vendorName || "receipt").replace(/[^a-z0-9]/gi, "_");
        const entryName = `${safeVendor}_${receipt.id}${ext}`;
        archive.append(nodeStream, { name: entryName });
      } catch (err) {
        if (!(err instanceof ObjectNotFoundError)) {
          console.warn(`Could not fetch file for receipt ${receipt.id}:`, err);
        }
      }
    }
  }

  // Attach the CSV manifest
  const csvContent = csvRows.join("\n");
  archive.append(csvContent, { name: `manifest-${year}.csv` });

  await archive.finalize();
});

// ─── GET /api/receipts/:transactionId ────────────────────────────────────────
// Get all receipts linked to a specific transaction.
router.get("/receipts/:transactionId", async (req: AuthRequest, res): Promise<void> => {
  const transactionId = parseInt(req.params.transactionId);
  if (!transactionId) {
    res.status(400).json({ error: "Invalid transactionId" });
    return;
  }

  // Verify the transaction exists and belongs to the user via business
  const [txn] = await db.select({ businessId: transactionsTable.businessId })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, transactionId))
    .limit(1);

  if (!txn) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  const owned = await verifyBusiness(txn.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  const receipts = await db.select().from(receiptsTable)
    .where(eq(receiptsTable.transactionId, transactionId))
    .orderBy(desc(receiptsTable.uploadedAt));

  res.json(receipts.map(serializeReceipt));
});

// ─── PATCH /api/receipts/:receiptId ──────────────────────────────────────────
// Update vendor, amount, category, notes (and other metadata fields).
router.patch("/receipts/:receiptId", async (req: AuthRequest, res): Promise<void> => {
  const receiptId = parseInt(req.params.receiptId);
  if (!receiptId) {
    res.status(400).json({ error: "Invalid receiptId" });
    return;
  }

  const [existing] = await db.select().from(receiptsTable)
    .where(eq(receiptsTable.id, receiptId)).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  const owned = await verifyBusiness(existing.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  const parsed = UpdateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { receiptAmount, ...rest } = parsed.data;
  const updates: Partial<typeof receiptsTable.$inferInsert> = { ...rest };
  if (receiptAmount !== undefined) {
    updates.receiptAmount = receiptAmount !== null ? String(receiptAmount) : null;
  }

  const [updated] = await db.update(receiptsTable)
    .set(updates)
    .where(eq(receiptsTable.id, receiptId))
    .returning();

  res.json(serializeReceipt(updated));
});

// ─── DELETE /api/receipts/:receiptId ─────────────────────────────────────────
// Delete the receipt record AND its file from storage.
router.delete("/receipts/:receiptId", async (req: AuthRequest, res): Promise<void> => {
  const receiptId = parseInt(req.params.receiptId);
  if (!receiptId) {
    res.status(400).json({ error: "Invalid receiptId" });
    return;
  }

  const [existing] = await db.select().from(receiptsTable)
    .where(eq(receiptsTable.id, receiptId)).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  const owned = await verifyBusiness(existing.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  // Delete the file from object storage (best-effort)
  if (existing.fileUrl && existing.fileUrl.startsWith("/objects/")) {
    try {
      await objectStorage.deleteObject(existing.fileUrl);
    } catch (err) {
      console.warn(`Could not delete storage object for receipt ${receiptId}:`, err);
    }
  }

  await db.delete(receiptsTable).where(eq(receiptsTable.id, receiptId));

  res.status(204).end();
});

// ─── Existing business-scoped routes (kept for backward compatibility) ────────

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
