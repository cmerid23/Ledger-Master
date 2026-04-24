import { Link, useLocation } from "wouter";
import { BottomNav } from "./BottomNav";
import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CreditCard,
  FileText,
  ScrollText,
  BarChart3,
  Upload,
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  Menu,
  X,
  CheckCircle,
  Check,
  Plus,
  Receipt,
  Archive,
  Users,
  ClipboardList,
  Briefcase,
  Store,
  FileCheck,
  Truck,
  Clock,
  FileSignature,
  Repeat,
  Sparkles,
  Code2,
} from "lucide-react";
import {
  useListBusinesses,
  useCreateBusiness,
  getListBusinessesQueryKey,
} from "@workspace/api-client-react";
import { getToken, clearToken, clearBusinessId, getBusinessId, setBusinessId } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface LayoutProps {
  children: React.ReactNode;
  businessId: number;
  onBusinessChange: (id: number) => void;
}

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/invoices", label: "Invoices", icon: FileText },
  { path: "/quotes", label: "Quotes", icon: ClipboardList },
  { path: "/proposals", label: "Proposals", icon: FileSignature },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/time-tracking", label: "Time Tracking", icon: Clock },
  { path: "/vendors", label: "Vendors", icon: Store },
  { path: "/bills", label: "Bills (AP)", icon: FileCheck },
  { path: "/fleet", label: "Fleet", icon: Truck },
  { path: "/accounts", label: "Chart of Accounts", icon: BookOpen },
  { path: "/transactions", label: "Transactions", icon: CreditCard },
  { path: "/journal", label: "Journal Entries", icon: ScrollText },
  { path: "/reconcile", label: "Reconciliation", icon: CheckCircle },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/upload", label: "Upload Statement", icon: Upload },
  { path: "/receipts", label: "Receipts", icon: Receipt },
  { path: "/tax-pack", label: "Tax Pack", icon: Archive },
  { path: "/recurring-billing", label: "Recurring Billing", icon: Repeat },
  { path: "/ai-tools", label: "AI Tools", icon: Sparkles },
  { path: "/billing", label: "Billing", icon: CreditCard },
  { path: "/developer-api", label: "Developer API", icon: Code2 },
  { path: "/settings", label: "Settings", icon: Settings },
];

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SGD", "INR", "MXN"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function Layout({ children, businessId, onBusinessChange }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bizDropdownOpen, setBizDropdownOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newFiscalStart, setNewFiscalStart] = useState(1);
  const [addError, setAddError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: businesses } = useListBusinesses({ query: { enabled: !!getToken() } });
  const createBusiness = useCreateBusiness();
  const currentBusiness = businesses?.find((b) => b.id === businessId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBizDropdownOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    clearToken();
    clearBusinessId();
    queryClient.clear();
    window.location.href = "/login";
  }

  function handleSwitchBusiness(id: number) {
    setBusinessId(id);
    onBusinessChange(id);
    setBizDropdownOpen(false);
    setShowAddForm(false);
    queryClient.clear();
  }

  async function handleAddBusiness(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    try {
      const biz = await createBusiness.mutateAsync({
        data: { name: newName, currency: newCurrency, fiscalYearStart: newFiscalStart },
      });
      queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
      setNewName("");
      setNewCurrency("USD");
      setNewFiscalStart(1);
      setShowAddForm(false);
      setBizDropdownOpen(false);
      handleSwitchBusiness(biz.id);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setAddError(e?.data?.error || e?.message || "Failed to create company");
    }
  }

  const bizCount = businesses?.length ?? 0;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-lg text-white">ClearLedger</span>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Company switcher */}
        <div className="px-3 py-3 border-b border-sidebar-border relative" ref={dropdownRef}>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-sidebar-accent transition-colors text-sm"
            onClick={() => { setBizDropdownOpen(!bizDropdownOpen); setShowAddForm(false); }}
          >
            <div className="w-6 h-6 rounded bg-sidebar-primary/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-3.5 h-3.5 text-sidebar-primary" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="truncate text-sidebar-foreground text-sm font-medium leading-tight">
                {currentBusiness?.name ?? "Select company"}
              </div>
              {bizCount > 1 && (
                <div className="text-sidebar-foreground/50 text-xs leading-tight">
                  {bizCount} companies
                </div>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 text-sidebar-foreground/50 flex-shrink-0 transition-transform", bizDropdownOpen && "rotate-180")} />
          </button>

          {bizDropdownOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-card border border-card-border rounded-lg shadow-xl overflow-hidden">
              {/* Company list */}
              <div className="max-h-52 overflow-y-auto">
                {businesses?.map((biz) => (
                  <button
                    key={biz.id}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors",
                      biz.id === businessId ? "bg-primary/5" : ""
                    )}
                    onClick={() => handleSwitchBusiness(biz.id)}
                  >
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn("truncate font-medium", biz.id === businessId ? "text-primary" : "text-foreground")}>
                        {biz.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{biz.currency}</div>
                    </div>
                    {biz.id === businessId && (
                      <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Add company */}
              <div className="border-t border-border">
                {!showAddForm ? (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    onClick={() => setShowAddForm(true)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add new company
                  </button>
                ) : (
                  <form onSubmit={handleAddBusiness} className="p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground mb-1.5">New company</p>
                    {addError && (
                      <p className="text-xs text-destructive">{addError}</p>
                    )}
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Company name"
                      required
                      autoFocus
                      className="w-full px-2.5 py-1.5 rounded border border-input bg-background text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex gap-1.5">
                      <select
                        value={newCurrency}
                        onChange={(e) => setNewCurrency(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select
                        value={newFiscalStart}
                        onChange={(e) => setNewFiscalStart(Number(e.target.value))}
                        className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => { setShowAddForm(false); setAddError(""); }}
                        className="flex-1 py-1.5 rounded border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={createBusiness.isPending}
                        className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {createBusiness.isPending ? "Creating…" : "Create"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                href={path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all",
                  active
                    ? "bg-sidebar-primary text-white font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">ClearLedger</span>
          <span className="ml-auto text-sm text-muted-foreground truncate">{currentBusiness?.name}</span>
        </div>

        <main className="flex-1 overflow-y-auto pb-safe-bottom lg:pb-0">
          <div className="pb-16 lg:pb-0">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
