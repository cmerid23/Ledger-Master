import { Router, type IRouter } from "express";
import { db, transactionsTable, businessesTable, accountsTable, bankRulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ConfirmUploadParams, ConfirmUploadBody } from "@workspace/api-zod";
import { accountingEngine } from "../engine/accounting";
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

// ── Keyword auto-categorization ───────────────────────────────────────────────

// Maps keyword patterns to account codes from the standard chart of accounts
const KEYWORD_RULES: Array<{ keywords: string[]; code: string; name: string; confidence: number }> = [
  // Fuel / trucking
  { keywords: ["shell", "exxon", "bp ", "chevron", "sunoco", "circle k", "loves ", "pilot", "ta travel", "petro ", "fuel", "gas station", "speedway", "marathon", "kwik trip", "flying j"], code: "6050", name: "Fuel and Oil", confidence: 0.92 },
  // Communication
  { keywords: ["at&t", "verizon", "t-mobile", "comcast", "xfinity", "spectrum", "sprint", "dish network", "directv", "centurylink", "lumen"], code: "6030", name: "Communication (Phone, Internet)", confidence: 0.93 },
  // Insurance
  { keywords: ["insurance", "insuranc", "progressive", "geico", "allstate", "statefarm", "nationwide", "usaa"], code: "6060", name: "Insurance", confidence: 0.90 },
  // Office supplies
  { keywords: ["amazon", "office depot", "staples", "best buy", "walmart", "target", "costco", "sam's club", "office max"], code: "6080", name: "Office Supplies", confidence: 0.70 },
  // Repairs & maintenance
  { keywords: ["jiffy lube", "firestone", "pep boys", "autozone", "advance auto", "o'reilly", "napa auto", "midas", "brakes plus", "tire", "mechanic", "repair", "maintenance"], code: "6110", name: "Repairs and Maintenance", confidence: 0.85 },
  // Meals & entertainment
  { keywords: ["mcdonald", "subway", "starbucks", "dunkin", "doordash", "uber eats", "grubhub", "restaurant", "cafe ", "diner", "pizza", "burger", "chick-fil", "wendy's", "taco bell", "chipotle", "panera"], code: "6070", name: "Meals and Entertainment", confidence: 0.82 },
  // Travel / lodging
  { keywords: ["marriott", "hilton", "hyatt", "holiday inn", "best western", "airbnb", "expedia", "hotels.com", "motel", "hotel"], code: "6140", name: "Travel", confidence: 0.88 },
  // Rent / lease
  { keywords: ["rent", "lease ", "leasing", "property mgmt", "landlord"], code: "6100", name: "Rent and Lease", confidence: 0.88 },
  // Utilities
  { keywords: ["electric", "water bill", "sewer", "gas bill", "utility", "utilities", "pge ", "duke energy", "southern co", "con ed", "consumers energy"], code: "6150", name: "Utilities", confidence: 0.90 },
  // Payroll / wages
  { keywords: ["payroll", "adp ", "paychex", "gusto", "direct deposit", "salary", "wages"], code: "6120", name: "Salaries and Wages", confidence: 0.88 },
  // Professional services
  { keywords: ["quickbooks", "intuit", "fresbooks", "xero", "attorney", "lawyer", "cpa ", "accounting", "bookkeep", "tax prep", "consulting"], code: "6090", name: "Professional Services", confidence: 0.80 },
  // Taxes / licenses
  { keywords: ["irs ", "state tax", "dmv ", "dot ", "license fee", "permit fee", "registration fee", "tax payment"], code: "6130", name: "Taxes and Licenses", confidence: 0.85 },
  // Advertising
  { keywords: ["google ads", "facebook ads", "meta ads", "instagram", "linkedin ads", "indeed", "marketing", "advertising"], code: "6010", name: "Advertising and Marketing", confidence: 0.85 },
  // Bank fees
  { keywords: ["service charge", "monthly fee", "bank fee", "overdraft", "wire fee", "transfer fee", "atm fee", "nsf fee", "maintenance fee"], code: "6020", name: "Bank Fees and Charges", confidence: 0.95 },
  // Vehicle expenses (general)
  { keywords: ["tolls", "toll road", "ez pass", "ipass", "pike ", "turnpike", "parking", "dmv", "dot inspection", "truck wash", "wash bay"], code: "6160", name: "Vehicle Expenses", confidence: 0.87 },
  // Income (deposits / payments to the business)
  { keywords: ["payment", "deposit", "transfer in", "zelle ", "venmo", "paypal", "stripe", "square", "invoice", "receivable"], code: "4010", name: "Service Revenue", confidence: 0.60 },
];

type AutoCatResult = {
  suggestedAccountId: number | null;
  suggestedAccountName: string | null;
  suggestedBy: string | null;
  suggestedConfidence: number | null;
};

async function autoCategorize(
  description: string,
  amount: number,
  businessId: number,
  accountsByCode: Map<string, { id: number; name: string }>
): Promise<AutoCatResult> {
  const desc = description.toLowerCase();

  // 1. Check bank rules first (user-defined, higher priority)
  const rules = await db
    .select()
    .from(bankRulesTable)
    .where(and(eq(bankRulesTable.businessId, businessId), eq(bankRulesTable.isActive, true)))
    .orderBy(bankRulesTable.priority);

  for (const rule of rules) {
    if (!rule.autoApply) continue;
    let match = false;
    const field = desc;
    switch (rule.conditionOperator) {
      case "contains":    match = field.includes(rule.conditionValue.toLowerCase()); break;
      case "starts_with": match = field.startsWith(rule.conditionValue.toLowerCase()); break;
      case "ends_with":   match = field.endsWith(rule.conditionValue.toLowerCase()); break;
      case "equals":      match = field === rule.conditionValue.toLowerCase(); break;
      case "greater_than": match = Math.abs(amount) > parseFloat(rule.conditionValue); break;
      case "less_than":    match = Math.abs(amount) < parseFloat(rule.conditionValue); break;
    }
    if (match && rule.accountId) {
      const acct = await db.select({ name: accountsTable.name }).from(accountsTable).where(eq(accountsTable.id, rule.accountId)).limit(1);
      return {
        suggestedAccountId: rule.accountId,
        suggestedAccountName: acct[0]?.name ?? null,
        suggestedBy: `rule:${rule.name}`,
        suggestedConfidence: 0.99,
      };
    }
  }

  // 2. Keyword matching against standard CoA
  // For deposits (positive = credit), prefer income accounts
  // For payments (negative = debit), prefer expense accounts
  for (const rule of KEYWORD_RULES) {
    const matched = rule.keywords.some((kw) => desc.includes(kw));
    if (!matched) continue;

    // Don't suggest income for expenses and vice versa
    const isIncome = rule.code.startsWith("4");
    if (amount > 0 && !isIncome) continue; // deposit → skip expense suggestions
    if (amount < 0 && isIncome) continue;  // payment → skip income suggestions

    const acct = accountsByCode.get(rule.code);
    if (acct) {
      return {
        suggestedAccountId: acct.id,
        suggestedAccountName: acct.name,
        suggestedBy: `keyword:${rule.name}`,
        suggestedConfidence: rule.confidence,
      };
    }
  }

  // 3. Fallback by transaction direction
  if (amount > 0) {
    const acct = accountsByCode.get("4010") ?? accountsByCode.get("4000");
    if (acct) return { suggestedAccountId: acct.id, suggestedAccountName: acct.name, suggestedBy: "direction:credit", suggestedConfidence: 0.40 };
  }

  return { suggestedAccountId: null, suggestedAccountName: null, suggestedBy: null, suggestedConfidence: null };
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
      format = "csv";
      const text = req.file.buffer.toString("utf-8");
      const sep = text.indexOf("\t") > text.indexOf(",") ? "\t" : ",";
      transactions = parseCsvTsv(text, sep);
    }

    // Build a code → { id, name } map for this business's accounts
    const accts = await db.select({ id: accountsTable.id, code: accountsTable.code, name: accountsTable.name })
      .from(accountsTable)
      .where(and(eq(accountsTable.businessId, businessId), eq(accountsTable.isActive, true)));
    const accountsByCode = new Map(accts.filter((a) => a.code).map((a) => [a.code!, { id: a.id, name: a.name }]));

    // Auto-categorize each transaction
    const categorized = await Promise.all(
      transactions.map(async (tx) => {
        const cat = await autoCategorize(tx.description, tx.amount, businessId, accountsByCode);
        return { ...tx, ...cat };
      })
    );

    res.json({ transactions: categorized, count: categorized.length, format });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: "Failed to parse file: " + msg });
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

  const businessId = params.data.businessId;
  const globalAccountId = parsed.data.accountId ?? null;

  let imported = 0;
  let journalEntriesPosted = 0;
  const errors: string[] = [];

  for (const tx of parsed.data.transactions) {
    // Determine which account to use: per-transaction → global → null
    const resolvedAccountId = tx.accountId ?? globalAccountId ?? null;

    const [inserted] = await db.insert(transactionsTable).values({
      businessId,
      date: tx.date,
      description: tx.description,
      amount: String(Math.abs(tx.amount)),
      type: tx.type,
      accountId: resolvedAccountId,
      source: "upload",
    }).returning();

    imported++;

    // Post a double-entry journal entry if we have an account to categorize to
    if (resolvedAccountId && inserted) {
      try {
        // amount sign: credit transactions = positive (money in), debit = negative (money out)
        const signedAmount = tx.type === "credit" ? Math.abs(tx.amount) : -Math.abs(tx.amount);
        await accountingEngine.postBankTransaction({
          businessId,
          transactionId: inserted.id,
          date: tx.date,
          description: tx.description,
          amount: signedAmount,
          categoryAccountId: resolvedAccountId,
        });
        journalEntriesPosted++;
      } catch (e) {
        // Non-fatal: record the error but continue importing
        errors.push(`TX ${tx.date} ${tx.description}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  res.status(201).json({ imported, journalEntriesPosted, errors: errors.length > 0 ? errors : undefined });
});

export default router;
