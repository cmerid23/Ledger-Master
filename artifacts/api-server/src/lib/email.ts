import { Resend } from "resend";

const FROM = process.env["FROM_EMAIL"] || "noreply@clearledger.app";

function getResend() {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return null;
  return new Resend(key);
}

// ── Invoice email ─────────────────────────────────────────────────────────────

export async function sendInvoiceEmail(params: {
  to: string;
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  dueDate?: string | null;
  total: string;
  pdfBuffer: Buffer;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  const { to, customerName, businessName, invoiceNumber, dueDate, total, pdfBuffer } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Invoice ${invoiceNumber} from ${businessName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F172A;">
        <div style="background:#0F172A;padding:32px 40px;border-radius:8px 8px 0 0;">
          <h2 style="color:#ffffff;margin:0 0 4px 0;font-size:22px;">${businessName}</h2>
          <span style="color:#10B981;font-size:13px;font-weight:bold;letter-spacing:1px;">INVOICE</span>
        </div>
        <div style="background:#F8FAFC;padding:32px 40px;">
          <p style="margin:0 0 16px 0;">Hi ${customerName},</p>
          <p style="margin:0 0 24px 0;">Please find your invoice attached. Here's a summary:</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0;color:#64748B;font-size:13px;">Invoice Number</td>
              <td style="padding:10px 0;font-weight:bold;text-align:right;">${invoiceNumber}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0;color:#64748B;font-size:13px;">Amount Due</td>
              <td style="padding:10px 0;font-weight:bold;color:#10B981;text-align:right;">$${parseFloat(total).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#64748B;font-size:13px;">Due Date</td>
              <td style="padding:10px 0;text-align:right;">${dueDate || "Upon receipt"}</td>
            </tr>
          </table>
          <p style="color:#64748B;font-size:13px;margin:0 0 8px 0;">Please contact us if you have any questions.</p>
          <p style="margin:0;">Thank you for your business.<br><strong>${businessName}</strong></p>
        </div>
        <div style="padding:16px 40px;background:#E2E8F0;border-radius:0 0 8px 8px;text-align:center;">
          <span style="color:#94A3B8;font-size:11px;">Sent via ClearLedger</span>
        </div>
      </div>
    `,
    attachments: [{ filename: `Invoice-${invoiceNumber}.pdf`, content: pdfBuffer }],
  });

  return true;
}

// ── Quote email ───────────────────────────────────────────────────────────────

export async function sendQuoteEmail(params: {
  to: string;
  customerName: string;
  businessName: string;
  quoteNumber: string;
  expiryDate?: string | null;
  total: string;
  pdfBuffer: Buffer;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  const { to, customerName, businessName, quoteNumber, expiryDate, total, pdfBuffer } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Quote ${quoteNumber} from ${businessName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F172A;">
        <div style="background:#0F172A;padding:32px 40px;border-radius:8px 8px 0 0;">
          <h2 style="color:#ffffff;margin:0 0 4px 0;font-size:22px;">${businessName}</h2>
          <span style="color:#10B981;font-size:13px;font-weight:bold;letter-spacing:1px;">QUOTE</span>
        </div>
        <div style="background:#F8FAFC;padding:32px 40px;">
          <p style="margin:0 0 16px 0;">Hi ${customerName},</p>
          <p style="margin:0 0 24px 0;">Please find your quote attached.${expiryDate ? ` This quote is valid until <strong>${expiryDate}</strong>.` : ""}</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0;color:#64748B;font-size:13px;">Quote Number</td>
              <td style="padding:10px 0;font-weight:bold;text-align:right;">${quoteNumber}</td>
            </tr>
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:10px 0;color:#64748B;font-size:13px;">Total</td>
              <td style="padding:10px 0;font-weight:bold;color:#10B981;text-align:right;">$${parseFloat(total).toFixed(2)}</td>
            </tr>
            ${expiryDate ? `<tr><td style="padding:10px 0;color:#64748B;font-size:13px;">Valid Until</td><td style="padding:10px 0;text-align:right;">${expiryDate}</td></tr>` : ""}
          </table>
          <p style="color:#64748B;font-size:13px;margin:0 0 8px 0;">To accept this quote, simply reply to this email or contact us directly.</p>
          <p style="margin:0;">Thank you,<br><strong>${businessName}</strong></p>
        </div>
        <div style="padding:16px 40px;background:#E2E8F0;border-radius:0 0 8px 8px;text-align:center;">
          <span style="color:#94A3B8;font-size:11px;">Sent via ClearLedger</span>
        </div>
      </div>
    `,
    attachments: [{ filename: `Quote-${quoteNumber}.pdf`, content: pdfBuffer }],
  });

  return true;
}

// ── Password reset email ──────────────────────────────────────────────────────

export async function sendPasswordResetEmail(params: {
  to: string;
  resetLink: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  const { to, resetLink } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your ClearLedger password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F172A;">
        <div style="background:#0F172A;padding:32px 40px;border-radius:8px 8px 0 0;">
          <h2 style="color:#ffffff;margin:0;font-size:22px;">ClearLedger</h2>
        </div>
        <div style="background:#F8FAFC;padding:32px 40px;">
          <h3 style="margin:0 0 16px 0;">Reset your password</h3>
          <p style="margin:0 0 16px 0;">We received a request to reset your ClearLedger password.</p>
          <p style="margin:0 0 24px 0;">Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetLink}" style="display:inline-block;background:#10B981;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">Reset Password</a>
          <p style="color:#64748B;font-size:13px;margin:28px 0 0 0;">If you did not request this, you can safely ignore this email — your password will not change.</p>
        </div>
        <div style="padding:16px 40px;background:#E2E8F0;border-radius:0 0 8px 8px;text-align:center;">
          <span style="color:#94A3B8;font-size:11px;">Sent via ClearLedger</span>
        </div>
      </div>
    `,
  });

  return true;
}

// ── Overdue reminder email ────────────────────────────────────────────────────

export async function sendOverdueReminderEmail(params: {
  to: string;
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  daysOverdue: number;
  amountDue: string;
  pdfBuffer?: Buffer;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  const { to, customerName, businessName, invoiceNumber, daysOverdue, amountDue, pdfBuffer } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Payment reminder — Invoice ${invoiceNumber} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F172A;">
        <div style="background:#EF4444;padding:32px 40px;border-radius:8px 8px 0 0;">
          <h2 style="color:#ffffff;margin:0 0 4px 0;font-size:22px;">Payment Reminder</h2>
          <span style="color:#FCA5A5;font-size:13px;">${businessName}</span>
        </div>
        <div style="background:#F8FAFC;padding:32px 40px;">
          <p style="margin:0 0 16px 0;">Hi ${customerName},</p>
          <p style="margin:0 0 24px 0;">This is a friendly reminder that Invoice <strong>${invoiceNumber}</strong> from <strong>${businessName}</strong> is <strong style="color:#EF4444;">${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
            <tr>
              <td style="padding:10px 0;color:#64748B;font-size:13px;">Amount Due</td>
              <td style="padding:10px 0;font-weight:bold;color:#EF4444;text-align:right;font-size:18px;">$${parseFloat(amountDue).toFixed(2)}</td>
            </tr>
          </table>
          <p style="margin:0 0 8px 0;">Please arrange payment at your earliest convenience. The invoice is attached for your reference.</p>
          <p style="color:#64748B;font-size:13px;margin:0;">If you have already made payment, please disregard this notice.</p>
        </div>
        <div style="padding:16px 40px;background:#E2E8F0;border-radius:0 0 8px 8px;text-align:center;">
          <span style="color:#94A3B8;font-size:11px;">Sent via ClearLedger</span>
        </div>
      </div>
    `,
    attachments: pdfBuffer ? [{ filename: `Invoice-${invoiceNumber}.pdf`, content: pdfBuffer }] : [],
  });

  return true;
}
