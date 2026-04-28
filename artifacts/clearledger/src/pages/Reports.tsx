import { useState, useEffect } from "react";
import {
  useGetProfitLossReport,
  useGetBalanceSheetReport,
  useGetTrialBalanceReport,
} from "@workspace/api-client-react";
import { formatCurrency, startOfYear, today } from "@/lib/utils";
import { Download, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  businessId: number;
}

type Tab = "monthly" | "pl" | "bs" | "tb";

interface MonthRow { month: string; income: number; expenses: number; net: number; }
interface MonthlyData { months: MonthRow[]; totalIncome: number; totalExpenses: number; netProfit: number; }

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function ReportsPage({ businessId }: Props) {
  const [tab, setTab]           = useState<Tab>("monthly");
  const [startDate, setStartDate] = useState(startOfYear());
  const [endDate, setEndDate]   = useState(today());
  const [asOfDate, setAsOfDate] = useState(today());
  const [monthly, setMonthly]   = useState<MonthlyData | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const { data: pl, isLoading: plLoading } = useGetProfitLossReport(
    businessId, { startDate, endDate }, { query: { enabled: tab === "pl" && !!businessId } }
  );
  const { data: bs, isLoading: bsLoading } = useGetBalanceSheetReport(
    businessId, { asOfDate }, { query: { enabled: tab === "bs" && !!businessId } }
  );
  const { data: tb, isLoading: tbLoading } = useGetTrialBalanceReport(
    businessId, { asOfDate }, { query: { enabled: tab === "tb" && !!businessId } }
  );

  // Fetch monthly data (uses direct fetch — no generated hook needed)
  useEffect(() => {
    if (tab !== "monthly" || !businessId) return;
    setMonthlyLoading(true);
    const token = localStorage.getItem("clearledger_token") ?? "";
    fetch(`/api/businesses/${businessId}/reports/monthly?startDate=${startDate}&endDate=${endDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setMonthly(d))
      .catch(() => setMonthly(null))
      .finally(() => setMonthlyLoading(false));
  }, [tab, businessId, startDate, endDate]);

  function handleExportCsv() {
    if (tab === "monthly" && monthly) {
      const rows = [
        ["Month", "Income", "Expenses", "Net"],
        ...monthly.months.map(m => [monthLabel(m.month), m.income.toFixed(2), m.expenses.toFixed(2), m.net.toFixed(2)]),
        ["TOTAL", monthly.totalIncome.toFixed(2), monthly.totalExpenses.toFixed(2), monthly.netProfit.toFixed(2)],
      ];
      downloadCsv(rows, `monthly-pl-${startDate}-${endDate}.csv`);
    } else if (tab === "pl" && pl) {
      const plData = pl as typeof pl & {
        cogs?: { items: { accountId: number; accountName: string; accountCode?: string | null; amount: number }[]; total: number };
        grossProfit?: number;
        grossMargin?: number;
        netMargin?: number;
      };
      const rows: string[][] = [
        ["Account", "Amount"],
        ["--- INCOME ---", ""],
        ...pl.income.items.map((i) => [i.accountName, i.amount.toFixed(2)]),
        ["Total Income", pl.income.total.toFixed(2)],
      ];
      if (plData.cogs && plData.cogs.items.length > 0) {
        rows.push(["--- COST OF GOODS SOLD ---", ""]);
        plData.cogs.items.forEach((i) => rows.push([i.accountName, i.amount.toFixed(2)]));
        rows.push(["Total COGS", plData.cogs.total.toFixed(2)]);
        rows.push(["Gross Profit", (plData.grossProfit ?? 0).toFixed(2)]);
      }
      rows.push(
        ["--- OPERATING EXPENSES ---", ""],
        ...pl.expenses.items.map((i) => [i.accountName, i.amount.toFixed(2)]),
        ["Total Expenses", pl.expenses.total.toFixed(2)],
        ["Net Profit", pl.netProfit.toFixed(2)],
      );
      downloadCsv(rows, `profit-loss-${startDate}-${endDate}.csv`);
    }
  }

  function downloadCsv(rows: string[][], filename: string) {
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "monthly", label: "Monthly P&L" },
    { id: "pl",      label: "Profit & Loss" },
    { id: "bs",      label: "Balance Sheet" },
    { id: "tb",      label: "Trial Balance" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monthly P&L, Profit & Loss, Balance Sheet, Trial Balance</p>
        </div>
        <button onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Date controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {tab !== "bs" && tab !== "tb" ? (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">As of</label>
            <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}
      </div>

      {/* ── Monthly Cash-Basis P&L ───────────────────────────────────────────── */}
      {tab === "monthly" && (
        <div className="space-y-4">
          {/* Summary cards */}
          {monthly && !monthlyLoading && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Income",   value: monthly.totalIncome,   color: "text-emerald-600", bg: "bg-emerald-50", icon: TrendingUp },
                { label: "Total Expenses", value: monthly.totalExpenses,  color: "text-rose-600",    bg: "bg-rose-50",    icon: TrendingDown },
                { label: "Net Profit",     value: monthly.netProfit,      color: monthly.netProfit >= 0 ? "text-emerald-600" : "text-rose-600", bg: monthly.netProfit >= 0 ? "bg-emerald-50" : "bg-rose-50", icon: Minus },
              ].map(({ label, value, color, bg, icon: Icon }) => (
                <div key={label} className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
                  <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-2`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-xl font-bold ${color} mt-0.5`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Month-by-Month Cash Basis</h2>
              <p className="text-xs text-muted-foreground mt-0.5">All bank deposits = Income · All bank withdrawals = Expenses</p>
            </div>

            {monthlyLoading ? (
              <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded"/>)}</div>
            ) : !monthly?.months?.length ? (
              <div className="p-10 text-center text-muted-foreground text-sm">
                No transactions found for this period.<br/>
                <span className="text-xs">Upload a bank statement to see your monthly P&L here.</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Month</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-emerald-700 uppercase">Income</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-rose-700 uppercase">Expenses</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthly.months.map(row => (
                    <tr key={row.month} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground">{monthLabel(row.month)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 font-medium tabular-nums">{formatCurrency(row.income)}</td>
                      <td className="px-5 py-3 text-right text-rose-600 font-medium tabular-nums">{formatCurrency(row.expenses)}</td>
                      <td className={`px-5 py-3 text-right font-bold tabular-nums ${row.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {row.net >= 0 ? "+" : ""}{formatCurrency(row.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="px-5 py-3 text-foreground">Total</td>
                    <td className="px-5 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(monthly.totalIncome)}</td>
                    <td className="px-5 py-3 text-right text-rose-600 tabular-nums">{formatCurrency(monthly.totalExpenses)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${monthly.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {monthly.netProfit >= 0 ? "+" : ""}{formatCurrency(monthly.netProfit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Standard P&L ────────────────────────────────────────────────────── */}
      {tab === "pl" && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Profit & Loss Statement</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{startDate} to {endDate}</p>
          </div>
          {plLoading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted animate-pulse rounded"/>)}</div>
          ) : pl ? (() => {
            const plData = pl as typeof pl & {
              cogs?: { title: string; items: { accountId: number; accountName: string; accountCode?: string | null; amount: number }[]; total: number };
              grossProfit?: number;
              grossMargin?: number;
              netMargin?: number;
            };
            return (
              <div>
                {/* Income section */}
                <div className="px-5 py-3 bg-emerald-50/50 border-b border-border">
                  <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Income</h3>
                  {pl.income.items.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">No income accounts or unassigned deposits found.</p>
                  )}
                  {pl.income.items.map((item) => (
                    <div key={item.accountId} className="flex justify-between py-1.5 text-sm">
                      <span className="text-foreground">{item.accountCode ? `${item.accountCode} · ` : ""}{item.accountName}</span>
                      <span className="font-medium text-emerald-700">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t border-border mt-1 font-semibold text-sm">
                    <span>Total Income</span>
                    <span className="text-emerald-600">{formatCurrency(pl.income.total)}</span>
                  </div>
                </div>

                {/* COGS section (only shown when there are COGS accounts) */}
                {plData.cogs && (plData.cogs.items.length > 0 || pl.income.total > 0) && (
                  <div className="px-5 py-3 bg-orange-50/50 border-b border-border">
                    <h3 className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Cost of Goods Sold</h3>
                    {plData.cogs.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">No COGS recorded for this period.</p>
                    ) : (
                      plData.cogs.items.map((item) => (
                        <div key={item.accountId} className="flex justify-between py-1.5 text-sm">
                          <span className="text-foreground">{item.accountCode ? `${item.accountCode} · ` : ""}{item.accountName}</span>
                          <span className="font-medium text-orange-700">{formatCurrency(item.amount)}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between py-2 border-t border-border mt-1 font-semibold text-sm">
                      <span>Total COGS</span>
                      <span className="text-orange-600">{formatCurrency(plData.cogs.total)}</span>
                    </div>
                  </div>
                )}

                {/* Gross Profit subtotal (when COGS section exists) */}
                {plData.cogs && plData.grossProfit !== undefined && (
                  <div className="px-5 py-3 border-b border-border bg-muted/20">
                    <div className="flex justify-between font-semibold text-sm">
                      <span className="text-foreground">Gross Profit</span>
                      <div className="flex items-center gap-3">
                        {plData.grossMargin !== undefined && (
                          <span className="text-xs text-muted-foreground">{plData.grossMargin.toFixed(1)}% margin</span>
                        )}
                        <span className={plData.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {formatCurrency(plData.grossProfit)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Operating Expenses */}
                <div className="px-5 py-3 bg-rose-50/50 border-b border-border">
                  <h3 className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-2">
                    {plData.cogs ? "Operating Expenses" : "Expenses"}
                  </h3>
                  {pl.expenses.items.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">No expense accounts or unassigned withdrawals found.</p>
                  )}
                  {pl.expenses.items.map((item) => (
                    <div key={item.accountId} className="flex justify-between py-1.5 text-sm">
                      <span className="text-foreground">{item.accountCode ? `${item.accountCode} · ` : ""}{item.accountName}</span>
                      <span className="font-medium text-rose-700">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t border-border mt-1 font-semibold text-sm">
                    <span>Total Expenses</span>
                    <span className="text-rose-600">{formatCurrency(pl.expenses.total)}</span>
                  </div>
                </div>

                {/* Net Profit */}
                <div className="px-5 py-4 flex justify-between font-bold text-base border-t-2 border-border">
                  <span>Net Profit</span>
                  <div className="flex items-center gap-3">
                    {plData.netMargin !== undefined && (
                      <span className="text-sm text-muted-foreground font-normal">{plData.netMargin.toFixed(1)}% margin</span>
                    )}
                    <span className={pl.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                      {formatCurrency(pl.netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })() : null}
        </div>
      )}

      {/* ── Balance Sheet ────────────────────────────────────────────────────── */}
      {tab === "bs" && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Balance Sheet</h2>
            <p className="text-xs text-muted-foreground mt-0.5">As of {asOfDate}</p>
          </div>
          {bsLoading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i=><div key={i} className="h-8 bg-muted animate-pulse rounded"/>)}</div>
          ) : bs ? (
            <div>
              {[
                { section: bs.assets,      label: "Assets",      color: "text-blue-700",   bg: "bg-blue-50/50" },
                { section: bs.liabilities, label: "Liabilities", color: "text-rose-700",   bg: "bg-rose-50/50" },
                { section: bs.equity,      label: "Equity",      color: "text-purple-700", bg: "bg-purple-50/50" },
              ].map(({ section, label, color, bg }) => (
                <div key={label} className={`px-5 py-3 ${bg} border-b border-border`}>
                  <h3 className={`text-xs font-semibold ${color} uppercase tracking-wide mb-2`}>{label}</h3>
                  {section.items.map(item => (
                    <div key={item.accountId} className="flex justify-between py-1.5 text-sm">
                      <span className="text-foreground">{item.accountName}</span>
                      <span className={`font-medium ${color}`}>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t border-border mt-1 font-semibold text-sm">
                    <span>Total {label}</span>
                    <span className={color}>{formatCurrency(section.total)}</span>
                  </div>
                </div>
              ))}
              <div className="px-5 py-4 flex justify-between font-bold text-base">
                <span>Total Liabilities + Equity</span>
                <span className="text-foreground">{formatCurrency(bs.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Trial Balance ────────────────────────────────────────────────────── */}
      {tab === "tb" && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-semibold text-foreground">Trial Balance</h2>
              <p className="text-xs text-muted-foreground mt-0.5">As of {asOfDate}</p>
            </div>
            {tb && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tb.isBalanced ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {tb.isBalanced ? "Balanced" : "Unbalanced"}
              </span>
            )}
          </div>
          {tbLoading ? (
            <div className="p-6 space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="h-8 bg-muted animate-pulse rounded"/>)}</div>
          ) : tb ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Account</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Debit</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tb.items.map(item => (
                  <tr key={item.accountId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3"><span className="text-foreground">{item.accountCode ? `${item.accountCode} · ` : ""}{item.accountName}</span></td>
                    <td className="px-5 py-3 hidden sm:table-cell"><span className="text-muted-foreground capitalize">{item.accountType}</span></td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">{item.debit > 0 ? formatCurrency(item.debit) : ""}</td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">{item.credit > 0 ? formatCurrency(item.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-5 py-3 text-foreground" colSpan={2}>Totals</td>
                  <td className="px-5 py-3 text-right text-foreground">{formatCurrency(tb.totalDebits)}</td>
                  <td className="px-5 py-3 text-right text-foreground">{formatCurrency(tb.totalCredits)}</td>
                </tr>
              </tfoot>
            </table>
          ) : null}
        </div>
      )}
    </div>
  );
}
