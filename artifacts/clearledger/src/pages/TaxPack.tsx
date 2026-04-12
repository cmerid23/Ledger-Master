import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Archive,
  Download,
  Mail,
  AlertCircle,
  CheckCircle2,
  FileX,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Loader2,
  X,
  Info,
  Car,
  MapPin,
  DollarSign,
  Users,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomeSummary {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  invoiceCount: number;
  byCustomer: { name: string; invoiced: number; collected: number; outstanding: number; count: number }[];
}

interface VehicleBreakdownItem {
  type: string;
  label: string;
  total: number;
}

interface EstimatedTax {
  netProfit: number;
  mileageDeduction: number;
  adjustedProfit: number;
  seTaxBase: number;
  seTax: number;
  seTaxDeduction: number;
  standardDeduction: number;
  federalTaxableIncome: number;
  federalTax: number;
  totalEstimatedTax: number;
  effectiveRate: number;
  brackets: { rate: number; upTo: number; taxableAmount: number; tax: number }[];
}

interface QuarterRow {
  label: string;
  income: number;
  expenses: number;
  profit: number;
}

interface TaxSummary {
  year: number;
  businessName: string;
  totalTransactions: number;
  totalWithReceipts: number;
  totalMissingReceipts: number;
  totalTaxDeductible: number;
  totalNonDeductible: number;
  totalAmount: number;
  categoryBreakdown: {
    category: string;
    totalAmount: number;
    taxDeductibleAmount: number;
    nonDeductibleAmount: number;
    transactionCount: number;
    withReceiptsCount: number;
  }[];
  accountBreakdown: {
    accountId: number | null;
    accountName: string;
    totalAmount: number;
    transactionCount: number;
  }[];
  missingReceiptTransactions: {
    id: number;
    date: string;
    description: string;
    amount: number;
    type: string;
    accountName: string | null;
    category: string;
  }[];
  // ── New fields ──
  incomeSummary: IncomeSummary;
  mileage: { totalMiles: number; irsRate: number; mileageDeduction: number };
  vehicleExpenses: { vehicleBreakdown: VehicleBreakdownItem[]; vehicleTotal: number };
  estimatedTax: EstimatedTax;
  quarterlyBreakdown: QuarterRow[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const pct = (n: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;

const n = (v: number | string | undefined | null) => Number(v ?? 0);

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaxPackPage({ businessId }: { businessId: number }) {
  const [year, setYear] = useState(currentYear);
  const [taxDeductibleOnly, setTaxDeductibleOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [showMissing, setShowMissing] = useState(false);
  const [showCustomers, setShowCustomers] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const {
    data: summary,
    isLoading,
    isError,
  } = useQuery<TaxSummary>({
    queryKey: ["tax-summary", businessId, year],
    queryFn: async () => {
      const res = await fetch(`/api/businesses/${businessId}/tax-summary?year=${year}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const emailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`/api/businesses/${businessId}/email-tax-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ year, toEmail: email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.details || err.error || "Failed to send");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Email sent!", description: data.message });
      setEmailOpen(false);
      setToEmail("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const handleDownload = async () => {
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/tax-pack?year=${year}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tax-pack-${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not generate tax pack.", variant: "destructive" });
    } finally {
      setDownloadLoading(false);
    }
  };

  const filteredCategories = useMemo(() => {
    if (!summary) return [];
    let rows = summary.categoryBreakdown;
    if (selectedAccount !== "all") {
      const accName = summary.accountBreakdown.find((a) => String(a.accountId ?? "none") === selectedAccount)?.accountName;
      if (accName) rows = rows.filter((r) => r.category === accName);
    }
    if (taxDeductibleOnly) rows = rows.filter((r) => r.taxDeductibleAmount > 0);
    if (selectedCategory !== "all") rows = rows.filter((r) => r.category === selectedCategory);
    return rows;
  }, [summary, taxDeductibleOnly, selectedCategory, selectedAccount]);

  const filteredMissing = useMemo(() => {
    if (!summary) return [];
    let rows = summary.missingReceiptTransactions;
    if (taxDeductibleOnly) return [];
    if (selectedCategory !== "all") rows = rows.filter((r) => r.category === selectedCategory);
    return rows;
  }, [summary, taxDeductibleOnly, selectedCategory]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Archive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tax Pack</h1>
            <p className="text-sm text-muted-foreground">Year-end summary, receipts & reports for your accountant</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => setEmailOpen(true)} disabled={isLoading}>
            <Mail className="w-4 h-4 mr-2" />
            Email to Accountant
          </Button>

          <Button onClick={handleDownload} disabled={isLoading || downloadLoading}>
            {downloadLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Download Full Tax Pack
          </Button>
        </div>
      </div>

      {/* ── ZIP notice ── */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3 border">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          The ZIP includes <strong>summary.csv</strong>, <strong>receipts-index.csv</strong>, all receipt files renamed by date/vendor/amount, a <strong>profit-loss.pdf</strong>, a <strong>balance-sheet.pdf</strong>, and a <strong>tax-summary.pdf</strong> with income, mileage, vehicle expenses, estimated tax, and quarterly breakdown.
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading tax summary…
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="w-5 h-5" />
          Failed to load tax summary.
        </div>
      )}

      {summary && (
        <>
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Transactions</p>
                <p className="text-2xl font-bold">{summary.totalTransactions}</p>
                <p className="text-xs text-muted-foreground mt-1">{summary.totalWithReceipts} with receipts</p>
              </CardContent>
            </Card>

            <Card className={summary.totalMissingReceipts > 0 ? "border-amber-400" : ""}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Missing Receipts</p>
                <p className={`text-2xl font-bold ${summary.totalMissingReceipts > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {summary.totalMissingReceipts}
                </p>
                {summary.totalMissingReceipts > 0 ? (
                  <button className="text-xs text-amber-600 underline mt-1 hover:text-amber-700" onClick={() => setShowMissing((v) => !v)}>
                    {showMissing ? "Hide list" : "Show missing"}
                  </button>
                ) : (
                  <p className="text-xs text-emerald-600 mt-1">All covered!</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Tax Deductible</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{fmt(summary.totalTaxDeductible)}</p>
                <p className="text-xs text-muted-foreground mt-1">{pct(summary.totalTaxDeductible, summary.totalAmount)} of total</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingDown className="w-3 h-3 text-slate-500" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Non-Deductible</p>
                </div>
                <p className="text-2xl font-bold">{fmt(summary.totalNonDeductible)}</p>
                <p className="text-xs text-muted-foreground mt-1">{pct(summary.totalNonDeductible, summary.totalAmount)} of total</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Missing receipts expandable ── */}
          {showMissing && summary.totalMissingReceipts > 0 && (
            <Card className="border-amber-300">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                  <FileX className="w-4 h-4" />
                  Transactions Missing Receipts ({filteredMissing.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate("/transactions")}>
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                    Go to Transactions
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowMissing(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left py-2 px-4 font-medium text-muted-foreground">Date</th>
                        <th className="text-left py-2 px-4 font-medium text-muted-foreground">Description</th>
                        <th className="text-left py-2 px-4 font-medium text-muted-foreground">Account</th>
                        <th className="text-left py-2 px-4 font-medium text-muted-foreground">Type</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMissing.map((tx) => (
                        <tr key={tx.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-4 text-muted-foreground">{tx.date}</td>
                          <td className="py-2 px-4 max-w-48 truncate">{tx.description}</td>
                          <td className="py-2 px-4 text-muted-foreground">{tx.accountName ?? "—"}</td>
                          <td className="py-2 px-4"><Badge variant="outline" className="text-xs">{tx.type}</Badge></td>
                          <td className={`py-2 px-4 text-right font-mono ${Number(tx.amount) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {fmt(Number(tx.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ── Section 1: Income Summary ── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                1. Income Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Invoiced</p>
                  <p className="text-xl font-bold text-emerald-700">{fmt(n(summary.incomeSummary?.totalInvoiced))}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{summary.incomeSummary?.invoiceCount ?? 0} invoices issued</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Collected</p>
                  <p className="text-xl font-bold text-blue-700">{fmt(n(summary.incomeSummary?.totalCollected))}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Payments received</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Outstanding</p>
                  <p className="text-xl font-bold text-amber-700">{fmt(n(summary.incomeSummary?.totalOutstanding))}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Not yet collected</p>
                </div>
              </div>

              {(summary.incomeSummary?.byCustomer?.length ?? 0) > 0 && (
                <div>
                  <button
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                    onClick={() => setShowCustomers((v) => !v)}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Customer Breakdown ({summary.incomeSummary.byCustomer.length})
                    <span className="text-xs">{showCustomers ? "▲" : "▼"}</span>
                  </button>
                  {showCustomers && (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 border-b">
                            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Customer</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Invoiced</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Collected</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Outstanding</th>
                            <th className="text-center py-2 px-3 font-medium text-muted-foreground"># Invoices</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.incomeSummary.byCustomer.map((c) => (
                            <tr key={c.name} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-3 font-medium">{c.name}</td>
                              <td className="py-2 px-3 text-right font-mono">{fmt(n(c.invoiced))}</td>
                              <td className="py-2 px-3 text-right font-mono text-emerald-700">{fmt(n(c.collected))}</td>
                              <td className="py-2 px-3 text-right font-mono text-amber-600">{fmt(n(c.outstanding))}</td>
                              <td className="py-2 px-3 text-center text-muted-foreground">{c.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ── Section 2: Expense Summary ── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                2. Expense Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tax Deductible</p>
                  <p className="text-xl font-bold text-emerald-700">{fmt(summary.totalTaxDeductible)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pct(summary.totalTaxDeductible, summary.totalAmount)} of all transactions</p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 border p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Non-Deductible</p>
                  <p className="text-xl font-bold">{fmt(summary.totalNonDeductible)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pct(summary.totalNonDeductible, summary.totalAmount)} of all transactions</p>
                </div>
                <div className={`rounded-lg border p-4 ${summary.totalMissingReceipts > 0 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"}`}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Receipts</p>
                  <p className={`text-xl font-bold ${summary.totalMissingReceipts > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {summary.totalWithReceipts}/{summary.totalTransactions}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.totalMissingReceipts > 0 ? `${summary.totalMissingReceipts} missing` : "All attached"}
                  </p>
                </div>
              </div>

              {/* Top deductible categories */}
              {summary.categoryBreakdown.filter((c) => c.taxDeductibleAmount > 0).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Top Deductible Categories</p>
                  <div className="space-y-2">
                    {summary.categoryBreakdown
                      .filter((c) => c.taxDeductibleAmount > 0)
                      .slice(0, 6)
                      .map((c) => {
                        const pctVal = summary.totalTaxDeductible > 0
                          ? (c.taxDeductibleAmount / summary.totalTaxDeductible) * 100
                          : 0;
                        return (
                          <div key={c.category}>
                            <div className="flex justify-between text-sm mb-0.5">
                              <span className="text-muted-foreground">{c.category}</span>
                              <span className="font-medium">{fmt(c.taxDeductibleAmount)}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pctVal}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ── Section 3: Mileage Deduction ── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                3. Mileage Deduction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Business Miles</p>
                  <p className="text-xl font-bold text-blue-700">
                    {n(summary.mileage?.totalMiles).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">From jobs tracked in {year}</p>
                </div>
                <div className="rounded-lg bg-muted/30 border p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">IRS Rate ({year})</p>
                  <p className="text-xl font-bold">${n(summary.mileage?.irsRate).toFixed(3)}/mile</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Standard business mileage rate</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Deduction Value</p>
                  <p className="text-xl font-bold text-emerald-700">{fmt(n(summary.mileage?.mileageDeduction))}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Miles × IRS rate</p>
                </div>
              </div>
              {n(summary.mileage?.totalMiles) === 0 && (
                <p className="text-sm text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  No miles logged in jobs for {year}. Enter actual miles on each job to track this deduction.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ── Section 4: Vehicle & Asset Expenses ── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="w-4 h-4 text-slate-600" />
                4. Vehicle &amp; Asset Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(summary.vehicleExpenses?.vehicleTotal ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  No vehicle expenses logged in jobs for {year}. Add expenses to jobs (fuel, maintenance, etc.) to see them here.
                </p>
              ) : (
                <div className="space-y-3">
                  {summary.vehicleExpenses.vehicleBreakdown.map((v) => {
                    const pctVal = summary.vehicleExpenses.vehicleTotal > 0
                      ? (v.total / summary.vehicleExpenses.vehicleTotal) * 100
                      : 0;
                    return (
                      <div key={v.type}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className="text-muted-foreground">{v.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{fmt(v.total)}</span>
                            <span className="text-xs text-muted-foreground w-10 text-right">{pctVal.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-slate-500 rounded-full transition-all" style={{ width: `${pctVal}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-2 border-t text-sm font-semibold">
                    <span>Total Vehicle Expenses</span>
                    <span>{fmt(summary.vehicleExpenses.vehicleTotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ── Section 5: Estimated Tax Liability ── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <Card className="border-orange-200 dark:border-orange-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-600" />
                5. Estimated Tax Liability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Disclaimer */}
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>This is an estimate only — consult your accountant.</strong> Calculations use 2024 single-filer brackets and standard deduction. Your actual liability may differ based on filing status, deductions, credits, and state taxes.
                </p>
              </div>

              {n(summary.estimatedTax?.netProfit) <= 0 ? (
                <p className="text-sm text-muted-foreground">Net profit is zero or negative — no estimated tax to display.</p>
              ) : (
                <>
                  {/* P&L Waterfall */}
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        <TaxRow label="Net Profit (P&L)" value={fmt(n(summary.estimatedTax.netProfit))} color="text-emerald-700" />
                        <TaxRow label={`Less: Mileage Deduction (${n(summary.estimatedTax.mileageDeduction).toLocaleString("en-US", { maximumFractionDigits: 0 })} mi)`} value={`(${fmt(n(summary.estimatedTax.mileageDeduction))})`} color="text-muted-foreground" />
                        <TaxRow label="Adjusted Net Profit" value={fmt(n(summary.estimatedTax.adjustedProfit))} bold />
                        <tr className="h-1 bg-muted/40" />
                        <TaxRow label="Self-Employment Tax (92.35% × 15.3%)" value={fmt(n(summary.estimatedTax.seTax))} color="text-red-600" />
                        <TaxRow label="SE Tax Deduction (½)" value={`(${fmt(n(summary.estimatedTax.seTaxDeduction))})`} color="text-muted-foreground" />
                        <TaxRow label="Standard Deduction" value={`(${fmt(n(summary.estimatedTax.standardDeduction))})`} color="text-muted-foreground" />
                        <TaxRow label="Federal Taxable Income" value={fmt(n(summary.estimatedTax.federalTaxableIncome))} bold />
                        <tr className="h-1 bg-muted/40" />
                        {summary.estimatedTax.brackets.map((b) => (
                          <TaxRow
                            key={b.rate}
                            label={`  Federal ${(b.rate * 100).toFixed(0)}% bracket (up to ${b.upTo === Infinity ? "∞" : fmt(b.upTo)})`}
                            value={fmt(b.tax)}
                            color="text-muted-foreground"
                            indent
                          />
                        ))}
                        <TaxRow label="Total Federal Income Tax" value={fmt(n(summary.estimatedTax.federalTax))} />
                        <TaxRow label="Total Self-Employment Tax" value={fmt(n(summary.estimatedTax.seTax))} />
                      </tbody>
                    </table>
                  </div>

                  {/* Total callout */}
                  <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-300 dark:border-orange-700 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Estimated Tax Due</p>
                      <p className="text-2xl font-bold text-orange-700">{fmt(n(summary.estimatedTax.totalEstimatedTax))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Effective Rate</p>
                      <p className="text-xl font-bold text-orange-600">{(n(summary.estimatedTax.effectiveRate) * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Quarterly payment hint */}
                  <div className="text-xs text-muted-foreground">
                    <strong>Quarterly payment hint:</strong> If self-employed, consider paying ~{fmt(n(summary.estimatedTax.totalEstimatedTax) / 4)} per quarter to avoid underpayment penalties. Consult your accountant.
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ── Section 6: Quarterly Breakdown ── */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-600" />
                6. Quarterly Summary ({year})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {summary.quarterlyBreakdown.map((q) => (
                  <div key={q.label} className="rounded-lg border p-3 space-y-1.5">
                    <p className="text-sm font-semibold text-muted-foreground">{q.label}</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Income</span>
                        <span className="font-mono text-emerald-700">{fmt(q.income)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expenses</span>
                        <span className="font-mono text-red-600">{fmt(q.expenses)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="font-medium">Profit</span>
                        <span className={`font-mono font-semibold ${q.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {fmt(q.profit)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Based on transaction date. Use these figures to estimate quarterly tax payments due Jan 15, Apr 15, Jun 15, Sep 15.
              </p>
            </CardContent>
          </Card>

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              <span>Expense Detail Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="tax-ded-filter" checked={taxDeductibleOnly} onCheckedChange={setTaxDeductibleOnly} />
              <Label htmlFor="tax-ded-filter" className="text-sm cursor-pointer">Tax deductible only</Label>
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {summary.categoryBreakdown.map((c) => (
                  <SelectItem key={c.category} value={c.category}>{c.category}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {summary.accountBreakdown.map((a) => (
                  <SelectItem key={String(a.accountId ?? "none")} value={String(a.accountId ?? "none")}>
                    {a.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(taxDeductibleOnly || selectedCategory !== "all" || selectedAccount !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setTaxDeductibleOnly(false); setSelectedCategory("all"); setSelectedAccount("all"); }}>
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* ── Category breakdown table ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredCategories.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No categories match the selected filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Category</th>
                        <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">Transactions</th>
                        <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">With Receipts</th>
                        <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-emerald-700">Tax Deductible</th>
                        <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Non-Deductible</th>
                        <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategories.map((row) => {
                        const receiptPct = row.transactionCount === 0 ? 0 : Math.round((row.withReceiptsCount / row.transactionCount) * 100);
                        return (
                          <tr key={row.category} className="border-b hover:bg-muted/30">
                            <td className="py-2.5 px-4 font-medium">{row.category}</td>
                            <td className="py-2.5 px-4 text-center text-muted-foreground">{row.transactionCount}</td>
                            <td className="py-2.5 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs ${receiptPct === 100 ? "text-emerald-600" : receiptPct === 0 ? "text-red-500" : "text-amber-600"}`}>
                                {receiptPct === 100
                                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                                  : <AlertCircle className="w-3.5 h-3.5" />}
                                {row.withReceiptsCount}/{row.transactionCount}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-emerald-700">{fmt(row.taxDeductibleAmount)}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">{fmt(row.nonDeductibleAmount)}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-semibold">{fmt(row.totalAmount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30">
                        <td className="py-2.5 px-4 font-bold text-sm" colSpan={3}>Totals</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                          {fmt(filteredCategories.reduce((s, r) => s + r.taxDeductibleAmount, 0))}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-muted-foreground">
                          {fmt(filteredCategories.reduce((s, r) => s + r.nonDeductibleAmount, 0))}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold">
                          {fmt(filteredCategories.reduce((s, r) => s + r.totalAmount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Account breakdown ── */}
          {selectedAccount === "all" && !taxDeductibleOnly && selectedCategory === "all" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">By Account</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Account</th>
                        <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">Transactions</th>
                        <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.accountBreakdown.map((row) => (
                        <tr key={String(row.accountId ?? "none")} className="border-b hover:bg-muted/30">
                          <td className="py-2.5 px-4 font-medium">{row.accountName}</td>
                          <td className="py-2.5 px-4 text-center text-muted-foreground">{row.transactionCount}</td>
                          <td className={`py-2.5 px-4 text-right font-mono ${row.totalAmount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {fmt(row.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Email modal ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Tax Pack to Accountant
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Accountant's Email</Label>
              <Input
                type="email"
                placeholder="accountant@firm.com"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && toEmail && emailMutation.mutate(toEmail)}
              />
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 space-y-1">
              <p className="font-medium">This will send:</p>
              <p>• tax-pack-{year}.zip (attached)</p>
              <p>• summary.csv, receipts-index.csv, receipt files</p>
              <p>• profit-loss.pdf, balance-sheet.pdf, tax-summary.pdf</p>
            </div>

            {emailMutation.isError && (
              <p className="text-sm text-destructive">{(emailMutation.error as Error).message}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button
              onClick={() => toEmail && emailMutation.mutate(toEmail)}
              disabled={!toEmail || emailMutation.isPending}
            >
              {emailMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Small helper component for the tax waterfall table ──

function TaxRow({ label, value, bold, color, indent }: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
  indent?: boolean;
}) {
  return (
    <tr className={bold ? "bg-muted/30 border-t border-b" : "border-b"}>
      <td className={`py-2 px-4 text-sm ${indent ? "pl-8" : ""} ${bold ? "font-semibold" : ""} text-foreground`}>{label}</td>
      <td className={`py-2 px-4 text-right font-mono text-sm ${bold ? "font-semibold" : ""} ${color ?? ""}`}>{value}</td>
    </tr>
  );
}
