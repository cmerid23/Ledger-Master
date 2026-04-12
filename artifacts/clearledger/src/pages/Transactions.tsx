import { useState, useEffect } from "react";
import {
  useListTransactions,
  useCreateTransaction,
  useDeleteTransaction,
  useBulkCategorizeTransactions,
  useListAccounts,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, today } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import {
  Plus,
  Trash2,
  Tag,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Paperclip,
} from "lucide-react";
import ReceiptDrawer, { type DrawerTransaction } from "@/components/ReceiptDrawer";

interface Props {
  businessId: number;
}

interface ReceiptRecord {
  id: number;
  transactionId: number | null;
}

export default function TransactionsPage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterReconciled, setFilterReconciled] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: today(), description: "", amount: "", type: "debit", accountId: "" });
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [error, setError] = useState("");

  // Receipt drawer state
  const [drawerTx, setDrawerTx] = useState<DrawerTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [receiptCounts, setReceiptCounts] = useState<Map<number, number>>(new Map());

  const limit = 25;

  const { data, isLoading } = useListTransactions(
    businessId,
    {
      accountId: filterAccount ? Number(filterAccount) : undefined,
      reconciled: filterReconciled === "" ? undefined : filterReconciled === "true",
      search: search || undefined,
      page,
      limit,
    },
    { query: { enabled: !!businessId } }
  );

  const { data: accounts } = useListAccounts(businessId, { query: { enabled: !!businessId } });
  const createTransaction = useCreateTransaction();
  const deleteTransaction = useDeleteTransaction();
  const bulkCategorize = useBulkCategorizeTransactions();

  // Load receipt counts for the business
  useEffect(() => {
    if (!businessId) return;
    const token = getToken();
    fetch(`/api/businesses/${businessId}/receipts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: ReceiptRecord[]) => {
        if (!Array.isArray(data)) return;
        const counts = new Map<number, number>();
        data.forEach((r) => {
          if (r.transactionId != null) {
            counts.set(r.transactionId, (counts.get(r.transactionId) ?? 0) + 1);
          }
        });
        setReceiptCounts(counts);
      })
      .catch(() => {});
  }, [businessId]);

  function handleReceiptsLoaded(transactionId: number, count: number) {
    setReceiptCounts((prev) => {
      const next = new Map(prev);
      next.set(transactionId, count);
      return next;
    });
  }

  function openDrawer(tx: DrawerTransaction) {
    setDrawerTx(tx);
    setDrawerOpen(true);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey(businessId) });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createTransaction.mutateAsync({
        businessId,
        data: {
          date: form.date,
          description: form.description,
          amount: parseFloat(form.amount),
          type: form.type as "debit" | "credit",
          accountId: form.accountId ? Number(form.accountId) : null,
          source: "manual",
        },
      });
      invalidate();
      setShowForm(false);
      setForm({ date: today(), description: "", amount: "", type: "debit", accountId: "" });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error creating transaction");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this transaction?")) return;
    await deleteTransaction.mutateAsync({ businessId, transactionId: id });
    invalidate();
  }

  async function handleBulkCategorize() {
    if (!bulkAccountId || selected.length === 0) return;
    await bulkCategorize.mutateAsync({
      businessId,
      data: { transactionIds: selected, accountId: Number(bulkAccountId) },
    });
    setSelected([]);
    setBulkAccountId("");
    invalidate();
  }

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  function toggleSelect(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{total} total transactions</p>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-4 h-4" />
            Add transaction
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-foreground text-sm">New transaction</h3>
            {error && <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground mb-1">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="e.g. Office rent"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Amount</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="0.00"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="debit">Debit (expense)</option>
                  <option value="credit">Credit (income)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Account</label>
                <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Uncategorized</option>
                  {accounts?.filter((a) => a.isActive).map((a) => (
                    <option key={a.id} value={a.id}>{a.code ? `${a.code} - ` : ""}{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={createTransaction.isPending}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                {createTransaction.isPending ? "Adding..." : "Add transaction"}
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search transactions..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select value={filterAccount} onChange={(e) => { setFilterAccount(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All accounts</option>
            {accounts?.filter((a) => a.isActive).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All types</option>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
          <select value={filterReconciled} onChange={(e) => { setFilterReconciled(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All statuses</option>
            <option value="true">Reconciled</option>
            <option value="false">Unreconciled</option>
          </select>
        </div>

        {/* Bulk actions */}
        {selected.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium text-foreground">{selected.length} selected</span>
            <select value={bulkAccountId} onChange={(e) => setBulkAccountId(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Assign account...</option>
              {accounts?.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkCategorize}
              disabled={!bulkAccountId || bulkCategorize.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Tag className="w-3.5 h-3.5" />
              Categorize
            </button>
            <button onClick={() => setSelected([])} className="text-sm text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No transactions found.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.length === transactions.length && transactions.length > 0}
                      onChange={(e) => setSelected(e.target.checked ? transactions.map((t) => t.id) : [])}
                      className="rounded border-input"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase w-10" title="Receipts">
                    <Paperclip className="w-3.5 h-3.5 mx-auto" />
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.map((tx) => {
                  const receiptCount = receiptCounts.get(tx.id) ?? 0;
                  const hasReceipts = receiptCount > 0;
                  const drawerTxData: DrawerTransaction = {
                    id: tx.id,
                    date: tx.date,
                    description: tx.description,
                    amount: tx.amount,
                    type: tx.type as "debit" | "credit",
                    accountName: tx.accountName,
                  };

                  return (
                    <tr
                      key={tx.id}
                      className={`group hover:bg-muted/30 transition-colors ${selected.includes(tx.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.includes(tx.id)} onChange={() => toggleSelect(tx.id)} className="rounded border-input" />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === "credit" ? "bg-emerald-50" : "bg-rose-50"}`}>
                            {tx.type === "credit" ? <ArrowUpRight className="w-3 h-3 text-emerald-600" /> : <ArrowDownRight className="w-3 h-3 text-rose-600" />}
                          </div>
                          <span className="text-sm text-foreground truncate max-w-xs">{tx.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {tx.accountName ?? <span className="italic text-muted-foreground/60">Uncategorized</span>}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${tx.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                        {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tx.reconciled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                          {tx.reconciled ? "Reconciled" : "Pending"}
                        </span>
                      </td>

                      {/* Receipt paperclip badge */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openDrawer(drawerTxData)}
                          title={hasReceipts ? `${receiptCount} receipt${receiptCount > 1 ? "s" : ""} attached` : "Attach receipt"}
                          className="relative inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-muted"
                        >
                          <Paperclip className={`w-3.5 h-3.5 transition-colors ${
                            hasReceipts
                              ? "text-emerald-600"
                              : "text-muted-foreground/40 group-hover:text-muted-foreground"
                          }`} />
                          {hasReceipts && receiptCount > 1 && (
                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                              {receiptCount > 9 ? "9+" : receiptCount}
                            </span>
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 text-sm text-foreground">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Drawer */}
      <ReceiptDrawer
        transaction={drawerTx}
        businessId={businessId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onReceiptsLoaded={handleReceiptsLoaded}
      />
    </>
  );
}
