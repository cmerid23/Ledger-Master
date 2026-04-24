import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Zap, Tag, FileText, ArrowRight, RefreshCw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { businessId: number }

export default function AiTools({ businessId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Categorizer state
  const [catDesc, setCatDesc] = useState("");
  const [catAmount, setCatAmount] = useState("");
  const [catResult, setCatResult] = useState<any>(null);
  const [catLoading, setCatLoading] = useState(false);

  // Batch categorizer
  const { data: uncategorized = [] } = useQuery<any[]>({
    queryKey: ["transactions-uncategorized", businessId],
    queryFn: () => apiRequest(`/api/transactions?businessId=${businessId}&uncategorized=true`),
  });

  // Quick invoice state
  const [invoiceText, setInvoiceText] = useState("");
  const [invoiceResult, setInvoiceResult] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  async function handleCategorize() {
    if (!catDesc) return;
    setCatLoading(true);
    try {
      const result = await apiRequest("/api/ai/categorize", {
        method: "POST",
        body: JSON.stringify({ description: catDesc, amount: catAmount, businessId }),
      });
      setCatResult(result);
    } catch {
      toast({ title: "Categorization failed", variant: "destructive" });
    } finally {
      setCatLoading(false);
    }
  }

  async function handleQuickInvoice() {
    if (!invoiceText.trim()) return;
    setInvoiceLoading(true);
    try {
      const result = await apiRequest("/api/ai/quick-invoice", {
        method: "POST",
        body: JSON.stringify({ text: invoiceText }),
      });
      setInvoiceResult(result);
    } catch {
      toast({ title: "Failed to parse invoice", variant: "destructive" });
    } finally {
      setInvoiceLoading(false);
    }
  }

  const confidenceColor = (c: number) => c >= 0.8 ? "text-emerald-600" : c >= 0.5 ? "text-amber-600" : "text-red-500";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-purple-500" />AI Tools</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Smart tools to speed up your accounting workflow</p>
      </div>

      <Tabs defaultValue="categorizer">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="categorizer" className="flex items-center gap-2"><Tag className="w-4 h-4" />Categorizer</TabsTrigger>
          <TabsTrigger value="quick-invoice" className="flex items-center gap-2"><FileText className="w-4 h-4" />Quick Invoice</TabsTrigger>
        </TabsList>

        {/* Transaction Categorizer */}
        <TabsContent value="categorizer" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Tag className="w-4 h-4 text-purple-500" />Transaction Categorizer</CardTitle>
              <p className="text-sm text-muted-foreground">Enter a transaction description to get a suggested account category</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Transaction Description</Label>
                  <Input
                    value={catDesc}
                    onChange={e => setCatDesc(e.target.value)}
                    placeholder="e.g. Shell Gas Station, Amazon Office Supplies..."
                    onKeyDown={e => e.key === "Enter" && handleCategorize()}
                  />
                </div>
                <div>
                  <Label>Amount (optional)</Label>
                  <Input type="number" value={catAmount} onChange={e => setCatAmount(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <Button onClick={handleCategorize} disabled={catLoading || !catDesc}>
                {catLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Categorize
              </Button>

              {catResult && (
                <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-lg space-y-2">
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="font-semibold text-purple-900">{catResult.category}</p>
                      <p className={`text-xs ${confidenceColor(catResult.confidence)}`}>
                        {Math.round(catResult.confidence * 100)}% confidence
                      </p>
                    </div>
                    {catResult.accountId && (
                      <Badge variant="outline" className="ml-auto text-xs border-purple-300 text-purple-700">Account matched</Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Common categories reference */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Common Categories</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {["Fuel & Gas", "Meals & Entertainment", "Office Supplies", "Software & Subscriptions", "Utilities", "Insurance", "Repairs & Maintenance", "Payroll", "Rent & Lease", "Marketing & Advertising", "Travel", "Professional Services"].map(cat => (
                  <button key={cat} onClick={() => setCatDesc(cat)} className="text-left text-xs px-2 py-1.5 rounded border border-border hover:bg-muted transition-colors truncate">
                    {cat}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quick Invoice */}
        <TabsContent value="quick-invoice" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Quick Invoice Parser</CardTitle>
              <p className="text-sm text-muted-foreground">Type your invoice items in plain text and we'll parse them into line items</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Describe your invoice items</Label>
                <Textarea
                  value={invoiceText}
                  onChange={e => setInvoiceText(e.target.value)}
                  placeholder={`Examples:\n2x Website Design @ $500\nMonthly hosting $99\n5 hours consulting @ $150\nLogo design $350`}
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">Supported formats: "2x Item @ $100", "Item $50", or just item names</p>
              </div>
              <Button onClick={handleQuickInvoice} disabled={invoiceLoading || !invoiceText.trim()}>
                {invoiceLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                Parse Invoice
              </Button>

              {invoiceResult && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Parsed {invoiceResult.lineItems.length} line item{invoiceResult.lineItems.length !== 1 ? "s" : ""}</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted text-muted-foreground text-xs uppercase">
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr></thead>
                      <tbody>
                        {invoiceResult.lineItems.map((li: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{li.description}</td>
                            <td className="px-3 py-2 text-center">{li.quantity}</td>
                            <td className="px-3 py-2 text-right">${li.rate}</td>
                            <td className="px-3 py-2 text-right font-medium">${li.amount}</td>
                          </tr>
                        ))}
                        <tr className="border-t bg-muted/30">
                          <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">${invoiceResult.subtotal}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => {
                      const params = new URLSearchParams({ prefill: JSON.stringify(invoiceResult.lineItems) });
                      window.location.href = `/invoices?${params}`;
                    }}
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Create Invoice with These Items
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
