import { useState } from "react";
import { useListBusinesses, useCreateBusiness, getListBusinessesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Building2, Plus } from "lucide-react";
import { clearToken } from "@/lib/auth";

interface Props {
  onBusinessSelected: (id: number) => void;
}

export default function SelectBusinessPage({ onBusinessSelected }: Props) {
  const { data: businesses, isLoading } = useListBusinesses();
  const createBusiness = useCreateBusiness();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [fiscalYearStart, setFiscalYearStart] = useState(1);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const biz = await createBusiness.mutateAsync({ data: { name, currency, fiscalYearStart } });
      queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
      onBusinessSelected(biz.id);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Failed to create business");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-lg">ClearLedger</span>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-1">Select a business</h1>
        <p className="text-muted-foreground text-sm mb-6">Choose a business to manage or create a new one</p>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {businesses?.map((biz) => (
              <button
                key={biz.id}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent transition-all text-left"
                onClick={() => onBusinessSelected(biz.id)}
              >
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-sm text-foreground">{biz.name}</div>
                  <div className="text-xs text-muted-foreground">{biz.currency}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!showForm ? (
          <button
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-4 h-4" />
            Add new business
          </button>
        ) : (
          <form onSubmit={handleCreate} className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <h3 className="font-medium text-sm text-foreground">New business</h3>

            {error && (
              <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>
            )}

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Business name"
              required
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="flex gap-2">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>

              <select
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(Number(e.target.value))}
                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2 px-3 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createBusiness.isPending}
                className="flex-1 py-2 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {createBusiness.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}

        <button
          className="mt-6 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { clearToken(); window.location.href = "/login"; }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
