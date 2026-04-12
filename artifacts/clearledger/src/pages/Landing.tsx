import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, useInView, useReducedMotion, AnimatePresence } from "framer-motion";
import { getToken } from "@/lib/auth";

// ─── Animation Helpers ────────────────────────────────────────────────────────
function useFadeUp(delay = 0) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion();
  return {
    ref,
    initial: reduced ? { opacity: 1 } : { opacity: 0, y: 32 },
    animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 },
    transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
  };
}

// ─── Icons (inline SVG) ──────────────────────────────────────────────────────
const BankIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
  </svg>
);
const SyncIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
  </svg>
);
const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);
const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);
const BuildingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
    <rect x="2" y="7" width="9" height="15"/>
    <rect x="13" y="3" width="9" height="19"/>
    <line x1="6" y1="12" x2="6" y2="12.01"/>
    <line x1="6" y1="16" x2="6" y2="16.01"/>
    <line x1="17" y1="8" x2="17" y2="8.01"/>
    <line x1="17" y1="12" x2="17" y2="12.01"/>
  </svg>
);
const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
);
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
  </svg>
);
const StarIcon = () => (
  <svg viewBox="0 0 20 20" fill="#10B981" className="w-4 h-4">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
  </svg>
);
const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ─── Dashboard Mockup ─────────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-xl mx-auto select-none pointer-events-none">
      <div className="bg-[#1E293B] rounded-2xl shadow-2xl overflow-hidden border border-white/10">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-[#0F172A] border-b border-white/5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-white/30 text-xs">ClearLedger — Dashboard</span>
        </div>
        <div className="p-5 space-y-4">
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Revenue", value: "$48,600", up: true },
              { label: "Expenses", value: "$31,200", up: false },
              { label: "Net Profit", value: "$17,400", up: true },
            ].map((s) => (
              <div key={s.label} className="bg-[#0F172A]/60 rounded-xl p-3">
                <div className="text-white/40 text-[10px] mb-1">{s.label}</div>
                <div className="text-white font-bold text-sm">{s.value}</div>
                <div className={`text-[10px] mt-0.5 font-medium ${s.up ? "text-emerald-400" : "text-rose-400"}`}>
                  {s.up ? "↑ 12.3%" : "↓ 4.1%"}
                </div>
              </div>
            ))}
          </div>
          {/* Fake bar chart */}
          <div className="bg-[#0F172A]/60 rounded-xl p-4">
            <div className="text-white/40 text-[10px] mb-3">Revenue vs Expenses — 2024</div>
            <div className="flex items-end gap-1.5 h-16">
              {[65,45,80,55,70,90,60,75,85,50,65,95].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col gap-0.5 justify-end">
                  <div className="rounded-sm bg-emerald-500/70" style={{ height: `${h * 0.6}%` }} />
                  <div className="rounded-sm bg-blue-400/40" style={{ height: `${(100 - h) * 0.3}%` }} />
                </div>
              ))}
            </div>
          </div>
          {/* Fake table rows */}
          <div className="bg-[#0F172A]/60 rounded-xl overflow-hidden">
            <div className="flex justify-between px-4 py-2 border-b border-white/5">
              <span className="text-white/30 text-[10px]">RECENT TRANSACTIONS</span>
              <span className="text-emerald-400/70 text-[10px]">View all</span>
            </div>
            {[
              { desc: "AWS Cloud Services", amt: "-$320.00", cat: "Software" },
              { desc: "Client Invoice #104", amt: "+$4,800.00", cat: "Revenue" },
              { desc: "Office Supplies", amt: "-$85.50", cat: "Supplies" },
            ].map((r) => (
              <div key={r.desc} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 last:border-0">
                <div>
                  <div className="text-white/80 text-[11px] font-medium">{r.desc}</div>
                  <div className="text-white/30 text-[9px]">{r.cat}</div>
                </div>
                <div className={`text-[11px] font-semibold ${r.amt.startsWith("+") ? "text-emerald-400" : "text-white/60"}`}>
                  {r.amt}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Glow */}
      <div className="absolute inset-0 -z-10 blur-3xl opacity-30 bg-emerald-500 rounded-full scale-75" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const [, navigate] = useLocation();
  const isLoggedIn = !!getToken();
  const reduced = useReducedMotion();

  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    if (isLoggedIn) {
      navigate("/dashboard");
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  function goTo(path: string) {
    navigate(path);
    setMobileMenuOpen(false);
  }

  const features = [
    { Icon: BankIcon, title: "Connect Your Bank", text: "Link your bank account and automatically import transactions in real time. No manual data entry required." },
    { Icon: UploadIcon, title: "Upload Bank Statements", text: "Import CSV bank statements. Our parser reads them instantly and categorises every transaction." },
    { Icon: SyncIcon, title: "Automatic Reconciliation", text: "Our engine matches bank transactions to journal entries by amount, date, and description — flagging only what needs your attention." },
    { Icon: ReceiptIcon, title: "Attach Receipts", text: "Photo your receipts and attach them directly to expenses. Come tax season, every deduction is documented and ready." },
    { Icon: ChartIcon, title: "Profit & Loss Reports", text: "Generate monthly or yearly P&L, Balance Sheet, and Cash Flow statements. Export to PDF or CSV in one click." },
    { Icon: BuildingsIcon, title: "Multiple Businesses", text: "Manage all your companies from one account. Each business has its own chart of accounts, reports, and data." },
  ];

  const steps = [
    { n: "01", title: "Create your business", desc: "Sign up free, create your business profile, and choose your chart of accounts template." },
    { n: "02", title: "Connect or upload", desc: "Upload your monthly CSV bank statement. Transactions import automatically and are parsed instantly." },
    { n: "03", title: "Reconcile and report", desc: "Our engine reconciles your books, you attach receipts to expenses, and generate reports whenever you need them." },
  ];

  const plans = [
    {
      name: "Starter", price: { monthly: 0, yearly: 0 }, highlight: false,
      features: ["1 business", "Upload bank statements (CSV)", "Up to 100 transactions/month", "Basic P&L report", "Receipt attachment (10 receipts)"],
      cta: "Get Started Free",
    },
    {
      name: "Pro", price: { monthly: 19, yearly: 15 }, highlight: true, badge: "Most Popular",
      features: ["Up to 3 businesses", "Unlimited transactions", "Full reports (P&L, Balance Sheet)", "Unlimited receipt storage", "Tax year-end export (ZIP)", "PDF export"],
      cta: "Start Free Trial",
    },
    {
      name: "Business", price: { monthly: 49, yearly: 39 }, highlight: false,
      features: ["Unlimited businesses", "Everything in Pro", "Team member access", "Priority support", "Custom chart of accounts", "Email reports to accountant"],
      cta: "Contact Us",
    },
  ];

  const testimonials = [
    { quote: "ClearLedger replaced three spreadsheets and an accountant visit. Reconciliation used to take me a full day — now it takes ten minutes.", name: "Sarah M.", role: "Bakery Owner", initials: "SM" },
    { quote: "Attaching receipts to every expense has made tax season stress-free. My accountant loves the year-end ZIP export.", name: "James K.", role: "Freelance Consultant", initials: "JK" },
    { quote: "Managing two businesses from one account with separate books is exactly what I needed. Clean, fast, reliable.", name: "Priya R.", role: "Retail Business Owner", initials: "PR" },
  ];

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Inter', system-ui, sans-serif", scrollBehavior: "smooth" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .hero-grid {
          background-color: #0F172A;
          background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .glow-corner {
          position: absolute;
          top: -80px; right: -80px;
          width: 500px; height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        @keyframes floatY {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{ background: scrolled ? "rgba(255,255,255,0.97)" : "transparent", boxShadow: scrolled ? "0 1px 12px rgba(0,0,0,0.08)" : "none", backdropFilter: scrolled ? "blur(8px)" : "none" }}
      >
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#10B981" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-5 h-5">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
              </svg>
            </div>
            <span className="font-bold text-lg" style={{ color: scrolled ? "#0F172A" : "white" }}>ClearLedger</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {["Features","Pricing","About"].map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} className="text-sm font-medium transition-colors"
                style={{ color: scrolled ? "#475569" : "rgba(255,255,255,0.8)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#10B981")}
                onMouseLeave={(e) => (e.currentTarget.style.color = scrolled ? "#475569" : "rgba(255,255,255,0.8)")}
              >{l}</a>
            ))}
          </nav>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => goTo("/login")} className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              style={{ color: scrolled ? "#475569" : "rgba(255,255,255,0.85)", border: scrolled ? "1px solid #E2E8F0" : "1px solid rgba(255,255,255,0.2)" }}>
              Log In
            </button>
            <button onClick={() => goTo("/register")} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ background: "#10B981" }}>
              Start Free Trial
            </button>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-1" style={{ color: scrolled ? "#0F172A" : "white" }} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-t border-gray-100 overflow-hidden">
              <div className="px-5 py-4 space-y-3">
                {["Features","Pricing","About"].map((l) => (
                  <a key={l} href={`#${l.toLowerCase()}`} onClick={() => setMobileMenuOpen(false)}
                    className="block text-sm font-medium text-slate-700 py-1">{l}</a>
                ))}
                <div className="pt-2 flex flex-col gap-2">
                  <button onClick={() => goTo("/login")} className="w-full text-sm font-medium py-2.5 rounded-lg border border-slate-200 text-slate-700">Log In</button>
                  <button onClick={() => goTo("/register")} className="w-full text-sm font-semibold py-2.5 rounded-lg text-white" style={{ background: "#10B981" }}>Start Free Trial</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="hero-grid relative min-h-screen flex items-center overflow-hidden pt-16">
        <div className="glow-corner" />
        <div className="max-w-7xl mx-auto px-5 py-20 w-full grid md:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div>
            <motion.div initial={reduced ? {} : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
                style={{ background: "rgba(16,185,129,0.15)", color: "#10B981" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Trusted by 500+ businesses
              </div>
            </motion.div>

            <motion.h1 initial={reduced ? {} : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl md:text-6xl font-extrabold leading-tight mb-5" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Smart Accounting<br />
              <span style={{ color: "#10B981" }}>for Growing</span><br />
              Businesses
            </motion.h1>

            <motion.p initial={reduced ? {} : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }}
              className="text-lg mb-8 leading-relaxed" style={{ color: "rgba(255,255,255,0.65)", maxWidth: 480 }}>
              Upload bank statements, auto-reconcile transactions, attach receipts, and generate professional financial reports — all in one place.
            </motion.p>

            <motion.div initial={reduced ? {} : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-wrap gap-3 mb-5">
              <button onClick={() => goTo("/register")}
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white text-sm transition-all hover:scale-105"
                style={{ background: "#10B981", boxShadow: "0 4px 20px rgba(16,185,129,0.4)" }}>
                Start Free Trial
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
              <button onClick={() => setDemoOpen(true)}
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all hover:scale-105"
                style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Watch Demo
              </button>
            </motion.div>

            <motion.p initial={reduced ? {} : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.65 }}
              className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              No credit card required · Free 14-day trial · Cancel anytime
            </motion.p>

            <motion.p initial={reduced ? {} : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.7 }}
              className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
              Demo: <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>demo@clearledger.com</code> / <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>demo123</code>
            </motion.p>
          </div>

          {/* Dashboard mockup */}
          <motion.div
            initial={reduced ? {} : { opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            style={{ animation: reduced ? "none" : "floatY 4s ease-in-out 1.2s infinite" }}
          >
            <DashboardMockup />
          </motion.div>
        </div>
      </section>

      {/* ── TRUST BAR ────────────────────────────────────────────────────────── */}
      <section style={{ background: "#F8FAFC", borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
        <div className="max-w-7xl mx-auto px-5 py-10 text-center">
          <p className="text-sm font-medium mb-6" style={{ color: "#94A3B8" }}>Trusted by small businesses and accountants across industries</p>
          <div className="flex flex-wrap justify-center gap-4">
            {["Bakery Co", "Consulting Ltd", "Retail Store", "Design Studio", "Tech Startup", "Law Firm"].map((name) => (
              <div key={name} className="px-5 py-2.5 rounded-xl text-sm font-medium" style={{ background: "#E2E8F0", color: "#94A3B8" }}>{name}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24" style={{ background: "white" }}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <motion.h2 {...useFadeUp()} className="text-4xl font-bold mb-3" style={{ color: "#0F172A" }}>
              Everything you need to run your finances
            </motion.h2>
            <motion.p {...useFadeUp(0.1)} className="text-lg" style={{ color: "#64748B" }}>
              Built for business owners who want clarity, not complexity
            </motion.p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => {
              const props = useFadeUp(i * 0.08);
              return (
                <motion.div key={f.title} {...props}
                  className="group p-7 rounded-2xl border cursor-default transition-all duration-200"
                  style={{ borderColor: "#E2E8F0", background: "white" }}
                  whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.08)" }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors"
                    style={{ background: "#F0FDF4", color: "#10B981" }}>
                    <f.Icon />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: "#0F172A" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#64748B" }}>{f.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section style={{ background: "#0F172A" }} className="py-24">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-16">
            <motion.h2 {...useFadeUp()} className="text-4xl font-bold text-white mb-3">Up and running in minutes</motion.h2>
            <motion.p {...useFadeUp(0.1)} style={{ color: "rgba(255,255,255,0.5)" }} className="text-lg">Three simple steps to financial clarity</motion.p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px"
              style={{ background: "linear-gradient(to right, #10B981, #10B981)" }} />
            {steps.map((s, i) => {
              const props = useFadeUp(i * 0.12);
              return (
                <motion.div key={s.n} {...props} className="text-center relative">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 text-white font-bold text-xl relative z-10"
                    style={{ background: "#10B981", boxShadow: "0 0 0 6px rgba(16,185,129,0.15)" }}>
                    {s.n}
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{s.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{s.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24" style={{ background: "#F8FAFC" }}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-12">
            <motion.h2 {...useFadeUp()} className="text-4xl font-bold mb-3" style={{ color: "#0F172A" }}>Simple, transparent pricing</motion.h2>
            <motion.p {...useFadeUp(0.1)} className="text-lg mb-7" style={{ color: "#64748B" }}>Start free. Upgrade when you're ready.</motion.p>
            {/* Toggle */}
            <motion.div {...useFadeUp(0.15)} className="inline-flex items-center rounded-xl p-1" style={{ background: "#E2E8F0" }}>
              {(["monthly", "yearly"] as const).map((b) => (
                <button key={b} onClick={() => setBilling(b)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize"
                  style={{ background: billing === b ? "white" : "transparent", color: billing === b ? "#0F172A" : "#64748B", boxShadow: billing === b ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
                  {b} {b === "yearly" && <span style={{ color: "#10B981", fontSize: 11 }}>&nbsp;−20%</span>}
                </button>
              ))}
            </motion.div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans.map((plan, i) => {
              const props = useFadeUp(i * 0.1);
              const price = plan.price[billing];
              return (
                <motion.div key={plan.name} {...props}
                  className="rounded-2xl p-7 relative"
                  style={{
                    background: plan.highlight ? "#0F172A" : "white",
                    border: plan.highlight ? "2px solid #10B981" : "1px solid #E2E8F0",
                    boxShadow: plan.highlight ? "0 20px 60px rgba(16,185,129,0.2)" : "0 2px 12px rgba(0,0,0,0.04)",
                  }}>
                  {plan.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white"
                      style={{ background: "#10B981" }}>
                      {plan.badge}
                    </div>
                  )}
                  <div className="mb-6">
                    <h3 className="font-bold text-lg mb-1" style={{ color: plan.highlight ? "white" : "#0F172A" }}>{plan.name}</h3>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-extrabold" style={{ color: plan.highlight ? "white" : "#0F172A" }}>
                        ${price}
                      </span>
                      <span className="text-sm mb-1.5" style={{ color: plan.highlight ? "rgba(255,255,255,0.5)" : "#94A3B8" }}>/month</span>
                    </div>
                    {billing === "yearly" && price > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "#10B981" }}>Billed annually</p>
                    )}
                  </div>
                  <ul className="space-y-2.5 mb-7">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <svg viewBox="0 0 20 20" fill="#10B981" className="w-4 h-4 mt-0.5 shrink-0">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                        </svg>
                        <span style={{ color: plan.highlight ? "rgba(255,255,255,0.75)" : "#475569" }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => goTo(plan.name === "Business" ? "/login" : "/register")}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                    style={{
                      background: plan.highlight ? "#10B981" : "transparent",
                      color: plan.highlight ? "white" : "#10B981",
                      border: plan.highlight ? "none" : "2px solid #10B981",
                    }}>
                    {plan.cta}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section className="py-24" style={{ background: "white" }}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <motion.h2 {...useFadeUp()} className="text-4xl font-bold mb-3" style={{ color: "#0F172A" }}>What our users say</motion.h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => {
              const props = useFadeUp(i * 0.1);
              return (
                <motion.div key={t.name} {...props}
                  className="p-7 rounded-2xl border"
                  style={{ borderColor: "#E2E8F0", boxShadow: "0 4px 24px rgba(0,0,0,0.05)" }}>
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(5)].map((_, j) => <StarIcon key={j} />)}
                  </div>
                  <p className="text-sm leading-relaxed mb-6 italic" style={{ color: "#475569" }}>"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: "#10B981" }}>
                      {t.initials}
                    </div>
                    <div>
                      <div className="font-semibold text-sm" style={{ color: "#0F172A" }}>{t.name}</div>
                      <div className="text-xs" style={{ color: "#94A3B8" }}>{t.role}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ABOUT ────────────────────────────────────────────────────────────── */}
      <section id="about" className="py-24" style={{ background: "#F8FAFC" }}>
        <div className="max-w-7xl mx-auto px-5 grid md:grid-cols-2 gap-14 items-center">
          <motion.div {...useFadeUp()}>
            <h2 className="text-4xl font-bold mb-5" style={{ color: "#0F172A" }}>
              Built by people who understand small business
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: "#64748B" }}>
              ClearLedger was built because existing accounting software was either too complex, too expensive, or too outdated. We wanted something that reconciles automatically, stores your receipts, and generates reports without needing an accounting degree. We are a small team obsessed with making financial clarity accessible to every business owner.
            </p>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {[["500+", "Businesses"], ["2M+", "Transactions Processed"], ["99.9%", "Uptime"], ["4.9★", "Rating"]].map(([v, l]) => (
                <div key={l} className="p-4 rounded-xl" style={{ background: "white", border: "1px solid #E2E8F0" }}>
                  <div className="text-2xl font-extrabold mb-0.5" style={{ color: "#10B981" }}>{v}</div>
                  <div className="text-xs" style={{ color: "#94A3B8" }}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={() => goTo("/register")}
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#10B981" }}>
              Learn More About Us
            </button>
          </motion.div>
          {/* Image placeholder */}
          <motion.div {...useFadeUp(0.15)} className="rounded-2xl overflow-hidden" style={{ background: "#0F172A", minHeight: 360 }}>
            <div className="h-full flex flex-col items-center justify-center p-8" style={{ minHeight: 360 }}>
              <div className="w-24 h-24 rounded-2xl flex items-center justify-center mb-6"
                style={{ background: "rgba(16,185,129,0.15)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={1.5} className="w-12 h-12">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <p className="text-center text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                "Financial clarity for every business owner, regardless of accounting expertise."
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{ background: "#10B981" }} className="py-20">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <motion.h2 {...useFadeUp()} className="text-4xl font-extrabold text-white mb-4">
            Ready to take control of your finances?
          </motion.h2>
          <motion.p {...useFadeUp(0.1)} className="text-lg mb-8" style={{ color: "rgba(255,255,255,0.8)" }}>
            Join hundreds of business owners using ClearLedger to reconcile faster, report smarter, and stress less at tax time.
          </motion.p>
          <motion.div {...useFadeUp(0.18)} className="flex flex-wrap justify-center gap-3">
            <button onClick={() => goTo("/register")}
              className="px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
              style={{ background: "white", color: "#0F172A" }}>
              Start Free Trial
            </button>
            <button onClick={() => setDemoOpen(true)}
              className="px-7 py-3.5 rounded-xl text-sm font-bold border-2 transition-all hover:scale-105"
              style={{ borderColor: "rgba(255,255,255,0.5)", color: "white" }}>
              Book a Demo
            </button>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#0F172A" }}>
        <div className="max-w-7xl mx-auto px-5 py-14">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#10B981" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-5 h-5">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
                  </svg>
                </div>
                <span className="font-bold text-white">ClearLedger</span>
              </div>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "#64748B" }}>
                Smart accounting for growing businesses.
              </p>
              <div className="flex gap-3">
                {[TwitterIcon, LinkedInIcon, FacebookIcon].map((Icon, i) => (
                  <button key={i} className="p-2 rounded-lg transition-colors hover:bg-white/10" style={{ color: "#64748B" }}>
                    <Icon />
                  </button>
                ))}
              </div>
            </div>
            {/* Links */}
            {[
              { title: "Product", links: ["Features", "Pricing", "Changelog", "Roadmap"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
              { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Cookie Policy", "Security"] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="font-semibold text-sm mb-4" style={{ color: "#94A3B8" }}>{col.title}</h4>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}>
                      <button className="text-sm transition-colors hover:text-white" style={{ color: "#475569" }}>{l}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} className="pt-7 text-center">
            <p className="text-sm" style={{ color: "#475569" }}>© 2025 ClearLedger. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* ── DEMO MODAL ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {demoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
            onClick={() => setDemoOpen(false)}>
            <motion.div initial={reduced ? {} : { scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-2xl rounded-2xl overflow-hidden"
              style={{ background: "#1E293B" }}
              onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="font-semibold text-white text-sm">Product Demo</span>
                <button aria-label="Close modal" onClick={() => setDemoOpen(false)} className="p-1 rounded-lg hover:bg-white/10 transition-colors" style={{ color: "rgba(255,255,255,0.5)" }}>
                  <CloseIcon />
                </button>
              </div>
              {/* Video placeholder */}
              <div className="mx-5 my-5 rounded-xl flex items-center justify-center" style={{ aspectRatio: "16/9", background: "#0F172A", border: "2px dashed rgba(255,255,255,0.1)" }}>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(16,185,129,0.15)" }}>
                    <svg viewBox="0 0 24 24" fill="#10B981" className="w-7 h-7">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </div>
                  <p className="font-semibold text-white text-sm">Demo video coming soon</p>
                  <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Try the live demo with demo@clearledger.com / demo123</p>
                  <button onClick={() => { setDemoOpen(false); goTo("/login"); }}
                    className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "#10B981" }}>
                    Try Live Demo Instead
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
