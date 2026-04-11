import { useState } from "react";
import {
  useListReconciliations,
  useCreateReconciliation,
  useRunReconciliation,
  useCompleteReconciliation,
  getListReconciliationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, today } from "@/lib/utils";
import { Plus, Play, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface Props {
  businessId: number;
}

interface ReconciliationResult {
  matched: Array<{
    bankTransaction: { id: number; date: string; description: string; amount: number; type: string };
    journalEntry: { id: number; date: string; memo: string | null };
  }>;
  unmatchedBank: Array<{ id: number; date: string; description: string; amount: number; type: string }>;
  unmatchedJournal: Array<{ id: number; date: string; memo: string | null }>;
  summary: {
    totalMatched: number;
    totalUnmatchedBank: number;
    totalUnmatchedJournal: number;
    openingBalance: number;
    closingBalance: number;
    difference: number;
  };
}

const STATUS_ICONS = {
  pending: <Clock className="w-4 h-4 text-amber-500" />,
  in_progress: <AlertCircle className="w-4 h-4 text-blue-500" />,
  completed: <CheckCircle className="w-4 h-4 text-emerald-500" />,
};

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function ReconcilePage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const { data: reconciliations, isLoading } = useListReconciliations(businessId, {
    query: { enabled: !!businessId },
  });
  const createRecon = useCreateReconciliation();
  const runRecon = useRunReconciliation();
  const completeRecon = useCompleteReconciliation();

  const [showForm, setShowForm] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [form, setForm] = useState({
    bankAccountName: "",
    statementDate: today(),
    openingBalance: "",
    closingBalance: "",
  });
  const [error, setError] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey(businessId) });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createRecon.mutateAsync({
        params: { businessId },
        data: {
          bankAccountName: form.bankAccountName,
          statementDate: form.statementDate,
          openingBalance: parseFloat(form.openingBalance),
          closingBalance: parseFloat(form.closingBalance),
        },
      });
      invalidate();
      setShowForm(false);
      setForm({ bankAccountName: "", statementDate: today(), openingBalance: "", closingBalance: "" });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error creating reconciliation");
    }
  }

  async function handleRun(reconciliationId: number) {
    setRunningId(reconciliationId);
    setResult(null);
    try {
      const res = await runRecon.mutateAsync({ params: { businessId, reconciliationId } });
      setResult(res as unknown as ReconciliationResult);
      invalidate();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error running reconciliation");
    }
    setRunningId(null);
  }

  async function handleComplete(reconciliationId: number) {
    await completeRecon.mutateAsync({ params: { businessId, reconciliationId } });
    setResult(null);
    invalidate();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Match bank transactions with journal entries</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="w-4 h-4" />
          New reconciliation
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground text-sm">New reconciliation</h3>
          {error && <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">Bank account name</label>
              <input type="text" value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} required placeholder="e.g. Chase Checking"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Statement date</label>
              <input type="date" value={form.statementDate} onChange={(e) => setForm({ ...form, statementDate: e.target.value })} required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div></div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Opening balance</label>
              <input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} required placeholder="0.00"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Closing balance</label>
              <input type="number" step="0.01" value={form.closingBalance} onChange={(e) => setForm({ ...form, closingBalance: e.target.value })} required placeholder="0.00"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={createRecon.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {createRecon.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      {/* Result panel */}
      {result && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Reconciliation Results</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{result.summary.totalMatched}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Matched</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{result.summary.totalUnmatchedBank}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Unmatched bank txns</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-rose-600">{result.summary.totalUnmatchedJournal}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Unmatched journal entries</div>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening balance</span>
                <span className="font-medium">{formatCurrency(result.summary.openingBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Closing balance</span>
                <span className="font-medium">{formatCurrency(result.summary.closingBalance)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Difference</span>
                <span className={`font-semibold ${Math.abs(result.summary.difference) < 0.01 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(result.summary.difference)}
                </span>
              </div>
            </div>

            {result.matched.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Matched pairs ({result.matched.length})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {result.matched.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 bg-emerald-50 rounded-lg px-3 py-2 text-xs">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="flex-1 truncate text-foreground">{m.bankTransaction.description}</span>
                      <span className="text-muted-foreground">{formatDate(m.bankTransaction.date)}</span>
                      <span className="font-medium text-foreground">{formatCurrency(m.bankTransaction.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.unmatchedBank.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Unmatched bank transactions ({result.unmatchedBank.length})</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.unmatchedBank.map((tx) => (
                    <div key={tx.id} className="flex items-center gap-3 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span className="flex-1 truncate">{tx.description}</span>
                      <span className="text-muted-foreground">{formatDate(tx.date)}</span>
                      <span className="font-medium">{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : reconciliations?.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No reconciliations yet. Create one to start matching transactions.
        </div>
      ) : (
        <div className="space-y-3">
          {reconciliations?.map((rec) => (
            <div key={rec.id} className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {STATUS_ICONS[rec.status as keyof typeof STATUS_ICONS]}
                  <div>
                    <div className="font-medium text-sm text-foreground">{rec.bankAccountName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Statement: {formatDate(rec.statementDate)} · {STATUS_LABELS[rec.status as keyof typeof STATUS_LABELS]}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground text-xs">Opening → Closing</div>
                    <div className="font-medium text-foreground">
                      {formatCurrency(rec.openingBalance)} → {formatCurrency(rec.closingBalance)}
                    </div>
                  </div>
                  {rec.status !== "completed" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRun(rec.id)}
                        disabled={runningId === rec.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        <Play className="w-3 h-3" />
                        {runningId === rec.id ? "Running..." : "Run"}
                      </button>
                      {result && (
                        <button
                          onClick={() => handleComplete(rec.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Complete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
