import { Router, type IRouter } from "express";
import { db, transactionsTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ConfirmUploadParams, ConfirmUploadBody } from "@workspace/api-zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { createRequire } from "node:module";
import multer from "multer";
import * as XLSX from "xlsx";

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = _require("pdf-parse");

const router: IRouter = Router();
router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

type ParsedTx = { date: string; description: string; amount: number; type: "debit" | "credit" };

// ── Ownership check ───────────────────────────────────────────────────────────

async function verifyBusiness(businessId: number, userId: number): Promise<boolean> {
  const [b] = await db.select().from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return !!b;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDate(raw: string): string {
  if (!raw) return "";
  raw = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY or DD/MM/YYYY or M/D/YY
  if (raw.includes("/")) {
    const parts = raw.split("/");
    if (parts.length === 3) {
      const yr = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      return `${yr}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
  }
  // MM-DD-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [m, d, y] = raw.split("-");
    return `${y}-${m}-${d}`;
  }
  // Excel serial date (number)
  const num = Number(raw);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = XLSX.SSF.parse_date_code(num);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  // Try native Date parse as last resort
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
}

function stripMoney(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}

// ── CSV/TSV Parser ────────────────────────────────────────────────────────────

function parseCsvTsv(content: string, sep = ","): ParsedTx[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].replace(/"/g, "").split(sep).map(h => h.trim().toLowerCase());

  const idx = (terms: string[]) => header.findIndex(h => terms.some(t => h.includes(t)));

  const dateIdx = idx(["date"]);
  const descIdx = idx(["desc", "narration", "memo", "detail", "payee", "note", "ref"]);
  const amtIdx  = idx(["amount", "value", "total", "sum"]);
  const debitIdx = idx(["debit", "withdrawal", "charge", "withdraw"]);
  const creditIdx = idx(["credit", "deposit", "payment", "receive"]);
  const balanceIdx = idx(["balance", "running"]);

  const txns: ParsedTx[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.replace(/"/g, "").split(sep).map(c => c.trim());

    const rawDate = cols[dateIdx] ?? "";
    const date = normalizeDate(rawDate);
    if (!date) continue;

    const description = cols[descIdx] ?? `Transaction ${i}`;

    if (amtIdx >= 0 && cols[amtIdx]) {
      const raw = cols[amtIdx].replace(/[$,\s]/g, "");
      const val = parseFloat(raw) || 0;
      if (val !== 0) {
        txns.push({ date, description, amount: Math.abs(val), type: val >= 0 ? "credit" : "debit" });
      }
    } else if (debitIdx >= 0 || creditIdx >= 0) {
      const debit  = debitIdx  >= 0 ? stripMoney(cols[debitIdx]  || "0") : 0;
      const credit = creditIdx >= 0 ? stripMoney(cols[creditIdx] || "0") : 0;
      if (debit > 0) txns.push({ date, description, amount: debit, type: "debit" });
      if (credit > 0) txns.push({ date, description, amount: credit, type: "credit" });
    }
  }

  return txns;
}

// ── Excel Parser ──────────────────────────────────────────────────────────────

function parseExcel(buffer: Buffer): ParsedTx[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (rows.length < 2) return [];

  // Find the header row — first row with ≥ 3 non-empty cells
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const nonEmpty = rows[r].filter((c: any) => c !== "").length;
    if (nonEmpty >= 3) { headerRowIdx = r; break; }
  }

  const header = rows[headerRowIdx].map((c: any) => String(c).trim().toLowerCase());
  const csvContent = [header.join(","), ...rows.slice(headerRowIdx + 1).map(r => r.map((c: any) => {
    if (c instanceof Date) return c.toISOString().slice(0, 10);
    return String(c);
  }).join(","))].join("\n");

  return parseCsvTsv(csvContent, ",");
}

// ── OFX / QFX / QBO Parser ────────────────────────────────────────────────────

function parseOfx(content: string): ParsedTx[] {
  const txns: ParsedTx[] = [];

  // Handle both SGML and XML styles — strip tags to get value
  const val = (tag: string, block: string): string => {
    const m = block.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i"));
    return m ? m[1].trim() : "";
  };

  // Each transaction is wrapped in <STMTTRN>...</STMTTRN>
  const txBlocks = content.split(/<\/?STMTTRN>/i).filter((_, i) => i % 2 === 1);

  for (const block of txBlocks) {
    const rawDate = val("DTPOSTED", block) || val("DTUSER", block);
    const date = rawDate ? normalizeDate(rawDate.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3")) : "";
    if (!date) continue;

    const amtStr = val("TRNAMT", block);
    const amount = parseFloat(amtStr) || 0;
    if (amount === 0) continue;

    const description = val("MEMO", block) || val("NAME", block) || val("PAYEE", block) || "Transaction";
    const trnType = val("TRNTYPE", block).toUpperCase();

    let type: "debit" | "credit";
    if (trnType === "CREDIT" || trnType === "DEP" || trnType === "XFER" && amount > 0) {
      type = amount >= 0 ? "credit" : "debit";
    } else if (trnType === "DEBIT" || trnType === "CHECK" || trnType === "ATM" || trnType === "FEE" || trnType === "SRVCHG") {
      type = "debit";
    } else {
      type = amount >= 0 ? "credit" : "debit";
    }

    txns.push({ date, description, amount: Math.abs(amount), type });
  }

  return txns;
}

// ── PDF (bank statement) Parser ───────────────────────────────────────────────

function parseBankStatementPdf(text: string): ParsedTx[] {
  const txns: ParsedTx[] = [];

  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

  const normalized = text.replace(/[ \t]+/g, " ").replace(/\r/g, "");
  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);

  type SectionType = "credit" | "debit" | "none";
  let section: SectionType = "none";

  // Chase PDFs: amount appears on the same line as the date, but continuation
  // lines follow (trace numbers, etc.) with no amount — so we must NOT anchor
  // to end-of-string. Find the LAST $ amount anywhere in the combined block.
  const dollarAmtRe = /\$([\d,]+\.\d{2})/g;
  const amountRe    = /\$?([\d,]+\.\d{2})\s*$/; // still used for quick "has amount at end" check
  const dateRe      = /^(\d{1,2}\/\d{2})\b/;

  const skipPatterns = [
    /^total\s/i, /^date\s+desc/i, /^beginning balance/i, /^ending balance/i,
    /^account number/i, /^page \d/i, /^\*(?:start|end)\*/i,
    /^chase\b/i, /^po box/i, /^checking summary/i, /^instances\s/i,
    /^deposits and additions\s*$/i, /^atm & debit/i, /^electronic withdrawal\s*$/i,
    /^how to avoid/i, /^if you meet/i, /^congratulations/i, /^important update/i,
    /^beginning january/i, /^were here/i, /^for more information/i,
    /^web site/i, /^service center/i, /^para espanol/i, /^international calls/i,
  ];

  function sectionOf(line: string): SectionType | null {
    const l = line.toLowerCase();
    if (/deposits and additions/.test(l) || /\*start\*deposits/.test(l)) return "credit";
    if (/electronic withdrawal/.test(l) || /atm.*debit.*withdrawal/.test(l) || /\*start\*atm/.test(l) ||
        /\*start\*electronic/.test(l) || /\*start\*fees/.test(l) || /^fees\s*$/.test(l) ||
        /other withdrawal/.test(l) || /\*start\*other/.test(l)) return "debit";
    return null;
  }

  function cleanDesc(d: string): string {
    return d
      .replace(/Orig CO Name:/gi, "")
      .replace(/Orig ID:[A-Z0-9]+/gi, "")
      .replace(/Desc Date:\d+/gi, "")
      .replace(/CO Entry Descr:\w+/gi, "")
      .replace(/Sec:(?:CCD|PPD|WEB|CTX)/gi, "")
      .replace(/Trace#:\d+/gi, "")
      .replace(/Eed:\d+/gi, "")
      .replace(/Ind ID:[^\s]+/gi, "")
      .replace(/Ind Name:/gi, "")
      .replace(/Trn:\s*\S+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "Bank Transaction";
  }

  let pendingDate: string | null = null;
  let pendingDesc: string[] = [];
  let pendingSection: SectionType = "none";

  function flush() {
    if (!pendingDate || pendingSection === "none") { pendingDate = null; pendingDesc = []; return; }
    const full = pendingDesc.join(" ");

    // Collect ALL $ amounts in the block; the LAST one is the transaction amount
    // (Chase format: "10/03 ... description ... $20,429.12  extra detail no amount")
    const allMatches = [...full.matchAll(dollarAmtRe)];
    if (allMatches.length > 0) {
      const m = allMatches[allMatches.length - 1]; // last $ amount in the block
      const amount = parseFloat(m[1].replace(/,/g, ""));
      if (amount > 0) {
        // description = everything before the amount occurrence
        const description = cleanDesc(full.slice(0, m.index).trim());
        txns.push({ date: pendingDate, description: description || "Bank Transaction", amount, type: pendingSection });
      }
    }
    pendingDate = null;
    pendingDesc = [];
  }

  for (const line of lines) {
    const sec = sectionOf(line);
    if (sec !== null) { flush(); section = sec; continue; }
    if (skipPatterns.some(r => r.test(line))) { flush(); continue; }

    if (dateRe.test(line)) {
      flush();
      const m = line.match(dateRe)!;
      const [month, day] = m[1].split("/");
      pendingDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      pendingSection = section;
      const rest = line.replace(dateRe, "").trim();
      pendingDesc = [rest];
      // Chase-style: amount is already on the date line — flush immediately so
      // continuation lines (trace numbers, etc.) don't interfere
      if (amountRe.test(rest)) flush();
    } else if (pendingDate) {
      pendingDesc.push(line);
      if (amountRe.test(line)) flush();
    }
  }
  flush();

  return txns.filter(t => t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
}

// ── Unified Statement Upload ───────────────────────────────────────────────────

router.post("/businesses/:businessId/upload/statement", upload.single("file"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const businessId = Number(req.params.businessId);
    if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }

    const owned = await verifyBusiness(businessId, req.userId!);
    if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const name = (req.file.originalname || "").toLowerCase();
    const ext  = name.includes(".") ? name.split(".").pop()! : "";
    const mime = req.file.mimetype || "";

    let transactions: ParsedTx[] = [];
    let format = "unknown";

    if (ext === "pdf" || mime === "application/pdf") {
      format = "pdf";
      const data = await pdfParse(req.file.buffer);
      transactions = parseBankStatementPdf(data.text);

    } else if (ext === "ofx" || ext === "qfx" || ext === "qbo" ||
               mime.includes("ofx") || mime.includes("qif")) {
      format = ext || "ofx";
      const text = req.file.buffer.toString("utf-8");
      transactions = parseOfx(text);

    } else if (ext === "xlsx" || ext === "xls" ||
               mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("ms-excel")) {
      format = "excel";
      transactions = parseExcel(req.file.buffer);

    } else if (ext === "tsv") {
      format = "tsv";
      const text = req.file.buffer.toString("utf-8");
      transactions = parseCsvTsv(text, "\t");

    } else {
      // Default to CSV (also handles .txt that has comma-separated values)
      format = "csv";
      const text = req.file.buffer.toString("utf-8");
      const sep = text.indexOf("\t") > text.indexOf(",") ? "\t" : ",";
      transactions = parseCsvTsv(text, sep);
    }

    res.json({ transactions, count: transactions.length, format });
  } catch (err: any) {
    console.error("Statement parse error:", err);
    res.status(500).json({ error: "Failed to parse file: " + (err?.message || "unknown error") });
  }
});

// ── Legacy CSV endpoint (kept for backwards compat) ───────────────────────────

router.post("/businesses/:businessId/upload/csv", async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const owned = await verifyBusiness(businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const { csvContent } = req.body as { csvContent?: string };
  if (!csvContent) { res.status(400).json({ error: "csvContent required" }); return; }
  const transactions = parseCsvTsv(csvContent, ",");
  res.json({ transactions, count: transactions.length });
});

// ── Confirm & import ──────────────────────────────────────────────────────────

router.post("/businesses/:businessId/upload/confirm", async (req: AuthRequest, res): Promise<void> => {
  const params = ConfirmUploadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const owned = await verifyBusiness(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }

  const parsed = ConfirmUploadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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
