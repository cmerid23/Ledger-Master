import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

function getStripe(): Stripe | null {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key || key.startsWith("sk_test_...")) return null;
  return new Stripe(key, { apiVersion: "2025-04-30.basil" });
}

// Plan → Stripe Price ID mapping (set these in your Stripe dashboard)
const PRICE_IDS: Record<string, Record<string, string>> = {
  starter: {
    monthly: process.env["STRIPE_PRICE_STARTER_MONTHLY"] ?? "",
    yearly: process.env["STRIPE_PRICE_STARTER_YEARLY"] ?? "",
  },
  pro: {
    monthly: process.env["STRIPE_PRICE_PRO_MONTHLY"] ?? "",
    yearly: process.env["STRIPE_PRICE_PRO_YEARLY"] ?? "",
  },
  business: {
    monthly: process.env["STRIPE_PRICE_BUSINESS_MONTHLY"] ?? "",
    yearly: process.env["STRIPE_PRICE_BUSINESS_YEARLY"] ?? "",
  },
};

// Helper — get or create Stripe customer for user
async function getOrCreateCustomer(stripe: Stripe, userId: number): Promise<{ customerId: string; sub: typeof subscriptionsTable.$inferSelect | null }> {
  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);

  if (existing?.stripeCustomerId) {
    return { customerId: existing.stripeCustomerId, sub: existing };
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: String(userId) } });

  const [sub] = await db.insert(subscriptionsTable).values({
    userId,
    stripeCustomerId: customer.id,
    plan: "free",
    status: "active",
  }).returning();

  return { customerId: customer.id, sub };
}

// ── GET /api/billing/status ───────────────────────────────────────────────────
router.get("/billing/status", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);

  if (!sub) {
    res.json({ plan: "free", status: "active", cancelAtPeriodEnd: false });
    return;
  }

  res.json({
    plan: sub.plan,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    trialEnd: sub.trialEnd?.toISOString() ?? null,
  });
});

// ── POST /api/billing/create-checkout ────────────────────────────────────────
router.post("/billing/create-checkout", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const stripe = getStripe();
  if (!stripe) { res.status(503).json({ error: "Billing not configured" }); return; }

  const { plan, interval = "monthly" } = req.body as { plan: string; interval?: string };

  const priceId = PRICE_IDS[plan]?.[interval];
  if (!priceId) {
    res.status(400).json({ error: "Invalid plan or interval. Configure STRIPE_PRICE_* env vars." });
    return;
  }

  const userId = req.userId!;
  const { customerId } = await getOrCreateCustomer(stripe, userId);

  const origin = process.env["CLIENT_URL"] ?? ((req.headers["origin"] as string) || `https://${req.headers["host"]}`);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    subscription_data: { trial_period_days: 14 },
    allow_promotion_codes: true,
  });

  res.json({ url: session.url });
});

// ── POST /api/billing/portal ──────────────────────────────────────────────────
router.post("/billing/portal", authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const stripe = getStripe();
  if (!stripe) { res.status(503).json({ error: "Billing not configured" }); return; }

  const userId = req.userId!;
  const { customerId } = await getOrCreateCustomer(stripe, userId);

  const origin = process.env["CLIENT_URL"] ?? ((req.headers["origin"] as string) || `https://${req.headers["host"]}`);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/billing`,
  });

  res.json({ url: session.url });
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
router.post("/billing/webhook", async (req: Request, res: Response): Promise<void> => {
  const stripe = getStripe();
  if (!stripe) { res.status(503).send("Billing not configured"); return; }

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).send(`Webhook Error: ${msg}`);
    return;
  }

  async function upsertSubscription(stripeSub: Stripe.Subscription) {
    const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

    const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.stripeCustomerId, customerId)).limit(1);
    if (!existing) return;

    const item = stripeSub.items.data[0];
    const priceId = item?.price.id ?? null;
    const plan = getPlanFromPriceId(priceId);

    const currentPeriodStart = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null;
    const currentPeriodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null;
    const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null;

    await db.update(subscriptionsTable)
      .set({
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: priceId,
        plan,
        status: stripeSub.status,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        currentPeriodStart,
        currentPeriodEnd,
        trialEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.stripeCustomerId, customerId));
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object as Stripe.Subscription);
      break;
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.CheckoutSession;
      if (session.subscription && session.customer) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await upsertSubscription(sub);
      }
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

function getPlanFromPriceId(priceId: string | null): string {
  if (!priceId) return "free";
  for (const [plan, intervals] of Object.entries(PRICE_IDS)) {
    if (Object.values(intervals).includes(priceId)) return plan;
  }
  return "starter";
}

export default router;
