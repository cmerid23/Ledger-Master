import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Zap, Building2, Briefcase, Loader2, CreditCard, ChevronRight, AlertTriangle, X } from "lucide-react";
import { authFetch } from "@/lib/api";

interface BillingStatus {
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
}

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    icon: Zap,
    monthly: 19,
    yearly: 15,
    description: "For freelancers and solo operators",
    features: [
      "1 business",
      "Invoices & quotes",
      "Bank reconciliation",
      "Receipt capture",
      "Financial reports",
      "Email support",
    ],
    color: "#3B82F6",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    icon: Briefcase,
    monthly: 49,
    yearly: 39,
    description: "For growing small businesses",
    features: [
      "3 businesses",
      "Everything in Starter",
      "CRM & customer management",
      "Jobs & project tracking",
      "Vendor & bill management",
      "Tax Pack export",
      "Push notifications",
      "Priority support",
    ],
    color: "#10B981",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    icon: Building2,
    monthly: 99,
    yearly: 79,
    description: "For multi-vehicle fleets & teams",
    features: [
      "Unlimited businesses",
      "Everything in Pro",
      "Fleet management & IFTA",
      "Mileage & fuel tracking",
      "CSV bulk import",
      "PWA mobile app",
      "Dedicated onboarding",
      "Phone support",
    ],
    color: "#8B5CF6",
    highlight: false,
  },
];

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [successBanner, setSuccessBanner] = useState(false);
  const [canceledBanner, setCanceledBanner] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") setSuccessBanner(true);
    if (params.get("canceled") === "1") setCanceledBanner(true);
  }, []);

  useEffect(() => {
    authFetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus({ plan: "free", status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: null, trialEnd: null }))
      .finally(() => setLoading(false));
  }, []);

  async function checkout(planId: string) {
    setActionLoading(planId);
    try {
      const r = await authFetch("/api/billing/create-checkout", {
        method: "POST",
        body: JSON.stringify({ plan: planId, interval }),
      });
      const data = await r.json();
      if (data.url) window.location.href = data.url;
      else if (data.error) alert(data.error);
    } finally {
      setActionLoading(null);
    }
  }

  async function openPortal() {
    setActionLoading("portal");
    try {
      const r = await authFetch("/api/billing/portal", { method: "POST" });
      const data = await r.json();
      if (data.url) window.location.href = data.url;
      else if (data.error) alert(data.error);
    } finally {
      setActionLoading(null);
    }
  }

  const currentPlan = status?.plan ?? "free";
  const isActive = status?.status === "active" || status?.status === "trialing";

  function formatDate(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Banners */}
      {successBanner && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
          <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="font-medium">You're all set! Your subscription is now active.</span>
          <button onClick={() => setSuccessBanner(false)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {canceledBanner && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-500" />
          <span>Checkout was canceled. Your plan was not changed.</span>
          <button onClick={() => setCanceledBanner(false)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription and payment details.</p>
      </div>

      {/* Current plan card */}
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Current Plan</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground capitalize">{currentPlan}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  status?.status === "trialing"
                    ? "bg-blue-100 text-blue-700"
                    : isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                }`}>
                  {status?.status === "trialing" ? "Trial" : isActive ? "Active" : status?.status ?? "Free"}
                </span>
                {status?.cancelAtPeriodEnd && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Cancels {formatDate(status.currentPeriodEnd)}
                  </span>
                )}
              </div>
              {status?.currentPeriodEnd && !status.cancelAtPeriodEnd && (
                <p className="text-sm text-muted-foreground mt-1">
                  Renews {formatDate(status.currentPeriodEnd)}
                </p>
              )}
              {status?.trialEnd && status.status === "trialing" && (
                <p className="text-sm text-muted-foreground mt-1">
                  Trial ends {formatDate(status.trialEnd)}
                </p>
              )}
            </div>
            {currentPlan !== "free" && (
              <button
                onClick={openPortal}
                disabled={actionLoading === "portal"}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                {actionLoading === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Manage billing
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Interval toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center bg-muted rounded-lg p-1 gap-1">
          <button
            onClick={() => setInterval("monthly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${interval === "monthly" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("yearly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${interval === "yearly" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Yearly
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Save 20%</span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = currentPlan === plan.id && isActive;
          const price = interval === "monthly" ? plan.monthly : plan.yearly;

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border-2 p-5 flex flex-col transition-all ${
                plan.highlight
                  ? "border-emerald-500 shadow-lg shadow-emerald-500/10"
                  : isCurrent
                    ? "border-primary"
                    : "border-border"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Most Popular</span>
                </div>
              )}
              {isCurrent && !plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow">Current Plan</span>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${plan.color}18` }}>
                  <Icon className="w-4 h-4" style={{ color: plan.color }} />
                </div>
                <span className="font-bold text-foreground">{plan.name}</span>
              </div>

              <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>

              <div className="flex items-end gap-1 mb-5">
                <span className="text-3xl font-extrabold text-foreground">${price}</span>
                <span className="text-sm text-muted-foreground mb-1">/mo</span>
                {interval === "yearly" && (
                  <span className="text-xs text-muted-foreground mb-1 ml-1">billed yearly</span>
                )}
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => isCurrent ? openPortal() : checkout(plan.id)}
                disabled={!!actionLoading}
                className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                  isCurrent
                    ? "border border-border text-muted-foreground hover:bg-muted"
                    : plan.highlight
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                      : "bg-foreground text-background hover:opacity-90"
                }`}
              >
                {actionLoading === plan.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isCurrent ? (
                  "Manage plan"
                ) : (
                  <>Start 14-day trial <ChevronRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Free plan note */}
      <p className="text-center text-sm text-muted-foreground">
        All paid plans include a <strong>14-day free trial</strong>. No credit card required to start. Cancel anytime.
      </p>
    </div>
  );
}
