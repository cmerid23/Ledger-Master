import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";
import { formatDate } from "@/lib/utils";
import { Building2, Trash2, RefreshCw, Search } from "lucide-react";

interface AdminBusiness {
  id: number;
  name: string;
  currency: string;
  fiscalYearStart: number;
  createdAt: string;
  userId: number;
  ownerEmail: string | null;
  ownerName: string | null;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    adminFetch<AdminBusiness[]>("/api/admin/businesses")
      .then(setBusinesses)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function deleteBusiness(id: number, name: string) {
    if (!confirm(`Delete business "${name}"? All accounts, transactions, and journal entries will be permanently removed.`))
      return;
    setActionId(id);
    try {
      await adminFetch(`/api/admin/businesses/${id}`, { method: "DELETE" });
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setActionId(null);
    }
  }

  const filtered = businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.ownerEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (b.ownerName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Businesses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All businesses across all tenants
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business name or owner..."
          className="w-full max-w-sm pl-9 pr-3 py-2 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {search ? "No businesses match your search." : "No businesses found."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground uppercase">
                  Business
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">
                  Owner
                </th>
                <th className="px-5 py-3.5 text-center text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">
                  Currency
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">
                  Created
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-medium text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((biz) => (
                <tr key={biz.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{biz.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          FY starts {MONTHS[(biz.fiscalYearStart - 1) % 12]}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <div className="text-foreground">{biz.ownerName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{biz.ownerEmail ?? "—"}</div>
                  </td>
                  <td className="px-5 py-4 text-center hidden sm:table-cell">
                    <span className="px-2 py-0.5 bg-muted rounded text-xs font-mono font-medium text-foreground">
                      {biz.currency}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-muted-foreground">
                    {formatDate(biz.createdAt)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => deleteBusiness(biz.id, biz.name)}
                      disabled={actionId === biz.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                      title="Delete business"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
            {filtered.length} of {businesses.length} businesses
          </div>
        )}
      </div>
    </div>
  );
}
