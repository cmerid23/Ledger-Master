import { useState } from "react";
import { getToken } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
  Upload,
  Trash2,
  ExternalLink,
  Tag,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  Plus,
  X,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Props {
  businessId: number;
}

interface ReceiptRecord {
  id: number;
  businessId: number;
  transactionId: number | null;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  vendorName: string | null;
  receiptAmount: number | null;
  receiptDate: string | null;
  expenseCategory: string | null;
  taxDeductible: boolean;
  notes: string | null;
  uploadedAt: string;
}

const EXPENSE_CATEGORIES = [
  "Meals & Entertainment",
  "Travel",
  "Office Supplies",
  "Marketing & Advertising",
  "Professional Services",
  "Utilities",
  "Rent",
  "Software & Subscriptions",
  "Equipment",
  "Other",
];

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function fileIcon(fileType: string | null) {
  if (fileType?.startsWith("image/")) return "🖼️";
  if (fileType === "application/pdf") return "📄";
  return "📎";
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReceiptsPage({ businessId }: Props) {
  const queryClient = useQueryClient();
  const [receipts, setReceipts] = useState<ReceiptRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [form, setForm] = useState({
    vendorName: "",
    receiptAmount: "",
    receiptDate: "",
    expenseCategory: "",
    taxDeductible: true,
    notes: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const token = getToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function fetchReceipts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/receipts`, { headers });
      const data = await res.json() as ReceiptRecord[];
      setReceipts(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }

  // Lazy-load on first render
  if (receipts === null && !loading) {
    fetchReceipts();
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) { setError("Please select a file"); return; }
    setError("");
    setUploading(true);
    setUploadProgress(10);

    try {
      // Step 1: Request presigned URL
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type || "application/octet-stream",
        }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      setUploadProgress(30);

      // Step 2: Upload directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
        body: selectedFile,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file");

      setUploadProgress(80);

      // Step 3: Create receipt record
      const body = {
        fileName: selectedFile.name,
        fileUrl: objectPath,
        fileType: selectedFile.type || null,
        fileSizeBytes: selectedFile.size,
        vendorName: form.vendorName || null,
        receiptAmount: form.receiptAmount ? parseFloat(form.receiptAmount) : null,
        receiptDate: form.receiptDate || null,
        expenseCategory: form.expenseCategory || null,
        taxDeductible: form.taxDeductible,
        notes: form.notes || null,
      };

      const createRes = await fetch(`/api/businesses/${businessId}/receipts`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!createRes.ok) throw new Error("Failed to save receipt");

      setUploadProgress(100);

      // Reset
      setSelectedFile(null);
      setForm({ vendorName: "", receiptAmount: "", receiptDate: "", expenseCategory: "", taxDeductible: true, notes: "" });
      setShowForm(false);
      setSuccessMsg("Receipt uploaded successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
      await fetchReceipts();
    } catch (err: unknown) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this receipt?")) return;
    await fetch(`/api/businesses/${businessId}/receipts/${id}`, { method: "DELETE", headers });
    setReceipts((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload and manage expense receipts for your business</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => { setShowForm(!showForm); setError(""); }}
        >
          <Plus className="w-4 h-4" />
          Upload receipt
        </button>
      </div>

      {/* Success */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Upload form */}
      {showForm && (
        <form onSubmit={handleUpload} className="bg-card border border-card-border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm">Upload receipt</h3>
            <button type="button" onClick={() => { setShowForm(false); setSelectedFile(null); setError(""); }}>
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive text-sm rounded-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* File picker */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">File <span className="text-destructive">*</span></label>
            {selectedFile ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-primary/30 bg-primary/5">
                <span className="text-lg">{fileIcon(selectedFile.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{selectedFile.name}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</div>
                </div>
                <button type="button" onClick={() => setSelectedFile(null)}>
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-md border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-all">
                <Upload className="w-6 h-6 text-muted-foreground" />
                <div className="text-center">
                  <div className="text-sm font-medium text-foreground">Click to upload</div>
                  <div className="text-xs text-muted-foreground">JPEG, PNG, WebP, PDF</div>
                </div>
                <input type="file" className="hidden" accept={ACCEPT} onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setSelectedFile(f);
                }} />
              </label>
            )}
          </div>

          {/* Metadata fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Vendor / Merchant</label>
              <input
                type="text"
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                placeholder="e.g. Staples, Delta Airlines"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Receipt amount</label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="number"
                  step="0.01"
                  value={form.receiptAmount}
                  onChange={(e) => setForm({ ...form, receiptAmount: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Receipt date</label>
              <input
                type="date"
                value={form.receiptDate}
                onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Expense category</label>
              <select
                value={form.expenseCategory}
                onChange={(e) => setForm({ ...form, expenseCategory: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select category</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="taxDeductible"
              checked={form.taxDeductible}
              onChange={(e) => setForm({ ...form, taxDeductible: e.target.checked })}
              className="rounded border-input"
            />
            <label htmlFor="taxDeductible" className="text-sm text-foreground cursor-pointer">Tax deductible</label>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setSelectedFile(null); }}
              className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={uploading || !selectedFile}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {/* Receipts list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : receipts?.length === 0 ? (
        <div className="py-16 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No receipts yet. Upload your first receipt to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {receipts?.map((r) => (
            <ReceiptCard key={r.id} receipt={r} businessId={businessId} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReceiptCard({ receipt: r, businessId, onDelete }: {
  receipt: ReceiptRecord;
  businessId: number;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fileUrl = `/api/storage${r.fileUrl}`;
  const isImage = r.fileType?.startsWith("image/");

  return (
    <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* File type icon */}
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
          {fileIcon(r.fileType)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground truncate">{r.fileName}</span>
            {r.taxDeductible && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium flex-shrink-0">
                <CheckCircle className="w-3 h-3" />
                Tax deductible
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {r.vendorName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> {r.vendorName}
              </span>
            )}
            {r.expenseCategory && (
              <span className="text-xs text-muted-foreground">{r.expenseCategory}</span>
            )}
            {r.receiptDate && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {formatDate(r.receiptDate)}
              </span>
            )}
            {r.fileSizeBytes && (
              <span className="text-xs text-muted-foreground">{formatBytes(r.fileSizeBytes)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {r.receiptAmount !== null && (
            <span className="text-sm font-semibold text-foreground">{formatCurrency(r.receiptAmount)}</span>
          )}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Open file"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 bg-muted/10 space-y-3">
          {isImage && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={fileUrl}
                alt={r.fileName}
                className="max-h-64 rounded-lg object-contain border border-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </a>
          )}
          {r.notes && (
            <p className="text-sm text-muted-foreground">{r.notes}</p>
          )}
          <div className="text-xs text-muted-foreground">
            Uploaded {new Date(r.uploadedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
