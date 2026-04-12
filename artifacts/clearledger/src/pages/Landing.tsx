import { useLocation } from "wouter";
import { getToken } from "@/lib/auth";
import {
  BarChart3,
  BookOpen,
  Upload,
  ShieldCheck,
  FileText,
  Receipt,
  Package,
  LayoutDashboard,
  ArrowRight,
  CheckCircle2,
  Building2,
  TrendingUp,
  Lock,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: LayoutDashboard,
    color: "text-violet-600",
    bg: "bg-violet-50",
    title: "Live Dashboard",
    description: "Real-time P&L, cash balance, revenue vs expenses charts, and recent transactions all in one view.",
  },
  {
    icon: BookOpen,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Chart of Accounts",
    description: "Full double-entry chart of accounts — assets, liabilities, equity, revenue, and expenses with parent/child hierarchy.",
  },
  {
    icon: BarChart3,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    title: "Transactions & Journal",
    description: "Manual transactions, bulk categorization, and a full double-entry journal with debit/credit line items.",
  },
  {
    icon: Upload,
    color: "text-amber-600",
    bg: "bg-amber-50",
    title: "CSV Bank Import",
    description: "Upload bank statement CSVs, preview parsed rows, assign accounts, and import in one click.",
  },
  {
    icon: ShieldCheck,
    color: "text-teal-600",
    bg: "bg-teal-50",
    title: "Bank Reconciliation",
    description: "Auto-match bank transactions to journal entries with confidence scoring. Mark high-confidence matches instantly.",
  },
  {
    icon: FileText,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    title: "Financial Reports",
    description: "Generate Profit & Loss statements and Balance Sheets for any date range, ready to share with stakeholders.",
  },
  {
    icon: Receipt,
    color: "text-rose-600",
    bg: "bg-rose-50",
    title: "Receipt Management",
    description: "Attach receipts to any transaction via drag-and-drop. Preview images, track missing receipts, and stay audit-ready.",
  },
  {
    icon: Package,
    color: "text-orange-600",
    bg: "bg-orange-50",
    title: "Tax Pack Export",
    description: "Generate a complete tax-year ZIP with P&L PDF, Balance Sheet PDF, and categorized CSV. Email directly to your accountant.",
  },
  {
    icon: Building2,
    color: "text-sky-600",
    bg: "bg-sky-50",
    title: "Multi-Business",
    description: "Manage multiple companies under one login. Switch between businesses instantly — fully isolated data per entity.",
  },
];

const HIGHLIGHTS = [
  "Double-entry bookkeeping engine",
  "Multi-business support",
  "CSV bank statement import",
  "Auto bank reconciliation",
  "P&L and Balance Sheet reports",
  "Receipt file attachments",
  "Tax pack ZIP export",
  "Email reports to accountant",
  "Full audit trail",
  "Admin portal for oversight",
];

export default function LandingPage() {
  const [, navigate] = useLocation();
  const isLoggedIn = !!getToken();

  function handleGetStarted() {
    navigate(isLoggedIn ? "/dashboard" : "/register");
  }

  function handleSignIn() {
    navigate(isLoggedIn ? "/dashboard" : "/login");
  }

  function handleDemo() {
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground tracking-tight">ClearLedger</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSignIn}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isLoggedIn ? "Go to app" : "Sign in"}
            </button>
            <button
              onClick={handleGetStarted}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {isLoggedIn ? "Dashboard" : "Get started"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <Zap className="w-3 h-3" />
          Advanced accounting for modern businesses
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-foreground leading-tight mb-5">
          Professional accounting,<br />
          <span className="text-primary">without the complexity</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          ClearLedger brings full double-entry bookkeeping, automated bank reconciliation,
          financial reports, and tax-year exports into one clean, fast interface.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleGetStarted}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm"
          >
            {isLoggedIn ? "Open Dashboard" : "Start for free"}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleDemo}
            className="flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
          >
            Try demo account
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Demo: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">demo@clearledger.com</code> / <code className="bg-muted px-1.5 py-0.5 rounded text-xs">demo123</code>
        </p>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: "Core modules", value: "9" },
            { label: "Report types", value: "2" },
            { label: "Multi-business", value: "✓" },
            { label: "Audit ready", value: "✓" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-foreground">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-3">Everything you need to manage finances</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From daily bookkeeping to year-end tax exports — ClearLedger covers the full accounting lifecycle.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card border border-card-border rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-lg ${f.bg} flex items-center justify-center mb-4`}>
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Highlights checklist */}
      <section className="bg-muted/30 border-y border-border">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Built for accountants<br />and founders alike
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Whether you're a bookkeeper handling multiple clients or a founder tracking
                your startup's finances, ClearLedger gives you professional-grade tools
                without the enterprise price tag.
              </p>
              <button
                onClick={handleGetStarted}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
              >
                {isLoggedIn ? "Go to dashboard" : "Create free account"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {HIGHLIGHTS.map((h) => (
                <div key={h} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security / trust */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-2">Secure & reliable</h2>
          <p className="text-muted-foreground text-sm">Your financial data is protected at every layer</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Lock,
              title: "Secure authentication",
              desc: "Session-based auth with hashed passwords. Each user's data is fully isolated.",
            },
            {
              icon: ShieldCheck,
              title: "Business isolation",
              desc: "All business data is scoped per user. No cross-contamination between accounts.",
            },
            {
              icon: TrendingUp,
              title: "Double-entry integrity",
              desc: "Every transaction follows double-entry rules — debits always equal credits.",
            },
          ].map((item) => (
            <div key={item.title} className="text-center p-6 bg-card border border-card-border rounded-xl">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold text-primary-foreground mb-3">
            Ready to take control of your books?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            Get started in minutes. Create your account and add your first business today.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleGetStarted}
              className="px-6 py-3 rounded-lg bg-background text-foreground font-semibold text-sm hover:bg-muted transition-colors"
            >
              {isLoggedIn ? "Go to dashboard" : "Get started — it's free"}
            </button>
            <button
              onClick={handleDemo}
              className="px-6 py-3 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold text-sm hover:bg-primary-foreground/10 transition-colors"
            >
              Try the demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">ClearLedger</span>
          </div>
          <p className="text-xs text-muted-foreground">Advanced accounting for modern businesses</p>
        </div>
      </footer>
    </div>
  );
}
