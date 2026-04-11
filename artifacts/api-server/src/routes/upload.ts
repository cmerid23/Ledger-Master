import { Router, type IRouter } from "express";
import { db, transactionsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { UploadCsvParams, UploadCsvBody, ConfirmUploadParams, ConfirmUploadBody } from "@workspace/api-zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusinessOwnership(businessId: number, userId: number): Promise<boolean> {
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
    .limit(1);
  return !!business;
}

function parseCsv(csvContent: string): Array<{ date: string; description: string; amount: number; type: "debit" | "credit" }> {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().replace(/"/g, "").split(",").map((h) => h.trim());

  const dateIdx = header.findIndex((h) => h.includes("date"));
  const descIdx = header.findIndex((h) => h.includes("desc") || h.includes("narration") || h.includes("memo") || h.includes("detail"));
  const amountIdx = header.findIndex((h) => h === "amount" || h === "value" || h === "total");
  const debitIdx = header.findIndex((h) => h.includes("debit") || h.includes("withdrawal") || h.includes("charge"));
  const creditIdx = header.findIndex((h) => h.includes("credit") || h.includes("deposit") || h.includes("payment"));

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.replace(/"/g, "").split(",").map((c) => c.trim());

    const rawDate = cols[dateIdx] ?? "";
    const description = cols[descIdx] ?? `Transaction ${i}`;

    // Normalize date to YYYY-MM-DD
    let date = rawDate;
    if (rawDate.includes("/")) {
      const parts = rawDate.split("/");
      if (parts.length === 3) {
        // MM/DD/YYYY or DD/MM/YYYY -> YYYY-MM-DD
        const maybeYear = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
        date = `${maybeYear}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }

    if (amountIdx >= 0 && cols[amountIdx]) {
      const amount = Math.abs(parseFloat(cols[amountIdx].replace(/[$,]/g, "")) || 0);
      const type = parseFloat(cols[amountIdx].replace(/[$,]/g, "")) >= 0 ? "credit" : "debit";
      if (amount > 0) transactions.push({ date, description, amount, type });
    } else if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = parseFloat((cols[debitIdx] || "0").replace(/[$,]/g, "")) || 0;
      const credit = parseFloat((cols[creditIdx] || "0").replace(/[$,]/g, "")) || 0;
      if (debit > 0) transactions.push({ date, description, amount: debit, type: "debit" as const });
      if (credit > 0) transactions.push({ date, description, amount: credit, type: "credit" as const });
    }
  }

  return transactions;
}

router.post("/businesses/:businessId/upload/csv", async (req: AuthRequest, res): Promise<void> => {
  const params = UploadCsvParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = UploadCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const transactions = parseCsv(parsed.data.csvContent);
  res.json({ transactions, count: transactions.length });
});

router.post("/businesses/:businessId/upload/confirm", async (req: AuthRequest, res): Promise<void> => {
  const params = ConfirmUploadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = ConfirmUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let imported = 0;
  for (const tx of parsed.data.transactions) {
    await db.insert(transactionsTable).values({
      businessId: params.data.businessId,
      date: tx.date,
      description: tx.description,
      amount: String(tx.amount),
      type: tx.type,
      accountId: parsed.data.accountId ?? null,
      source: "upload",
    });
    imported++;
  }

  res.status(201).json({ imported });
});

export default router;
