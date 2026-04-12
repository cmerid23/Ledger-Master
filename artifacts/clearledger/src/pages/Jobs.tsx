import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, Plus, Pencil, Trash2, Search, X, Loader2, ArrowLeft,
  MapPin, TrendingUp, TrendingDown, ChevronDown, Route, ReceiptText,
  BarChart3, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

interface Props { businessId: number }
interface Customer { id: number; name: string }

interface Expense {
  id: number; jobId: number; description: string | null; amount: string;
  expenseType: string | null; date: string | null; createdAt: string;
}

interface PnL {
  revenue: { estimated: string | null; actual: string; variance: string | null; variancePct: string | null };
  cost: { estimated: string | null; actual: string; variance: string | null; variancePct: string | null; byType: Record<string, string> };
  profit: { gross: string; margin: string };
  mileage: { estimated: string | null; actual: string | null; revenuePerMile: string | null; costPerMile: string | null; ratePerMile: string | null } | null;
}

interface Job {
  id: number; name: string; jobNumber: string | null; status: string;
  jobType: string | null; startDate: string | null; endDate: string | null;
  origin: string | null; destination: string | null;
  estimatedMiles: string | null; actualMiles: string | null;
  ratePerMile: string | null; flatRate: string | null;
  estimatedRevenue: string | null; actualRevenue: string;
  estimatedCost: string | null; actualCost: string;
  profit: string; profitMargin: string | null; notes: string | null;
  customerId: number | null; customerName: string | null;
  createdAt: string; completedAt: string | null;
  expenses?: Expense[]; pnl?: PnL;
}

interface JobsResponse {
  jobs: Job[];
  summary: {
    totalJobs: number; activeJobs: number; completedJobs: number;
    totalRevenue: string; totalCost: string; totalProfit: string;
    avgMargin: string; overallMargin: string;
    byStatus: Record<string, number>; byType: Record<string, number>;
  };
}

interface ReportJob {
  id: number; name: string; jobNumber: string | null; status: string; jobType: string | null;
  customerName: string | null; revenue: { estimated: string | null; actual: string; variance: string | null };
  cost: { estimated: string | null; actual: string; variance: string | null };
  profit: string; margin: string | null;
}

interface SummaryReport {
  generatedAt: string;
  summary: { totalJobs: number; totalRevenue: string; totalCost: string; totalProfit: string; overallMargin: string; totalMiles: string | null; avgRevenuePerMile: string | null };
  byStatus: Record<string, { count: number; revenue: string; profit: string; margin: string }>;
  byType: Record<string, { count: number; revenue: string; profit: string; margin: string }>;
  topPerformers: { id: number; name: string; profit: string; margin: string | null }[];
  bottomPerformers: { id: number; name: string; profit: string; margin: string | null }[];
  jobs: ReportJob[];
}

const STATUSES: Record<string, { label: string; color: string }> = {
  active:    { label: "Active",    color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
  "on-hold": { label: "On Hold",   color: "bg-yellow-100 text-yellow-700" },
};

const EXPENSE_TYPES: { key: string; label: string }[] = [
  { key: "fuel_oil",              label: "Fuel & Oil" },
  { key: "tolls_scales",          label: "Tolls & Scales" },
  { key: "driver_pay",            label: "Driver Pay & Per Diem" },
  { key: "truck_lease",           label: "Truck Lease / Loan Payments" },
  { key: "maintenance",           label: "Truck Maintenance & Repairs" },
  { key: "tires",                 label: "Tires" },
  { key: "insurance",             label: "Insurance (Truck & Cargo)" },
  { key: "permits_licenses",      label: "Permits & Licenses" },
  { key: "dot_compliance",        label: "DOT Compliance" },
  { key: "dispatch_fees",         label: "Dispatch Fees" },
  { key: "lumper_fees",           label: "Lumper Fees" },
  { key: "parking_storage",       label: "Parking & Storage" },
  { key: "communication",         label: "Communication (Phone, ELD)" },
  { key: "office_admin",          label: "Office & Admin" },
  { key: "professional_services", label: "Professional Services (Accountant, Legal)" },
];

function expenseLabel(key: string | null | undefined): string {
  if (!key) return "Expense";
  return EXPENSE_TYPES.find((t) => t.key === key)?.label ?? key.replace(/_/g, " ");
}

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers as Record<string, string> ?? {}) },
  });
}

function today() { return new Date().toISOString().split("T")[0]!; }
function n(v: string | null | undefined) { return parseFloat(v || "0"); }
function pct(v: string | null | undefined) { return v ? `${parseFloat(v).toFixed(1)}%` : "—"; }

type View = "list" | "editor" | "detail" | "report";

const EMPTY_FORM = {
  name: "", jobNumber: "", customerId: "" as string | number, status: "active" as string,
  jobType: "", startDate: "", endDate: "", origin: "", destination: "",
  estimatedMiles: "", actualMiles: "", ratePerMile: "", flatRate: "",
  estimatedRevenue: "", actualRevenue: "0", estimatedCost: "", actualCost: "0", notes: "",
};

function VariancePill({ v }: { v: string | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const val = parseFloat(v);
  if (Math.abs(val) < 0.01) return <span className="text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" />0</span>;
  return val > 0
    ? <span className="text-red-500 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" />{formatCurrency(Math.abs(val))}</span>
    : <span className="text-green-600 flex items-center gap-0.5"><ArrowDownRight className="w-3 h-3" />{formatCurrency(Math.abs(val))}</span>;
}

export default function JobsPage({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [statusDropOpen, setStatusDropOpen] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expenseForm, setExpenseForm] = useState({ description: "", amount: "", expenseType: "fuel_oil", date: today() });
  const [deletingExpense, setDeletingExpense] = useState<number | null>(null);

  const { data: jobsResponse, isLoading } = useQuery<JobsResponse>({
    queryKey: ["jobs", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/jobs?businessId=${businessId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const jobs = jobsResponse?.jobs ?? [];
  const summary = jobsResponse?.summary;

  const { data: jobDetail } = useQuery<Job>({
    queryKey: ["jobs", businessId, detailId],
    queryFn: async () => {
      const res = await authFetch(`/api/jobs/${detailId!}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: detailId !== null,
  });

  const { data: summaryReport, isLoading: reportLoading } = useQuery<SummaryReport>({
    queryKey: ["jobs-report-summary", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/jobs/report/summary?businessId=${businessId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: view === "report",
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", businessId],
    queryFn: async () => {
      const res = await authFetch(`/api/customers?businessId=${businessId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  function openNew() {
    setEditingId(null);
    const num = `JOB-${String(jobs.length + 1).padStart(4, "0")}`;
    setForm({ ...EMPTY_FORM, jobNumber: num });
    setView("editor");
  }

  function openEdit(j: Job) {
    setEditingId(j.id);
    setForm({
      name: j.name, jobNumber: j.jobNumber ?? "", customerId: j.customerId ?? "",
      status: j.status, jobType: j.jobType ?? "", startDate: j.startDate ?? "",
      endDate: j.endDate ?? "", origin: j.origin ?? "", destination: j.destination ?? "",
      estimatedMiles: j.estimatedMiles ?? "", actualMiles: j.actualMiles ?? "",
      ratePerMile: j.ratePerMile ?? "", flatRate: j.flatRate ?? "",
      estimatedRevenue: j.estimatedRevenue ?? "", actualRevenue: j.actualRevenue,
      estimatedCost: j.estimatedCost ?? "", actualCost: j.actualCost, notes: j.notes ?? "",
    });
    setView("editor");
  }

  function openDetail(j: Job) {
    setDetailId(j.id);
    setExpenseForm({ description: "", amount: "", expenseType: "fuel_oil", date: today() });
    setView("detail");
  }

  function setF(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/jobs/${editingId}` : `/api/jobs`;
      const method = editingId ? "PATCH" : "POST";
      const payload = {
        ...form, businessId,
        customerId: form.customerId ? Number(form.customerId) : null,
        estimatedMiles: form.estimatedMiles || null, actualMiles: form.actualMiles || null,
        ratePerMile: form.ratePerMile || null, flatRate: form.flatRate || null,
        estimatedRevenue: form.estimatedRevenue || null, estimatedCost: form.estimatedCost || null,
        jobType: form.jobType || null, startDate: form.startDate || null, endDate: form.endDate || null,
        origin: form.origin || null, destination: form.destination || null,
      };
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", businessId] });
      setView("list");
      toast({ title: editingId ? "Job updated" : "Job created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", businessId] });
      setDeleting(null);
      toast({ title: "Job deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await authFetch(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", businessId] }); setStatusDropOpen(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/jobs/${detailId!}/expenses`, { method: "POST", body: JSON.stringify(expenseForm) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", businessId, detailId] });
      qc.invalidateQueries({ queryKey: ["jobs", businessId] });
      setExpenseForm({ description: "", amount: "", expenseType: "fuel_oil", date: today() });
      toast({ title: "Expense added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      const res = await authFetch(`/api/jobs/${detailId!}/expenses/${expenseId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", businessId, detailId] });
      qc.invalidateQueries({ queryKey: ["jobs", businessId] });
      setDeletingExpense(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = jobs.filter((j) => {
    const matchSearch = j.name.toLowerCase().includes(search.toLowerCase()) ||
      (j.jobNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.customerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.origin ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.destination ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── REPORT VIEW ───────────────────────────────────────────────────────────────
  if (view === "report") {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Profitability Report</h1>
            <p className="text-xs text-muted-foreground mt-0.5">All jobs · revenue, cost and margin comparison</p>
          </div>
        </div>

        {reportLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !summaryReport ? null : (
          <div className="space-y-6">
            {/* Top-level KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Jobs", value: String(summaryReport.summary.totalJobs), color: "text-foreground" },
                { label: "Total Revenue", value: formatCurrency(n(summaryReport.summary.totalRevenue)), color: "text-foreground" },
                { label: "Total Cost", value: formatCurrency(n(summaryReport.summary.totalCost)), color: "text-muted-foreground" },
                { label: "Total Profit", value: formatCurrency(n(summaryReport.summary.totalProfit)), color: n(summaryReport.summary.totalProfit) >= 0 ? "text-green-600" : "text-destructive" },
                { label: "Overall Margin", value: pct(summaryReport.summary.overallMargin), color: "text-foreground" },
                { label: "Rev/Mile", value: summaryReport.summary.avgRevenuePerMile ? `$${parseFloat(summaryReport.summary.avgRevenuePerMile).toFixed(2)}` : "—", color: "text-muted-foreground" },
              ].map((c) => (
                <div key={c.label} className="bg-card border border-border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                  <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* By Status + By Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* By Status */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">By Status</h2>
                <div className="space-y-2">
                  {Object.entries(summaryReport.byStatus).map(([status, data]) => {
                    const st = STATUSES[status] ?? { label: status, color: "bg-muted text-muted-foreground" };
                    return (
                      <div key={status} className="flex items-center gap-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color} w-24 text-center`}>{st.label}</span>
                        <span className="text-muted-foreground w-8 text-right">{data.count}</span>
                        <div className="flex-1 flex items-center gap-2 justify-end">
                          <span className="text-foreground">{formatCurrency(n(data.revenue))}</span>
                          <span className={`text-xs font-medium ${n(data.profit) >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(n(data.profit))}</span>
                          <span className="text-xs text-muted-foreground w-12 text-right">{pct(data.margin)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Type */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">By Job Type</h2>
                {Object.keys(summaryReport.byType).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No typed jobs yet</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(summaryReport.byType).map(([type, data]) => (
                      <div key={type} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground capitalize w-20 truncate">{type}</span>
                        <span className="text-muted-foreground w-6 text-right text-xs">{data.count}</span>
                        <div className="flex-1 flex items-center gap-2 justify-end">
                          <span className="text-foreground">{formatCurrency(n(data.revenue))}</span>
                          <span className={`text-xs font-medium ${n(data.profit) >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(n(data.profit))}</span>
                          <span className="text-xs text-muted-foreground w-12 text-right">{pct(data.margin)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top / Bottom performers */}
            {(summaryReport.topPerformers.length > 0 || summaryReport.bottomPerformers.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-card border border-border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-green-600" />Top Performers</h2>
                  <div className="space-y-2">
                    {summaryReport.topPerformers.map((j, i) => (
                      <div key={j.id} className="flex items-center gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                        <button onClick={() => { const job = jobs.find(jj => jj.id === j.id); if (job) openDetail(job); }} className="text-foreground hover:underline font-medium truncate text-left">{j.name}</button>
                        <span className="ml-auto font-bold text-green-600">{formatCurrency(n(j.profit))}</span>
                        <span className="text-muted-foreground text-xs">{pct(j.margin)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><TrendingDown className="w-4 h-4 text-destructive" />Lowest Margin</h2>
                  <div className="space-y-2">
                    {summaryReport.bottomPerformers.map((j, i) => (
                      <div key={j.id} className="flex items-center gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                        <button onClick={() => { const job = jobs.find(jj => jj.id === j.id); if (job) openDetail(job); }} className="text-foreground hover:underline font-medium truncate text-left">{j.name}</button>
                        <span className={`ml-auto font-bold ${n(j.profit) >= 0 ? "text-foreground" : "text-destructive"}`}>{formatCurrency(n(j.profit))}</span>
                        <span className="text-muted-foreground text-xs">{pct(j.margin)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Full comparison table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Job-by-Job Comparison</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Job</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Type</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Est. Rev</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Act. Rev</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Act. Cost</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Profit</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Margin</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryReport.jobs.map((j) => {
                      const profit = n(j.profit);
                      const st = STATUSES[j.status] ?? { label: j.status, color: "bg-muted text-muted-foreground" };
                      return (
                        <tr key={j.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => { const job = jobs.find(jj => jj.id === j.id); if (job) { openDetail(job); } }}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-foreground">{j.name}</div>
                            {j.jobNumber && <div className="text-xs font-mono text-muted-foreground">{j.jobNumber}</div>}
                          </td>
                          <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground capitalize text-xs">{j.jobType ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{j.revenue.estimated ? formatCurrency(n(j.revenue.estimated)) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(n(j.revenue.actual))}</td>
                          <td className="px-4 py-2.5 text-right hidden sm:table-cell text-muted-foreground">{formatCurrency(n(j.cost.actual))}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-bold ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(profit)}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{pct(j.margin)}</td>
                          <td className="px-4 py-2.5 hidden lg:table-cell">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td className="px-4 py-2.5 font-bold text-foreground" colSpan={2}>Total ({summaryReport.summary.totalJobs} jobs)</td>
                      <td className="px-4 py-2.5 text-right hidden md:table-cell" />
                      <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(n(summaryReport.summary.totalRevenue))}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden sm:table-cell">{formatCurrency(n(summaryReport.summary.totalCost))}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-bold ${n(summaryReport.summary.totalProfit) >= 0 ? "text-green-600" : "text-destructive"}`}>
                          {formatCurrency(n(summaryReport.summary.totalProfit))}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground">{pct(summaryReport.summary.overallMargin)}</td>
                      <td className="hidden lg:table-cell" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────────
  if (view === "detail" && jobDetail) {
    const st = STATUSES[jobDetail.status] ?? STATUSES.active!;
    const expenses = jobDetail.expenses ?? [];
    const pnl = jobDetail.pnl;
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{jobDetail.name}</h1>
              {jobDetail.jobNumber && <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{jobDetail.jobNumber}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
            </div>
            {jobDetail.customerName && <p className="text-sm text-muted-foreground mt-0.5">{jobDetail.customerName}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => openEdit(jobDetail)} className="gap-1.5"><Pencil className="w-3.5 h-3.5" />Edit</Button>
        </div>

        {/* P&L cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Revenue", value: formatCurrency(n(jobDetail.actualRevenue)), sub: jobDetail.estimatedRevenue ? `est. ${formatCurrency(n(jobDetail.estimatedRevenue))}` : undefined, color: "text-foreground" },
            { label: "Cost", value: formatCurrency(n(jobDetail.actualCost)), sub: jobDetail.estimatedCost ? `est. ${formatCurrency(n(jobDetail.estimatedCost))}` : undefined, color: "text-muted-foreground" },
            { label: "Profit", value: formatCurrency(n(jobDetail.profit)), color: n(jobDetail.profit) >= 0 ? "text-green-600" : "text-destructive" },
            { label: "Margin", value: pct(jobDetail.profitMargin), color: "text-foreground" },
          ].map((card) => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
              <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
              {card.sub && <p className="text-xs text-muted-foreground">{card.sub}</p>}
            </div>
          ))}
        </div>

        {/* Variance table */}
        {pnl && (pnl.revenue.estimated || pnl.cost.estimated) && (
          <div className="bg-card border border-border rounded-xl p-5 mb-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Estimated vs Actual</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left pb-2 font-medium">Line</th>
                  <th className="text-right pb-2 font-medium">Estimated</th>
                  <th className="text-right pb-2 font-medium">Actual</th>
                  <th className="text-right pb-2 font-medium">Variance</th>
                  <th className="text-right pb-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: "Revenue", est: pnl.revenue.estimated, act: pnl.revenue.actual, v: pnl.revenue.variance, vp: pnl.revenue.variancePct },
                  { label: "Cost", est: pnl.cost.estimated, act: pnl.cost.actual, v: pnl.cost.variance, vp: pnl.cost.variancePct },
                ].filter(r => r.est).map((r) => (
                  <tr key={r.label}>
                    <td className="py-2 font-medium text-foreground">{r.label}</td>
                    <td className="py-2 text-right text-muted-foreground">{r.est ? formatCurrency(n(r.est)) : "—"}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(n(r.act))}</td>
                    <td className="py-2 text-right"><VariancePill v={r.v} /></td>
                    <td className="py-2 text-right text-xs text-muted-foreground">{r.vp ? `${parseFloat(r.vp) > 0 ? "+" : ""}${parseFloat(r.vp).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cost by type + mileage */}
        {pnl && (Object.keys(pnl.cost.byType).length > 0 || pnl.mileage) && (
          <div className={`grid gap-5 mb-5 ${pnl.mileage ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {Object.keys(pnl.cost.byType).length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Cost Breakdown by Type</h2>
                <div className="space-y-2">
                  {Object.entries(pnl.cost.byType).sort(([, a], [, b]) => n(b) - n(a)).map(([type, amt]) => {
                    const total = n(pnl.cost.actual);
                    const pctVal = total > 0 ? (n(amt) / total * 100) : 0;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className="text-muted-foreground">{expenseLabel(type)}</span>
                          <div className="flex gap-2">
                            <span className="font-medium">{formatCurrency(n(amt))}</span>
                            <span className="text-muted-foreground text-xs">{pctVal.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, pctVal)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {pnl.mileage && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><Route className="w-4 h-4" />Mileage Economics</h2>
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Estimated Miles", value: pnl.mileage.estimated ? `${parseFloat(pnl.mileage.estimated).toLocaleString()} mi` : "—" },
                    { label: "Actual Miles", value: pnl.mileage.actual ? `${parseFloat(pnl.mileage.actual).toLocaleString()} mi` : "—" },
                    { label: "Contract Rate/mi", value: pnl.mileage.ratePerMile ? `$${parseFloat(pnl.mileage.ratePerMile).toFixed(4)}` : "—" },
                    { label: "Revenue/Mile", value: pnl.mileage.revenuePerMile ? `$${parseFloat(pnl.mileage.revenuePerMile).toFixed(4)}` : "—" },
                    { label: "Cost/Mile", value: pnl.mileage.costPerMile ? `$${parseFloat(pnl.mileage.costPerMile).toFixed(4)}` : "—" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Route bar */}
        {(jobDetail.origin || jobDetail.destination) && (
          <div className="bg-card border border-border rounded-xl p-4 mb-5 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium">{jobDetail.origin ?? "—"}</span>
            <Route className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">{jobDetail.destination ?? "—"}</span>
            {jobDetail.actualMiles && <span className="ml-auto text-xs text-muted-foreground">{parseFloat(jobDetail.actualMiles).toLocaleString()} mi actual</span>}
          </div>
        )}

        {/* Expenses */}
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><ReceiptText className="w-4 h-4" />Expenses</h2>
            <span className="text-xs text-muted-foreground">{expenses.length} item{expenses.length !== 1 ? "s" : ""} · {formatCurrency(n(jobDetail.actualCost))} total</span>
          </div>
          {expenses.length > 0 && (
            <div className="space-y-1 mb-4">
              {expenses.map((exp) => (
                <div key={exp.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{exp.description || expenseLabel(exp.expenseType)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{expenseLabel(exp.expenseType)}</span>
                    {exp.date && <span className="ml-2 text-xs text-muted-foreground">{exp.date}</span>}
                  </div>
                  <span className="text-sm font-medium">{formatCurrency(n(exp.amount))}</span>
                  {deletingExpense === exp.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteExpenseMutation.mutate(exp.id)} className="px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded">
                        {deleteExpenseMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                      </button>
                      <button onClick={() => setDeletingExpense(null)} className="px-1.5 py-0.5 text-xs border border-border rounded hover:bg-muted">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingExpense(exp.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); addExpenseMutation.mutate(); }} className="grid grid-cols-[1fr_100px_130px_100px_auto] gap-2 items-center">
            <Input placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))} className="text-sm" />
            <Input type="number" min="0.01" step="0.01" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} className="text-sm" required />
            <select value={expenseForm.expenseType} onChange={(e) => setExpenseForm((p) => ({ ...p, expenseType: e.target.value }))}
              className="h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {EXPENSE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((p) => ({ ...p, date: e.target.value }))} className="text-sm" />
            <Button type="submit" size="sm" className="gap-1.5" disabled={addExpenseMutation.isPending}>
              {addExpenseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" />Add</>}
            </Button>
          </form>
        </div>

        {jobDetail.notes && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1 font-medium">NOTES</p>
            <p className="text-sm text-foreground">{jobDetail.notes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── EDITOR VIEW ──────────────────────────────────────────────────────────────
  if (view === "editor") {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView("list")} className="p-1.5 rounded hover:bg-muted transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-bold text-foreground">{editingId ? "Edit Job" : "New Job"}</h1>
        </div>
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Job Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Job Name *</Label><Input className="mt-1" value={form.name} onChange={setF("name")} required placeholder="e.g. Chicago to Atlanta Run" /></div>
              <div><Label>Job Number</Label><Input className="mt-1" value={form.jobNumber} onChange={setF("jobNumber")} /></div>
              <div>
                <Label>Customer</Label>
                <select value={String(form.customerId)} onChange={setF("customerId")} className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— None —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Job Type</Label>
                <select value={form.jobType} onChange={setF("jobType")} className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">— Select type —</option>
                  <optgroup label="Trucking"><option value="route">Route</option><option value="load">Load</option><option value="contract">Contract</option></optgroup>
                  <optgroup label="Service"><option value="project">Project</option><option value="retainer">Retainer</option><option value="one-time">One-time</option></optgroup>
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select value={form.status} onChange={setF("status")} className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Start Date</Label><Input type="date" className="mt-1" value={form.startDate} onChange={setF("startDate")} /></div>
                <div><Label>End Date</Label><Input type="date" className="mt-1" value={form.endDate} onChange={setF("endDate")} /></div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Route & Mileage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Origin / Pickup</Label><Input className="mt-1" value={form.origin} onChange={setF("origin")} placeholder="City, ST" /></div>
              <div><Label>Destination / Delivery</Label><Input className="mt-1" value={form.destination} onChange={setF("destination")} placeholder="City, ST" /></div>
              <div><Label>Estimated Miles</Label><Input type="number" min="0" step="any" className="mt-1" value={form.estimatedMiles} onChange={setF("estimatedMiles")} /></div>
              <div><Label>Actual Miles</Label><Input type="number" min="0" step="any" className="mt-1" value={form.actualMiles} onChange={setF("actualMiles")} /></div>
              <div><Label>Rate per Mile ($)</Label><Input type="number" min="0" step="0.0001" className="mt-1" value={form.ratePerMile} onChange={setF("ratePerMile")} /></div>
              <div><Label>Flat Rate ($)</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.flatRate} onChange={setF("flatRate")} /></div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Financials</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Estimated Revenue ($)</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.estimatedRevenue} onChange={setF("estimatedRevenue")} /></div>
              <div><Label>Actual Revenue ($)</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.actualRevenue} onChange={setF("actualRevenue")} /></div>
              <div><Label>Estimated Cost ($)</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.estimatedCost} onChange={setF("estimatedCost")} /></div>
              <div><Label>Actual Cost ($)</Label><Input type="number" min="0" step="0.01" className="mt-1" value={form.actualCost} onChange={setF("actualCost")} />
                <p className="text-xs text-muted-foreground mt-1">Auto-updated when you add expenses</p>
              </div>
            </div>
            {(parseFloat(form.actualRevenue) > 0 || parseFloat(form.actualCost) > 0) && (
              <div className="mt-4 p-3 bg-muted/40 rounded-lg flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Profit preview:</span>
                {(() => {
                  const rev = parseFloat(form.actualRevenue) || 0;
                  const cost = parseFloat(form.actualCost) || 0;
                  const profit = rev - cost;
                  const margin = rev > 0 ? ((profit / rev) * 100).toFixed(1) : "0.0";
                  return <><span className={`font-bold ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(profit)}</span><span className="text-muted-foreground">({margin}% margin)</span></>;
                })()}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={setF("notes")} rows={3} placeholder="Load details, special instructions…"
              className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {editingId ? "Update Job" : "Create Job"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Briefcase className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
            <p className="text-sm text-muted-foreground">{jobs.length} total</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView("report")} className="gap-2 hidden sm:flex"><BarChart3 className="w-4 h-4" />P&amp;L Report</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> New Job</Button>
        </div>
      </div>

      {/* Summary cards from API */}
      {summary && jobs.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Active</p>
            <p className="text-2xl font-bold text-blue-600">{summary.activeJobs}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Revenue</p>
            <p className="text-lg font-bold">{formatCurrency(n(summary.totalRevenue))}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Cost</p>
            <p className="text-lg font-bold text-muted-foreground">{formatCurrency(n(summary.totalCost))}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Profit</p>
            <p className={`text-lg font-bold flex items-center gap-1 ${n(summary.totalProfit) >= 0 ? "text-green-600" : "text-destructive"}`}>
              {n(summary.totalProfit) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {formatCurrency(Math.abs(n(summary.totalProfit)))}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Overall Margin</p>
            <p className="text-lg font-bold">{pct(summary.overallMargin)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search jobs, customers, routes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All statuses</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <Button variant="outline" onClick={() => setView("report")} className="gap-1.5 sm:hidden"><BarChart3 className="w-4 h-4" /></Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search || statusFilter !== "all" ? "No jobs match your filters" : "No jobs yet"}</p>
          {!search && statusFilter === "all" && <p className="text-sm mt-1">Create your first job to track revenue, costs, and profitability</p>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Route</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Profit</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Margin</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const st = STATUSES[j.status] ?? STATUSES.active!;
                const profit = n(j.profit);
                return (
                  <tr key={j.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDetail(j)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{j.name}</div>
                      {j.jobNumber && <div className="text-xs font-mono text-muted-foreground">{j.jobNumber}</div>}
                      {j.jobType && <div className="text-xs text-muted-foreground capitalize">{j.jobType}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{j.customerName ?? "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {(j.origin || j.destination) ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{j.origin ?? "—"}</span><Route className="w-3 h-3 flex-shrink-0" /><span>{j.destination ?? "—"}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(n(j.actualRevenue))}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className={`font-medium ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(profit)}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell text-muted-foreground">{pct(j.profitMargin)}</td>
                    <td className="px-4 py-3">
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setStatusDropOpen(statusDropOpen === j.id ? null : j.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}<ChevronDown className="w-3 h-3" />
                        </button>
                        {statusDropOpen === j.id && (
                          <div className="absolute z-50 mt-1 bg-card border border-border rounded-lg shadow-xl min-w-[130px]">
                            {Object.entries(STATUSES).map(([key, val]) => (
                              <button key={key} onClick={() => statusMutation.mutate({ id: j.id, status: key })}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${j.status === key ? "font-bold" : ""}`}>
                                {val.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button title="Edit" onClick={() => openEdit(j)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        {deleting === j.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteMutation.mutate(j.id)} className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded">
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                            </button>
                            <button onClick={() => setDeleting(null)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleting(j.id)} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
