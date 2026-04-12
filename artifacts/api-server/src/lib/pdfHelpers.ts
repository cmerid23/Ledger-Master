import PDFDocument from "pdfkit";

const GREEN = "#10B981";
const DARK = "#0F172A";
const GRAY = "#64748B";
const LIGHT = "#F8FAFC";

function pdfToBuffer(draw: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new (PDFDocument as unknown as new (opts: object) => InstanceType<typeof PDFDocument>)({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    draw(doc);
    doc.end();
  });
}

// ── Invoice PDF ───────────────────────────────────────────────────────────────

export type InvoiceForPdf = {
  invoiceNumber: string;
  status?: string | null;
  businessName?: string | null;
  customerName?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  subtotal?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  discountAmount?: string | null;
  total?: string | null;
  amountPaid?: string | null;
  balanceDue?: string | null;
  notes?: string | null;
  terms?: string | null;
  lineItems?: Array<{ description: string; quantity: unknown; unit?: string | null; rate: unknown; amount: unknown }>;
};

export function generateInvoicePdfBuffer(invoice: InvoiceForPdf): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    // Header band
    doc.rect(0, 0, doc.page.width, 120).fill(DARK);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(26).text(invoice.businessName || "Invoice", 50, 35);
    doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(14).text("INVOICE", 50, 68);
    doc.fillColor("#94A3B8").font("Helvetica").fontSize(10).text(invoice.invoiceNumber, 50, 86);

    const statusText = (invoice.status ?? "draft").toUpperCase();
    doc.roundedRect(doc.page.width - 120, 40, 80, 26, 5).fill(GREEN);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text(statusText, doc.page.width - 120, 50, { width: 80, align: "center" });

    doc.fillColor(DARK);
    let y = 140;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("BILLED TO", 50, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("ISSUE DATE", 300, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("DUE DATE", 420, y);
    y += 14;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(invoice.customerName ?? "—", 50, y);
    doc.font("Helvetica").fontSize(11).fillColor(DARK).text(invoice.issueDate ?? "—", 300, y);
    doc.font("Helvetica").fontSize(11).fillColor(DARK).text(invoice.dueDate ?? "—", 420, y);
    y += 40;

    // Line items table header
    doc.rect(50, y, doc.page.width - 100, 24).fill(LIGHT);
    doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(9);
    doc.text("DESCRIPTION", 58, y + 7);
    doc.text("QTY", 330, y + 7, { width: 50, align: "right" });
    doc.text("UNIT", 385, y + 7, { width: 40, align: "center" });
    doc.text("RATE", 430, y + 7, { width: 60, align: "right" });
    doc.text("AMOUNT", doc.page.width - 100 - 60 + 50, y + 7, { width: 60, align: "right" });
    y += 24;

    doc.font("Helvetica").fontSize(10).fillColor(DARK);
    for (const li of invoice.lineItems ?? []) {
      if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
      doc.text(li.description, 58, y + 5, { width: 265 });
      doc.text(String(li.quantity), 330, y + 5, { width: 50, align: "right" });
      doc.text(li.unit ?? "", 385, y + 5, { width: 40, align: "center" });
      doc.text(`$${parseFloat(String(li.rate)).toFixed(2)}`, 430, y + 5, { width: 60, align: "right" });
      doc.text(`$${parseFloat(String(li.amount)).toFixed(2)}`, doc.page.width - 100 - 60 + 50, y + 5, { width: 60, align: "right" });
      y += 22;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    }

    y += 16;
    const totalsX = 350;
    const totalsW = doc.page.width - 50 - totalsX;

    const totRow = (label: string, value: string, bold = false, color = DARK) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor(bold ? color : GRAY);
      doc.text(label, totalsX, y);
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
      doc.text(value, totalsX, y, { width: totalsW, align: "right" });
      y += bold ? 20 : 16;
    };

    totRow("Subtotal", `$${parseFloat(invoice.subtotal ?? "0").toFixed(2)}`);
    if (parseFloat(invoice.taxRate ?? "0") > 0) totRow(`Tax (${invoice.taxRate}%)`, `$${parseFloat(invoice.taxAmount ?? "0").toFixed(2)}`);
    if (parseFloat(invoice.discountAmount ?? "0") > 0) totRow("Discount", `-$${parseFloat(invoice.discountAmount ?? "0").toFixed(2)}`);
    doc.moveTo(totalsX, y).lineTo(doc.page.width - 50, y).strokeColor(GREEN).lineWidth(1).stroke();
    y += 8;
    totRow("Total", `$${parseFloat(invoice.total ?? "0").toFixed(2)}`, true, DARK);
    if (parseFloat(invoice.amountPaid ?? "0") > 0) {
      totRow("Amount Paid", `-$${parseFloat(invoice.amountPaid ?? "0").toFixed(2)}`);
      totRow("Balance Due", `$${parseFloat(invoice.balanceDue ?? "0").toFixed(2)}`, true, parseFloat(invoice.balanceDue ?? "0") > 0 ? "#EF4444" : GREEN);
    }

    if (invoice.notes || invoice.terms) {
      y += 20;
      if (invoice.notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("NOTES", 50, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).fillColor(DARK).text(invoice.notes, 50, y, { width: 400 });
        y += doc.heightOfString(invoice.notes, { width: 400 }) + 10;
      }
      if (invoice.terms) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("TERMS", 50, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).fillColor(DARK).text(invoice.terms, 50, y, { width: 400 });
      }
    }

    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY - 10).lineTo(doc.page.width - 50, footerY - 10).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Generated by ClearLedger", 50, footerY, { align: "center", width: doc.page.width - 100 });
  });
}

// ── Quote PDF ─────────────────────────────────────────────────────────────────

export type QuoteForPdf = {
  quoteNumber: string;
  status?: string | null;
  businessName?: string | null;
  customerName?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  subtotal?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  total?: string | null;
  notes?: string | null;
  terms?: string | null;
  lineItems?: Array<{ description: string; quantity: unknown; unit?: string | null; rate: unknown; amount: unknown }>;
};

export function generateQuotePdfBuffer(quote: QuoteForPdf): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    // Header band — teal accent for quotes
    const TEAL = "#0EA5E9";
    doc.rect(0, 0, doc.page.width, 120).fill(DARK);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(26).text(quote.businessName || "Quote", 50, 35);
    doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(14).text("QUOTE", 50, 68);
    doc.fillColor("#94A3B8").font("Helvetica").fontSize(10).text(quote.quoteNumber, 50, 86);

    const statusText = (quote.status ?? "draft").toUpperCase();
    doc.roundedRect(doc.page.width - 120, 40, 80, 26, 5).fill(TEAL);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text(statusText, doc.page.width - 120, 50, { width: 80, align: "center" });

    doc.fillColor(DARK);
    let y = 140;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("QUOTED TO", 50, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("ISSUE DATE", 300, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("VALID UNTIL", 420, y);
    y += 14;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(quote.customerName ?? "—", 50, y);
    doc.font("Helvetica").fontSize(11).fillColor(DARK).text(quote.issueDate ?? "—", 300, y);
    doc.font("Helvetica").fontSize(11).fillColor(DARK).text(quote.expiryDate ?? "—", 420, y);
    y += 40;

    doc.rect(50, y, doc.page.width - 100, 24).fill(LIGHT);
    doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(9);
    doc.text("DESCRIPTION", 58, y + 7);
    doc.text("QTY", 330, y + 7, { width: 50, align: "right" });
    doc.text("UNIT", 385, y + 7, { width: 40, align: "center" });
    doc.text("RATE", 430, y + 7, { width: 60, align: "right" });
    doc.text("AMOUNT", doc.page.width - 100 - 60 + 50, y + 7, { width: 60, align: "right" });
    y += 24;

    doc.font("Helvetica").fontSize(10).fillColor(DARK);
    for (const li of quote.lineItems ?? []) {
      if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
      doc.text(li.description, 58, y + 5, { width: 265 });
      doc.text(String(li.quantity), 330, y + 5, { width: 50, align: "right" });
      doc.text(li.unit ?? "", 385, y + 5, { width: 40, align: "center" });
      doc.text(`$${parseFloat(String(li.rate)).toFixed(2)}`, 430, y + 5, { width: 60, align: "right" });
      doc.text(`$${parseFloat(String(li.amount)).toFixed(2)}`, doc.page.width - 100 - 60 + 50, y + 5, { width: 60, align: "right" });
      y += 22;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    }

    y += 16;
    const totalsX = 350;
    const totalsW = doc.page.width - 50 - totalsX;

    const totRow = (label: string, value: string, bold = false, color = DARK) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor(bold ? color : GRAY);
      doc.text(label, totalsX, y);
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
      doc.text(value, totalsX, y, { width: totalsW, align: "right" });
      y += bold ? 20 : 16;
    };

    totRow("Subtotal", `$${parseFloat(quote.subtotal ?? "0").toFixed(2)}`);
    if (parseFloat(quote.taxRate ?? "0") > 0) totRow(`Tax (${quote.taxRate}%)`, `$${parseFloat(quote.taxAmount ?? "0").toFixed(2)}`);
    doc.moveTo(totalsX, y).lineTo(doc.page.width - 50, y).strokeColor(TEAL).lineWidth(1).stroke();
    y += 8;
    totRow("Total", `$${parseFloat(quote.total ?? "0").toFixed(2)}`, true, DARK);

    if (quote.notes || quote.terms) {
      y += 20;
      if (quote.notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("NOTES", 50, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).fillColor(DARK).text(quote.notes, 50, y, { width: 400 });
        y += doc.heightOfString(quote.notes, { width: 400 }) + 10;
      }
      if (quote.terms) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text("TERMS", 50, y);
        y += 14;
        doc.font("Helvetica").fontSize(10).fillColor(DARK).text(quote.terms, 50, y, { width: 400 });
      }
    }

    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY - 10).lineTo(doc.page.width - 50, footerY - 10).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Generated by ClearLedger", 50, footerY, { align: "center", width: doc.page.width - 100 });
  });
}
