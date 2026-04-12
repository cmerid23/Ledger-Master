import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { BarChart3, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(!token ? "Invalid reset link. Please request a new one." : "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; message?: string };
      if (!res.ok) throw new Error(d.error ?? "Reset failed");
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-sidebar">
      <div className="hidden lg:flex flex-col justify-between w-96 p-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-xl text-white">ClearLedger</span>
        </div>
        <div>
          <blockquote className="text-sidebar-foreground text-lg leading-relaxed">
            "Finally an accounting tool that doesn't require a degree to navigate."
          </blockquote>
          <p className="mt-4 text-sm text-sidebar-foreground/60">— Sarah M., Small Business Owner</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg">ClearLedger</span>
          </div>

          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Password updated!</h1>
              <p className="text-muted-foreground text-sm">
                Your password has been changed. Redirecting you to sign in...
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-1">Choose a new password</h1>
              <p className="text-muted-foreground text-sm mb-6">
                Your new password must be at least 8 characters.
              </p>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full px-3 py-2.5 pr-10 rounded-md border border-input bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPw(!showPw)}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Confirm new password</label>
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3 py-2.5 rounded-md border border-input bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? "Updating..." : "Update password"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
