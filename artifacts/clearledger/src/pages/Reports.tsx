import { useState } from "react";
import {
  useGetProfitLossReport,
  useGetBalanceSheetReport,
  useGetTrialBalanceReport,
} from "@workspace/api-client-react";
import { formatCurrency, startOfYear, today } from "@/lib/utils";
import { Download } from "lucide-react";

interface Props {
  businessId: number;
}

type Tab = "pl" | "bs" | "tb";

export default function ReportsPage({ businessId }: Props) {
  const [tab, setTab] = useState<Tab>("pl");
  const [startDate, setStartDate] = useState(startOfYear());
  const [endDate, setEndDate] = useState(today());
  const [asOfDate, setAsOfDate] = useState(today());

  const { data: pl, isLoading: plLoading } = useGetProfitLossReport(
    businessId,
    { startDate, endDate },
    { query: { enabled: tab === "pl" && !!businessId } }
  );

  const { data: bs, isLoading: bsLoading } = useGetBalanceSheetReport(
    businessId,
    { asOfDate },
    { query: { enabled: tab === "bs" && !!businessId } }
  );

  const { data: tb, isLoading: tbLoading } = useGetTrialBalanceReport(
    businessId,
    { asOfDate },
    { query: { enabled: tab === "tb" && !!businessId } }
  );

  function handleExportCsv() {
    if (tab === "pl" && pl) {
      const rows = [
        ["Account", "Amount"],
        ["--- INCOME ---", ""],
        ...pl.income.items.map((i) => [i.accountName, i.amount.toString()]),
        ["Total Income", pl.income.total.toString()],
        ["--- EXPENSES ---", ""],
        ...pl.expenses.items.map((i) => [i.accountName, i.amount.toString()]),
        ["Total Expenses", pl.expenses.total.toString()],
        ["Net Profit", pl.netProfit.toString()],
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profit-loss-${startDate}-${endDate}.csv`;
      a.click();
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "pl", label: "Profit & Loss" },
    { id: "bs", label: "Balance Sheet" },
    { id: "tb", label: "Trial Balance" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Profit & Loss, Balance Sheet, Trial Balance</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {(tab === "pl") ? (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">As of</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}
      </div>

      {/* P&L Report */}
      {tab === "pl" && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Profit & Loss Statement</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{startDate} to {endDate}</p>
          </div>
          {plLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
            </div>
          ) : pl ? (
            <div>
              <div className="px-5 py-3 bg-emerald-50/50 border-b border-border">
                <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Income</h3>
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

              <div className="px-5 py-3 bg-rose-50/50 border-b border-border">
                <h3 className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-2">Expenses</h3>
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

              <div className="px-5 py-4 flex justify-between font-bold text-base">
                <span>Net Profit</span>
                <span className={pl.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {formatCurrency(pl.netProfit)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Balance Sheet */}
      {tab === "bs" && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Balance Sheet</h2>
            <p className="text-xs text-muted-foreground mt-0.5">As of {asOfDate}</p>
          </div>
          {bsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
            </div>
          ) : bs ? (
            <div>
              {[
                { section: bs.assets, label: "Assets", color: "text-blue-700", bg: "bg-blue-50/50" },
                { section: bs.liabilities, label: "Liabilities", color: "text-rose-700", bg: "bg-rose-50/50" },
                { section: bs.equity, label: "Equity", color: "text-purple-700", bg: "bg-purple-50/50" },
              ].map(({ section, label, color, bg }) => (
                <div key={label} className={`px-5 py-3 ${bg} border-b border-border`}>
                  <h3 className={`text-xs font-semibold ${color} uppercase tracking-wide mb-2`}>{label}</h3>
                  {section.items.map((item) => (
                    <div key={item.accountId} className="flex justify-between py-1.5 text-sm">
                      <span className="text-foreground">{item.accountName}</span>
                      <span className={`font-medium ${color}`}>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  <div className={`flex justify-between py-2 border-t border-border mt-1 font-semibold text-sm`}>
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

      {/* Trial Balance */}
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
            <div className="p-6 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
            </div>
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
                {tb.items.map((item) => (
                  <tr key={item.accountId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-foreground">{item.accountCode ? `${item.accountCode} · ` : ""}{item.accountName}</span>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className="text-muted-foreground capitalize">{item.accountType}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
                      {item.debit > 0 ? formatCurrency(item.debit) : ""}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
                      {item.credit > 0 ? formatCurrency(item.credit) : ""}
                    </td>
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
