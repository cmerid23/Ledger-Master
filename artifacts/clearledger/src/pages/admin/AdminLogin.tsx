import { useState } from "react";
import { useLocation } from "wouter";
import { setAdminToken, adminFetch } from "@/lib/adminAuth";
import { BarChart3, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await adminFetch<{ token: string; admin: { name: string } }>(
        "/api/admin/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      );
      setAdminToken(result.token);
      navigate("/admin/dashboard");
    } catch (err: unknown) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-sidebar">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-96 p-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-xl text-white">ClearLedger</span>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-sidebar-primary" />
            <span className="text-white font-medium">Admin Portal</span>
          </div>
          <p className="text-sidebar-foreground text-sm leading-relaxed">
            Manage all tenants, users, and businesses across the ClearLedger platform from one secure admin portal.
          </p>
          <div className="mt-6 space-y-2 text-sm text-sidebar-foreground/70">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-sidebar-primary" />
              View all businesses & users
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-sidebar-primary" />
              Promote/demote admin roles
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-sidebar-primary" />
              Remove tenants & accounts
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-muted-foreground">Admin Access</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Admin sign in</h1>
          <p className="text-muted-foreground text-sm mb-8">Restricted to admin accounts only</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Admin email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@clearledger.com"
                required
                className="w-full px-3 py-2.5 rounded-md border border-input bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 pr-10 rounded-md border border-input bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Signing in..." : "Sign in as admin"}
            </button>
          </form>

          <div className="mt-6 p-3 bg-muted/50 rounded-md text-xs text-muted-foreground">
            <strong className="text-foreground">First time?</strong> Call{" "}
            <code className="bg-muted px-1 py-0.5 rounded">POST /api/admin/setup</code> to create
            the initial admin account.
          </div>

          <a
            href="/"
            className="block mt-4 text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to app
          </a>
        </div>
      </div>
    </div>
  );
}
