import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable, invoicesTable, businessesTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router = Router();

const VAPID_PUBLIC  = process.env["VAPID_PUBLIC_KEY"] ?? "";
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_EMAIL   = process.env["VAPID_EMAIL"] ?? "mailto:admin@clearledger.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

// GET /api/push/vapid-public-key
router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// POST /api/push/subscribe
router.post("/push/subscribe", authMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Invalid subscription object" }); return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { p256dh: keys.p256dh, auth: keys.auth, userId },
    });

  res.json({ ok: true });
});

// DELETE /api/push/subscribe
router.delete("/push/subscribe", authMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }

  await db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));

  res.json({ ok: true });
});

// Internal: send push notifications to owners of overdue invoices
export async function sendOverdueInvoicePushes(): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const today = new Date().toISOString().split("T")[0];

  // Get overdue invoices with the business owner's userId
  const overdueRows = await db
    .select({
      invoiceNumber: invoicesTable.invoiceNumber,
      userId: businessesTable.userId,
    })
    .from(invoicesTable)
    .innerJoin(businessesTable, eq(businessesTable.id, invoicesTable.businessId))
    .where(
      and(
        eq(invoicesTable.status, "sent"),
        lt(invoicesTable.dueDate, today),
      )
    )
    .limit(100);

  for (const row of overdueRows) {
    const subs = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, row.userId));

    const payload = JSON.stringify({
      title: "Invoice Overdue",
      body: `Invoice ${row.invoiceNumber} is past due`,
      icon: "/icons/icon-192x192.png",
      url: "/invoices",
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch { /* expired/invalid subscription — skip */ }
    }
  }
}

export default router;
