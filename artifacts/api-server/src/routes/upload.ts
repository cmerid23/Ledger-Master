import { Router, type IRouter } from "express";
import { db, transactionsTable, businessesTable, accountsTable, bankRulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ConfirmUploadParams, ConfirmUploadBody } from "@workspace/api-zod";
import { accountingEngine } from "../engine/accounting";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { createRequire } from "node:module";
import multer from "multer";
import * as XLSX from "xlsx";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const _require = createRequire(import.meta.url);
const { PDFParse } = _require("pdf-parse") as { PDFParse: new (opts: { url: string; verbosity: number }) => { getText: () => Promise<{ text: string }>; destroy: () => void } };

async function pdfToText(buf: Buffer): Promise<string> {
  // pdf-parse v2 requires a file URL — write buffer to a temp file, parse, then clean up
  const tmpFile = join(tmpdir(), `cl-pdf-${Date.now()}.pdf`);
  try {
    writeFileSync(tmpFile, buf);
    const parser = new PDFParse({ url: `file://${tmpFile}`, verbosity: 0 });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      parser.destroy();
    }
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

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

const MONTH_NAMES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  january: "01", february: "02", march: "03", april: "04", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function normalizeDate(raw: string): string {
  if (!raw) return "";
  raw = raw.trim().replace(/['"]/g, "");
  if (!raw) return "";

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // YYYYMMDD (OFX / some exports)
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  // MM/DD/YYYY or M/D/YYYY or M/D/YY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, p1, p2, p3] = slashMatch;
    const yr = p3.length === 2 ? `20${p3}` : p3;
    // If p3 is the year (4-digit), assume MM/DD/YYYY
    return `${yr}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`;
  }

  // DD-MM-YYYY or MM-DD-YYYY or YYYY-MM-DD already handled
  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, p1, p2, yr] = dashMatch;
    // Assume MM-DD-YYYY
    return `${yr}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`;
  }

  // DD-Mon-YYYY or Mon-DD-YYYY (e.g. "15-Jan-2024" or "Jan-15-2024")
  const monDash = raw.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/);
  if (monDash) {
    const [, d, mon, yr] = monDash;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (m) return `${yr.length === 2 ? "20" + yr : yr}-${m}-${d.padStart(2, "0")}`;
  }
  const monDash2 = raw.match(/^([A-Za-z]{3,9})-(\d{1,2})-(\d{2,4})$/);
  if (monDash2) {
    const [, mon, d, yr] = monDash2;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (m) return `${yr.length === 2 ? "20" + yr : yr}-${m}-${d.padStart(2, "0")}`;
  }

  // "Jan 15, 2024" or "January 15, 2024" or "15 Jan 2024"
  const monthNameMatch = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/) ||
                         raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthNameMatch) {
    const [, a, b, c] = monthNameMatch;
    // Is first part a month name or a day?
    const mA = MONTH_NAMES[a.toLowerCase()];
    const mB = MONTH_NAMES[b.toLowerCase()];
    if (mA) return `${c}-${mA}-${b.padStart(2, "0")}`;       // Jan 15, 2024
    if (mB) return `${c}-${mB}-${a.padStart(2, "0")}`;       // 15 Jan 2024
  }

  // DD/Mon/YYYY or Mon/DD/YYYY
  const slashMon = raw.match(/^(\d{1,2})\/([A-Za-z]{3,9})\/(\d{2,4})$/) ||
                   raw.match(/^([A-Za-z]{3,9})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMon) {
    const [, a, b, c] = slashMon;
    const mA = MONTH_NAMES[a.toLowerCase()];
    const mB = MONTH_NAMES[b.toLowerCase()];
    const yr = c.length === 2 ? "20" + c : c;
    if (mA) return `${yr}-${mA}-${b.padStart(2, "0")}`;
    if (mB) return `${yr}-${mB}-${a.padStart(2, "0")}`;
  }

  // Excel serial date (number)
  const num = Number(raw);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = XLSX.SSF.parse_date_code(num);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }

  // Try native Date parse as last resort (handles ISO strings with time, etc.)
  try {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch { /* ignore */ }

  return "";
}

function stripMoney(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}

// ── CSV/TSV Parser ────────────────────────────────────────────────────────────

function splitCsvLine(line: string, sep: string): string[] {
  // Handle quoted fields properly
  if (!line.includes('"')) return line.split(sep).map(c => c.trim());
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCsvTsv(content: string, sep = ","): ParsedTx[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect whether the first non-empty row is a header or a data row.
  // If the first cell of that row looks like a date, it's probably headerless data.
  let headerRowIdx = 0;
  let isHeaderless = false;

  for (let r = 0; r < Math.min(10, lines.length); r++) {
    const cells = splitCsvLine(lines[r], sep);
    if (cells.filter(c => c !== "").length >= 2) {
      headerRowIdx = r;
      const firstCell = cells[0].replace(/"/g, "").trim();
      // If the first cell normalises to a valid date, the row is data (no headers)
      const testDate = normalizeDate(firstCell);
      if (testDate && /^\d{4}-\d{2}-\d{2}$/.test(testDate)) isHeaderless = true;
      break;
    }
  }

  const header = isHeaderless
    // Synthesise positional header names so the rest of the logic still works
    ? splitCsvLine(lines[headerRowIdx], sep).map((_, i) => `col${i}`)
    : splitCsvLine(lines[headerRowIdx], sep).map(h => h.replace(/"/g, "").trim().toLowerCase());

  // Flexible column matching — order matters (first match wins)
  const idx = (terms: string[]) => {
    for (const t of terms) {
      const i = header.findIndex(h => h === t);
      if (i >= 0) return i;
    }
    for (const t of terms) {
      const i = header.findIndex(h => h.includes(t));
      if (i >= 0) return i;
    }
    return -1;
  };

  const dateIdx   = idx(["date", "trans date", "transaction date", "post date", "posted date", "posting date", "value date", "trans.", "transaction", "posted"]);
  const descIdx   = idx(["description", "desc", "narration", "memo", "details", "detail", "payee", "note", "notes", "reference", "ref", "particulars", "remarks", "transaction description", "name"]);
  const amtIdx    = idx(["amount", "value", "total", "sum", "net amount", "transaction amount"]);
  const debitIdx  = idx(["debit", "withdrawal", "withdrawals", "charge", "charges", "withdraw", "debit amount", "money out", "out", "dr"]);
  const creditIdx = idx(["credit", "deposit", "deposits", "payment", "payments", "receive", "credit amount", "money in", "in", "cr"]);
  const typeIdx   = idx(["type", "transaction type", "dr/cr", "dr cr", "debit/credit"]);
  const balanceIdx= idx(["balance", "running balance", "ledger balance", "available balance", "ending balance", "closing balance"]);

  // If we still can't find a date column, try column 0 if it looks like dates
  const effectiveDateIdx = dateIdx >= 0 ? dateIdx : 0;

  // ── First pass: collect raw rows ─────────────────────────────────────────
  // We do two passes so we can use balance changes to determine direction
  // for banks that export all amounts as positive in a single column.
  interface RawRow { line: number; date: string; description: string; rawAmt: string; rawBalance: string; typeHint?: string; }
  const rawRows: RawRow[] = [];

  const dataStartIdx = isHeaderless ? headerRowIdx : headerRowIdx + 1;
  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line, sep);

    const rawDate = cols[effectiveDateIdx] ?? "";
    if (!rawDate) continue;
    const date = normalizeDate(rawDate);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    let description = descIdx >= 0 ? cols[descIdx] : undefined;
    if (!description && isHeaderless) {
      for (let c = cols.length - 1; c >= 0; c--) {
        if (c === effectiveDateIdx) continue;
        const cell = cols[c];
        if (cell && !/^[\d\s$,.()-]+$/.test(cell) && cell !== "*") { description = cell; break; }
      }
    }
    description = description || `Transaction ${i}`;

    // Skip rows with no useful debit/credit/amount column (header-like rows in middle of file)
    if (amtIdx < 0 && debitIdx < 0 && creditIdx < 0) {
      // Last-resort: find the first meaningful numeric column
      let found = false;
      for (let c = 0; c < cols.length; c++) {
        if (c === effectiveDateIdx || c === descIdx) continue;
        const raw = (cols[c] || "").replace(/[$,\s()]/g, "");
        const val = parseFloat(raw);
        if (!isNaN(val) && val !== 0 && Math.abs(val) < 1_000_000) {
          rawRows.push({ line: i, date, description, rawAmt: cols[c] ?? "", rawBalance: balanceIdx >= 0 ? (cols[balanceIdx] ?? "") : "", typeHint: typeIdx >= 0 ? cols[typeIdx] : undefined });
          found = true; break;
        }
      }
      if (!found) continue;
    } else {
      rawRows.push({
        line: i, date, description,
        rawAmt: amtIdx >= 0 ? (cols[amtIdx] ?? "") : "",
        rawBalance: balanceIdx >= 0 ? (cols[balanceIdx] ?? "") : "",
        typeHint: typeIdx >= 0 ? cols[typeIdx] : undefined,
        // Embed debit/credit separately for split-column format
        ...(amtIdx < 0 && (debitIdx >= 0 || creditIdx >= 0) ? {
          _debit: debitIdx >= 0 ? cols[debitIdx] : "",
          _credit: creditIdx >= 0 ? cols[creditIdx] : "",
        } : {}),
      } as RawRow & { _debit?: string; _credit?: string });
    }
  }

  // ── Balance-based direction detection ────────────────────────────────────
  // If all amounts are positive and we have a balance column, use balance delta to determine direction
  const balances = rawRows.map(r => stripMoney(r.rawBalance));
  const hasBalanceCol = balanceIdx >= 0 && balances.some(b => b > 0);
  const allRawAmtsPositive = amtIdx >= 0 && rawRows.every(r => {
    const raw = r.rawAmt.replace(/[$,\s()]/g, "");
    const val = parseFloat(raw);
    // Skip empty/zero rows in this check — they don't indicate sign direction
    if (isNaN(val) || val === 0) return true;
    const neg = r.rawAmt.trim().startsWith("(") || r.rawAmt.trim().startsWith("-");
    return !neg && val > 0;
  });

  // ── Second pass: produce ParsedTx[] ──────────────────────────────────────
  const txns: ParsedTx[] = [];
  for (let ri = 0; ri < rawRows.length; ri++) {
    const row = rawRows[ri] as RawRow & { _debit?: string; _credit?: string };

    // Split-column (Debit/Withdrawal vs Credit/Deposit)
    if (amtIdx < 0 && (debitIdx >= 0 || creditIdx >= 0)) {
      const debit  = stripMoney(row._debit  ?? "0");
      const credit = stripMoney(row._credit ?? "0");
      if (debit > 0)  txns.push({ date: row.date, description: row.description, amount: debit,  type: "debit" });
      if (credit > 0) txns.push({ date: row.date, description: row.description, amount: credit, type: "credit" });
      continue;
    }

    // Single amount column
    const raw = row.rawAmt.replace(/[$,\s()]/g, "");
    const negative = row.rawAmt.trim().startsWith("(") || row.rawAmt.trim().startsWith("-");
    const val = negative ? -Math.abs(parseFloat(raw) || 0) : (parseFloat(raw) || 0);
    if (val === 0) continue;

    let type: "debit" | "credit" = val < 0 ? "debit" : "credit";

    // 1. Explicit type column takes precedence
    if (row.typeHint) {
      const t = row.typeHint.toLowerCase().trim();
      if (t === "dr" || t === "debit" || t === "d" || t === "withdrawal" || t === "withdraw") type = "debit";
      else if (t === "cr" || t === "credit" || t === "c" || t === "deposit") type = "credit";
    }
    // 2. Balance delta — if all amounts are positive and we have balances, use delta to detect direction
    else if (allRawAmtsPositive && hasBalanceCol) {
      const prevBal = ri > 0 ? balances[ri - 1] : null;
      const curBal  = balances[ri];
      if (prevBal !== null && curBal > 0 && prevBal > 0) {
        const delta = curBal - prevBal;
        // Allow small rounding tolerance
        if (Math.abs(Math.abs(delta) - Math.abs(val)) < 0.02) {
          type = delta < 0 ? "debit" : "credit";
        }
      }
    }

    txns.push({ date: row.date, description: row.description, amount: Math.abs(val), type });
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

  // Chase PDFs: amount appears on the same line as the date (or at end of a continuation
  // block). First transaction in each section uses $, rest are bare numbers.
  // Match both: "$3,000.00" and "3,202.00" but not raw IDs (which lack the comma-decimal pattern).
  const dollarAmtRe = /\$?((?:\d{1,3},)*\d{1,3}\.\d{2})/g;
  const amountRe    = /\$?((?:\d{1,3},)*\d{1,3}\.\d{2})\s*$/; // used for "has amount at end of line" check
  const dateRe      = /^(\d{1,2}\/\d{2})\b/;

  const skipPatterns = [
    /^total\s/i, /^date\s+desc/i, /^beginning balance/i, /^ending balance/i,
    /^account number/i, /^page \d/i, /^\*(?:start|end)\*/i,
    /^chase\b/i, /^po box/i, /^checking summary/i, /^instances\s/i,
    /^deposits and additions\s*$/i, /^atm & debit/i, /^electronic withdrawal\s*$/i,
    /^electronic withdrawals\s*$/i, /^electronic withdrawals\s*\(continued\)\s*$/i,
    /^how to avoid/i, /^if you meet/i, /^congratulations/i, /^important update/i,
    /^beginning january/i, /^were here/i, /^for more information/i,
    /^web site/i, /^service center/i, /^para espanol/i, /^international calls/i,
    /^daily ending balance/i, /^in case of errors/i, /^call us at/i,
    /^-- \d+ of \d+ --/i, /^\d+ \d+page of/i, /^this page intentionally/i,
    /^jpmorgan chase/i, /^member fdic/i,
  ];

  function sectionOf(line: string): SectionType | null {
    const l = line.toLowerCase();
    if (/deposits and additions/.test(l) || /\*start\*deposits/.test(l)) return "credit";
    if (/electronic withdrawal/.test(l) || /atm.*debit.*withdrawal/.test(l) || /\*start\*atm/.test(l) ||
        /\*start\*electronic/.test(l) || /\*start\*fees/.test(l) || /^fees\s*$/i.test(l) ||
        /other withdrawal/.test(l) || /\*start\*other/.test(l)) return "debit";
    // Stop parsing at daily ending balance (just a balance table, not transactions)
    if (/daily ending balance/.test(l)) return "none";
    return null;
  }

  function cleanDesc(d: string): string {
    return d
      // Remove ACH/NACHA technical fields
      .replace(/Orig CO Name:/gi, "")
      .replace(/Orig ID:[A-Z0-9]+/gi, "")
      .replace(/Desc Date:[A-Z0-9]*/gi, "")
      .replace(/CO Entry\s*Descr:[A-Za-z]*/gi, "CO Entry")
      .replace(/\bCO Entry\b/gi, "")
      .replace(/Sec:(?:CCD|PPD|WEB|CTX|TEL)/gi, "")
      .replace(/Trace#:\d+/gi, "")
      .replace(/Eed:\d+/gi, "")
      .replace(/Ind ID:[^\s]+/gi, "")
      .replace(/Ind Name:/gi, "")
      .replace(/Trn:\s*\S+(?:Tc)?/gi, "")
      // Remove bare "Descr:" prefix followed by short word
      .replace(/Descr:[A-Za-z]*/gi, "")
      // Remove Zelle/ACH transaction reference IDs (alphanumeric 8+ chars: Jpm99C7Kcl8V, 28245620043)
      .replace(/\b(?:[A-Z][a-z0-9]{2,}[A-Z][A-Za-z0-9]{4,}|[0-9]{8,})\b/g, "")
      // Remove long ALL-CAPS IDs (8+ uppercase chars/digits like GDXLK2VV)
      .replace(/\b[A-Z0-9]{8,}\b/g, "")
      // Remove bare ":PPD", ":CCD" remnants
      .replace(/:[A-Z]{3}/g, "")
      .replace(/\s*[.:\s]+$/, "")
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
      const text = await pdfToText(req.file.buffer);
      transactions = parseBankStatementPdf(text);

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
        // Pass signed amount: negative for debits (money out), positive for credits (money in)
        // so that autoCategorize can correctly filter expense vs income accounts
        const signedAmt = tx.type === "debit" ? -Math.abs(tx.amount) : Math.abs(tx.amount);
        const cat = await autoCategorize(tx.description, signedAmt, businessId, accountsByCode);
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
