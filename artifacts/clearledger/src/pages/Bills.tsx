import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileCheck, Plus, Pencil, Trash2, Search, Loader2, ArrowLeft,
  ChevronDown, DollarSign, AlertCircle, CheckCircle2, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

interface Props { businessId: number }
interface Vendor { id: number; name: string; paymentTerms: number | null }
interface Account { id: number; name: string; type: string }

interface LineItem {
  id?: number; description: string; quantity: string; rate: string; amount: string;
  accountId?: number | null; jobId?: number | null; sortOrder?: number;
}

interface Payment {
  id: number; billId: number; amount: string; paymentDate: string;
  paymentMethod: string | null; reference: string | null; createdAt: string;
}

interface Bill {
  id: number; businessId: number; vendorId: number | null; vendorName: string | null;
  billNumber: string | null; jobId: number | null; status: string;
  billDate: string | null; dueDate: string | null;
  subtotal: string; taxRate: string; taxAmount: string; total: string;
  amountPaid: string; balanceDue: string; notes: string | null;
  createdAt: string; paidAt: string | null;
  lineItems?: LineItem[]; payments?: Payment[];
}

interface BillsResponse {
  bills: Bill[];
  summary: { totalBills: number; totalBilled: string; totalUnpaid: string; totalOverdue: string; totalPaid: string };
}

const STATUSES: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  unpaid:    { label: "Unpaid",    color: "bg-yellow-100 text-yellow-700", icon: Clock },
  partial:   { label: "Partial",   color: "bg-blue-100 text-blue-700",    icon: DollarSign },
  paid:      { label: "Paid",      color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  overdue:   { label: "Overdue",   color: "bg-red-100 text-red-700",      icon: AlertCircle },
  cancelled: { label: "Cancelled", color: "bg-muted text-muted-foreground", icon: Trash2 },
};

const PAY_METHODS = ["check", "ach", "wire", "cash", "card", "other"];

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers as Record<string, string> ?? {}) },
  });
}

function today() { return new Date().toISOString().split("T")[0]!; }
function n(v: string | null | undefined) { return parseFloat(v || "0"); }

function emptyLine(): LineItem {
  return { description: "", quantity: "1", rate: "0", amount: "0" };
}

function calcLine(li: LineItem): LineItem {
  const amt = (n(li.quantity) * n(li.rate)).toFixed(2);
  return { ...li, amount: amt };
}

function calcTotals(lines: LineItem[], taxRate: string) {
  const subtotal = lines.reduce((s, l) => s + n(l.amount), 0);
  const taxAmount = subtotal * (n(taxRate) / 100);
  const total = subtotal + taxAmount;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
}

const EMPTY_BILL_FORM = {
  vendorId: "" as string | number,
  billNumber: "",
  status: "unpaid",
  billDate: today(),
  dueDate: "",
  taxRate: "0",
  notes: "",
};

type View = "list" | "editor" | "detail";

export default function BillsPage({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [statusDropOpen, setStatusDropOpen] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_BILL_FORM);
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [payForm, setPayForm] = useState({ amount: "", paymentDate: today(), paymentMethod: "check", reference: "" });
  const [deletingPayment, setDeletingPayment] = useState<number | null>(null);

  const { data: billsResponse, isLoading } = useQuery<BillsResponse>({
    queryKey: ["bills", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/bills?businessId=${businessId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const bills = billsResponse?.bills ?? [];
  const summary = billsResponse?.summary;

  const { data: billDetail } = useQuery<Bill>({
    queryKey: ["bills", businessId, detailId],
    queryFn: async () => {
      const res = await authFetch(`/api/bills/${detailId!}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: detailId !== null,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/vendors?businessId=${businessId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((v: { id: number; name: string; paymentTerms: number | null }) => v);
    },
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounts", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/accounts?businessId=${businessId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  // ── computed totals preview in editor
  const { subtotal, taxAmount, total } = calcTotals(lineItems, form.taxRate);

  function openNew() {
    setEditingId(null);
    const num = `BILL-${String(bills.length + 1).padStart(4, "0")}`;
    setForm({ ...EMPTY_BILL_FORM, billNumber: num });
    setLineItems([emptyLine()]);
    setView("editor");
  }

  function openEdit(b: Bill) {
    setEditingId(b.id);
    setDetailId(null);
    setForm({
      vendorId: b.vendorId ?? "", billNumber: b.billNumber ?? "", status: b.status,
      billDate: b.billDate ?? today(), dueDate: b.dueDate ?? "", taxRate: b.taxRate,
      notes: b.notes ?? "",
    });
    setLineItems(b.lineItems?.length ? b.lineItems.map((l) => ({ ...l, quantity: String(l.quantity), rate: String(l.rate), amount: String(l.amount) })) : [emptyLine()]);
    setView("editor");
  }

  function openDetail(b: Bill) {
    setDetailId(b.id);
    setPayForm({ amount: String(n(b.balanceDue) > 0 ? n(b.balanceDue).toFixed(2) : ""), paymentDate: today(), paymentMethod: "check", reference: "" });
    setView("detail");
  }

  function setF(key: keyof typeof EMPTY_BILL_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const val = e.target.value;
      setForm((p) => {
        const next = { ...p, [key]: val };
        // Auto-fill due date when vendor changes
        if (key === "vendorId" && val) {
          const vendor = vendors.find((v) => String(v.id) === val);
          if (vendor?.paymentTerms && p.billDate) {
            const due = new Date(p.billDate);
            due.setDate(due.getDate() + vendor.paymentTerms);
            next.dueDate = due.toISOString().split("T")[0]!;
          }
        }
        return next;
      });
    };
  }

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLineItems((prev) => {
      const updated = [...prev];
      const line = { ...updated[idx]!, [field]: value };
      if (field === "quantity" || field === "rate") {
        updated[idx] = calcLine(line);
      } else {
        updated[idx] = line;
      }
      return updated;
    });
  }

  function addLine() { setLineItems((p) => [...p, emptyLine()]); }
  function removeLine(idx: number) { setLineItems((p) => p.filter((_, i) => i !== idx)); }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/bills/${editingId}` : `/api/bills`;
      const method = editingId ? "PATCH" : "POST";
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...form, businessId,
          vendorId: form.vendorId ? Number(form.vendorId) : null,
          billDate: form.billDate || null, dueDate: form.dueDate || null,
          notes: form.notes || null, lineItems,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      return res.json();
    },
    onSuccess: (bill: Bill) => {
      qc.invalidateQueries({ queryKey: ["bills", businessId] });
      setDetailId(bill.id);
      setView("detail");
      toast({ title: editingId ? "Bill updated" : "Bill created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/bills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills", businessId] });
      setDeleting(null);
      toast({ title: "Bill deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await authFetch(`/api/bills/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bills", businessId] }); setStatusDropOpen(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/bills/${detailId!}/payments`, {
        method: "POST",
        body: JSON.stringify({ ...payForm, reference: payForm.reference || null }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills", businessId, detailId] });
      qc.invalidateQueries({ queryKey: ["bills", businessId] });
      setPayForm({ amount: "", paymentDate: today(), paymentMethod: "check", reference: "" });
      toast({ title: "Payment recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await authFetch(`/api/bills/${detailId!}/payments/${paymentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills", businessId, detailId] });
      qc.invalidateQueries({ queryKey: ["bills", businessId] });
      setDeletingPayment(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = bills.filter((b) => {
    const match = (b.billNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.vendorName ?? "").toLowerCase().includes(search.toLowerCase());
    return match && (statusFilter === "all" || b.status === statusFilter);
  });

  // ── DETAIL ───────────────────────────────────────────────────────────────────
  if (view === "detail" && billDetail) {
    const st = STATUSES[billDetail.status] ?? STATUSES.unpaid!;
    const payments = billDetail.payments ?? [];
    const lineItems = billDetail.lineItems ?? [];
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{billDetail.billNumber ?? "Bill"}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
            </div>
            {billDetail.vendorName && <p className="text-sm text-muted-foreground mt-0.5">{billDetail.vendorName}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => openEdit(billDetail)} className="gap-1.5"><Pencil className="w-3.5 h-3.5" />Edit</Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Subtotal", value: formatCurrency(n(billDetail.subtotal)) },
            { label: `Tax (${n(billDetail.taxRate).toFixed(2)}%)`, value: formatCurrency(n(billDetail.taxAmount)) },
            { label: "Total", value: formatCurrency(n(billDetail.total)), bold: true },
            { label: "Balance Due", value: formatCurrency(n(billDetail.balanceDue)), color: n(billDetail.balanceDue) > 0 ? "text-destructive" : "text-green-600" },
          ].map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              <p className={`text-lg ${c.bold ? "font-bold" : "font-medium"} ${c.color ?? "text-foreground"}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Dates */}
        <div className="bg-card border border-border rounded-xl p-4 mb-5 flex flex-wrap gap-6 text-sm">
          {billDetail.billDate && <div><span className="text-muted-foreground">Bill Date: </span><span className="font-medium">{billDetail.billDate}</span></div>}
          {billDetail.dueDate && <div><span className="text-muted-foreground">Due Date: </span><span className={`font-medium ${billDetail.status === "overdue" ? "text-destructive" : ""}`}>{billDetail.dueDate}</span></div>}
          {billDetail.paidAt && <div><span className="text-muted-foreground">Paid: </span><span className="font-medium text-green-600">{new Date(billDetail.paidAt).toLocaleDateString()}</span></div>}
        </div>

        {/* Line items */}
        {lineItems.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Line Items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-16">Qty</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-24">Rate</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{li.description}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{n(li.quantity).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatCurrency(n(li.rate))}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(n(li.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Subtotal</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(n(billDetail.subtotal))}</td>
                </tr>
                {n(billDetail.taxAmount) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Tax ({n(billDetail.taxRate).toFixed(2)}%)</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(n(billDetail.taxAmount))}</td>
                  </tr>
                )}
                <tr className="border-t border-border bg-muted/10">
                  <td colSpan={3} className="px-4 py-2.5 text-right font-bold">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-lg">{formatCurrency(n(billDetail.total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Payments */}
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4" />Payments</h2>
            <span className="text-xs text-muted-foreground">{formatCurrency(n(billDetail.amountPaid))} paid · {formatCurrency(n(billDetail.balanceDue))} due</span>
          </div>
          {payments.length > 0 && (
            <div className="space-y-1 mb-4">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors group">
                  <div className="flex-1">
                    <span className="text-sm font-medium">{formatCurrency(n(p.amount))}</span>
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{p.paymentMethod?.replace("_", " ")}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{p.paymentDate}</span>
                    {p.reference && <span className="ml-2 text-xs text-muted-foreground">ref: {p.reference}</span>}
                  </div>
                  {deletingPayment === p.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deletePaymentMutation.mutate(p.id)} className="px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded">
                        {deletePaymentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                      </button>
                      <button onClick={() => setDeletingPayment(null)} className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-muted">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingPayment(p.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {billDetail.status !== "paid" && billDetail.status !== "cancelled" && (
            <form onSubmit={(e) => { e.preventDefault(); addPaymentMutation.mutate(); }} className="grid grid-cols-[100px_130px_100px_1fr_auto] gap-2 items-center">
              <Input type="number" min="0.01" step="0.01" placeholder="Amount" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} className="text-sm" required />
              <Input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm((p) => ({ ...p, paymentDate: e.target.value }))} className="text-sm" />
              <select value={payForm.paymentMethod} onChange={(e) => setPayForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring capitalize">
                {PAY_METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
              <Input placeholder="Reference" value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} className="text-sm" />
              <Button type="submit" size="sm" className="gap-1.5" disabled={addPaymentMutation.isPending}>
                {addPaymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" />Record</>}
              </Button>
            </form>
          )}
        </div>

        {billDetail.notes && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1 font-medium">NOTES</p>
            <p className="text-sm text-foreground">{billDetail.notes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── EDITOR ───────────────────────────────────────────────────────────────────
  if (view === "editor") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-bold text-foreground">{editingId ? "Edit Bill" : "New Bill"}</h1>
        </div>
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Bill Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Vendor</Label>
                <select value={String(form.vendorId)} onChange={setF("vendorId")}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— Select vendor —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div><Label>Bill #</Label><Input className="mt-1" value={form.billNumber} onChange={setF("billNumber")} /></div>
              <div>
                <Label>Status</Label>
                <select value={form.status} onChange={setF("status")}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><Label>Bill Date</Label><Input type="date" className="mt-1" value={form.billDate} onChange={setF("billDate")} /></div>
              <div><Label>Due Date</Label><Input type="date" className="mt-1" value={form.dueDate} onChange={setF("dueDate")} /></div>
              <div><Label>Tax Rate (%)</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.taxRate} onChange={setF("taxRate")} /></div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Line Items</h2>
              <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add Line</Button>
            </div>
            <div className="p-4 space-y-2">
              <div className="grid grid-cols-[1fr_60px_90px_90px_28px] gap-2 text-xs text-muted-foreground px-1">
                <span>Description</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span><span />
              </div>
              {lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_60px_90px_90px_28px] gap-2 items-center">
                  <Input value={li.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="Description" className="text-sm" />
                  <Input type="number" min="0" step="any" value={li.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} className="text-sm text-right" />
                  <Input type="number" min="0" step="0.01" value={li.rate} onChange={(e) => updateLine(idx, "rate", e.target.value)} className="text-sm text-right" />
                  <div className="h-9 flex items-center justify-end px-3 bg-muted/40 rounded-md text-sm font-medium">{formatCurrency(n(li.amount))}</div>
                  <button onClick={() => removeLine(idx)} disabled={lineItems.length === 1} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {/* Expense account selector per line (compact) */}
              {expenseAccounts.length > 0 && lineItems.map((li, idx) => (
                <div key={`acct-${idx}`} className="grid grid-cols-[1fr_28px] gap-2 -mt-0.5">
                  <select value={String(li.accountId ?? "")} onChange={(e) => updateLine(idx, "accountId", e.target.value)}
                    className="h-7 px-2 rounded-md border border-input bg-background text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">— Expense account —</option>
                    {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <span />
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="border-t border-border px-5 py-4 space-y-1.5 bg-muted/10">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(n(subtotal))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({n(form.taxRate).toFixed(2)}%)</span>
                <span className="font-medium">{formatCurrency(n(taxAmount))}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-1.5">
                <span>Total</span>
                <span>{formatCurrency(n(total))}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-5">
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={setF("notes")} rows={3} placeholder="Terms, reference numbers, instructions…"
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {editingId ? "Update Bill" : "Create Bill"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bills</h1>
            <p className="text-sm text-muted-foreground">Accounts Payable · {bills.length} total</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />New Bill</Button>
      </div>

      {summary && bills.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Billed</p>
            <p className="text-lg font-bold">{formatCurrency(n(summary.totalBilled))}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
            <p className={`text-lg font-bold ${n(summary.totalUnpaid) > 0 ? "text-yellow-600" : "text-foreground"}`}>{formatCurrency(n(summary.totalUnpaid))}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Overdue</p>
            <p className={`text-lg font-bold ${n(summary.totalOverdue) > 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(n(summary.totalOverdue))}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Paid</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(n(summary.totalPaid))}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search bills or vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All statuses</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search || statusFilter !== "all" ? "No bills match your filters" : "No bills yet"}</p>
          {!search && statusFilter === "all" && <p className="text-sm mt-1">Record your first vendor bill to track accounts payable</p>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bill #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Vendor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Bill Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Due Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const st = STATUSES[b.status] ?? STATUSES.unpaid!;
                return (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDetail(b)}>
                    <td className="px-4 py-3 font-medium">{b.billNumber ?? `#${b.id}`}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{b.vendorName ?? "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{b.billDate ?? "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={b.status === "overdue" ? "text-destructive font-medium" : "text-muted-foreground"}>{b.dueDate ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(n(b.total))}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground">{formatCurrency(n(b.amountPaid))}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${n(b.balanceDue) > 0 ? "text-destructive" : "text-green-600"}`}>{formatCurrency(n(b.balanceDue))}</span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <button onClick={() => setStatusDropOpen(statusDropOpen === b.id ? null : b.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}<ChevronDown className="w-3 h-3" />
                        </button>
                        {statusDropOpen === b.id && (
                          <div className="absolute z-50 mt-1 bg-card border border-border rounded-lg shadow-xl min-w-[130px]">
                            {Object.entries(STATUSES).map(([key, val]) => (
                              <button key={key} onClick={() => statusMutation.mutate({ id: b.id, status: key })}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${b.status === key ? "font-bold" : ""}`}>
                                {val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(b)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        {deleting === b.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteMutation.mutate(b.id)} className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded">
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                            </button>
                            <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleting(b.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
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
    </div>
  );
}
