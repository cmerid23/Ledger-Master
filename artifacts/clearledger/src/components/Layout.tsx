import { Link, useLocation, useRoute } from "wouter";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CreditCard,
  FileText,
  BarChart3,
  Upload,
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  Menu,
  X,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { useListBusinesses } from "@workspace/api-client-react";
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
  { path: "/accounts", label: "Chart of Accounts", icon: BookOpen },
  { path: "/transactions", label: "Transactions", icon: CreditCard },
  { path: "/journal", label: "Journal Entries", icon: FileText },
  { path: "/reconcile", label: "Reconciliation", icon: CheckCircle },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/upload", label: "Upload Statement", icon: Upload },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children, businessId, onBusinessChange }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bizDropdownOpen, setBizDropdownOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: businesses } = useListBusinesses({ query: { enabled: !!getToken() } });
  const currentBusiness = businesses?.find((b) => b.id === businessId);

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
    queryClient.clear();
  }

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

        {/* Business switcher */}
        <div className="px-3 py-3 border-b border-sidebar-border relative">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-sidebar-accent transition-colors text-sm"
            onClick={() => setBizDropdownOpen(!bizDropdownOpen)}
          >
            <Building2 className="w-4 h-4 flex-shrink-0 text-sidebar-primary" />
            <span className="flex-1 text-left truncate text-sidebar-foreground">
              {currentBusiness?.name ?? "Select business"}
            </span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", bizDropdownOpen && "rotate-180")} />
          </button>

          {bizDropdownOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-card border border-card-border rounded-md shadow-lg overflow-hidden">
              {businesses?.map((biz) => (
                <button
                  key={biz.id}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                    biz.id === businessId && "text-primary font-medium"
                  )}
                  onClick={() => handleSwitchBusiness(biz.id)}
                >
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{biz.name}</span>
                </button>
              ))}
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted border-t border-border transition-colors"
                onClick={() => setBizDropdownOpen(false)}
              >
                + Add business
              </Link>
            </div>
          )}
        </div>

        {/* Nav items */}
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

        {/* Logout */}
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
        {/* Top bar (mobile) */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">ClearLedger</span>
          <span className="ml-auto text-sm text-muted-foreground truncate">{currentBusiness?.name}</span>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
