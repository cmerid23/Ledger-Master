import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Send, CheckCircle, XCircle, Pencil, Trash2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LineItem { description: string; quantity: string; unit: string; rate: string; amount: string; }
interface Proposal {
  id: number; proposalNumber: string; title: string; status: string;
  issueDate: string; expiryDate?: string; subtotal: string; taxRate: string;
  taxAmount: string; total: string; customerId?: number; currency: string;
  notes?: string; lineItems: LineItem[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-purple-100 text-purple-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

const emptyLine = (): LineItem => ({ description: "", quantity: "1", unit: "", rate: "0", amount: "0" });

function calcLine(li: LineItem): LineItem {
  return { ...li, amount: (parseFloat(li.quantity || "0") * parseFloat(li.rate || "0")).toFixed(2) };
}

export default function Proposals({ businessId }: { businessId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [form, setForm] = useState<any>({ title: "", proposalNumber: "", issueDate: new Date().toISOString().split("T")[0], expiryDate: "", status: "draft", customerId: "", taxRate: "0", notes: "", currency: "USD", lineItems: [emptyLine()] });

  const { data: proposals = [] } = useQuery<Proposal[]>({
    queryKey: ["proposals", businessId],
    queryFn: () => apiRequest(`/api/proposals?businessId=${businessId}`),
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers", businessId],
    queryFn: () => apiRequest(`/api/customers?businessId=${businessId}`),
  });

  const save = useMutation({
    mutationFn: (data: any) => editing
      ? apiRequest(`/api/proposals/${editing.id}`, { method: "PUT", body: JSON.stringify(data) })
      : apiRequest("/api/proposals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proposals"] }); setOpen(false); toast({ title: editing ? "Proposal updated" : "Proposal created" }); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/proposals/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proposals"] }); toast({ title: "Proposal deleted" }); },
  });

  const convert = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/proposals/${id}/convert`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proposals", "invoices"] }); toast({ title: "Converted to invoice!" }); },
  });

  function calcTotals(items: LineItem[], taxRate: string) {
    const subtotal = items.reduce((s, li) => s + parseFloat(li.amount || "0"), 0);
    const taxAmount = (subtotal * parseFloat(taxRate || "0") / 100);
    return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: (subtotal + taxAmount).toFixed(2) };
  }

  function handleLineChange(i: number, field: keyof LineItem, val: string) {
    const items = form.lineItems.map((li: LineItem, idx: number) => {
      if (idx !== i) return li;
      const updated = { ...li, [field]: val };
      return calcLine(updated);
    });
    setForm({ ...form, lineItems: items });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { subtotal, taxAmount, total } = calcTotals(form.lineItems, form.taxRate);
    save.mutate({ ...form, businessId, subtotal, taxAmount, total, customerId: form.customerId ? Number(form.customerId) : null });
  }

  function openNew() {
    setEditing(null);
    const num = `PROP-${Date.now().toString().slice(-6)}`;
    setForm({ title: "", proposalNumber: num, issueDate: new Date().toISOString().split("T")[0], expiryDate: "", status: "draft", customerId: "", taxRate: "0", notes: "", currency: "USD", lineItems: [emptyLine()] });
    setOpen(true);
  }

  function openEdit(p: Proposal) {
    setEditing(p);
    setForm({ ...p, customerId: p.customerId?.toString() ?? "", lineItems: p.lineItems?.length ? p.lineItems : [emptyLine()] });
    setOpen(true);
  }

  const { subtotal, taxAmount, total } = calcTotals(form.lineItems, form.taxRate);

  const totalValue = proposals.filter(p => p.status === "accepted").reduce((s, p) => s + parseFloat(p.total || "0"), 0);
  const pending = proposals.filter(p => ["sent", "viewed"].includes(p.status)).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proposals</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create and manage client proposals</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Proposal</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Total Proposals</p><p className="text-2xl font-bold mt-1">{proposals.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Pending Response</p><p className="text-2xl font-bold mt-1 text-blue-600">{pending}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Accepted Value</p><p className="text-2xl font-bold mt-1 text-emerald-600">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {proposals.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No proposals yet</p>
              <p className="text-sm mt-1">Create your first proposal to win new clients</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Number</th>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Expires</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.proposalNumber}</td>
                      <td className="px-4 py-3 font-medium">{p.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.issueDate}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.expiryDate || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold">${parseFloat(p.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || "bg-slate-100 text-slate-700"}`}>
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {p.status !== "accepted" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Convert to Invoice" onClick={() => convert.mutate(p.id)}><ArrowRight className="w-3.5 h-3.5" /></Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Proposal" : "New Proposal"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Proposal # *</Label><Input value={form.proposalNumber} onChange={e => setForm({ ...form, proposalNumber: e.target.value })} required /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["draft","sent","viewed","accepted","declined","expired"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Proposal title" required /></div>
              <div><Label>Issue Date *</Label><Input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} required /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
              <div className="col-span-2"><Label>Customer</Label>
                <Select value={form.customerId || "none"} onValueChange={v => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{customers.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2"><Label>Line Items</Label><Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, lineItems: [...form.lineItems, emptyLine()] })}><Plus className="w-3.5 h-3.5 mr-1" />Add Line</Button></div>
              <div className="space-y-2">
                {form.lineItems.map((li: LineItem, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-5"><Input placeholder="Description" value={li.description} onChange={e => handleLineChange(i, "description", e.target.value)} /></div>
                    <div className="col-span-2"><Input type="number" step="0.01" placeholder="Qty" value={li.quantity} onChange={e => handleLineChange(i, "quantity", e.target.value)} /></div>
                    <div className="col-span-2"><Input type="number" step="0.01" placeholder="Rate" value={li.rate} onChange={e => handleLineChange(i, "rate", e.target.value)} /></div>
                    <div className="col-span-2"><Input readOnly value={`$${li.amount}`} className="bg-muted text-right text-xs" /></div>
                    <div className="col-span-1 flex justify-center"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setForm({ ...form, lineItems: form.lineItems.filter((_: any, j: number) => j !== i) })}><Trash2 className="w-3.5 h-3.5" /></Button></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-6 text-sm border-t pt-3">
              <div className="space-y-1 text-right">
                <div className="flex gap-8 justify-between"><span className="text-muted-foreground">Subtotal</span><span>${subtotal}</span></div>
                <div className="flex gap-4 items-center justify-between"><span className="text-muted-foreground">Tax %</span><Input type="number" step="0.01" className="w-20 h-7 text-right text-xs" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: e.target.value })} /></div>
                <div className="flex gap-8 justify-between font-semibold"><span>Total</span><span>${total}</span></div>
              </div>
            </div>

            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes for client" /></div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={save.isPending}>{editing ? "Save Changes" : "Create Proposal"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
