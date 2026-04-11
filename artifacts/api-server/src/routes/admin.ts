import { Router, type IRouter } from "express";
import { db, usersTable, businessesTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { adminMiddleware, generateAdminToken, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────
// POST /api/admin/login
// Admin login: checks role === 'admin', returns admin JWT
// ─────────────────────────────────────────────────────────────
router.post("/admin/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || user.role !== "admin") {
    res.status(401).json({ error: "Invalid credentials or not an admin account" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials or not an admin account" });
    return;
  }

  const token = generateAdminToken(user.id);
  res.json({
    token,
    admin: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/setup
// Bootstrap: create first admin account (only when none exists)
// Uses ADMIN_EMAIL / ADMIN_PASSWORD env vars or request body
// ─────────────────────────────────────────────────────────────
router.post("/admin/setup", async (req, res): Promise<void> => {
  const existingAdmins = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);

  if (existingAdmins.length > 0) {
    res.status(409).json({ error: "Admin already exists" });
    return;
  }

  const email =
    req.body?.email ?? process.env.ADMIN_EMAIL ?? "admin@clearledger.com";
  const password =
    req.body?.password ?? process.env.ADMIN_PASSWORD ?? "admin123";
  const name = req.body?.name ?? "Admin";

  const passwordHash = await bcrypt.hash(password, 10);
  const [admin] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, role: "admin" })
    .returning();

  res.status(201).json({
    message: "Admin account created",
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
});

// ─── All routes below require admin JWT ──────────────────────

// GET /api/admin/stats
router.get("/admin/stats", adminMiddleware, async (_req: AuthRequest, res): Promise<void> => {
  const [totalUsersRow] = await db.select({ count: count() }).from(usersTable);
  const [totalBusinessesRow] = await db.select({ count: count() }).from(businessesTable);

  const totalUsers = totalUsersRow?.count ?? 0;
  const totalBusinesses = totalBusinessesRow?.count ?? 0;

  res.json({
    totalUsers,
    totalBusinesses,
    avgBusinessesPerUser:
      totalUsers > 0 ? Math.round((totalBusinesses / totalUsers) * 10) / 10 : 0,
  });
});

// GET /api/admin/users
router.get("/admin/users", adminMiddleware, async (_req: AuthRequest, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));

  // Attach business count per user
  const businessCounts = await db
    .select({ userId: businessesTable.userId, count: count() })
    .from(businessesTable)
    .groupBy(businessesTable.userId);

  const countMap = new Map(businessCounts.map((r) => [r.userId, r.count]));

  res.json(
    users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      businessCount: countMap.get(u.id) ?? 0,
    }))
  );
});

// GET /api/admin/businesses
router.get("/admin/businesses", adminMiddleware, async (_req: AuthRequest, res): Promise<void> => {
  const businesses = await db
    .select({
      id: businessesTable.id,
      name: businessesTable.name,
      currency: businessesTable.currency,
      fiscalYearStart: businessesTable.fiscalYearStart,
      createdAt: businessesTable.createdAt,
      userId: businessesTable.userId,
      ownerEmail: usersTable.email,
      ownerName: usersTable.name,
    })
    .from(businessesTable)
    .leftJoin(usersTable, eq(businessesTable.userId, usersTable.id))
    .orderBy(desc(businessesTable.createdAt));

  res.json(
    businesses.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
    }))
  );
});

// PATCH /api/admin/users/:userId/role
router.patch("/admin/users/:userId/role", adminMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const userId = Number(req.params.userId);
  const { role } = req.body ?? {};

  if (!["user", "admin"].includes(role)) {
    res.status(400).json({ error: "Role must be 'user' or 'admin'" });
    return;
  }

  // Prevent demoting yourself
  if (userId === req.userId && role === "user") {
    res.status(400).json({ error: "Cannot demote your own admin account" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ id: updated.id, email: updated.email, role: updated.role });
});

// DELETE /api/admin/users/:userId
router.delete("/admin/users/:userId", adminMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const userId = Number(req.params.userId);

  if (userId === req.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const deleted = await db.delete(usersTable).where(eq(usersTable.id, userId)).returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ message: "User deleted" });
});

// DELETE /api/admin/businesses/:businessId
router.delete("/admin/businesses/:businessId", adminMiddleware, async (req: AuthRequest, res): Promise<void> => {
  const businessId = Number(req.params.businessId);

  const deleted = await db
    .delete(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({ message: "Business deleted" });
});

export default router;
