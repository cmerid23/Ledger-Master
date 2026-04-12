import { useState } from "react";
import {
  useListJournalEntries,
  useCreateJournalEntry,
  useListAccounts,
  getListJournalEntriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, today } from "@/lib/utils";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  businessId: number;
}

interface JournalLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
}

export default function JournalPage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const { data: entries, isLoading } = useListJournalEntries(businessId, {}, {
    query: { enabled: !!businessId },
  });
  const { data: accounts } = useListAccounts(businessId, { query: { enabled: !!businessId } });
  const createEntry = useCreateJournalEntry();

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({ date: today(), memo: "", lines: [
    { accountId: "", debitAmount: "", creditAmount: "" },
    { accountId: "", debitAmount: "", creditAmount: "" },
  ] as JournalLine[] });
  const [error, setError] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey(businessId) });
  }

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, { accountId: "", debitAmount: "", creditAmount: "" }] }));
  }

  function removeLine(i: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }

  function updateLine(i: number, field: keyof JournalLine, value: string) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l),
    }));
  }

  const totalDebits = form.lines.reduce((s, l) => s + (parseFloat(l.debitAmount) || 0), 0);
  const totalCredits = form.lines.reduce((s, l) => s + (parseFloat(l.creditAmount) || 0), 0);
  const balanced = Math.abs(totalDebits - totalCredits) < 0.01;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!balanced) {
      setError("Debits must equal credits");
      return;
    }
    const validLines = form.lines.filter((l) => l.accountId);
    if (validLines.length < 2) {
      setError("At least 2 lines required");
      return;
    }
    try {
      await createEntry.mutateAsync({
        businessId,
        data: {
          date: form.date,
          memo: form.memo || null,
          lines: validLines.map((l) => ({
            accountId: Number(l.accountId),
            debitAmount: parseFloat(l.debitAmount) || 0,
            creditAmount: parseFloat(l.creditAmount) || 0,
          })),
        },
      });
      invalidate();
      setShowForm(false);
      setForm({ date: today(), memo: "", lines: [
        { accountId: "", debitAmount: "", creditAmount: "" },
        { accountId: "", debitAmount: "", creditAmount: "" },
      ]});
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error creating journal entry");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Journal Entries</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Double-entry bookkeeping ledger</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="w-4 h-4" />
          New entry
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground text-sm">New journal entry</h3>
          {error && <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Memo</label>
              <input type="text" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="Optional description"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">Journal lines</span>
              <div className={`text-xs px-2 py-0.5 rounded-full ${balanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {balanced ? "Balanced" : `Off by ${formatCurrency(Math.abs(totalDebits - totalCredits))}`}
              </div>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-32">Debit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-32">Credit</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {form.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <select value={line.accountId} onChange={(e) => updateLine(i, "accountId", e.target.value)}
                          className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                          <option value="">Select account</option>
                          {accounts?.filter((a) => a.isActive).map((a) => (
                            <option key={a.id} value={a.id}>{a.code ? `${a.code} - ` : ""}{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" min="0" value={line.debitAmount} onChange={(e) => updateLine(i, "debitAmount", e.target.value)} placeholder="0.00"
                          className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" min="0" value={line.creditAmount} onChange={(e) => updateLine(i, "creditAmount", e.target.value)} placeholder="0.00"
                          className="w-full px-2 py-1 rounded border border-input bg-background text-foreground text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring" />
                      </td>
                      <td className="px-3 py-2">
                        {form.lines.length > 2 && (
                          <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/20 border-t border-border">
                    <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Totals</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-foreground">{formatCurrency(totalDebits)}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-foreground">{formatCurrency(totalCredits)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addLine}
              className="mt-2 text-sm text-primary hover:underline">
              + Add line
            </button>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={createEntry.isPending || !balanced}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {createEntry.isPending ? "Saving..." : "Post entry"}
            </button>
          </div>
        </form>
      )}

      {/* Entries list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : entries?.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No journal entries yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {entries?.map((entry) => {
            const expanded = expandedId === entry.id;
            const totalDebit = entry.lines.reduce((s, l) => s + l.debitAmount, 0);
            return (
              <div key={entry.id} className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{entry.memo || "Journal entry"}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{entry.lines.length} lines · {formatCurrency(totalDebit)}</div>
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expanded && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/20">
                          <th className="px-5 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                          <th className="px-5 py-2 text-right text-xs font-medium text-muted-foreground">Debit</th>
                          <th className="px-5 py-2 text-right text-xs font-medium text-muted-foreground">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entry.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-5 py-2.5 text-foreground">{line.accountName ?? `Account ${line.accountId}`}</td>
                            <td className="px-5 py-2.5 text-right text-foreground">
                              {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : ""}
                            </td>
                            <td className="px-5 py-2.5 text-right text-foreground">
                              {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
