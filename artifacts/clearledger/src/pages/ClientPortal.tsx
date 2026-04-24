import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, CheckCircle, Clock, AlertCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700", icon: Clock },
  viewed: { label: "Viewed", color: "bg-purple-100 text-purple-700", icon: Clock },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  partial: { label: "Partially Paid", color: "bg-amber-100 text-amber-700", icon: Clock },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertCircle },
};

export default function ClientPortal() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => fetch(`/api/portal/${token}`).then(r => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading invoice...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h2 className="text-xl font-semibold text-slate-800">Invoice Not Found</h2>
          <p className="text-slate-500 mt-2">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const { invoice, lineItems = [], payments = [], business, customer } = data;
  const status = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.sent;
  const StatusIcon = status.icon;

  const fmt = (n: string | number) =>
    `${invoice.currency || "USD"} ${parseFloat(String(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg leading-tight">{business?.name || "ClearLedger"}</p>
            <p className="text-slate-400 text-xs">Powered by ClearLedger</p>
          </div>
          <div className="ml-auto">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>
              <StatusIcon className="w-3 h-3 inline mr-1" />{status.label}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Invoice header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Invoice</h1>
                <p className="text-slate-500 font-mono text-sm mt-0.5">#{invoice.invoiceNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-900">{fmt(invoice.total)}</p>
                {parseFloat(invoice.balanceDue) > 0 && parseFloat(invoice.balanceDue) !== parseFloat(invoice.total) && (
                  <p className="text-sm text-red-600 mt-0.5">Balance due: {fmt(invoice.balanceDue)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Bill To</p>
                {customer ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-900">{customer.name}</p>
                    {customer.email && <p className="text-slate-500">{customer.email}</p>}
                    {customer.address && <p className="text-slate-500 whitespace-pre-line">{customer.address}</p>}
                  </div>
                ) : <p className="text-slate-400">—</p>}
              </div>
              <div className="text-right space-y-2">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Issue Date</p>
                  <p className="text-slate-700">{invoice.issueDate}</p>
                </div>
                {invoice.dueDate && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Due Date</p>
                    <p className={`font-medium ${invoice.status === "overdue" ? "text-red-600" : "text-slate-700"}`}>{invoice.dueDate}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Description</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Qty</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Rate</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-5 py-3.5 text-slate-800">{li.description}</td>
                    <td className="px-5 py-3.5 text-center text-slate-500">{parseFloat(li.quantity)}{li.unit ? ` ${li.unit}` : ""}</td>
                    <td className="px-5 py-3.5 text-right text-slate-500">{fmt(li.rate)}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-900">{fmt(li.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="pt-5">
            <div className="space-y-2 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span><span>{fmt(invoice.subtotal)}</span>
              </div>
              {parseFloat(invoice.discountAmount) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span><span>-{fmt(invoice.discountAmount)}</span>
                </div>
              )}
              {parseFloat(invoice.taxAmount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({invoice.taxRate}%)</span><span>{fmt(invoice.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t text-slate-900">
                <span>Total</span><span>{fmt(invoice.total)}</span>
              </div>
              {parseFloat(invoice.amountPaid) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Amount Paid</span><span>-{fmt(invoice.amountPaid)}</span>
                </div>
              )}
              {parseFloat(invoice.balanceDue) > 0 && (
                <div className="flex justify-between font-bold text-base pt-2 border-t text-red-700">
                  <span>Balance Due</span><span>{fmt(invoice.balanceDue)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payments history */}
        {payments.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm font-semibold mb-3">Payment History</p>
              <div className="space-y-2">
                {payments.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-slate-600">{p.paymentDate}</span>
                      {p.paymentMethod && <Badge variant="outline" className="text-xs">{p.paymentMethod}</Badge>}
                    </div>
                    <span className="font-medium text-emerald-700">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {invoice.notes && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}

        {invoice.terms && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Terms & Conditions</p>
              <p className="text-sm text-slate-500 whitespace-pre-line">{invoice.terms}</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-slate-400 py-4">
          Sent via <span className="font-semibold">ClearLedger</span>
        </div>
      </div>
    </div>
  );
}
