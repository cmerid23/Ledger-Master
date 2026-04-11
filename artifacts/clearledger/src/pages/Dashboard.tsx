import {
  useGetDashboardSummary,
  useGetRevenueChart,
  useGetRecentTransactions,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Wallet, CheckCircle, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "wouter";

interface Props {
  businessId: number;
}

export default function DashboardPage({ businessId }: Props) {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(businessId, {
    query: { enabled: !!businessId },
  });
  const { data: chartData, isLoading: chartLoading } = useGetRevenueChart(businessId, {
    query: { enabled: !!businessId },
  });
  const { data: recentTxns, isLoading: txnsLoading } = useGetRecentTransactions(businessId, {
    query: { enabled: !!businessId },
  });

  const summaryCards = [
    {
      label: "Total Revenue",
      value: summary?.totalRevenue ?? 0,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Total Expenses",
      value: summary?.totalExpenses ?? 0,
      icon: TrendingDown,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    {
      label: "Net Profit",
      value: summary?.netProfit ?? 0,
      icon: DollarSign,
      color: (summary?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600",
      bg: (summary?.netProfit ?? 0) >= 0 ? "bg-emerald-50" : "bg-rose-50",
    },
    {
      label: "Cash Balance",
      value: summary?.cashBalance ?? 0,
      icon: Wallet,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Overview for the current year</p>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              summary.reconciliationStatus === "up_to_date"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}>
              {summary.reconciliationStatus === "up_to_date" ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {summary.reconciliationStatus === "up_to_date" ? "Reconciled" : "Needs review"}
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            {summaryLoading ? (
              <div className="h-7 w-32 bg-muted animate-pulse rounded" />
            ) : (
              <div className={`text-2xl font-bold ${value >= 0 ? "text-foreground" : "text-rose-600"}`}>
                {formatCurrency(value)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-foreground">Revenue vs Expenses</h2>
          <span className="text-xs text-muted-foreground">Last 12 months</span>
        </div>
        {chartLoading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            Loading chart...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData ?? []} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
                name="Revenue"
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
                name="Expenses"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent transactions */}
      <div className="bg-card border border-card-border rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Transactions</h2>
          <Link href="/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {txnsLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : recentTxns?.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">
            No transactions yet.{" "}
            <Link href="/transactions" className="text-primary hover:underline">
              Add one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentTxns?.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  tx.type === "credit" ? "bg-emerald-50" : "bg-rose-50"
                }`}>
                  {tx.type === "credit" ? (
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{tx.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(tx.date)}
                    {tx.accountName && <span className="ml-2 text-muted-foreground/70">{tx.accountName}</span>}
                  </div>
                </div>
                <div className={`text-sm font-semibold flex-shrink-0 ${
                  tx.type === "credit" ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Add Transaction", href: "/transactions" },
          { label: "Upload Statement", href: "/upload" },
          { label: "View Reports", href: "/reports" },
          { label: "Reconcile", href: "/reconcile" },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="px-4 py-3 bg-card border border-border rounded-lg text-sm font-medium text-foreground text-center hover:bg-accent hover:border-primary/30 transition-all"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
