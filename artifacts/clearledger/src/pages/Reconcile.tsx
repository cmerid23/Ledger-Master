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
import { Plus, Play, CheckCircle, Clock, AlertCircle, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  businessId: number;
}

interface BankTx {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: string;
}

interface JournalEntry {
  id: number;
  date: string;
  memo: string | null;
}

interface MatchedPair {
  bankTransaction: BankTx;
  journalEntry: JournalEntry;
  confidence: "high" | "low";
}

interface ReconciliationResult {
  matched: MatchedPair[];
  needsReview: MatchedPair[];
  unmatchedBank: BankTx[];
  unmatchedJournal: JournalEntry[];
  summary: {
    total: number;
    autoReconciled: number;
    reviewNeeded: number;
    unmatched: number;
    openingBalance: number;
    closingBalance: number;
    difference: number;
  };
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <Clock className="w-4 h-4 text-amber-500" />,
  complete: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  pending: <Clock className="w-4 h-4 text-amber-500" />,
  in_progress: <AlertCircle className="w-4 h-4 text-blue-500" />,
  completed: <CheckCircle className="w-4 h-4 text-emerald-500" />,
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  complete: "Complete",
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
  const [activeReconId, setActiveReconId] = useState<number | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [form, setForm] = useState({
    bankAccountName: "",
    periodStart: today(),
    periodEnd: today(),
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
        businessId,
        data: {
          bankAccountName: form.bankAccountName,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          openingBalance: parseFloat(form.openingBalance),
          closingBalance: parseFloat(form.closingBalance),
        },
      });
      invalidate();
      setShowForm(false);
      setForm({ bankAccountName: "", periodStart: today(), periodEnd: today(), openingBalance: "", closingBalance: "" });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error creating reconciliation");
    }
  }

  async function handleRun(reconciliationId: number) {
    setRunningId(reconciliationId);
    setActiveReconId(reconciliationId);
    setResult(null);
    try {
      const res = await runRecon.mutateAsync({ businessId, reconciliationId });
      setResult(res as unknown as ReconciliationResult);
      invalidate();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error running reconciliation");
    }
    setRunningId(null);
  }

  async function handleComplete(reconciliationId: number) {
    await completeRecon.mutateAsync({ businessId, reconciliationId });
    setResult(null);
    setActiveReconId(null);
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
              <label className="block text-xs font-medium text-foreground mb-1">Period start</label>
              <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Period end</label>
              <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
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

      {/* Results panel */}
      {result && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Reconciliation Results</h3>
            <span className="text-xs text-muted-foreground">{result.summary.total} bank transactions processed</span>
          </div>

          {/* Summary stats — 4 tiles */}
          <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
            <div className="px-5 py-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">{result.summary.autoReconciled}</div>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Auto-matched</span>
              </div>
            </div>
            <div className="px-5 py-4 text-center">
              <div className="text-2xl font-bold text-amber-500">{result.summary.reviewNeeded}</div>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                <span className="text-xs text-muted-foreground">Needs review</span>
              </div>
            </div>
            <div className="px-5 py-4 text-center">
              <div className="text-2xl font-bold text-rose-500">{result.summary.unmatched}</div>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <AlertCircle className="w-3 h-3 text-rose-500" />
                <span className="text-xs text-muted-foreground">Unmatched</span>
              </div>
            </div>
            <div className="px-5 py-4 text-center">
              <div className={cn("text-2xl font-bold", Math.abs(result.summary.difference) < 0.01 ? "text-emerald-600" : "text-rose-500")}>
                {formatCurrency(result.summary.difference)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Difference</div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Balance summary */}
            <div className="bg-muted/30 rounded-lg p-4 text-sm flex gap-6">
              <div>
                <span className="text-muted-foreground text-xs">Opening balance</span>
                <div className="font-semibold">{formatCurrency(result.summary.openingBalance)}</div>
              </div>
              <div className="text-muted-foreground self-end mb-0.5">→</div>
              <div>
                <span className="text-muted-foreground text-xs">Closing balance</span>
                <div className="font-semibold">{formatCurrency(result.summary.closingBalance)}</div>
              </div>
              {Math.abs(result.summary.difference) < 0.01 && (
                <div className="ml-auto flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Balanced
                </div>
              )}
            </div>

            {/* High-confidence matches */}
            {result.matched.length > 0 && (
              <ResultSection
                title="Auto-matched"
                subtitle="High confidence — automatically reconciled"
                count={result.matched.length}
                badgeClass="bg-emerald-100 text-emerald-700"
                icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                rowClass="bg-emerald-50/60"
                items={result.matched.map((m) => ({
                  description: m.bankTransaction.description,
                  date: m.bankTransaction.date,
                  amount: m.bankTransaction.amount,
                  sub: m.journalEntry.memo ?? "—",
                }))}
              />
            )}

            {/* Needs review */}
            {result.needsReview.length > 0 && (
              <ResultSection
                title="Needs review"
                subtitle="Low confidence — verify these matches manually"
                count={result.needsReview.length}
                badgeClass="bg-amber-100 text-amber-700"
                icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                rowClass="bg-amber-50/60"
                items={result.needsReview.map((m) => ({
                  description: m.bankTransaction.description,
                  date: m.bankTransaction.date,
                  amount: m.bankTransaction.amount,
                  sub: `Suggested journal: ${m.journalEntry.memo ?? "—"}`,
                }))}
              />
            )}

            {/* Unmatched bank */}
            {result.unmatchedBank.length > 0 && (
              <ResultSection
                title="Unmatched bank transactions"
                subtitle="No journal entry found for these"
                count={result.unmatchedBank.length}
                badgeClass="bg-rose-100 text-rose-700"
                icon={<AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                rowClass="bg-rose-50/60"
                items={result.unmatchedBank.map((tx) => ({
                  description: tx.description,
                  date: tx.date,
                  amount: tx.amount,
                }))}
              />
            )}
          </div>
        </div>
      )}

      {/* Reconciliation list */}
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
                      {formatDate(rec.periodStart)} – {formatDate(rec.periodEnd)} · {STATUS_LABELS[rec.status] ?? rec.status}
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
                      {result && activeReconId === rec.id && (
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

// Shared section component for result buckets
function ResultSection({
  title, subtitle, count, badgeClass, icon, rowClass, items,
}: {
  title: string;
  subtitle: string;
  count: number;
  badgeClass: string;
  icon: React.ReactNode;
  rowClass: string;
  items: Array<{ description: string; date: string; amount: number; sub?: string }>;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div>
      <button
        className="w-full flex items-center gap-2 mb-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", badgeClass)}>
          {icon}
          {count}
        </span>
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
        <span className="ml-auto text-xs text-muted-foreground">{expanded ? "hide" : "show"}</span>
      </button>
      {expanded && (
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className={cn("flex items-start gap-3 rounded-lg px-3 py-2 text-xs", rowClass)}>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-foreground">{item.description}</div>
                {item.sub && <div className="text-muted-foreground truncate">{item.sub}</div>}
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-muted-foreground">{formatDate(item.date)}</div>
                <div className="font-medium text-foreground">{formatCurrency(item.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
