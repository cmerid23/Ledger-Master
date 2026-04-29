import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  LayoutDashboard, FileText, Briefcase, Truck, MoreHorizontal, X,
  Users, ClipboardList, Store, FileCheck, BookOpen, CreditCard,
  ScrollText, CheckCircle, BarChart3, Upload, Receipt, Archive, Settings, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_TABS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/invoices",  label: "Invoices",  icon: FileText },
  { path: "/jobs",      label: "Jobs",      icon: Briefcase },
  { path: "/fleet",     label: "Fleet",     icon: Truck },
];

const MORE_LINKS = [
  { path: "/customers",    label: "Customers",        icon: Users },
  { path: "/quotes",       label: "Quotes",           icon: ClipboardList },
  { path: "/vendors",      label: "Vendors",          icon: Store },
  { path: "/bills",        label: "Bills (AP)",       icon: FileCheck },
  { path: "/accounts",     label: "Chart of Accounts",icon: BookOpen },
  { path: "/transactions", label: "Transactions",     icon: CreditCard },
  { path: "/journal",      label: "Journal Entries",  icon: ScrollText },
  { path: "/reconcile",    label: "Reconciliation",   icon: CheckCircle },
  { path: "/reports",      label: "Reports",          icon: BarChart3 },
  { path: "/upload",       label: "Upload Statement", icon: Upload },
  { path: "/bank-rules",  label: "Bank Rules",       icon: Zap },
  { path: "/receipts",     label: "Receipts",         icon: Receipt },
  { path: "/tax-pack",     label: "Tax Pack",         icon: Archive },
  { path: "/settings",     label: "Settings",         icon: Settings },
];

export function BottomNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_LINKS.some((l) => location === l.path || location.startsWith(l.path + "/"));

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {PRIMARY_TABS.map(({ path, label, icon: Icon }) => {
          const active = location === path || location.startsWith(path + "/");
          return (
            <Link key={path} href={path}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", active ? "text-primary" : "text-muted-foreground")} />
              {label}
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
            isMoreActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className={cn("w-5 h-5", isMoreActive ? "text-primary" : "text-muted-foreground")} />
          More
        </button>
      </nav>

      {/* More drawer */}
      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-[60] bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="lg:hidden fixed bottom-0 inset-x-0 z-[70] bg-card rounded-t-2xl shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">More</span>
              <button onClick={() => setMoreOpen(false)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 px-3 pb-4">
              {MORE_LINKS.map(({ path, label, icon: Icon }) => {
                const active = location === path || location.startsWith(path + "/");
                return (
                  <Link key={path} href={path}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors text-[11px] font-medium",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", active ? "text-primary" : "")} />
                    <span className="text-center leading-tight">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
