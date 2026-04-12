import { useState } from "react";
import {
  useListAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2, ChevronRight, Archive, RotateCcw } from "lucide-react";

interface Props {
  businessId: number;
}

type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const TYPE_COLORS: Record<AccountType, string> = {
  asset: "text-blue-600 bg-blue-50",
  liability: "text-rose-600 bg-rose-50",
  equity: "text-purple-600 bg-purple-50",
  income: "text-emerald-600 bg-emerald-50",
  expense: "text-amber-600 bg-amber-50",
};

interface Account {
  id: number;
  name: string;
  type: string;
  code: string | null;
  parentAccountId: number | null;
  isActive: boolean;
}

export default function AccountsPage({ businessId }: Props) {
  const { data: accounts, isLoading } = useListAccounts(businessId, {
    query: { enabled: !!businessId },
  });
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: "", type: "expense" as AccountType, code: "", parentAccountId: "" });
  const [error, setError] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey(businessId) });
  }

  function resetForm() {
    setForm({ name: "", type: "expense", code: "", parentAccountId: "" });
    setShowForm(false);
    setEditingId(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const data = {
      name: form.name,
      type: form.type,
      code: form.code || null,
      parentAccountId: form.parentAccountId ? Number(form.parentAccountId) : null,
    };
    try {
      if (editingId) {
        await updateAccount.mutateAsync({ businessId, accountId: editingId, data });
      } else {
        await createAccount.mutateAsync({ businessId, data });
      }
      invalidate();
      resetForm();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error saving account");
    }
  }

  async function handleDelete(accountId: number) {
    if (!confirm("Archive this account?")) return;
    await deleteAccount.mutateAsync({ businessId, accountId });
    invalidate();
  }

  async function handleRestore(accountId: number) {
    await updateAccount.mutateAsync({ businessId, accountId, data: { isActive: true } });
    invalidate();
  }

  function startEdit(account: Account) {
    setForm({
      name: account.name,
      type: account.type as AccountType,
      code: account.code ?? "",
      parentAccountId: account.parentAccountId ? String(account.parentAccountId) : "",
    });
    setEditingId(account.id);
    setShowForm(true);
  }

  const activeAccounts = accounts?.filter((a) => a.isActive) ?? [];
  const archivedAccounts = accounts?.filter((a) => !a.isActive) ?? [];

  const grouped = (["asset", "liability", "equity", "income", "expense"] as AccountType[]).map((type) => ({
    type,
    accounts: activeAccounts.filter((a) => a.type === type),
  })).filter((g) => g.accounts.length > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeAccounts.length} active accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Hide" : "Show"} archived ({archivedAccounts.length})
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            <Plus className="w-4 h-4" />
            Add account
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit account" : "New account"}</h3>

          {error && (
            <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Account name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Checking Account"
                required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.entries(TYPE_LABELS)).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Account code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. 1000"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Parent account</label>
              <select
                value={form.parentAccountId}
                onChange={(e) => setForm({ ...form, parentAccountId: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None (top-level)</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ""}{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createAccount.isPending || updateAccount.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {editingId ? "Save changes" : "Create account"}
            </button>
          </div>
        </form>
      )}

      {/* Accounts grouped by type */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ type, accounts: typeAccounts }) => (
            <div key={type} className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${TYPE_COLORS[type]}`}>
                  {TYPE_LABELS[type]}
                </span>
                <span className="text-xs text-muted-foreground">{typeAccounts.length} accounts</span>
              </div>
              <div className="divide-y divide-border">
                {typeAccounts.map((account) => {
                  const parent = accounts?.find((a) => a.id === account.parentAccountId);
                  return (
                    <div key={account.id} className="flex items-center gap-3 px-5 py-3 group">
                      {account.parentAccountId && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {account.code && (
                            <span className="text-xs font-mono text-muted-foreground">{account.code}</span>
                          )}
                          <span className="text-sm font-medium text-foreground">{account.name}</span>
                        </div>
                        {parent && (
                          <div className="text-xs text-muted-foreground mt-0.5">Sub-account of {parent.name}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(account as Account)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(account.id)}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {showArchived && archivedAccounts.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm opacity-60">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground">Archived accounts</span>
              </div>
              <div className="divide-y divide-border">
                {archivedAccounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 px-5 py-3 group">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground line-through">{account.name}</span>
                    </div>
                    <button
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                      onClick={() => handleRestore(account.id)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeAccounts.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No accounts yet. Add your first account to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
