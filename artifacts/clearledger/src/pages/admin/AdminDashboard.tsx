import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";
import { Users, Building2, TrendingUp, Activity } from "lucide-react";
import { Link } from "wouter";

interface Stats {
  totalUsers: number;
  totalBusinesses: number;
  avgBusinessesPerUser: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/admin/users",
    },
    {
      label: "Total Businesses",
      value: stats?.totalBusinesses ?? 0,
      icon: Building2,
      color: "text-purple-600",
      bg: "bg-purple-50",
      href: "/admin/businesses",
    },
    {
      label: "Avg Businesses / User",
      value: stats?.avgBusinessesPerUser ?? 0,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: null,
    },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform-wide stats across all tenants
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg, href }) => {
          const card = (
            <div
              className={`bg-card border border-card-border rounded-xl p-5 shadow-sm ${href ? "hover:border-primary/30 transition-colors cursor-pointer" : ""}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {label}
                </span>
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
              </div>
              {loading ? (
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{value}</div>
              )}
            </div>
          );
          return href ? (
            <Link key={label} href={href}>
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/admin/users"
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-accent transition-all"
          >
            <Users className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium text-foreground">Manage Users</div>
              <div className="text-xs text-muted-foreground">View, promote, or remove users</div>
            </div>
          </Link>
          <Link
            href="/admin/businesses"
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-accent transition-all"
          >
            <Building2 className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-medium text-foreground">Manage Businesses</div>
              <div className="text-xs text-muted-foreground">View all tenant businesses</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Setup help */}
      <div className="bg-muted/40 border border-border rounded-xl p-5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4" />
          <span className="font-medium text-foreground">Admin Setup</span>
        </div>
        <p>
          To create additional admin accounts, promote a user from the{" "}
          <Link href="/admin/users" className="text-primary hover:underline">
            Users
          </Link>{" "}
          page. To bootstrap the first admin on a fresh install, call{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs">POST /api/admin/setup</code>.
        </p>
      </div>
    </div>
  );
}
