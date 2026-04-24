import { useState, useRef, useCallback } from "react";
import {
  useConfirmUpload,
  useListAccounts,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Upload, CheckCircle, FileText, X, Pencil, AlertCircle } from "lucide-react";

interface Props {
  businessId: number;
}

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
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

export default function UploadPage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedTx[] | null>(null);
  const [format, setFormat] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<ParsedTx | null>(null);

  const { data: accounts } = useListAccounts(businessId, { query: { enabled: !!businessId } });
  const confirmUpload = useConfirmUpload();

  function resetAll() {
    setFile(null);
    setParsed(null);
    setFormat("");
    setImported(null);
    setError("");
    setEditIdx(null);
    setEditRow(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function setSelectedFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const ok = ACCEPTED_EXTENSIONS.some(e => e === "." + ext) || f.type.startsWith("text/");
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
      setParsed(json.transactions);
      setFormat(json.format || "");
    } catch (err: any) {
      setError(err.message || "Error parsing file");
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
        data: {
          transactions: parsed,
          accountId: selectedAccount ? Number(selectedAccount) : null,
        },
      });
      setImported(result.imported);
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(businessId) });
    } catch (err: any) {
      setError(err?.data?.error || err?.message || "Error importing transactions");
    }
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

  // ── Render ────────────────────────────────────────────────────────────────

  if (imported !== null) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-card border border-card-border rounded-xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-1">Import complete</h3>
          <p className="text-muted-foreground text-sm mb-6">
            {imported} transaction{imported !== 1 ? "s" : ""} added to the General Ledger
          </p>
          <button onClick={resetAll}
            className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
            Upload another statement
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Bank Statement</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Import transactions from any bank export format — PDF, CSV, Excel, OFX/QFX/QBO, and more
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
                onClick={e => { e.stopPropagation(); resetAll(); }}
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
                {["PDF", "CSV", "Excel", "OFX", "QFX", "QBO", "TSV", "TXT"].map(f => (
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
          {parsing ? "Parsing…" : "Parse transactions"}
        </button>
      </div>

      {/* Preview & import */}
      {parsed && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-semibold text-sm text-foreground">Step 2 — Review &amp; Import</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{parsed.length} transactions found</p>
              </div>
              {format && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                  {formatBadge(format)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No account (categorize later)</option>
                {accounts?.filter(a => a.isActive).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button
                onClick={handleImport}
                disabled={confirmUpload.isPending || parsed.length === 0}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {confirmUpload.isPending ? "Importing…" : `Import ${parsed.length}`}
              </button>
            </div>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase w-28">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase w-32">Amount</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-20">Type</th>
                  <th className="px-4 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.map((tx, i) =>
                  editIdx === i ? (
                    <tr key={i} className="bg-muted/30">
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={editRow!.date}
                          onChange={e => setEditRow(r => ({ ...r!, date: e.target.value }))}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editRow!.description}
                          onChange={e => setEditRow(r => ({ ...r!, description: e.target.value }))}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editRow!.amount}
                          onChange={e => setEditRow(r => ({ ...r!, amount: parseFloat(e.target.value) || 0 }))}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <select
                          value={editRow!.type}
                          onChange={e => setEditRow(r => ({ ...r!, type: e.target.value as "debit" | "credit" }))}
                          className="rounded border border-input bg-background px-1 py-1 text-xs"
                        >
                          <option value="credit">credit</option>
                          <option value="debit">debit</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={saveEdit} className="text-xs font-medium text-primary hover:underline">Save</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap text-xs">{formatDate(tx.date)}</td>
                      <td className="px-4 py-2.5 text-foreground max-w-xs">
                        <span className="block truncate">{tx.description}</span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${tx.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                        {tx.type === "credit" ? "+" : "−"}{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tx.type === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeRow(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                            <X className="w-3.5 h-3.5" />
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
            <span>Hover a row to edit or remove it before importing</span>
            <span>
              {parsed.filter(t => t.type === "credit").length} deposits &nbsp;·&nbsp;
              {parsed.filter(t => t.type === "debit").length} withdrawals
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
        </div>
      )}
    </div>
  );
}
