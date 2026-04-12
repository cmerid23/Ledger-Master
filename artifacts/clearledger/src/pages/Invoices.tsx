import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Pencil, Trash2, Search, X, Loader2, ArrowLeft,
  Send, DollarSign, ChevronDown, RotateCcw, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

interface Props { businessId: number }

interface Customer { id: number; name: string; email: string | null; paymentTerms: number }
interface LineItem { id?: number; description: string; quantity: string; unit: string; rate: string; amount: string; sortOrder: number }
interface Payment { id: number; amount: string; paymentDate: string; paymentMethod: string | null; reference: string | null; notes: string | null }

interface Invoice {
  id: number;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  customerId: number | null;
  customerName: string | null;
  isRecurring: boolean;
  recurringInterval: string | null;
  lineItems?: LineItem[];
  payments?: Payment[];
  createdAt: string;
}

const STATUSES: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-muted text-muted-foreground" },
  sent:      { label: "Sent",      color: "bg-blue-100 text-blue-700" },
  viewed:    { label: "Viewed",    color: "bg-purple-100 text-purple-700" },
  partial:   { label: "Partial",   color: "bg-yellow-100 text-yellow-700" },
  paid:      { label: "Paid",      color: "bg-green-100 text-green-700" },
  overdue:   { label: "Overdue",   color: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
};

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers },
  });
}

function today() { return new Date().toISOString().split("T")[0]!; }
function addDays(d: string, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0]!;
}

const EMPTY_LINE: LineItem = { description: "", quantity: "1", unit: "", rate: "0", amount: "0", sortOrder: 0 };

type View = "list" | "editor";

export default function InvoicesPage({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [paymentOpen, setPaymentOpen] = useState<number | null>(null);
  const [statusDropOpen, setStatusDropOpen] = useState<number | null>(null);

  // Invoice form
  const [form, setForm] = useState({
    invoiceNumber: "", customerId: "" as string | number,
    issueDate: today(), dueDate: addDays(today(), 30),
    taxRate: "0", discountAmount: "0",
    currency: "USD", notes: "", terms: "",
    isRecurring: false, recurringInterval: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [payForm, setPayForm] = useState({ amount: "", paymentDate: today(), paymentMethod: "bank transfer", reference: "", notes: "" });

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/businesses/${businessId}/invoices`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/businesses/${businessId}/customers`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: editingInvoice } = useQuery<Invoice>({
    queryKey: ["invoice", businessId, editingId],
    queryFn: async () => {
      const res = await authFetch(`/api/businesses/${businessId}/invoices/${editingId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!editingId,
  });

  // Populate form when editing invoice loads
  const initEdit = useCallback((inv: Invoice) => {
    setForm({
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId ?? "",
      issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? "",
      taxRate: inv.taxRate,
      discountAmount: inv.discountAmount,
      currency: inv.currency,
      notes: inv.notes ?? "",
      terms: inv.terms ?? "",
      isRecurring: inv.isRecurring,
      recurringInterval: inv.recurringInterval ?? "",
    });
    setLineItems(inv.lineItems && inv.lineItems.length > 0
      ? inv.lineItems.map(li => ({ ...li, quantity: String(li.quantity), rate: String(li.rate), amount: String(li.amount), unit: li.unit ?? "" }))
      : [{ ...EMPTY_LINE }]
    );
  }, []);

  function openNew() {
    setEditingId(null);
    const num = `INV-${String(invoices.length + 1).padStart(4, "0")}`;
    setForm({ invoiceNumber: num, customerId: "", issueDate: today(), dueDate: addDays(today(), 30), taxRate: "0", discountAmount: "0", currency: "USD", notes: "", terms: "", isRecurring: false, recurringInterval: "" });
    setLineItems([{ ...EMPTY_LINE }]);
    setView("editor");
  }

  function openEdit(inv: Invoice) {
    setEditingId(inv.id);
    initEdit(inv);
    setView("editor");
  }

  // Recompute line item amount when qty/rate change
  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLineItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, [field]: value };
      if (field === "quantity" || field === "rate") {
        const q = parseFloat(next[idx]!.quantity) || 0;
        const r = parseFloat(next[idx]!.rate) || 0;
        next[idx]!.amount = (q * r).toFixed(2);
      }
      return next;
    });
  }

  function addLine() { setLineItems((p) => [...p, { ...EMPTY_LINE, sortOrder: p.length }]); }
  function removeLine(i: number) { setLineItems((p) => p.filter((_, j) => j !== i)); }

  const subtotal = lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
  const taxAmt = subtotal * ((parseFloat(form.taxRate) || 0) / 100);
  const discount = parseFloat(form.discountAmount) || 0;
  const total = subtotal + taxAmt - discount;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId
        ? `/api/businesses/${businessId}/invoices/${editingId}`
        : `/api/businesses/${businessId}/invoices`;
      const payload = { ...form, customerId: form.customerId ? Number(form.customerId) : null, lineItems };
      const res = await authFetch(url, { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", businessId] });
      if (editingId) qc.invalidateQueries({ queryKey: ["invoice", businessId, editingId] });
      setView("list");
      toast({ title: editingId ? "Invoice updated" : "Invoice created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/businesses/${businessId}/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", businessId] });
      setDeleting(null);
      toast({ title: "Invoice deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await authFetch(`/api/businesses/${businessId}/invoices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", businessId] });
      setStatusDropOpen(null);
      toast({ title: "Status updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const paymentMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await authFetch(`/api/businesses/${businessId}/invoices/${invoiceId}/payments`, {
        method: "POST", body: JSON.stringify(payForm),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", businessId] });
      setPaymentOpen(null);
      setPayForm({ amount: "", paymentDate: today(), paymentMethod: "bank transfer", reference: "", notes: "" });
      toast({ title: "Payment recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = invoices.filter((inv) =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customerName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (view === "editor") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">
            {editingId ? `Edit Invoice` : "New Invoice"}
          </h1>
        </div>

        <div className="space-y-6">
          {/* Meta */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Invoice Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Invoice #</Label>
                <Input className="mt-1" value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} required />
              </div>
              <div>
                <Label>Customer</Label>
                <select
                  value={String(form.customerId)}
                  onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— No customer —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Currency</Label>
                <Input className="mt-1" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} />
              </div>
              <div>
                <Label>Issue Date</Label>
                <Input type="date" className="mt-1" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" className="mt-1" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Line Items</h2>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[1fr_80px_80px_100px_100px_32px] gap-2 text-xs text-muted-foreground font-medium px-1">
                <span>Description</span><span>Qty</span><span>Unit</span><span>Rate</span><span className="text-right">Amount</span><span />
              </div>
              {lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_100px_100px_32px] gap-2 items-center">
                  <Input placeholder="Description" value={li.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="text-sm" />
                  <Input placeholder="1" value={li.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} className="text-sm" type="number" min="0" step="any" />
                  <Input placeholder="hr" value={li.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} className="text-sm" />
                  <Input placeholder="0.00" value={li.rate} onChange={(e) => updateLine(i, "rate", e.target.value)} className="text-sm" type="number" min="0" step="any" />
                  <div className="text-sm text-right font-medium text-foreground pr-1">
                    {formatCurrency(parseFloat(li.amount) || 0)}
                  </div>
                  <button onClick={() => removeLine(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addLine} className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add line
            </button>

            {/* Totals */}
            <div className="mt-5 flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-muted-foreground">Tax (%)</span>
                  <Input type="number" min="0" max="100" step="0.01" value={form.taxRate}
                    onChange={(e) => setForm((p) => ({ ...p, taxRate: e.target.value }))}
                    className="w-24 h-7 text-sm text-right" />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-muted-foreground">Discount ($)</span>
                  <Input type="number" min="0" step="0.01" value={form.discountAmount}
                    onChange={(e) => setForm((p) => ({ ...p, discountAmount: e.target.value }))}
                    className="w-24 h-7 text-sm text-right" />
                </div>
                <div className="flex justify-between font-bold text-foreground border-t border-border pt-2 text-base">
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Notes (visible to customer)</Label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3} className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Thank you for your business!" />
              </div>
              <div>
                <Label>Terms</Label>
                <textarea value={form.terms} onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))}
                  rows={3} className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Payment due within 30 days…" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editingId ? "Update Invoice" : "Create Invoice"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
            <p className="text-sm text-muted-foreground">{invoices.length} total</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> New Invoice</Button>
      </div>

      {/* Summary cards */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Outstanding", value: invoices.filter(i => ["sent","viewed","partial","overdue"].includes(i.status)).reduce((s, i) => s + parseFloat(i.balanceDue), 0), color: "text-foreground" },
            { label: "Overdue", value: invoices.filter(i => i.status === "overdue").reduce((s, i) => s + parseFloat(i.balanceDue), 0), color: "text-destructive" },
            { label: "Paid (All Time)", value: invoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.total), 0), color: "text-green-600" },
            { label: "Drafts", value: invoices.filter(i => i.status === "draft").length, color: "text-muted-foreground", isCount: true },
          ].map((card) => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
              <p className={`text-lg font-bold ${card.color}`}>
                {card.isCount ? card.value : formatCurrency(card.value as number)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by invoice # or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "No invoices match" : "No invoices yet"}</p>
          {!search && <p className="text-sm mt-1">Create your first invoice to get started</p>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Issue Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Due</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const st = STATUSES[inv.status] ?? STATUSES.draft!;
                return (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{inv.customerName ?? "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{inv.issueDate}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{inv.dueDate ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(parseFloat(inv.total))}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {parseFloat(inv.balanceDue) > 0
                        ? <span className="text-destructive font-medium">{formatCurrency(parseFloat(inv.balanceDue))}</span>
                        : <span className="text-green-600 font-medium">Paid</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          onClick={() => setStatusDropOpen(statusDropOpen === inv.id ? null : inv.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}
                        >
                          {st.label}<ChevronDown className="w-3 h-3" />
                        </button>
                        {statusDropOpen === inv.id && (
                          <div className="absolute z-50 mt-1 bg-card border border-border rounded-lg shadow-xl min-w-[140px]">
                            {Object.entries(STATUSES).map(([key, val]) => (
                              <button key={key} onClick={() => statusMutation.mutate({ id: inv.id, status: key })}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${inv.status === key ? "font-bold" : ""}`}>
                                {val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {inv.status !== "paid" && inv.status !== "cancelled" && (
                          <button title="Record payment" onClick={() => { setPaymentOpen(inv.id); setPayForm({ amount: inv.balanceDue, paymentDate: today(), paymentMethod: "bank transfer", reference: "", notes: "" }); }}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-green-600">
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button title="Edit" onClick={() => openEdit(inv)}
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {deleting === inv.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteMutation.mutate(inv.id)} className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded hover:opacity-90">
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                            </button>
                            <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleting(inv.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentOpen !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Record Payment</h2>
              <button onClick={() => setPaymentOpen(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); paymentMutation.mutate(paymentOpen); }} className="p-5 space-y-4">
              <div>
                <Label>Amount</Label>
                <Input type="number" min="0.01" step="0.01" className="mt-1" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" className="mt-1" value={payForm.paymentDate} onChange={(e) => setPayForm((p) => ({ ...p, paymentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Method</Label>
                <select value={payForm.paymentMethod} onChange={(e) => setPayForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {["cash", "check", "bank transfer", "card"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <Label>Reference</Label>
                <Input className="mt-1" placeholder="Cheque #, transaction ref…" value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setPaymentOpen(null)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={paymentMutation.isPending}>
                  {paymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
