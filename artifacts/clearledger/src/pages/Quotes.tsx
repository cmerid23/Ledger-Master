import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Plus, Pencil, Trash2, Search, X, Loader2, ArrowLeft,
  ArrowRightLeft, ChevronDown, Send, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

interface Props { businessId: number }
interface Customer { id: number; name: string }
interface LineItem { id?: number; description: string; quantity: string; unit: string; rate: string; amount: string; sortOrder: number }
interface Quote {
  id: number;
  quoteNumber: string;
  status: string;
  issueDate: string;
  expiryDate: string | null;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  terms: string | null;
  customerId: number | null;
  customerName: string | null;
  convertedToInvoiceId: number | null;
  lineItems?: LineItem[];
  createdAt: string;
}

const STATUSES: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-muted text-muted-foreground" },
  sent:      { label: "Sent",      color: "bg-blue-100 text-blue-700" },
  accepted:  { label: "Accepted",  color: "bg-green-100 text-green-700" },
  declined:  { label: "Declined",  color: "bg-red-100 text-red-700" },
  expired:   { label: "Expired",   color: "bg-orange-100 text-orange-700" },
  converted: { label: "Converted", color: "bg-purple-100 text-purple-700" },
};

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers as Record<string, string> ?? {}) },
  });
}

function today() { return new Date().toISOString().split("T")[0]!; }
function addDays(d: string, n: number) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().split("T")[0]!; }
const EMPTY_LINE: LineItem = { description: "", quantity: "1", unit: "", rate: "0", amount: "0", sortOrder: 0 };
type View = "list" | "editor";

export default function QuotesPage({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [statusDropOpen, setStatusDropOpen] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    quoteNumber: "", customerId: "" as string | number,
    issueDate: today(), expiryDate: addDays(today(), 30),
    taxRate: "0", notes: "", terms: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["quotes", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/quotes?businessId=${businessId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/customers?businessId=${businessId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  function openNew() {
    setEditingId(null);
    const num = `QUO-${String(quotes.length + 1).padStart(4, "0")}`;
    setForm({ quoteNumber: num, customerId: "", issueDate: today(), expiryDate: addDays(today(), 30), taxRate: "0", notes: "", terms: "" });
    setLineItems([{ ...EMPTY_LINE }]);
    setView("editor");
  }

  function openEdit(q: Quote) {
    setEditingId(q.id);
    setForm({ quoteNumber: q.quoteNumber, customerId: q.customerId ?? "", issueDate: q.issueDate, expiryDate: q.expiryDate ?? "", taxRate: q.taxRate, notes: q.notes ?? "", terms: q.terms ?? "" });
    setLineItems(q.lineItems && q.lineItems.length > 0
      ? q.lineItems.map(li => ({ ...li, quantity: String(li.quantity), rate: String(li.rate), amount: String(li.amount), unit: li.unit ?? "" }))
      : [{ ...EMPTY_LINE }]
    );
    setView("editor");
  }

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLineItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, [field]: value };
      if (field === "quantity" || field === "rate") {
        next[idx]!.amount = ((parseFloat(next[idx]!.quantity) || 0) * (parseFloat(next[idx]!.rate) || 0)).toFixed(2);
      }
      return next;
    });
  }
  function addLine() { setLineItems((p) => [...p, { ...EMPTY_LINE, sortOrder: p.length }]); }
  function removeLine(i: number) { setLineItems((p) => p.filter((_, j) => j !== i)); }

  const subtotal = lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
  const taxAmt = subtotal * ((parseFloat(form.taxRate) || 0) / 100);
  const total = subtotal + taxAmt;

  const saveMutation = useMutation({
    mutationFn: async () => {
      let url: string;
      let method: string;
      if (editingId) { url = `/api/quotes/${editingId}`; method = "PATCH"; }
      else { url = `/api/quotes`; method = "POST"; }
      const payload = { ...form, businessId, customerId: form.customerId ? Number(form.customerId) : null, lineItems };
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes", businessId] });
      setView("list");
      toast({ title: editingId ? "Quote updated" : "Quote created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/quotes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes", businessId] });
      setDeleting(null);
      toast({ title: "Quote deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await authFetch(`/api/quotes/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes", businessId] });
      setStatusDropOpen(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleSend(q: Quote) {
    setSendingId(q.id);
    try {
      const res = await authFetch(`/api/quotes/${q.id}/send`, { method: "POST" });
      const data = await res.json() as { emailSent?: boolean; emailTo?: string | null };
      qc.invalidateQueries({ queryKey: ["quotes", businessId] });
      toast({ title: "Quote sent", description: data.emailSent ? `Email sent to ${data.emailTo}` : "Marked as sent" });
    } catch {
      toast({ title: "Error", description: "Failed to send", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  }

  async function handleAccept(q: Quote) {
    setAcceptingId(q.id);
    try {
      const res = await authFetch(`/api/quotes/${q.id}/accept`, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      qc.invalidateQueries({ queryKey: ["quotes", businessId] });
      toast({ title: "Quote accepted" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleConvert(q: Quote) {
    setConvertingId(q.id);
    try {
      const res = await authFetch(`/api/quotes/${q.id}/convert`, { method: "POST" });
      const data = await res.json() as { invoiceNumber?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      qc.invalidateQueries({ queryKey: ["quotes", businessId] });
      qc.invalidateQueries({ queryKey: ["invoices", businessId] });
      toast({ title: `Invoice ${data.invoiceNumber} created`, description: "Quote converted to invoice" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setConvertingId(null);
    }
  }

  const filtered = quotes.filter((q) =>
    q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
    (q.customerName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ── EDITOR VIEW ──────────────────────────────────────────────────────────────
  if (view === "editor") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-bold text-foreground">{editingId ? "Edit Quote" : "New Quote"}</h1>
        </div>
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Quote Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><Label>Quote #</Label><Input className="mt-1" value={form.quoteNumber} onChange={(e) => setForm((p) => ({ ...p, quoteNumber: e.target.value }))} required /></div>
              <div>
                <Label>Customer</Label>
                <select value={String(form.customerId)} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— No customer —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><Label>Issue Date</Label><Input type="date" className="mt-1" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} /></div>
              <div><Label>Expiry Date</Label><Input type="date" className="mt-1" value={form.expiryDate} onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))} /></div>
              <div><Label>Tax Rate (%)</Label><Input type="number" min="0" max="100" step="0.01" className="mt-1" value={form.taxRate} onChange={(e) => setForm((p) => ({ ...p, taxRate: e.target.value }))} /></div>
            </div>
          </div>

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
                  <div className="text-sm text-right font-medium text-foreground pr-1">{formatCurrency(parseFloat(li.amount) || 0)}</div>
                  <button onClick={() => removeLine(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <button onClick={addLine} className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add line</button>
            <div className="mt-5 flex justify-end">
              <div className="w-56 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax ({form.taxRate}%)</span><span>{formatCurrency(taxAmt)}</span></div>
                <div className="flex justify-between font-bold text-foreground border-t border-border pt-2 text-base"><span>Total</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Notes</Label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" /></div>
              <div><Label>Terms</Label><textarea value={form.terms} onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" /></div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {editingId ? "Update Quote" : "Create Quote"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quotes</h1>
            <p className="text-sm text-muted-foreground">{quotes.length} total</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> New Quote</Button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by quote # or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "No quotes match" : "No quotes yet"}</p>
          {!search && <p className="text-sm mt-1">Send your first quote to a customer</p>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Quote #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Issue Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Expires</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => {
                const st = STATUSES[q.status] ?? STATUSES.draft!;
                return (
                  <tr key={q.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{q.quoteNumber}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{q.customerName ?? "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{q.issueDate}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{q.expiryDate ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(parseFloat(q.total))}</td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button onClick={() => setStatusDropOpen(statusDropOpen === q.id ? null : q.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}<ChevronDown className="w-3 h-3" />
                        </button>
                        {statusDropOpen === q.id && (
                          <div className="absolute z-50 mt-1 bg-card border border-border rounded-lg shadow-xl min-w-[140px]">
                            {Object.entries(STATUSES).map(([key, val]) => (
                              <button key={key} onClick={() => statusMutation.mutate({ id: q.id, status: key })}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${q.status === key ? "font-bold" : ""}`}>
                                {val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        {/* Send */}
                        {q.status === "draft" && (
                          <button title="Send quote" onClick={() => handleSend(q)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-blue-600">
                            {sendingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {/* Accept */}
                        {["sent", "draft"].includes(q.status) && !q.convertedToInvoiceId && (
                          <button title="Mark as accepted" onClick={() => handleAccept(q)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-green-600">
                            {acceptingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {/* Convert */}
                        {!q.convertedToInvoiceId && !["declined", "expired"].includes(q.status) && (
                          <button title="Convert to invoice" onClick={() => handleConvert(q)}
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary">
                            {convertingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {q.convertedToInvoiceId && (
                          <span className="text-xs text-purple-600 font-medium px-1">→ INV</span>
                        )}
                        {/* Edit */}
                        <button title="Edit" onClick={() => openEdit(q)}
                          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* Delete */}
                        {deleting === q.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteMutation.mutate(q.id)} className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded">
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                            </button>
                            <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleting(q.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
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
    </div>
  );
}
