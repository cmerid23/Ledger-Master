import { useState, useRef, useCallback } from "react";
import {
  useConfirmUpload,
  useListAccounts,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Upload, CheckCircle, FileText, X, Pencil, AlertCircle, Tag, Zap, ArrowLeftRight } from "lucide-react";

interface Props {
  businessId: number;
}

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  accountId?: number | null;
  suggestedAccountId?: number | null;
  suggestedAccountName?: string | null;
  suggestedBy?: string | null;
  suggestedConfidence?: number | null;
}

const ACCEPTED_EXTENSIONS = [".csv", ".pdf", ".ofx", ".qfx", ".qbo", ".xlsx", ".xls", ".tsv", ".txt"];
const ACCEPTED_MIME = [
  "text/csv", "text/plain", "text/tab-separated-values",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/x-ofx", "application/ofx",
].join(",");

function formatBadge(fmt: string) {
  const map: Record<string, string> = {
    pdf: "PDF", csv: "CSV", tsv: "TSV", ofx: "OFX", qfx: "QFX", qbo: "QBO",
    excel: "Excel", xls: "Excel", xlsx: "Excel", unknown: "Auto",
  };
  return map[fmt] ?? fmt.toUpperCase();
}

function ConfidenceBadge({ by, confidence }: { by?: string | null; confidence?: number | null }) {
  if (!by || !confidence) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "text-emerald-700 bg-emerald-50" : pct >= 50 ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50";
  const label = by.startsWith("rule:") ? "rule" : by.startsWith("keyword:") ? "auto" : "guess";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      <Zap className="w-2.5 h-2.5" />
      {label} {pct}%
    </span>
  );
}

export default function UploadPage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedTx[] | null>(null);
  const [format, setFormat] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const [journalPosted, setJournalPosted] = useState<number | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<ParsedTx | null>(null);

  const { data: accounts } = useListAccounts(businessId, { query: { enabled: !!businessId } });
  const confirmUpload = useConfirmUpload();

  const activeAccounts = accounts?.filter((a) => a.isActive) ?? [];

  function resetAll() {
    setFile(null);
    setParsed(null);
    setFormat("");
    setImported(null);
    setJournalPosted(null);
    setError("");
    setEditIdx(null);
    setEditRow(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function setSelectedFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const ok = ACCEPTED_EXTENSIONS.some((e) => e === "." + ext) || f.type.startsWith("text/");
    if (!ok) { setError(`Unsupported file type: .${ext}`); return; }
    resetAll();
    setFile(f);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setSelectedFile(f);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setSelectedFile(f);
  }, []);

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave() { setDragging(false); }

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("clearledger_token") ?? "";
      const res = await fetch(`/api/businesses/${businessId}/upload/statement`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Parse failed");
      if (!json.transactions?.length) {
        setError("No transactions found. Check the file has date, description, and amount columns.");
        return;
      }
      // Apply auto-suggested account as the default accountId for each transaction
      const withDefaults: ParsedTx[] = json.transactions.map((tx: ParsedTx) => ({
        ...tx,
        accountId: tx.suggestedAccountId ?? null,
      }));
      setParsed(withDefaults);
      setFormat(json.format || "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error parsing file");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setError("");
    try {
      const result = await confirmUpload.mutateAsync({
        businessId,
        data: { transactions: parsed },
      });
      setImported(result.imported);
      setJournalPosted((result as { journalEntriesPosted?: number }).journalEntriesPosted ?? null);
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(businessId) });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error importing transactions");
    }
  }

  function setTxAccount(i: number, accountId: number | null) {
    if (!parsed) return;
    const next = [...parsed];
    next[i] = { ...next[i], accountId };
    setParsed(next);
  }

  function applyAllSuggestions() {
    if (!parsed) return;
    setParsed(parsed.map((tx) => ({
      ...tx,
      accountId: tx.suggestedAccountId ?? tx.accountId ?? null,
    })));
  }

  function startEdit(i: number) {
    setEditIdx(i);
    setEditRow({ ...parsed![i] });
  }

  function saveEdit() {
    if (editIdx === null || !editRow || !parsed) return;
    const next = [...parsed];
    next[editIdx] = editRow;
    setParsed(next);
    setEditIdx(null);
    setEditRow(null);
  }

  function removeRow(i: number) {
    if (!parsed) return;
    setParsed(parsed.filter((_, idx) => idx !== i));
  }

  const categorizedCount = parsed?.filter((t) => !!t.accountId).length ?? 0;
  const uncategorizedCount = (parsed?.length ?? 0) - categorizedCount;
  const suggestedCount = parsed?.filter((t) => !!t.suggestedAccountId).length ?? 0;

  const allSameDirection = parsed && parsed.length > 1 &&
    (parsed.every((t) => t.type === "credit") || parsed.every((t) => t.type === "debit"));

  function flipAllTypes() {
    if (!parsed) return;
    setParsed(parsed.map((tx) => ({ ...tx, type: tx.type === "credit" ? "debit" : "credit" })));
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (imported !== null) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-card border border-card-border rounded-xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-1">Import complete</h3>
          <p className="text-muted-foreground text-sm mb-2">
            {imported} transaction{imported !== 1 ? "s" : ""} added to the General Ledger
          </p>
          {journalPosted !== null && journalPosted > 0 && (
            <p className="text-emerald-600 text-sm font-medium mb-6">
              {journalPosted} double-entry journal entr{journalPosted !== 1 ? "ies" : "y"} posted
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={resetAll}
              className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Upload another statement
            </button>
            <a href="/reports"
              className="px-5 py-2.5 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors">
              View P&amp;L Report
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Bank Statement</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Import transactions from any bank export — PDF, CSV, Excel, OFX/QFX/QBO.
          Transactions are automatically categorized against your chart of accounts.
        </p>
      </div>

      {/* Drop zone */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-foreground">Step 1 — Select your file</h3>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all
            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-6 h-6 text-primary shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); resetAll(); }}
                className="ml-2 p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${dragging ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm font-semibold text-foreground">Drop your bank statement here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {["PDF", "CSV", "Excel", "OFX", "QFX", "QBO", "TSV"].map((f) => (
                  <span key={f} className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-mono">{f}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_MIME + "," + ACCEPTED_EXTENSIONS.join(",")}
          onChange={onFileInput}
          className="hidden"
        />

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 text-destructive text-sm rounded-md">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={!file || parsing}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {parsing ? "Parsing & categorizing…" : "Parse transactions"}
        </button>
      </div>

      {/* Preview & categorize */}
      {parsed && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Step 2 — Review &amp; Categorize</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{parsed.length} transactions found</p>
                </div>
                {format && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                    {formatBadge(format)}
                  </span>
                )}
              </div>
              <button
                onClick={handleImport}
                disabled={confirmUpload.isPending || parsed.length === 0}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {confirmUpload.isPending ? "Importing…" : `Post ${parsed.length} to Books`}
              </button>
            </div>

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">{parsed.filter((t) => t.type === "credit").length} deposits</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-muted-foreground">{parsed.filter((t) => t.type === "debit").length} withdrawals</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-700">
                <Tag className="w-3 h-3" />
                {categorizedCount} categorized
              </span>
              {uncategorizedCount > 0 && (
                <span className="text-amber-700 font-medium">
                  {uncategorizedCount} need category
                </span>
              )}
              {suggestedCount > 0 && (
                <button
                  onClick={applyAllSuggestions}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Zap className="w-3 h-3" />
                  Apply all {suggestedCount} suggestions
                </button>
              )}
              <button
                onClick={flipAllTypes}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline ml-auto"
                title="Flip all transactions between deposit and withdrawal"
              >
                <ArrowLeftRight className="w-3 h-3" />
                Flip all directions
              </button>
            </div>

            {/* Warning when all transactions have the same direction */}
            {allSameDirection && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  All {parsed.length} transactions were detected as{" "}
                  <strong>{parsed[0].type === "credit" ? "deposits (+)" : "withdrawals (−)"}</strong>.
                  If some are actually {parsed[0].type === "credit" ? "withdrawals" : "deposits"}, click any amount badge to flip it, or use{" "}
                  <button onClick={flipAllTypes} className="font-semibold underline">Flip all directions</button>.
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase w-24">Date</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase w-28">Amount</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase w-52">Category</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.map((tx, i) =>
                  editIdx === i ? (
                    <tr key={i} className="bg-muted/30">
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={editRow!.date}
                          onChange={(e) => setEditRow((r) => ({ ...r!, date: e.target.value }))}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editRow!.description}
                          onChange={(e) => setEditRow((r) => ({ ...r!, description: e.target.value }))}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <select
                            value={editRow!.type}
                            onChange={(e) => setEditRow((r) => ({ ...r!, type: e.target.value as "debit" | "credit" }))}
                            className="rounded border border-input bg-background px-1 py-1 text-xs"
                          >
                            <option value="credit">+ deposit</option>
                            <option value="debit">− withdrawal</option>
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editRow!.amount}
                            onChange={(e) => setEditRow((r) => ({ ...r!, amount: parseFloat(e.target.value) || 0 }))}
                            className="w-20 rounded border border-input bg-background px-2 py-1 text-xs text-right"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2" colSpan={2}>
                        <button onClick={saveEdit} className="text-xs font-medium text-primary hover:underline mr-3">Save</button>
                        <button onClick={() => setEditIdx(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className={`hover:bg-muted/20 transition-colors group ${!tx.accountId ? "bg-amber-50/30" : ""}`}>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs">{formatDate(tx.date)}</td>
                      <td className="px-3 py-2.5 text-foreground max-w-[180px]">
                        <span className="block truncate text-xs">{tx.description}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        <button
                          title="Click to toggle between deposit (+) and withdrawal (−)"
                          onClick={() => {
                            const next = [...parsed!];
                            next[i] = { ...tx, type: tx.type === "credit" ? "debit" : "credit" };
                            setParsed(next);
                          }}
                          className={`font-medium px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity cursor-pointer
                            ${tx.type === "credit" ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"}`}
                        >
                          {tx.type === "credit" ? "+" : "−"}{formatCurrency(tx.amount)}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={tx.accountId ?? ""}
                            onChange={(e) => setTxAccount(i, e.target.value ? Number(e.target.value) : null)}
                            className={`flex-1 rounded border text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring bg-background
                              ${!tx.accountId ? "border-amber-300 text-muted-foreground" : "border-input text-foreground"}`}
                          >
                            <option value="">— unassigned —</option>
                            {activeAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code ? `${a.code} · ` : ""}{a.name}
                              </option>
                            ))}
                          </select>
                          {tx.suggestedAccountId && tx.suggestedBy && (
                            <ConfidenceBadge by={tx.suggestedBy} confidence={tx.suggestedConfidence} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeRow(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>Rows highlighted in amber have no category — they will import without a journal entry</span>
            <span>
              {formatCurrency(parsed.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0))} in &nbsp;·&nbsp;
              {formatCurrency(parsed.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0))} out
            </span>
          </div>
        </div>
      )}

      {/* Format guide */}
      {!parsed && (
        <div className="bg-muted/30 border border-border rounded-xl p-5 space-y-3">
          <h4 className="font-medium text-sm text-foreground">Supported formats</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="space-y-1">
              <p className="font-medium text-foreground">Bank PDFs</p>
              <p>Chase, Wells Fargo, Bank of America, and most standard bank PDF statements are auto-parsed.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">CSV / TSV / TXT</p>
              <p>Any file with date, description, and amount columns. Split debit/credit columns also supported.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Excel (.xlsx / .xls)</p>
              <p>First sheet is used. Header row is auto-detected. Works with most bank exports.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">OFX / QFX / QBO</p>
              <p>Standard financial data exchange formats from Quicken, QuickBooks, and most banks.</p>
            </div>
          </div>
          <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-primary font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Auto-categorization included
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              After parsing, each transaction is automatically matched against your chart of accounts
              using keyword matching and bank rules. You can review and adjust before importing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
