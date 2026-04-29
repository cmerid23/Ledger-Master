import { useState, useEffect, useCallback } from "react";
import { useListAccounts } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Zap, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown, FlaskConical, Loader2, X, GripVertical,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  businessId: number;
}

interface BankRule {
  id: number;
  name: string;
  priority: number;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  transactionType: string | null;
  accountId: number | null;
  isActive: boolean;
  autoApply: boolean;
  timesApplied: number;
  createdAt: string;
}

interface Account {
  id: number;
  name: string;
  type: string;
}

const OPERATORS: Record<string, string> = {
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with",
  equals: "equals",
  greater_than: "> (amount)",
  less_than: "< (amount)",
};

const FIELDS: Record<string, string> = {
  description: "Description",
  amount: "Amount",
};

const TYPE_LABELS: Record<string, string> = {
  debit: "Debit only",
  credit: "Credit only",
  both: "Both",
};

const TYPE_COLORS: Record<string, string> = {
  debit: "text-rose-600 bg-rose-50 border-rose-200",
  credit: "text-emerald-600 bg-emerald-50 border-emerald-200",
  both: "text-blue-600 bg-blue-50 border-blue-200",
};

const defaultForm = {
  name: "",
  conditionField: "description",
  conditionOperator: "contains",
  conditionValue: "",
  transactionType: "both",
  accountId: "",
  priority: "0",
  isActive: true,
  autoApply: true,
};

type FormState = typeof defaultForm;

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export default function BankRulesPage({ businessId }: Props) {
  const { toast } = useToast();
  const { data: accounts } = useListAccounts(businessId, { query: { enabled: !!businessId } });

  const [rules, setRules] = useState<BankRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [testDesc, setTestDesc] = useState("");
  const [testAmount, setTestAmount] = useState("");
  const [testResult, setTestResult] = useState<{ matched: boolean; rule?: string; accountName?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/businesses/${businessId}/bank-rules`);
      setRules(data ?? []);
    } catch {
      toast({ title: "Failed to load rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [businessId, toast]);

  useEffect(() => { loadRules(); }, [loadRules]);

  function openAdd() {
    setEditingId(null);
    setForm(defaultForm);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(rule: BankRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      conditionField: rule.conditionField,
      conditionOperator: rule.conditionOperator,
      conditionValue: rule.conditionValue,
      transactionType: rule.transactionType ?? "both",
      accountId: rule.accountId ? String(rule.accountId) : "",
      priority: String(rule.priority),
      isActive: rule.isActive,
      autoApply: rule.autoApply,
    });
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.conditionValue.trim()) {
      setFormError("Name and condition value are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: form.name.trim(),
        conditionField: form.conditionField,
        conditionOperator: form.conditionOperator,
        conditionValue: form.conditionValue.trim(),
        transactionType: form.transactionType,
        accountId: form.accountId ? Number(form.accountId) : null,
        priority: Number(form.priority),
        isActive: form.isActive,
        autoApply: form.autoApply,
      };
      if (editingId) {
        const updated = await apiFetch(`/api/businesses/${businessId}/bank-rules/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setRules((r) => r.map((x) => (x.id === editingId ? updated : x)));
        toast({ title: "Rule updated" });
      } else {
        const created = await apiFetch(`/api/businesses/${businessId}/bank-rules`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setRules((r) => [...r, created].sort((a, b) => a.priority - b.priority));
        toast({ title: "Rule created" });
      }
      closeForm();
    } catch (err: unknown) {
      const e = err as Error;
      setFormError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this rule?")) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/businesses/${businessId}/bank-rules/${id}`, { method: "DELETE" });
      setRules((r) => r.filter((x) => x.id !== id));
      toast({ title: "Rule deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(rule: BankRule) {
    try {
      const updated = await apiFetch(`/api/businesses/${businessId}/bank-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRules((r) => r.map((x) => (x.id === rule.id ? updated : x)));
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  async function handlePriorityChange(rule: BankRule, direction: "up" | "down") {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((r) => r.id === rule.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    const newP = other.priority;
    const oldP = rule.priority;
    try {
      await Promise.all([
        apiFetch(`/api/businesses/${businessId}/bank-rules/${rule.id}`, {
          method: "PATCH", body: JSON.stringify({ priority: newP }),
        }),
        apiFetch(`/api/businesses/${businessId}/bank-rules/${other.id}`, {
          method: "PATCH", body: JSON.stringify({ priority: oldP }),
        }),
      ]);
      setRules((r) =>
        r.map((x) =>
          x.id === rule.id ? { ...x, priority: newP }
          : x.id === other.id ? { ...x, priority: oldP }
          : x
        )
      );
    } catch {
      toast({ title: "Reorder failed", variant: "destructive" });
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch(`/api/businesses/${businessId}/bank-rules/test`, {
        method: "POST",
        body: JSON.stringify({ description: testDesc, amount: testAmount ? Number(testAmount) : undefined }),
      });
      setTestResult(result);
    } catch {
      toast({ title: "Test failed", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const accountMap = Object.fromEntries((accounts ?? []).map((a: Account) => [a.id, a.name]));

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bank Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auto-categorize transactions when importing bank statements
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {/* Rules table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading rules…
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Zap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">No rules yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create rules to automatically categorize transactions during import.
            </p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Add your first rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condition</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Applied</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((rule, idx) => (
                  <tr
                    key={rule.id}
                    className={cn("transition-colors hover:bg-muted/30", !rule.isActive && "opacity-50")}
                  >
                    {/* Priority arrows */}
                    <td className="px-2 py-3">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => handlePriorityChange(rule, "up")}
                          disabled={idx === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                          title="Higher priority"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <GripVertical className="w-3 h-3 text-muted-foreground/30" />
                        <button
                          onClick={() => handlePriorityChange(rule, "down")}
                          disabled={idx === sorted.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                          title="Lower priority"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{rule.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Priority {rule.priority}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">{FIELDS[rule.conditionField] ?? rule.conditionField}</span>
                      {" "}
                      <span className="text-foreground font-medium">{OPERATORS[rule.conditionOperator] ?? rule.conditionOperator}</span>
                      {" "}
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
                        {rule.conditionValue}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {rule.transactionType && (
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full border font-medium",
                          TYPE_COLORS[rule.transactionType] ?? "text-muted-foreground bg-muted border-border"
                        )}>
                          {TYPE_LABELS[rule.transactionType] ?? rule.transactionType}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {rule.accountId && accountMap[rule.accountId]
                        ? <span className="text-foreground">{accountMap[rule.accountId]}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {rule.timesApplied > 0 ? (
                        <span className="text-foreground font-medium">{rule.timesApplied}×</span>
                      ) : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className="transition-colors"
                        title={rule.isActive ? "Disable rule" : "Enable rule"}
                      >
                        {rule.isActive
                          ? <ToggleRight className="w-6 h-6 text-primary" />
                          : <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                        }
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(rule)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={deletingId === rule.id}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === rule.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rule tester */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Test a transaction</h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-1">
          Check which rule (if any) would match a given description or amount.
        </p>
        <form onSubmit={handleTest} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <input
              value={testDesc}
              onChange={(e) => setTestDesc(e.target.value)}
              placeholder="e.g. Wex Inc fuel card"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Amount (optional)</label>
            <input
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              placeholder="e.g. 500"
              type="number"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={testing || !testDesc.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            Test
          </button>
        </form>
        {testResult && (
          <div className={cn(
            "flex items-start gap-3 p-3 rounded-lg text-sm border",
            testResult.matched
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-muted border-border text-muted-foreground"
          )}>
            {testResult.matched ? (
              <>
                <Zap className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                <div>
                  <span className="font-medium">Matched: </span>
                  <span className="font-mono">{testResult.rule}</span>
                  {testResult.accountName && (
                    <> → <span className="font-medium">{testResult.accountName}</span></>
                  )}
                </div>
              </>
            ) : (
              <>
                <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>No rule matched this transaction.</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">
                {editingId ? "Edit Rule" : "New Rule"}
              </h2>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{formError}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Rule name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. WEX Fuel Card"
                  required
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Condition</label>
                <div className="flex gap-2">
                  <select
                    value={form.conditionField}
                    onChange={(e) => setForm((f) => ({ ...f, conditionField: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {Object.entries(FIELDS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <select
                    value={form.conditionOperator}
                    onChange={(e) => setForm((f) => ({ ...f, conditionOperator: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {Object.entries(OPERATORS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={form.conditionValue}
                    onChange={(e) => setForm((f) => ({ ...f, conditionValue: e.target.value }))}
                    placeholder="value"
                    required
                    className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Matching is case-insensitive.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Transaction type</label>
                <div className="flex gap-2">
                  {(["debit", "credit", "both"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, transactionType: t }))}
                      className={cn(
                        "flex-1 py-2 rounded-lg border text-sm font-medium transition-colors",
                        form.transactionType === t
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Post to account</label>
                <select
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— No account selected —</option>
                  {(accounts ?? []).map((a: Account) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  min="0"
                  className="w-28 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">Lower number = higher priority (runs first).</p>
              </div>

              <div className="flex gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm text-foreground">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.autoApply}
                    onChange={(e) => setForm((f) => ({ ...f, autoApply: e.target.checked }))}
                    className="w-4 h-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm text-foreground">Auto-apply on import</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? "Save changes" : "Create rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
