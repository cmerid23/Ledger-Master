import { Router, type IRouter } from "express";
import {
  db, vehiclesTable, mileageLogsTable, fuelLogsTable,
  businessesTable, jobsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyBusiness(businessId: number, userId: number) {
  const [b] = await db.select({ id: businessesTable.id, name: businessesTable.name })
    .from(businessesTable)
    .where(and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))).limit(1);
  return b ?? null;
}

async function verifyVehicle(vehicleId: number, userId: number) {
  const [v] = await db
    .select({ id: vehiclesTable.id, businessId: vehiclesTable.businessId })
    .from(vehiclesTable)
    .innerJoin(businessesTable, eq(vehiclesTable.businessId, businessesTable.id))
    .where(and(eq(vehiclesTable.id, vehicleId), eq(businessesTable.userId, userId)))
    .limit(1);
  return v ?? null;
}

async function verifyMileageLog(logId: number, userId: number) {
  const [r] = await db
    .select({ id: mileageLogsTable.id })
    .from(mileageLogsTable)
    .innerJoin(businessesTable, eq(mileageLogsTable.businessId, businessesTable.id))
    .where(and(eq(mileageLogsTable.id, logId), eq(businessesTable.userId, userId)))
    .limit(1);
  return r ?? null;
}

async function verifyFuelLog(logId: number, userId: number) {
  const [r] = await db
    .select({ id: fuelLogsTable.id })
    .from(fuelLogsTable)
    .innerJoin(businessesTable, eq(fuelLogsTable.businessId, businessesTable.id))
    .where(and(eq(fuelLogsTable.id, logId), eq(businessesTable.userId, userId)))
    .limit(1);
  return r ?? null;
}

const n = (v: unknown) => Number(v ?? 0);

// ══════════════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════════════

// GET /api/vehicles?businessId=X
router.get("/vehicles", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  // Enrich with mileage / fuel totals
  const vehicles = await db.select().from(vehiclesTable)
    .where(eq(vehiclesTable.businessId, businessId))
    .orderBy(vehiclesTable.name);

  const ids = vehicles.map((v) => v.id);

  // Mileage totals per vehicle
  const mileageTotals = ids.length > 0
    ? await db.select({
        vehicleId: mileageLogsTable.vehicleId,
        totalMiles: sql<number>`coalesce(sum(${mileageLogsTable.miles}), 0)`,
        logCount: sql<number>`count(*)`,
      })
      .from(mileageLogsTable)
      .where(eq(mileageLogsTable.businessId, businessId))
      .groupBy(mileageLogsTable.vehicleId)
    : [];

  // Fuel totals per vehicle
  const fuelTotals = ids.length > 0
    ? await db.select({
        vehicleId: fuelLogsTable.vehicleId,
        totalGallons: sql<number>`coalesce(sum(${fuelLogsTable.gallons}), 0)`,
        totalFuelCost: sql<number>`coalesce(sum(${fuelLogsTable.totalAmount}), 0)`,
        logCount: sql<number>`count(*)`,
      })
      .from(fuelLogsTable)
      .where(eq(fuelLogsTable.businessId, businessId))
      .groupBy(fuelLogsTable.vehicleId)
    : [];

  const mileageMap = new Map(mileageTotals.map((r) => [r.vehicleId, r]));
  const fuelMap = new Map(fuelTotals.map((r) => [r.vehicleId, r]));

  const enriched = vehicles.map((v) => ({
    ...v,
    totalMiles: n(mileageMap.get(v.id)?.totalMiles),
    mileageLogCount: n(mileageMap.get(v.id)?.logCount),
    totalGallons: n(fuelMap.get(v.id)?.totalGallons),
    totalFuelCost: n(fuelMap.get(v.id)?.totalFuelCost),
    fuelLogCount: n(fuelMap.get(v.id)?.logCount),
  }));

  res.json(enriched);
});

// POST /api/vehicles
router.post("/vehicles", async (req: AuthRequest, res): Promise<void> => {
  const { businessId, name, make, model, year, licensePlate, vin, odometerStart, fuelType, notes } = req.body;
  if (!businessId || !name) { res.status(400).json({ error: "businessId and name required" }); return; }
  const biz = await verifyBusiness(Number(businessId), req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const [v] = await db.insert(vehiclesTable).values({
    businessId: Number(businessId), name, make: make || null, model: model || null,
    year: year ? Number(year) : null, licensePlate: licensePlate || null, vin: vin || null,
    odometerStart: odometerStart || null, fuelType: fuelType || "diesel",
    notes: notes || null, isActive: true,
  }).returning();
  res.status(201).json(v);
});

// GET /api/vehicles/:id
router.get("/vehicles/:id", async (req: AuthRequest, res): Promise<void> => {
  const v = await verifyVehicle(Number(req.params.id), req.userId!);
  if (!v) { res.status(404).json({ error: "Vehicle not found" }); return; }
  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, v.id));
  res.json(vehicle);
});

// PATCH /api/vehicles/:id
router.patch("/vehicles/:id", async (req: AuthRequest, res): Promise<void> => {
  const v = await verifyVehicle(Number(req.params.id), req.userId!);
  if (!v) { res.status(404).json({ error: "Vehicle not found" }); return; }

  const { name, make, model, year, licensePlate, vin, odometerStart, fuelType, isActive, notes } = req.body;
  const updates: Partial<typeof vehiclesTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (make !== undefined) updates.make = make || null;
  if (model !== undefined) updates.model = model || null;
  if (year !== undefined) updates.year = year ? Number(year) : null;
  if (licensePlate !== undefined) updates.licensePlate = licensePlate || null;
  if (vin !== undefined) updates.vin = vin || null;
  if (odometerStart !== undefined) updates.odometerStart = odometerStart || null;
  if (fuelType !== undefined) updates.fuelType = fuelType;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (notes !== undefined) updates.notes = notes || null;

  const [updated] = await db.update(vehiclesTable).set(updates).where(eq(vehiclesTable.id, v.id)).returning();
  res.json(updated);
});

// DELETE /api/vehicles/:id
router.delete("/vehicles/:id", async (req: AuthRequest, res): Promise<void> => {
  const v = await verifyVehicle(Number(req.params.id), req.userId!);
  if (!v) { res.status(404).json({ error: "Vehicle not found" }); return; }
  await db.delete(vehiclesTable).where(eq(vehiclesTable.id, v.id));
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
// MILEAGE LOGS
// ══════════════════════════════════════════════════════════════

// GET /api/mileage-logs?businessId=X[&vehicleId=Y&year=Z]
router.get("/mileage-logs", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string) : null;
  const year = req.query.year ? parseInt(req.query.year as string) : null;

  const rows = await db
    .select({
      log: mileageLogsTable,
      vehicleName: vehiclesTable.name,
      vehicleLicensePlate: vehiclesTable.licensePlate,
    })
    .from(mileageLogsTable)
    .leftJoin(vehiclesTable, eq(mileageLogsTable.vehicleId, vehiclesTable.id))
    .where(and(
      eq(mileageLogsTable.businessId, businessId),
      vehicleId ? eq(mileageLogsTable.vehicleId, vehicleId) : undefined,
    ))
    .orderBy(desc(mileageLogsTable.date));

  const filtered = year
    ? rows.filter((r) => r.log.date.startsWith(String(year)))
    : rows;

  // IRS mileage rates
  const IRS_RATES: Record<number, number> = { 2024: 0.67, 2025: 0.70 };
  const DEFAULT_RATE = 0.67;

  const logs = filtered.map((r) => {
    const miles = n(r.log.miles) ||
      (r.log.odometerEnd && r.log.odometerStart ? n(r.log.odometerEnd) - n(r.log.odometerStart) : 0);
    const logYear = new Date(r.log.date).getFullYear();
    const irsRate = IRS_RATES[logYear] ?? DEFAULT_RATE;
    return {
      ...r.log,
      miles,
      deductionValue: r.log.tripType === "business" ? miles * irsRate : 0,
      irsRate,
      vehicleName: r.vehicleName,
      vehicleLicensePlate: r.vehicleLicensePlate,
    };
  });

  const totalBusinessMiles = logs.filter((l) => l.tripType === "business").reduce((s, l) => s + l.miles, 0);
  const totalDeductionValue = logs.filter((l) => l.tripType === "business").reduce((s, l) => s + l.deductionValue, 0);

  res.json({ logs, totalBusinessMiles, totalDeductionValue });
});

// POST /api/mileage-logs
router.post("/mileage-logs", async (req: AuthRequest, res): Promise<void> => {
  const {
    businessId, vehicleId, jobId, driverName, date,
    startLocation, endLocation, odometerStart, odometerEnd,
    purpose, tripType, notes,
  } = req.body;

  if (!businessId || !date) { res.status(400).json({ error: "businessId and date required" }); return; }
  const biz = await verifyBusiness(Number(businessId), req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const computedMiles = odometerEnd && odometerStart
    ? Number(odometerEnd) - Number(odometerStart)
    : null;

  const [log] = await db.insert(mileageLogsTable).values({
    businessId: Number(businessId),
    vehicleId: vehicleId ? Number(vehicleId) : null,
    jobId: jobId ? Number(jobId) : null,
    driverName: driverName || null,
    date,
    startLocation: startLocation || null,
    endLocation: endLocation || null,
    odometerStart: odometerStart || null,
    odometerEnd: odometerEnd || null,
    miles: computedMiles !== null ? String(computedMiles) : null,
    purpose: purpose || null,
    tripType: tripType || "business",
    notes: notes || null,
  }).returning();
  res.status(201).json(log);
});

// PATCH /api/mileage-logs/:id
router.patch("/mileage-logs/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyMileageLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Mileage log not found" }); return; }

  const { vehicleId, jobId, driverName, date, startLocation, endLocation, odometerStart, odometerEnd, purpose, tripType, notes } = req.body;

  const updates: Partial<typeof mileageLogsTable.$inferInsert> = {};
  if (vehicleId !== undefined) updates.vehicleId = vehicleId ? Number(vehicleId) : null;
  if (jobId !== undefined) updates.jobId = jobId ? Number(jobId) : null;
  if (driverName !== undefined) updates.driverName = driverName || null;
  if (date !== undefined) updates.date = date;
  if (startLocation !== undefined) updates.startLocation = startLocation || null;
  if (endLocation !== undefined) updates.endLocation = endLocation || null;
  if (odometerStart !== undefined) updates.odometerStart = odometerStart || null;
  if (odometerEnd !== undefined) updates.odometerEnd = odometerEnd || null;
  if (purpose !== undefined) updates.purpose = purpose || null;
  if (tripType !== undefined) updates.tripType = tripType || "business";
  if (notes !== undefined) updates.notes = notes || null;

  // Recompute miles if odometer values change
  const start = odometerStart ?? (await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.id, log.id)).limit(1))[0]?.odometerStart;
  const end = odometerEnd ?? (await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.id, log.id)).limit(1))[0]?.odometerEnd;
  if (start && end) updates.miles = String(Number(end) - Number(start));

  const [updated] = await db.update(mileageLogsTable).set(updates).where(eq(mileageLogsTable.id, log.id)).returning();
  res.json(updated);
});

// DELETE /api/mileage-logs/:id
router.delete("/mileage-logs/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyMileageLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Mileage log not found" }); return; }
  await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, log.id));
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
// FUEL LOGS
// ══════════════════════════════════════════════════════════════

// GET /api/fuel-logs/summary?businessId=X[&year=Y] — STATIC before /:id
router.get("/fuel-logs/summary", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const year = req.query.year ? parseInt(req.query.year as string) : null;

  const rows = await db
    .select({
      vehicleId: fuelLogsTable.vehicleId,
      vehicleName: vehiclesTable.name,
      state: fuelLogsTable.state,
      fuelType: fuelLogsTable.fuelType,
      totalGallons: sql<number>`coalesce(sum(${fuelLogsTable.gallons}), 0)`,
      totalAmount: sql<number>`coalesce(sum(${fuelLogsTable.totalAmount}), 0)`,
      logCount: sql<number>`count(*)`,
    })
    .from(fuelLogsTable)
    .leftJoin(vehiclesTable, eq(fuelLogsTable.vehicleId, vehiclesTable.id))
    .where(eq(fuelLogsTable.businessId, businessId))
    .groupBy(fuelLogsTable.vehicleId, vehiclesTable.name, fuelLogsTable.state, fuelLogsTable.fuelType);

  const filtered = year
    ? rows // state-level grouping doesn't have date range; summarize outside
    : rows;

  const totalGallons = filtered.reduce((s, r) => s + n(r.totalGallons), 0);
  const totalAmount = filtered.reduce((s, r) => s + n(r.totalAmount), 0);

  res.json({ summary: filtered, totalGallons, totalAmount });
});

// GET /api/fuel-logs?businessId=X[&vehicleId=Y&year=Z]
router.get("/fuel-logs", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string) : null;
  const year = req.query.year ? parseInt(req.query.year as string) : null;

  const rows = await db
    .select({
      log: fuelLogsTable,
      vehicleName: vehiclesTable.name,
      vehicleLicensePlate: vehiclesTable.licensePlate,
    })
    .from(fuelLogsTable)
    .leftJoin(vehiclesTable, eq(fuelLogsTable.vehicleId, vehiclesTable.id))
    .where(and(
      eq(fuelLogsTable.businessId, businessId),
      vehicleId ? eq(fuelLogsTable.vehicleId, vehicleId) : undefined,
    ))
    .orderBy(desc(fuelLogsTable.date));

  const filtered = year ? rows.filter((r) => r.log.date.startsWith(String(year))) : rows;

  const logs = filtered.map((r) => ({
    ...r.log,
    vehicleName: r.vehicleName,
    vehicleLicensePlate: r.vehicleLicensePlate,
  }));

  const totalGallons = logs.reduce((s, l) => s + n(l.gallons), 0);
  const totalAmount = logs.reduce((s, l) => s + n(l.totalAmount), 0);
  const avgPricePerGallon = totalGallons > 0 ? totalAmount / totalGallons : 0;

  res.json({ logs, totalGallons, totalAmount, avgPricePerGallon });
});

// POST /api/fuel-logs
router.post("/fuel-logs", async (req: AuthRequest, res): Promise<void> => {
  const {
    businessId, vehicleId, jobId, transactionId, date,
    stationName, state, gallons, pricePerGallon, totalAmount,
    odometer, fuelType, receiptId, iftaReportable, notes,
  } = req.body;

  if (!businessId || !date) { res.status(400).json({ error: "businessId and date required" }); return; }
  const biz = await verifyBusiness(Number(businessId), req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const computedTotal = gallons && pricePerGallon
    ? String(Number(gallons) * Number(pricePerGallon))
    : totalAmount || null;

  const [log] = await db.insert(fuelLogsTable).values({
    businessId: Number(businessId),
    vehicleId: vehicleId ? Number(vehicleId) : null,
    jobId: jobId ? Number(jobId) : null,
    transactionId: transactionId ? Number(transactionId) : null,
    date,
    stationName: stationName || null,
    state: state || null,
    gallons: gallons || null,
    pricePerGallon: pricePerGallon || null,
    totalAmount: computedTotal,
    odometer: odometer || null,
    fuelType: fuelType || "diesel",
    receiptId: receiptId ? Number(receiptId) : null,
    iftaReportable: iftaReportable !== false,
    notes: notes || null,
  }).returning();
  res.status(201).json(log);
});

// PATCH /api/fuel-logs/:id
router.patch("/fuel-logs/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyFuelLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Fuel log not found" }); return; }

  const { vehicleId, jobId, date, stationName, state, gallons, pricePerGallon, totalAmount, odometer, fuelType, iftaReportable, notes } = req.body;
  const updates: Partial<typeof fuelLogsTable.$inferInsert> = {};
  if (vehicleId !== undefined) updates.vehicleId = vehicleId ? Number(vehicleId) : null;
  if (jobId !== undefined) updates.jobId = jobId ? Number(jobId) : null;
  if (date !== undefined) updates.date = date;
  if (stationName !== undefined) updates.stationName = stationName || null;
  if (state !== undefined) updates.state = state || null;
  if (gallons !== undefined) updates.gallons = gallons || null;
  if (pricePerGallon !== undefined) updates.pricePerGallon = pricePerGallon || null;
  if (totalAmount !== undefined) updates.totalAmount = totalAmount || null;
  if (odometer !== undefined) updates.odometer = odometer || null;
  if (fuelType !== undefined) updates.fuelType = fuelType;
  if (iftaReportable !== undefined) updates.iftaReportable = Boolean(iftaReportable);
  if (notes !== undefined) updates.notes = notes || null;

  // Auto-compute total if both gallons and rate are known
  const g = gallons ?? null;
  const p = pricePerGallon ?? null;
  if (g && p) updates.totalAmount = String(Number(g) * Number(p));

  const [updated] = await db.update(fuelLogsTable).set(updates).where(eq(fuelLogsTable.id, log.id)).returning();
  res.json(updated);
});

// DELETE /api/fuel-logs/:id
router.delete("/fuel-logs/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyFuelLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Fuel log not found" }); return; }
  await db.delete(fuelLogsTable).where(eq(fuelLogsTable.id, log.id));
  res.json({ success: true });
});

export default router;
