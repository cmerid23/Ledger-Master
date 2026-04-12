import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetBusiness,
  useUpdateBusiness,
  useCreateBusiness,
  useListBusinesses,
  useDeleteBusiness,
  getListBusinessesQueryKey,
  getGetBusinessQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { clearToken, clearBusinessId } from "@/lib/auth";
import { Building2, Plus, Trash2, Bell, Smartphone } from "lucide-react";
import { authFetch } from "@/lib/api";

interface Props {
  businessId: number;
  onBusinessChange: (id: number) => void;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENCIES = ["USD","EUR","GBP","CAD","AUD","JPY","CHF","SGD","INR","MXN"];

export default function SettingsPage({ businessId, onBusinessChange }: Props) {
  const queryClient = useQueryClient();
  const { data: business, isLoading } = useGetBusiness(businessId, { query: { enabled: !!businessId } });
  const { data: businesses } = useListBusinesses();
  const updateBusiness = useUpdateBusiness();
  const createBusiness = useCreateBusiness();
  const deleteBusiness = useDeleteBusiness();

  const [form, setForm] = useState({ name: "", currency: "USD", fiscalYearStart: 1 });
  const [newBizForm, setNewBizForm] = useState({ name: "", currency: "USD", fiscalYearStart: 1 });
  const [showNewBiz, setShowNewBiz] = useState(false);
  const [savedBiz, setSavedBiz] = useState(false);
  const [error, setError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  // Push notification support detection
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  async function handleTogglePush() {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await authFetch("/api/push/subscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setPushLoading(false); return; }
        const keyRes = await authFetch("/api/push/vapid-public-key");
        const { publicKey } = await keyRes.json() as { publicKey: string };
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        const json = sub.toJSON();
        await authFetch("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
        setPushEnabled(true);
      }
    } catch { /* permission denied or unsupported */ }
    finally { setPushLoading(false); }
  }

  // Initialize form from loaded business
  if (business && form.name === "" && !isLoading) {
    setForm({ name: business.name, currency: business.currency, fiscalYearStart: business.fiscalYearStart });
  }

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await updateBusiness.mutateAsync({
        businessId,
        data: form,
      });
      queryClient.invalidateQueries({ queryKey: getGetBusinessQueryKey(businessId) });
      queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
      setSavedBiz(true);
      setTimeout(() => setSavedBiz(false), 3000);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error updating business");
    }
  }

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    try {
      const biz = await createBusiness.mutateAsync({ data: newBizForm });
      queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
      setShowNewBiz(false);
      setNewBizForm({ name: "", currency: "USD", fiscalYearStart: 1 });
      onBusinessChange(biz.id);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error || e?.message || "Error creating business");
    }
  }

  async function handleDeleteBusiness(id: number) {
    if (!confirm("Delete this business and all its data? This cannot be undone.")) return;
    await deleteBusiness.mutateAsync({ businessId: id });
    queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
    if (id === businessId) {
      const remaining = businesses?.filter((b) => b.id !== id);
      if (remaining && remaining.length > 0) {
        onBusinessChange(remaining[0].id);
      } else {
        clearToken();
        clearBusinessId();
        window.location.href = "/login";
      }
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your business settings</p>
      </div>

      {/* Business settings */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Business Settings</h2>
        </div>

        {error && <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
          </div>
        ) : (
          <form onSubmit={handleSaveBusiness} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Business name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Fiscal year start</label>
                <select
                  value={form.fiscalYearStart}
                  onChange={(e) => setForm({ ...form, fiscalYearStart: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={updateBusiness.isPending}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {updateBusiness.isPending ? "Saving..." : "Save changes"}
              </button>
              {savedBiz && <span className="text-sm text-emerald-600">Saved</span>}
            </div>
          </form>
        )}
      </div>

      {/* Notifications */}
      {pushSupported && (
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Notifications</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Overdue invoice alerts</p>
              <p className="text-xs text-muted-foreground mt-0.5">Get push notifications when invoices become overdue</p>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${pushEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              aria-pressed={pushEnabled}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pushEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          {pushEnabled && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <Bell className="w-3 h-3" /> Notifications enabled
            </p>
          )}
        </div>
      )}

      {/* App install */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Install App</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Install ClearLedger on your phone for offline access and faster load times.
        </p>
        <Link href="/install"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
          <Smartphone className="w-4 h-4" />
          View install instructions
        </Link>
      </div>

      {/* All businesses */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">All Businesses</h2>
          <button
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            onClick={() => setShowNewBiz(!showNewBiz)}
          >
            <Plus className="w-3.5 h-3.5" />
            Add new
          </button>
        </div>

        {showNewBiz && (
          <form onSubmit={handleCreateBusiness} className="border border-border rounded-lg p-4 space-y-3">
            <input
              type="text"
              value={newBizForm.name}
              onChange={(e) => setNewBizForm({ ...newBizForm, name: e.target.value })}
              placeholder="Business name"
              required
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <select value={newBizForm.currency} onChange={(e) => setNewBizForm({ ...newBizForm, currency: e.target.value })}
                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newBizForm.fiscalYearStart} onChange={(e) => setNewBizForm({ ...newBizForm, fiscalYearStart: Number(e.target.value) })}
                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNewBiz(false)}
                className="flex-1 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={createBusiness.isPending}
                className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {createBusiness.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {businesses?.map((biz) => (
            <div key={biz.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${biz.id === businessId ? "border-primary/30 bg-primary/5" : "border-border"}`}>
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{biz.name}</div>
                <div className="text-xs text-muted-foreground">{biz.currency} · Fiscal year starts {MONTHS[biz.fiscalYearStart - 1]}</div>
              </div>
              {biz.id === businessId && (
                <span className="text-xs text-primary font-medium">Current</span>
              )}
              <button
                onClick={() => handleDeleteBusiness(biz.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
