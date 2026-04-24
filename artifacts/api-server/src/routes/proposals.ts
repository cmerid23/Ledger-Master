import { Router, type IRouter } from "express";
import { db, proposalsTable, proposalLineItemsTable, invoicesTable, invoiceLineItemsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";
import crypto from "crypto";

const router: IRouter = Router();
router.use(authMiddleware as any);

router.get("/proposals", async (req: AuthRequest, res) => {
  try {
    const businessId = Number(req.query.businessId);
    if (!businessId) return res.status(400).json({ error: "businessId required" });
    const proposals = await db.query.proposalsTable.findMany({
      where: eq(proposalsTable.businessId, businessId),
      with: { lineItems: true },
      orderBy: [desc(proposalsTable.createdAt)],
    });
    res.json(proposals);
  } catch {
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

router.get("/proposals/:id", async (req: AuthRequest, res) => {
  try {
    const proposal = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, Number(req.params.id)),
      with: { lineItems: true },
    });
    if (!proposal) return res.status(404).json({ error: "Not found" });
    res.json(proposal);
  } catch {
    res.status(500).json({ error: "Failed to fetch proposal" });
  }
});

router.post("/proposals", async (req: AuthRequest, res) => {
  try {
    const { lineItems, ...data } = req.body;
    const publicToken = crypto.randomBytes(16).toString("hex");
    const [proposal] = await db.insert(proposalsTable).values({ ...data, publicToken }).returning();
    if (lineItems?.length) {
      await db.insert(proposalLineItemsTable).values(
        lineItems.map((li: any, i: number) => ({ ...li, proposalId: proposal.id, sortOrder: i }))
      );
    }
    const full = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, proposal.id),
      with: { lineItems: true },
    });
    res.status(201).json(full);
  } catch {
    res.status(500).json({ error: "Failed to create proposal" });
  }
});

router.put("/proposals/:id", async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { lineItems, ...data } = req.body;
    await db.update(proposalsTable).set(data).where(eq(proposalsTable.id, id));
    if (lineItems) {
      await db.delete(proposalLineItemsTable).where(eq(proposalLineItemsTable.proposalId, id));
      if (lineItems.length) {
        await db.insert(proposalLineItemsTable).values(
          lineItems.map((li: any, i: number) => ({ ...li, proposalId: id, sortOrder: i }))
        );
      }
    }
    const full = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, id),
      with: { lineItems: true },
    });
    res.json(full);
  } catch {
    res.status(500).json({ error: "Failed to update proposal" });
  }
});

router.post("/proposals/:id/convert", async (req: AuthRequest, res) => {
  try {
    const proposal = await db.query.proposalsTable.findFirst({
      where: eq(proposalsTable.id, Number(req.params.id)),
      with: { lineItems: true },
    });
    if (!proposal) return res.status(404).json({ error: "Not found" });
    const invNum = `INV-${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];
    const [invoice] = await db.insert(invoicesTable).values({
      businessId: proposal.businessId,
      customerId: proposal.customerId,
      invoiceNumber: invNum,
      status: "draft",
      issueDate: today,
      subtotal: proposal.subtotal,
      taxRate: proposal.taxRate,
      taxAmount: proposal.taxAmount,
      discountAmount: proposal.discountAmount,
      total: proposal.total,
      amountPaid: "0",
      balanceDue: proposal.total,
      currency: proposal.currency,
      notes: proposal.notes,
      terms: proposal.terms,
    }).returning();
    if (proposal.lineItems?.length) {
      await db.insert(invoiceLineItemsTable).values(
        proposal.lineItems.map((li) => ({
          invoiceId: invoice.id,
          description: li.description,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount,
          sortOrder: li.sortOrder,
        }))
      );
    }
    await db.update(proposalsTable)
      .set({ status: "accepted", convertedToInvoiceId: invoice.id })
      .where(eq(proposalsTable.id, proposal.id));
    res.json({ invoice });
  } catch {
    res.status(500).json({ error: "Failed to convert proposal" });
  }
});

router.delete("/proposals/:id", async (req: AuthRequest, res) => {
  try {
    await db.delete(proposalsTable).where(eq(proposalsTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete proposal" });
  }
});

export default router;
