import { Router, type IRouter } from "express";
import { db, invoicesTable, invoiceLineItemsTable, invoicePaymentsTable, businessesTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

// Generate a portal link for an invoice (requires auth)
router.post("/invoices/:id/portal-link", async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const token = crypto.randomBytes(24).toString("hex");
    const [invoice] = await db.update(invoicesTable)
      .set({ publicToken: token })
      .where(eq(invoicesTable.id, id))
      .returning();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json({ token, url: `/portal/${token}` });
  } catch {
    res.status(500).json({ error: "Failed to generate portal link" });
  }
});

// Public portal — no auth required
router.get("/portal/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const invoice = await db.query.invoicesTable.findFirst({
      where: eq(invoicesTable.publicToken, token),
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const [lineItems, payments, business, customer] = await Promise.all([
      db.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, invoice.id)),
      db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoice.id)),
      db.select({ name: businessesTable.name, currency: businessesTable.currency }).from(businessesTable).where(eq(businessesTable.id, invoice.businessId)).then(r => r[0]),
      invoice.customerId
        ? db.select({ name: customersTable.name, email: customersTable.email, phone: customersTable.phone, address: customersTable.address }).from(customersTable).where(eq(customersTable.id, invoice.customerId)).then(r => r[0])
        : Promise.resolve(null),
    ]);

    // Mark as viewed if not yet
    if (invoice.status === "sent") {
      await db.update(invoicesTable).set({ status: "viewed" }).where(eq(invoicesTable.id, invoice.id));
    }

    res.json({ invoice: { ...invoice, status: invoice.status === "sent" ? "viewed" : invoice.status }, lineItems, payments, business, customer });
  } catch {
    res.status(500).json({ error: "Failed to load portal" });
  }
});

export default router;
