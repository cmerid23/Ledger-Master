import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Pencil, Trash2, Search, Mail, Phone, MapPin, X, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

interface Props { businessId: number }

interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  paymentTerms: number;
  notes: string | null;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "", email: "", phone: "", address: "", city: "",
  state: "", zip: "", country: "US", paymentTerms: 30, notes: "",
};

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers },
  });
}

export default function CustomersPage({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<number | null>(null);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/businesses/${businessId}/customers`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const url = editing
        ? `/api/businesses/${businessId}/customers/${editing.id}`
        : `/api/businesses/${businessId}/customers`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to save"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", businessId] });
      setModalOpen(false);
      toast({ title: editing ? "Customer updated" : "Customer created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/businesses/${businessId}/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", businessId] });
      setDeleting(null);
      toast({ title: "Customer deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name, email: c.email ?? "", phone: c.phone ?? "",
      address: c.address ?? "", city: c.city ?? "", state: c.state ?? "",
      zip: c.zip ?? "", country: c.country, paymentTerms: c.paymentTerms, notes: c.notes ?? "",
    });
    setModalOpen(true);
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function f(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: key === "paymentTerms" ? Number(e.target.value) : e.target.value }));
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground">{customers.length} total</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "No customers match your search" : "No customers yet"}</p>
          {!search && <p className="text-sm mt-1">Add your first customer to get started</p>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Location</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Terms</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/5" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.name}</div>
                    {c.notes && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.notes}</div>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="space-y-0.5">
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="w-3 h-3" />{c.email}
                        </div>
                      )}
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="w-3 h-3" />{c.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {(c.city || c.state) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {[c.city, c.state].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="secondary">Net {c.paymentTerms}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {deleting === c.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteMutation.mutate(c.id)} className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded hover:opacity-90">
                            {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                          </button>
                          <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleting(c.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editing ? "Edit Customer" : "New Customer"}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
              className="p-5 space-y-4"
            >
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input id="name" value={form.name} onChange={f("name")} required className="mt-1" placeholder="Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={f("email")} className="mt-1" placeholder="billing@acme.com" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={f("phone")} className="mt-1" placeholder="+1 555 000 0000" />
                </div>
              </div>
              <div>
                <Label htmlFor="address">Street Address</Label>
                <Input id="address" value={form.address} onChange={f("address")} className="mt-1" placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={form.city} onChange={f("city")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={form.state} onChange={f("state")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="zip">ZIP</Label>
                  <Input id="zip" value={form.zip} onChange={f("zip")} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={form.country} onChange={f("country")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="paymentTerms">Payment Terms (days)</Label>
                  <Input id="paymentTerms" type="number" min={0} value={form.paymentTerms} onChange={f("paymentTerms")} className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={f("notes")}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Internal notes…"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Update" : "Create")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
