import { useState, useRef } from "react";
import {
  useUploadCsv,
  useConfirmUpload,
  useListAccounts,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Upload, CheckCircle, FileText, X } from "lucide-react";

interface Props {
  businessId: number;
}

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

export default function UploadPage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedTx[] | null>(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const [error, setError] = useState("");

  const { data: accounts } = useListAccounts(businessId, { query: { enabled: !!businessId } });
  const uploadCsv = useUploadCsv();
  const confirmUpload = useConfirmUpload();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsvContent(ev.target?.result as string ?? "");
    reader.readAsText(file);
    setParsed(null);
    setImported(null);
    setError("");
  }

  async function handleParse() {
    if (!csvContent) return;
    setError("");
    try {
      const result = await uploadCsv.mutateAsync({
        params: { businessId },
        data: { csvContent },
      });
      setParsed(result.transactions as ParsedTx[]);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error parsing CSV");
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setError("");
    try {
      const result = await confirmUpload.mutateAsync({
        params: { businessId },
        data: {
          transactions: parsed,
          accountId: selectedAccount ? Number(selectedAccount) : null,
        },
      });
      setImported(result.imported);
      setParsed(null);
      setCsvContent("");
      setFileName("");
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(businessId) });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error importing transactions");
    }
  }

  function handleReset() {
    setParsed(null);
    setCsvContent("");
    setFileName("");
    setImported(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Bank Statement</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Import transactions from a CSV bank statement</p>
      </div>

      {imported !== null ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-1">Import complete</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Successfully imported {imported} transaction{imported !== 1 ? "s" : ""}
          </p>
          <button onClick={handleReset}
            className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
            Upload another statement
          </button>
        </div>
      ) : (
        <>
          {/* Upload area */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-sm text-foreground">Step 1: Select CSV file</h3>

            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
              onClick={() => fileRef.current?.click()}
            >
              {fileName ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-foreground">{fileName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Click to select a CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports most bank CSV formats with date, description, and amount columns
                  </p>
                </>
              )}
            </div>

            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />

            {error && <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}

            <button
              onClick={handleParse}
              disabled={!csvContent || uploadCsv.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {uploadCsv.isPending ? "Parsing..." : "Parse transactions"}
            </button>
          </div>

          {/* Preview */}
          {parsed && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Step 2: Review & Import</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{parsed.length} transactions found</p>
                </div>
                <div className="flex items-center gap-3">
                  <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
                    className="px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">No account (categorize later)</option>
                    {accounts?.filter((a) => a.isActive).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleImport}
                    disabled={confirmUpload.isPending}
                    className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {confirmUpload.isPending ? "Importing..." : "Import all"}
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border">
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                      <th className="px-5 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                      <th className="px-5 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsed.map((tx, i) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="px-5 py-2.5 text-foreground truncate max-w-xs">{tx.description}</td>
                        <td className={`px-5 py-2.5 text-right font-medium ${tx.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                          {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tx.type === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                            {tx.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Help section */}
      <div className="bg-muted/40 border border-border rounded-xl p-5 text-sm text-muted-foreground space-y-2">
        <h4 className="font-medium text-foreground text-sm">Supported CSV formats</h4>
        <p>The parser automatically detects common bank CSV formats:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Standard format: date, description, amount (positive = credit, negative = debit)</li>
          <li>Split format: date, description, debit, credit (separate columns)</li>
          <li>Date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY</li>
        </ul>
      </div>
    </div>
  );
}
