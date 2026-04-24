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
import { Switch } from "@/components/ui/switch";
import { Plus, Repeat, Play, Pause, Pencil, Trash2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Schedule {
  id: number; name: string; status: string; frequency: string;
  nextRunDate: string; lastRunDate?: string; totalRuns: number;
  templateTitle: string; templateTotal: string; customerId?: number;
  autoSend: boolean; dueAfterDays: number; templateLineItems: string;
  templateSubtotal: string; templateTaxRate: string; templateCurrency: string;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly", biweekly: "Every 2 Weeks", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly"
};

const emptyLine = () => ({ description: "", quantity: "1", rate: "0", amount: "0" });

export default function RecurringBilling({ businessId }: { businessId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [lines, setLines] = useState<any[]>([emptyLine()]);
  const [form, setForm] = useState<any>({
    name: "", frequency: "monthly", nextRunDate: new Date().toISOString().split("T")[0],
    status: "active", customerId: "", taxRate: "0", currency: "USD",
    dueAfterDays: "30", autoSend: false,
  });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["recurring", businessId],
    queryFn: () => apiRequest(`/api/recurring?businessId=${businessId}`),
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers", businessId],
    queryFn: () => apiRequest(`/api/customers?businessId=${businessId}`),
  });

  const save = useMutation({
    mutationFn: (data: any) => editing
      ? apiRequest(`/api/recurring/${editing.id}`, { method: "PUT", body: JSON.stringify(data) })
      : apiRequest("/api/recurring", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recurring"] }); setOpen(false); toast({ title: editing ? "Schedule updated" : "Schedule created" }); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recurring/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recurring"] }); toast({ title: "Schedule deleted" }); },
  });

  const run = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/recurring/${id}/run`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recurring", "invoices"] }); toast({ title: "Invoice generated!" }); },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: any) => apiRequest(`/api/recurring/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });

  function calcSubtotal() {
    return lines.reduce((s: number, l: any) => s + parseFloat(l.amount || "0"), 0);
  }

  function handleLineChange(i: number, field: string, val: string) {
    const updated = lines.map((l: any, idx: number) => {
      if (idx !== i) return l;
      const u = { ...l, [field]: val };
      if (field === "quantity" || field === "rate") {
        u.amount = (parseFloat(u.quantity || "0") * parseFloat(u.rate || "0")).toFixed(2);
      }
      return u;
    });
    setLines(updated);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subtotal = calcSubtotal();
    const tax = subtotal * parseFloat(form.taxRate || "0") / 100;
    save.mutate({
      ...form,
      businessId,
      customerId: form.customerId ? Number(form.customerId) : null,
      dueAfterDays: Number(form.dueAfterDays),
      dayOfMonth: 1,
      templateTitle: form.name,
      templateLineItems: JSON.stringify(lines),
      templateSubtotal: subtotal.toFixed(2),
      templateTaxRate: form.taxRate,
      templateTotal: (subtotal + tax).toFixed(2),
      templateCurrency: form.currency,
    });
  }

  function openNew() {
    setEditing(null);
    setLines([emptyLine()]);
    setForm({ name: "", frequency: "monthly", nextRunDate: new Date().toISOString().split("T")[0], status: "active", customerId: "", taxRate: "0", currency: "USD", dueAfterDays: "30", autoSend: false });
    setOpen(true);
  }

  function openEdit(s: Schedule) {
    setEditing(s);
    const li = (() => { try { return JSON.parse(s.templateLineItems); } catch { return [emptyLine()]; } })();
    setLines(li.length ? li : [emptyLine()]);
    setForm({ name: s.name, frequency: s.frequency, nextRunDate: s.nextRunDate, status: s.status, customerId: s.customerId?.toString() ?? "", taxRate: s.templateTaxRate, currency: s.templateCurrency, dueAfterDays: s.dueAfterDays.toString(), autoSend: s.autoSend });
    setOpen(true);
  }

  const active = schedules.filter(s => s.status === "active").length;
  const totalMonthly = schedules.filter(s => s.status === "active" && s.frequency === "monthly")
    .reduce((sum, s) => sum + parseFloat(s.templateTotal || "0"), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Repeat className="w-6 h-6" />Recurring Billing</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Set up automatic invoices on a schedule</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Schedule</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Active Schedules</p><p className="text-2xl font-bold mt-1 text-emerald-600">{active}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Monthly Recurring</p><p className="text-2xl font-bold mt-1">${totalMonthly.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Total Invoices Generated</p><p className="text-2xl font-bold mt-1">{schedules.reduce((s, r) => s + (r.totalRuns || 0), 0)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {schedules.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Repeat className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No recurring schedules yet</p>
              <p className="text-sm mt-1">Create a schedule to auto-generate invoices</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Frequency</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Next Run</th>
                  <th className="px-4 py-3 text-center">Runs</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3" />
                </tr></thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{FREQ_LABELS[s.frequency] || s.frequency}</td>
                      <td className="px-4 py-3 text-right font-semibold">${parseFloat(s.templateTotal).toFixed(2)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.nextRunDate}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{s.totalRuns}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Run now" onClick={() => run.mutate(s.id)}><Play className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title={s.status === "active" ? "Pause" : "Resume"}
                            onClick={() => toggleStatus.mutate({ id: s.id, status: s.status === "active" ? "paused" : "active" })}>
                            {s.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Schedule" : "New Recurring Schedule"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Schedule Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Retainer - Acme Corp" required /></div>
              <div><Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FREQ_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>First Run Date *</Label><Input type="date" value={form.nextRunDate} onChange={e => setForm({ ...form, nextRunDate: e.target.value })} required /></div>
              <div><Label>Customer</Label>
                <Select value={form.customerId || "none"} onValueChange={v => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{customers.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Payment Due After (days)</Label><Input type="number" min="0" value={form.dueAfterDays} onChange={e => setForm({ ...form, dueAfterDays: e.target.value })} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2"><Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
              </div>
              <div className="space-y-2">
                {lines.map((li: any, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-6"><Input placeholder="Description" value={li.description} onChange={e => handleLineChange(i, "description", e.target.value)} /></div>
                    <div className="col-span-2"><Input type="number" placeholder="Qty" value={li.quantity} onChange={e => handleLineChange(i, "quantity", e.target.value)} /></div>
                    <div className="col-span-2"><Input type="number" placeholder="Rate" value={li.rate} onChange={e => handleLineChange(i, "rate", e.target.value)} /></div>
                    <div className="col-span-1"><p className="text-xs text-right text-muted-foreground">${li.amount}</p></div>
                    <div className="col-span-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setLines(lines.filter((_: any, j: number) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></Button></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-4 mt-2 text-sm">
                <span className="text-muted-foreground">Subtotal: <strong>${calcSubtotal().toFixed(2)}</strong></span>
                <div className="flex items-center gap-1"><span className="text-muted-foreground">Tax %</span><Input type="number" className="w-16 h-7 text-xs" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: e.target.value })} /></div>
                <span className="font-semibold">Total: ${(calcSubtotal() * (1 + parseFloat(form.taxRate || "0") / 100)).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.autoSend} onCheckedChange={v => setForm({ ...form, autoSend: v })} />
              <Label>Auto-send invoice to customer on generation</Label>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={save.isPending}>{editing ? "Save Changes" : "Create Schedule"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
