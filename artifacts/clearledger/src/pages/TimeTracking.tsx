import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Clock, DollarSign, CheckCircle, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TimeEntry {
  id: number;
  description: string;
  date: string;
  hours: string;
  ratePerHour: string;
  amount: string;
  billable: boolean;
  billed: boolean;
  customerId: number | null;
  jobId: number | null;
  notes?: string;
}

interface Props { businessId: number }

const empty = {
  description: "", date: new Date().toISOString().split("T")[0],
  hours: "1", ratePerHour: "0", billable: true, billed: false,
  customerId: "", jobId: "", notes: "",
};

export default function TimeTracking({ businessId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [form, setForm] = useState<any>(empty);

  const { data: entries = [] } = useQuery<TimeEntry[]>({
    queryKey: ["time-entries", businessId],
    queryFn: () => apiRequest(`/api/time-entries?businessId=${businessId}`),
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers", businessId],
    queryFn: () => apiRequest(`/api/customers?businessId=${businessId}`),
  });

  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ["jobs", businessId],
    queryFn: () => apiRequest(`/api/jobs?businessId=${businessId}`),
  });

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("/api/time-entries", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); setOpen(false); toast({ title: "Time entry added" }); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/api/time-entries/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); setOpen(false); toast({ title: "Entry updated" }); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/time-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["time-entries"] }); toast({ title: "Entry deleted" }); },
  });

  const totalHours = entries.reduce((s, e) => s + parseFloat(e.hours || "0"), 0);
  const billableHours = entries.filter(e => e.billable && !e.billed).reduce((s, e) => s + parseFloat(e.hours || "0"), 0);
  const totalAmount = entries.reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  const unbilledAmount = entries.filter(e => e.billable && !e.billed).reduce((s, e) => s + parseFloat(e.amount || "0"), 0);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(e: TimeEntry) {
    setEditing(e);
    setForm({ ...e, customerId: e.customerId?.toString() ?? "", jobId: e.jobId?.toString() ?? "" });
    setOpen(true);
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const payload = {
      ...form,
      businessId,
      customerId: form.customerId ? Number(form.customerId) : null,
      jobId: form.jobId ? Number(form.jobId) : null,
      amount: (parseFloat(form.hours) * parseFloat(form.ratePerHour)).toFixed(2),
    };
    if (editing) update.mutate({ id: editing.id, ...payload });
    else create.mutate(payload);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Time Tracking</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track billable hours and generate invoices</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Log Time</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" />Total Hours</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" />Unbilled Hours</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{billableHours.toFixed(1)}h</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="w-4 h-4" />Total Earned</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" />Unbilled Amount</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">${unbilledAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
      </div>

      {/* Entries table */}
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No time entries yet</p>
              <p className="text-sm mt-1">Click "Log Time" to start tracking</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Hours</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Billable</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3 font-medium max-w-xs truncate">{e.description}</td>
                      <td className="px-4 py-3 text-right">{parseFloat(e.hours).toFixed(2)}h</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">${parseFloat(e.ratePerHour).toFixed(2)}/hr</td>
                      <td className="px-4 py-3 text-right font-semibold">${parseFloat(e.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        {e.billable ? <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Billable</Badge>
                          : <Badge variant="outline" className="text-xs text-muted-foreground">Non-billable</Badge>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.billed ? <Badge className="text-xs bg-slate-100 text-slate-600">Billed</Badge>
                          : e.billable ? <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">Unbilled</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Time Entry" : "Log Time"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Description *</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What did you work on?" required />
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <Label>Hours *</Label>
                <Input type="number" step="0.25" min="0" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} required />
              </div>
              <div>
                <Label>Rate per Hour ($)</Label>
                <Input type="number" step="0.01" min="0" value={form.ratePerHour} onChange={e => setForm({ ...form, ratePerHour: e.target.value })} />
              </div>
              <div>
                <Label>Amount</Label>
                <Input readOnly value={`$${(parseFloat(form.hours || "0") * parseFloat(form.ratePerHour || "0")).toFixed(2)}`} className="bg-muted text-muted-foreground" />
              </div>
              <div>
                <Label>Customer</Label>
                <Select value={form.customerId || "none"} onValueChange={v => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {customers.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Job</Label>
                <Select value={form.jobId || "none"} onValueChange={v => setForm({ ...form, jobId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {jobs.map((j: any) => <SelectItem key={j.id} value={String(j.id)}>{j.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.billable} onCheckedChange={v => setForm({ ...form, billable: v })} />
                <Label>Billable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.billed} onCheckedChange={v => setForm({ ...form, billed: v })} />
                <Label>Already billed</Label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending || update.isPending}>
                {editing ? "Save Changes" : "Log Time"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
