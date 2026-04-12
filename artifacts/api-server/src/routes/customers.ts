import { Router, type IRouter } from "express";
import { db, customersTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();
router.use(authMiddleware);

async function verifyBusinessOwnership(businessId: number, userId: number): Promise<boolean> {
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId)))
    .limit(1);
  return !!business;
}

const BusinessParams = z.object({ businessId: z.coerce.number().int().positive() });
const CustomerParams = z.object({ businessId: z.coerce.number().int().positive(), customerId: z.coerce.number().int().positive() });
const CustomerBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  country: z.string().optional().default("US"),
  paymentTerms: z.number().int().optional().default(30),
  notes: z.string().optional().nullable(),
});

// List customers
router.get("/businesses/:businessId/customers", async (req: AuthRequest, res): Promise<void> => {
  const params = BusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid businessId" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const customers = await db.select().from(customersTable)
    .where(eq(customersTable.businessId, params.data.businessId))
    .orderBy(customersTable.name);
  res.json(customers);
});

// Create customer
router.post("/businesses/:businessId/customers", async (req: AuthRequest, res): Promise<void> => {
  const params = BusinessParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid businessId" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = CustomerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [customer] = await db.insert(customersTable).values({
    ...body.data,
    businessId: params.data.businessId,
  }).returning();
  res.status(201).json(customer);
});

// Update customer
router.put("/businesses/:businessId/customers/:customerId", async (req: AuthRequest, res): Promise<void> => {
  const params = CustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  const body = CustomerBody.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [customer] = await db.update(customersTable)
    .set(body.data)
    .where(and(eq(customersTable.id, params.data.customerId), eq(customersTable.businessId, params.data.businessId)))
    .returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(customer);
});

// Delete customer
router.delete("/businesses/:businessId/customers/:customerId", async (req: AuthRequest, res): Promise<void> => {
  const params = CustomerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid params" }); return; }
  const owned = await verifyBusinessOwnership(params.data.businessId, req.userId!);
  if (!owned) { res.status(404).json({ error: "Business not found" }); return; }
  await db.delete(customersTable)
    .where(and(eq(customersTable.id, params.data.customerId), eq(customersTable.businessId, params.data.businessId)));
  res.json({ success: true });
});

export default router;
