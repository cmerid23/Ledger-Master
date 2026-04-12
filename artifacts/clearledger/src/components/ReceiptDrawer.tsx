import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Upload,
  Trash2,
  ExternalLink,
  FileText,
  DollarSign,
  Calendar,
  Tag,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Pencil,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawerTransaction {
  id: number;
  date: string;
  description: string;
  amount: number | string;
  type: "debit" | "credit";
  accountName?: string | null;
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

interface ReceiptDrawerProps {
  transaction: DrawerTransaction | null;
  businessId: number;
  isOpen: boolean;
  onClose: () => void;
  onReceiptsLoaded?: (transactionId: number, count: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const ACCEPT_TYPES = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

function isImageType(fileType: string | null) {
  return !!fileType?.startsWith("image/");
}

function isPdfType(fileType: string | null) {
  return fileType === "application/pdf";
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export default function ReceiptDrawer({
  transaction,
  businessId,
  isOpen,
  onClose,
  onReceiptsLoaded,
}: ReceiptDrawerProps) {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [lightboxReceipt, setLightboxReceipt] = useState<ReceiptRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeader = { Authorization: `Bearer ${getToken()}` };

  // Load receipts whenever drawer opens with a transaction
  useEffect(() => {
    if (isOpen && transaction) {
      loadReceipts(transaction.id);
    } else {
      setReceipts([]);
      setError("");
    }
  }, [isOpen, transaction?.id]);

  async function loadReceipts(transactionId: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/receipts/${transactionId}`, { headers: authHeader });
      if (!res.ok) throw new Error("Failed to load receipts");
      const data = await res.json() as ReceiptRecord[];
      const list = Array.isArray(data) ? data : [];
      setReceipts(list);
      onReceiptsLoaded?.(transactionId, list.length);
    } catch {
      setError("Could not load receipts");
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file: File) {
    if (!transaction) return;
    setError("");
    setUploading(true);
    setUploadProgress(15);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("businessId", String(businessId));
      fd.append("transactionId", String(transaction.id));

      setUploadProgress(40);
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        headers: authHeader,
        body: fd,
      });
      setUploadProgress(85);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "Upload failed");
      }
      const receipt = await res.json() as ReceiptRecord;
      setUploadProgress(100);
      setReceipts((prev) => [receipt, ...prev]);
      onReceiptsLoaded?.(transaction.id, receipts.length + 1);
    } catch (err: unknown) {
      setError((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    Array.from(files).forEach((f) => uploadFile(f));
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [transaction, businessId, receipts.length]);

  async function handleDelete(receiptId: number) {
    setReceipts((prev) => {
      const next = prev.filter((r) => r.id !== receiptId);
      if (transaction) onReceiptsLoaded?.(transaction.id, next.length);
      return next;
    });
    try {
      await fetch(`/api/receipts/${receiptId}`, {
        method: "DELETE",
        headers: authHeader,
      });
    } catch {
      // Re-fetch on error
      if (transaction) loadReceipts(transaction.id);
    }
  }

  async function handlePatch(receiptId: number, updates: Partial<ReceiptRecord>) {
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json() as ReceiptRecord;
      setReceipts((prev) => prev.map((r) => r.id === receiptId ? updated : r));
    } catch {
      setError("Failed to update receipt");
    }
  }

  const amount = typeof transaction?.amount === "string"
    ? parseFloat(transaction.amount)
    : (transaction?.amount ?? 0);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl flex flex-col p-0 gap-0"
        >
          {/* ── Transaction header ── */}
          <SheetHeader className="px-6 py-5 border-b border-border bg-muted/20 flex-shrink-0">
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                transaction?.type === "credit" ? "bg-emerald-100" : "bg-rose-100"
              )}>
                {transaction?.type === "credit"
                  ? <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  : <ArrowDownRight className="w-4 h-4 text-rose-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base font-semibold text-foreground leading-snug truncate">
                  {transaction?.description ?? "Transaction"}
                </SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    {transaction?.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(transaction.date)}
                      </span>
                    )}
                    {transaction?.accountName && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {transaction.accountName}
                      </span>
                    )}
                    <span className={cn(
                      "font-semibold text-sm",
                      transaction?.type === "credit" ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {transaction?.type === "credit" ? "+" : "-"}{formatCurrency(amount)}
                    </span>
                  </div>
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-5">

              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                  <button onClick={() => setError("")} className="ml-auto">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* ── Dropzone ── */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Attach Receipt
                </p>
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all cursor-pointer select-none",
                    "px-4 py-5",
                    dragOver
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-primary/40 hover:bg-muted/30",
                    uploading && "pointer-events-none opacity-70"
                  )}
                >
                  {uploading ? (
                    <div className="w-full space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading…
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                        dragOver ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Upload className={cn("w-4 h-4", dragOver ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">
                          {dragOver ? "Drop files here" : "Drag & drop or click to upload"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">JPEG, PNG, WebP, PDF · max 20 MB</p>
                      </div>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_TYPES}
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>
              </div>

              {/* ── Receipts section ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Receipts
                    {receipts.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {receipts.length}
                      </span>
                    )}
                  </p>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="aspect-[4/5] bg-muted animate-pulse rounded-xl" />
                    ))}
                  </div>
                ) : receipts.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No receipts attached yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {receipts.map((r) => (
                      <ReceiptCard
                        key={r.id}
                        receipt={r}
                        onDelete={handleDelete}
                        onPatch={handlePatch}
                        onOpenLightbox={setLightboxReceipt}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Image Lightbox ── */}
      <Dialog open={!!lightboxReceipt} onOpenChange={(open) => { if (!open) setLightboxReceipt(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] p-2 bg-black/95 border-0">
          <DialogClose className="absolute right-3 top-3 z-10 rounded-full bg-white/10 hover:bg-white/20 p-1.5 transition-colors">
            <X className="w-4 h-4 text-white" />
          </DialogClose>
          {lightboxReceipt && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={`/api/storage${lightboxReceipt.fileUrl}`}
                alt={lightboxReceipt.fileName}
                className="max-h-[80vh] max-w-full object-contain rounded-md"
              />
              <div className="flex items-center gap-4 text-sm text-white/70">
                <span>{lightboxReceipt.fileName}</span>
                {lightboxReceipt.vendorName && <span>· {lightboxReceipt.vendorName}</span>}
                {lightboxReceipt.receiptAmount != null && (
                  <span>· {formatCurrency(lightboxReceipt.receiptAmount)}</span>
                )}
                <a
                  href={`/api/storage${lightboxReceipt.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-white/50 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Receipt Card ─────────────────────────────────────────────────────────────

function ReceiptCard({
  receipt: r,
  onDelete,
  onPatch,
  onOpenLightbox,
}: {
  receipt: ReceiptRecord;
  onDelete: (id: number) => void;
  onPatch: (id: number, updates: Partial<ReceiptRecord>) => Promise<void>;
  onOpenLightbox: (r: ReceiptRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vendorName: r.vendorName ?? "",
    receiptAmount: r.receiptAmount !== null ? String(r.receiptAmount) : "",
    receiptDate: r.receiptDate ?? "",
    expenseCategory: r.expenseCategory ?? "",
    notes: r.notes ?? "",
    taxDeductible: r.taxDeductible,
  });

  const fileUrl = `/api/storage${r.fileUrl}`;
  const isImage = isImageType(r.fileType);
  const isPdf = isPdfType(r.fileType);

  async function handleToggleTax() {
    const next = !form.taxDeductible;
    setForm((f) => ({ ...f, taxDeductible: next }));
    await onPatch(r.id, { taxDeductible: next });
  }

  async function handleSave() {
    setSaving(true);
    await onPatch(r.id, {
      vendorName: form.vendorName || null,
      receiptAmount: form.receiptAmount ? parseFloat(form.receiptAmount) : null,
      receiptDate: form.receiptDate || null,
      expenseCategory: form.expenseCategory || null,
      notes: form.notes || null,
      taxDeductible: form.taxDeductible,
    });
    setSaving(false);
    setExpanded(false);
  }

  function handleThumbnailClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isImage) {
      onOpenLightbox(r);
    } else if (isPdf) {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className={cn(
      "bg-card border border-card-border rounded-xl overflow-hidden shadow-sm flex flex-col transition-shadow",
      expanded ? "shadow-md col-span-2 sm:col-span-3" : "hover:shadow-md"
    )}>
      {expanded ? (
        /* ── Expanded edit view ── */
        <div className="p-4 space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isImage ? (
                <img
                  src={fileUrl}
                  alt={r.fileName}
                  className="w-10 h-10 rounded-md object-cover border border-border cursor-pointer"
                  onClick={handleThumbnailClick}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{r.fileName}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(r.fileSizeBytes)}</p>
              </div>
            </div>
            <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {/* Edit form grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Vendor / Merchant</label>
              <input
                type="text"
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
                placeholder="e.g. Staples"
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="number"
                  step="0.01"
                  value={form.receiptAmount}
                  onChange={(e) => setForm({ ...form, receiptAmount: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-6 pr-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Receipt date</label>
              <input
                type="date"
                value={form.receiptDate}
                onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Category</label>
              <select
                value={form.expenseCategory}
                onChange={(e) => setForm({ ...form, expenseCategory: e.target.value })}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select…</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes…"
                rows={2}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`tax-${r.id}`}
              checked={form.taxDeductible}
              onChange={(e) => setForm({ ...form, taxDeductible: e.target.checked })}
              className="rounded border-input"
            />
            <label htmlFor={`tax-${r.id}`} className="text-sm text-foreground cursor-pointer select-none">
              Tax deductible
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive font-medium">Delete this receipt?</span>
                <button
                  onClick={() => { setConfirmDelete(false); onDelete(r.id); }}
                  className="px-2.5 py-1 rounded text-xs bg-destructive text-destructive-foreground font-medium hover:opacity-90"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 rounded text-xs border border-border text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(false)}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Collapsed card view ── */
        <>
          {/* Thumbnail */}
          <div
            className="relative aspect-[4/3] bg-muted overflow-hidden cursor-pointer group"
            onClick={handleThumbnailClick}
          >
            {isImage ? (
              <>
                <img
                  src={fileUrl}
                  alt={r.fileName}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                  }}
                />
                <div className="hidden absolute inset-0 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
              </>
            ) : isPdf ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <FileText className="w-10 h-10 text-rose-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PDF</span>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              {isImage && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  View
                </span>
              )}
              {isPdf && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Open
                </span>
              )}
            </div>
          </div>

          {/* Card info */}
          <div className="p-3 space-y-1.5 flex-1">
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-medium text-foreground leading-snug truncate flex-1">
                {r.vendorName || r.fileName}
              </p>
              <button
                onClick={() => setExpanded(true)}
                className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
                title="Edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>

            {r.receiptAmount !== null && (
              <p className="text-sm font-semibold text-foreground">
                {formatCurrency(r.receiptAmount)}
              </p>
            )}

            {r.receiptDate && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                {formatDate(r.receiptDate)}
              </p>
            )}

            {r.expenseCategory && (
              <p className="text-xs text-muted-foreground truncate">{r.expenseCategory}</p>
            )}

            {/* Tax deductible toggle */}
            <button
              onClick={handleToggleTax}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium transition-colors w-fit",
                form.taxDeductible
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              title="Toggle tax deductible"
            >
              <span className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                form.taxDeductible ? "bg-emerald-500" : "bg-muted-foreground/40"
              )} />
              {form.taxDeductible ? "Tax deductible" : "Not deductible"}
            </button>

            {/* Delete button */}
            <div className="pt-0.5">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-destructive">Sure?</span>
                  <button
                    onClick={() => { setConfirmDelete(false); onDelete(r.id); }}
                    className="text-xs text-destructive font-medium hover:underline"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete receipt"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
