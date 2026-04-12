import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, Plus, Pencil, Trash2, Search, Loader2, ArrowLeft, Mail, Phone, MapPin, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

interface Props { businessId: number }
interface Account { id: number; name: string; type: string }

interface Vendor {
  id: number; businessId: number; name: string; email: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  accountNumber: string | null; paymentTerms: number | null; defaultExpenseAccountId: number | null;
  notes: string | null; createdAt: string;
  billSummary: { unpaidCount: number; totalOwed: number; totalBilled: number };
}

const EMPTY_FORM = {
  name: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  accountNumber: "", paymentTerms: "30", defaultExpenseAccountId: "" as string | number, notes: "",
};

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers as Record<string, string> ?? {}) },
  });
}

export default function VendorsPage({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/vendors?businessId=${businessId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
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

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setView("editor");
  }

  function openEdit(v: Vendor) {
    setEditingId(v.id);
    setForm({
      name: v.name, email: v.email ?? "", phone: v.phone ?? "", address: v.address ?? "",
      city: v.city ?? "", state: v.state ?? "", zip: v.zip ?? "",
      accountNumber: v.accountNumber ?? "", paymentTerms: String(v.paymentTerms ?? 30),
      defaultExpenseAccountId: v.defaultExpenseAccountId ?? "", notes: v.notes ?? "",
    });
    setView("editor");
  }

  function setF(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/vendors/${editingId}` : `/api/vendors`;
      const method = editingId ? "PATCH" : "POST";
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...form, businessId,
          paymentTerms: form.paymentTerms ? Number(form.paymentTerms) : null,
          defaultExpenseAccountId: form.defaultExpenseAccountId ? Number(form.defaultExpenseAccountId) : null,
          email: form.email || null, phone: form.phone || null, address: form.address || null,
          city: form.city || null, state: form.state || null, zip: form.zip || null,
          accountNumber: form.accountNumber || null, notes: form.notes || null,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors", businessId] });
      setView("list");
      toast({ title: editingId ? "Vendor updated" : "Vendor added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/vendors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors", businessId] });
      setDeleting(null);
      toast({ title: "Vendor deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (v.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (v.accountNumber ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalOwed = vendors.reduce((s, v) => s + (v.billSummary?.totalOwed ?? 0), 0);
  const totalBilled = vendors.reduce((s, v) => s + (v.billSummary?.totalBilled ?? 0), 0);
  const vendorsWithUnpaid = vendors.filter((v) => (v.billSummary?.unpaidCount ?? 0) > 0).length;

  // ── EDITOR ───────────────────────────────────────────────────────────────────
  if (view === "editor") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-bold text-foreground">{editingId ? "Edit Vendor" : "Add Vendor"}</h1>
        </div>
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Vendor Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label>Vendor Name *</Label><Input className="mt-1" value={form.name} onChange={setF("name")} required placeholder="e.g. Pilot Flying J" /></div>
              <div><Label>Email</Label><Input type="email" className="mt-1" value={form.email} onChange={setF("email")} placeholder="billing@vendor.com" /></div>
              <div><Label>Phone</Label><Input type="tel" className="mt-1" value={form.phone} onChange={setF("phone")} /></div>
              <div><Label>Account Number</Label><Input className="mt-1" value={form.accountNumber} onChange={setF("accountNumber")} placeholder="Your account # with this vendor" /></div>
              <div>
                <Label>Payment Terms (days)</Label>
                <Input type="number" min="0" step="1" className="mt-1" value={form.paymentTerms} onChange={setF("paymentTerms")} />
              </div>
              <div className="sm:col-span-2">
                <Label>Default Expense Account</Label>
                <select value={String(form.defaultExpenseAccountId)} onChange={setF("defaultExpenseAccountId")}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— None —</option>
                  {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label>Street Address</Label><Input className="mt-1" value={form.address} onChange={setF("address")} /></div>
              <div><Label>City</Label><Input className="mt-1" value={form.city} onChange={setF("city")} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>State</Label><Input className="mt-1" value={form.state} onChange={setF("state")} maxLength={2} placeholder="TX" /></div>
                <div><Label>ZIP</Label><Input className="mt-1" value={form.zip} onChange={setF("zip")} /></div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={setF("notes")} rows={3} placeholder="Payment preferences, contacts, special terms…"
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {editingId ? "Update Vendor" : "Add Vendor"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Store className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vendors</h1>
            <p className="text-sm text-muted-foreground">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Vendor</Button>
      </div>

      {vendors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Vendors</p>
            <p className="text-2xl font-bold text-foreground">{vendors.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Billed</p>
            <p className="text-lg font-bold">{formatCurrency(totalBilled)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Outstanding Owed</p>
            <div className="flex items-center gap-2">
              <p className={`text-lg font-bold ${totalOwed > 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(totalOwed)}</p>
              {vendorsWithUnpaid > 0 && <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">{vendorsWithUnpaid} vendor{vendorsWithUnpaid !== 1 ? "s" : ""}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "No vendors match your search" : "No vendors yet"}</p>
          {!search && <p className="text-sm mt-1">Add your first vendor to track bills and payments</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">{v.name}</h3>
                    {(v.billSummary?.unpaidCount ?? 0) > 0 && (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    )}
                  </div>
                  {v.accountNumber && <p className="text-xs text-muted-foreground font-mono mt-0.5">Acct: {v.accountNumber}</p>}
                </div>
                <div className="flex items-center gap-0.5 ml-2">
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  {deleting === v.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteMutation.mutate(v.id)} className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded">
                        {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                      </button>
                      <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs border border-border rounded">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleting(v.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                {v.email && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3" /><span className="truncate">{v.email}</span>
                  </div>
                )}
                {v.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" /><span>{v.phone}</span>
                  </div>
                )}
                {(v.city || v.state) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" /><span>{[v.city, v.state].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {v.paymentTerms && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3" /><span>Net {v.paymentTerms}</span>
                  </div>
                )}
              </div>

              {v.billSummary && (v.billSummary.totalBilled > 0) && (
                <div className="border-t border-border pt-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Billed</p>
                    <p className="text-sm font-medium">{formatCurrency(v.billSummary.totalBilled)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Balance Due</p>
                    <p className={`text-sm font-bold ${v.billSummary.totalOwed > 0 ? "text-destructive" : "text-green-600"}`}>
                      {formatCurrency(v.billSummary.totalOwed)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
