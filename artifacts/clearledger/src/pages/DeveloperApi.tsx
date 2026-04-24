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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Key, Copy, Check, Trash2, Power, Code2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ApiKey {
  id: number; name: string; keyPrefix: string; scopes: string;
  isActive: boolean; lastUsedAt?: string; expiresAt?: string; createdAt: string;
}

export default function DeveloperApi({ businessId }: { businessId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", scopes: "read", expiresAt: "" });

  const { data: keys = [] } = useQuery<ApiKey[]>({
    queryKey: ["api-keys", businessId],
    queryFn: () => apiRequest(`/api/api-keys?businessId=${businessId}`),
  });

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("/api/api-keys", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKey(data.rawKey);
      setOpen(false);
      toast({ title: "API key created" });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: any) => apiRequest(`/api/api-keys/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast({ title: "Key deleted" }); },
  });

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ ...form, businessId });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="w-6 h-6" />Developer API</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage API keys for programmatic access to your business data</p>
        </div>
        <Button onClick={() => { setForm({ name: "", scopes: "read", expiresAt: "" }); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />New API Key
        </Button>
      </div>

      {/* New key reveal */}
      {newKey && (
        <Alert className="border-emerald-200 bg-emerald-50">
          <Shield className="w-4 h-4 text-emerald-600" />
          <AlertDescription>
            <p className="font-semibold text-emerald-800 mb-2">Your new API key — copy it now, it won't be shown again</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-white border border-emerald-200 rounded px-3 py-2 font-mono text-emerald-900 break-all">{newKey}</code>
              <Button size="sm" variant="outline" onClick={() => copyKey(newKey)} className="shrink-0">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setNewKey(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* API Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Base URL</CardTitle></CardHeader>
          <CardContent><code className="text-xs font-mono text-foreground">{window.location.origin}/api</code></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Authentication</CardTitle></CardHeader>
          <CardContent><code className="text-xs font-mono">Authorization: Bearer &lt;key&gt;</code></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Keys</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{keys.filter(k => k.isActive).length}</p></CardContent>
        </Card>
      </div>

      {/* Keys table */}
      <Card>
        <CardContent className="p-0">
          {keys.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Key className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No API keys yet</p>
              <p className="text-sm mt-1">Create a key to start using the API</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Prefix</th>
                  <th className="px-4 py-3 text-left">Scope</th>
                  <th className="px-4 py-3 text-left">Last Used</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3" />
                </tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{k.name}</td>
                      <td className="px-4 py-3"><code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{k.keyPrefix}…</code></td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs capitalize">{k.scopes}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs ${k.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {k.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title={k.isActive ? "Deactivate" : "Activate"}
                            onClick={() => toggle.mutate({ id: k.id, isActive: !k.isActive })}>
                            <Power className={`w-3.5 h-3.5 ${k.isActive ? "text-emerald-600" : "text-muted-foreground"}`} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(k.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

      {/* Quick reference */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Quick Reference</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { method: "GET", path: "/api/invoices?businessId=X", desc: "List invoices" },
            { method: "GET", path: "/api/customers?businessId=X", desc: "List customers" },
            { method: "GET", path: "/api/transactions?businessId=X", desc: "List transactions" },
            { method: "GET", path: "/api/reports/profit-loss?businessId=X", desc: "Profit & Loss report" },
            { method: "POST", path: "/api/invoices", desc: "Create invoice" },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Badge variant="outline" className={`text-xs w-12 justify-center shrink-0 ${r.method === "POST" ? "border-blue-300 text-blue-700" : "border-slate-300 text-slate-600"}`}>{r.method}</Badge>
              <code className="font-mono text-xs text-muted-foreground flex-1">{r.path}</code>
              <span className="text-muted-foreground text-xs">{r.desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New API Key</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Key Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. My Integration, Zapier" required />
            </div>
            <div>
              <Label>Scope</Label>
              <Select value={form.scopes} onValueChange={v => setForm({ ...form, scopes: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read only</SelectItem>
                  <SelectItem value="read,write">Read & Write</SelectItem>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expiry Date (optional)</Label>
              <Input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={create.isPending}>Create Key</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
