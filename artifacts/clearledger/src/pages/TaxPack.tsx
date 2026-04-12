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
  ChevronDown,
  ChevronUp,
  Filter,
  TrendingUp,
  TrendingDown,
  Loader2,
  X,
  Info,
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
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const pct = (n: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;

export default function TaxPackPage({ businessId }: { businessId: number }) {
  const [year, setYear] = useState(currentYear);
  const [taxDeductibleOnly, setTaxDeductibleOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [showMissing, setShowMissing] = useState(false);
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
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

  // Filtered category breakdown
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
            Download Tax Pack (ZIP)
          </Button>
        </div>
      </div>

      {/* ── ZIP contents notice ── */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3 border">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          The ZIP includes <strong>summary.csv</strong>, <strong>receipts-index.csv</strong>, all receipt files renamed by date/vendor/amount, a <strong>profit-loss.pdf</strong>, and a <strong>balance-sheet.pdf</strong>.
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
                  <button
                    className="text-xs text-amber-600 underline mt-1 hover:text-amber-700"
                    onClick={() => setShowMissing((v) => !v)}
                  >
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
                          <td className="py-2 px-4">
                            <Badge variant="outline" className="text-xs">{tx.type}</Badge>
                          </td>
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

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="tax-ded-filter"
                checked={taxDeductibleOnly}
                onCheckedChange={setTaxDeductibleOnly}
              />
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setTaxDeductibleOnly(false); setSelectedCategory("all"); setSelectedAccount("all"); }}
              >
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
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No categories match the selected filters.
                </div>
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
                                  : receiptPct === 0
                                  ? <AlertCircle className="w-3.5 h-3.5" />
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
              <p>• summary.csv, receipts-index.csv, receipt files, P&L + Balance Sheet PDFs</p>
            </div>

            {emailMutation.isError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{(emailMutation.error as Error).message}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button
              onClick={() => emailMutation.mutate(toEmail)}
              disabled={!toEmail || emailMutation.isPending}
            >
              {emailMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Sending…</>
              ) : (
                <><Mail className="w-3.5 h-3.5 mr-2" />Send</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
