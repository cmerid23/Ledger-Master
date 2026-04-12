import { Router, type IRouter } from "express";
import {
  db, vehiclesTable, mileageLogsTable, fuelLogsTable,
  businessesTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
router.use(authMiddleware);

// ─── Constants ────────────────────────────────────────────────────────────────

const IRS_RATES: Record<number, number> = { 2024: 0.67, 2025: 0.70 };
const DEFAULT_IRS_RATE = 0.67;
function irsRate(year: number) { return IRS_RATES[year] ?? DEFAULT_IRS_RATE; }

const QUARTERS: Record<number, number[]> = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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

// ── Enrich a raw mileage row with computed miles + IRS deduction ──────────────
function enrichMileageRow(row: {
  log: typeof mileageLogsTable.$inferSelect;
  vehicleName: string | null;
  vehicleLicensePlate: string | null;
}) {
  const miles = n(row.log.miles) ||
    (row.log.odometerEnd && row.log.odometerStart
      ? n(row.log.odometerEnd) - n(row.log.odometerStart)
      : 0);
  const logYear = new Date(row.log.date).getFullYear();
  const rate = irsRate(logYear);
  return {
    ...row.log,
    miles,
    irsRate: rate,
    deductionValue: row.log.tripType === "business" ? miles * rate : 0,
    vehicleName: row.vehicleName,
    vehicleLicensePlate: row.vehicleLicensePlate,
  };
}

// ── Fetch all mileage logs for a business / optional year ────────────────────
async function getMileageLogs(businessId: number, year: number | null, vehicleId: number | null) {
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

  const filtered = year ? rows.filter((r) => r.log.date.startsWith(String(year))) : rows;
  return filtered.map(enrichMileageRow);
}

// ══════════════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════════════

// GET /api/vehicles
router.get("/vehicles", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const vehicles = await db.select().from(vehiclesTable)
    .where(eq(vehiclesTable.businessId, businessId))
    .orderBy(vehiclesTable.name);

  const [mileageTotals, fuelTotals] = await Promise.all([
    db.select({
      vehicleId: mileageLogsTable.vehicleId,
      totalMiles: sql<number>`coalesce(sum(${mileageLogsTable.miles}), 0)`,
      logCount: sql<number>`count(*)`,
    })
    .from(mileageLogsTable)
    .where(eq(mileageLogsTable.businessId, businessId))
    .groupBy(mileageLogsTable.vehicleId),

    db.select({
      vehicleId: fuelLogsTable.vehicleId,
      totalGallons: sql<number>`coalesce(sum(${fuelLogsTable.gallons}), 0)`,
      totalFuelCost: sql<number>`coalesce(sum(${fuelLogsTable.totalAmount}), 0)`,
      logCount: sql<number>`count(*)`,
    })
    .from(fuelLogsTable)
    .where(eq(fuelLogsTable.businessId, businessId))
    .groupBy(fuelLogsTable.vehicleId),
  ]);

  const mileageMap = new Map(mileageTotals.map((r) => [r.vehicleId, r]));
  const fuelMap    = new Map(fuelTotals.map((r) => [r.vehicleId, r]));

  res.json(vehicles.map((v) => ({
    ...v,
    totalMiles:      n(mileageMap.get(v.id)?.totalMiles),
    mileageLogCount: n(mileageMap.get(v.id)?.logCount),
    totalGallons:    n(fuelMap.get(v.id)?.totalGallons),
    totalFuelCost:   n(fuelMap.get(v.id)?.totalFuelCost),
    fuelLogCount:    n(fuelMap.get(v.id)?.logCount),
  })));
});

// POST /api/vehicles
router.post("/vehicles", async (req: AuthRequest, res): Promise<void> => {
  const { businessId, name, make, model, year, licensePlate, vin, odometerStart, fuelType, notes } = req.body;
  if (!businessId || !name) { res.status(400).json({ error: "businessId and name required" }); return; }
  const biz = await verifyBusiness(Number(businessId), req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const [v] = await db.insert(vehiclesTable).values({
    businessId: Number(businessId), name,
    make: make || null, model: model || null,
    year: year ? Number(year) : null,
    licensePlate: licensePlate || null, vin: vin || null,
    odometerStart: odometerStart || null,
    fuelType: fuelType || "diesel",
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
  const u: Partial<typeof vehiclesTable.$inferInsert> = {};
  if (name        !== undefined) u.name         = name;
  if (make        !== undefined) u.make         = make || null;
  if (model       !== undefined) u.model        = model || null;
  if (year        !== undefined) u.year         = year ? Number(year) : null;
  if (licensePlate !== undefined) u.licensePlate = licensePlate || null;
  if (vin         !== undefined) u.vin          = vin || null;
  if (odometerStart !== undefined) u.odometerStart = odometerStart || null;
  if (fuelType    !== undefined) u.fuelType     = fuelType;
  if (isActive    !== undefined) u.isActive     = Boolean(isActive);
  if (notes       !== undefined) u.notes        = notes || null;

  const [updated] = await db.update(vehiclesTable).set(u).where(eq(vehiclesTable.id, v.id)).returning();
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
// MILEAGE  — all static routes BEFORE /:id
// ══════════════════════════════════════════════════════════════

// ── GET /api/mileage/report?businessId=X&year=Y ──────────────────────────────
router.get("/mileage/report", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
  const logs = await getMileageLogs(businessId, year, null);

  // By vehicle
  const vehicleMap = new Map<number | null, { vehicleId: number | null; vehicleName: string | null; businessMiles: number; personalMiles: number; otherMiles: number; deductionValue: number; tripCount: number }>();
  for (const l of logs) {
    const key = l.vehicleId;
    if (!vehicleMap.has(key)) vehicleMap.set(key, { vehicleId: key, vehicleName: l.vehicleName, businessMiles: 0, personalMiles: 0, otherMiles: 0, deductionValue: 0, tripCount: 0 });
    const e = vehicleMap.get(key)!;
    if (l.tripType === "business")       { e.businessMiles += l.miles; e.deductionValue += l.deductionValue; }
    else if (l.tripType === "personal")  { e.personalMiles += l.miles; }
    else                                 { e.otherMiles += l.miles; }
    e.tripCount++;
  }

  // By month
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, label: MONTH_NAMES[i],
    businessMiles: 0, personalMiles: 0, deductionValue: 0, tripCount: 0,
  }));
  for (const l of logs) {
    const m = new Date(l.date).getMonth(); // 0-indexed
    if (l.tripType === "business") { byMonth[m].businessMiles += l.miles; byMonth[m].deductionValue += l.deductionValue; }
    else                           { byMonth[m].personalMiles += l.miles; }
    byMonth[m].tripCount++;
  }

  // By trip type
  const tripTypeMap = new Map<string, { tripType: string; miles: number; trips: number; deductionValue: number }>();
  for (const l of logs) {
    if (!tripTypeMap.has(l.tripType)) tripTypeMap.set(l.tripType, { tripType: l.tripType, miles: 0, trips: 0, deductionValue: 0 });
    const e = tripTypeMap.get(l.tripType)!;
    e.miles += l.miles; e.trips++; e.deductionValue += l.deductionValue;
  }

  const bizLogs = logs.filter((l) => l.tripType === "business");
  const rate = irsRate(year);

  res.json({
    year,
    irsRate: rate,
    businessName: biz.name,
    totalMiles:        logs.reduce((s, l) => s + l.miles, 0),
    totalBusinessMiles: bizLogs.reduce((s, l) => s + l.miles, 0),
    totalPersonalMiles: logs.filter((l) => l.tripType === "personal").reduce((s, l) => s + l.miles, 0),
    totalDeductionValue: bizLogs.reduce((s, l) => s + l.deductionValue, 0),
    tripCount: logs.length,
    byVehicle: Array.from(vehicleMap.values()).sort((a, b) => b.businessMiles - a.businessMiles),
    byMonth,
    byTripType: Array.from(tripTypeMap.values()).sort((a, b) => b.miles - a.miles),
  });
});

// ── GET /api/mileage/tax-deduction?businessId=X&year=Y ───────────────────────
router.get("/mileage/tax-deduction", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
  const logs = await getMileageLogs(businessId, year, null);
  const bizLogs = logs.filter((l) => l.tripType === "business");
  const rate = irsRate(year);
  const totalBusinessMiles = bizLogs.reduce((s, l) => s + l.miles, 0);
  const totalDeduction = totalBusinessMiles * rate;

  // By month
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, label: MONTH_NAMES[i], businessMiles: 0, deductionValue: 0,
  }));
  for (const l of bizLogs) {
    const m = new Date(l.date).getMonth();
    byMonth[m].businessMiles += l.miles;
    byMonth[m].deductionValue += l.deductionValue;
  }

  // Quarterly
  const byQuarter = [1, 2, 3, 4].map((q) => {
    const months = QUARTERS[q];
    const qLogs = bizLogs.filter((l) => months.includes(new Date(l.date).getMonth() + 1));
    const miles = qLogs.reduce((s, l) => s + l.miles, 0);
    return { quarter: `Q${q}`, months: months.map((m) => MONTH_NAMES[m - 1]).join("/"), businessMiles: miles, deductionValue: miles * rate };
  });

  // By vehicle
  const vehicleMap = new Map<number | null, { vehicleId: number | null; vehicleName: string | null; businessMiles: number; deductionValue: number }>();
  for (const l of bizLogs) {
    if (!vehicleMap.has(l.vehicleId)) vehicleMap.set(l.vehicleId, { vehicleId: l.vehicleId, vehicleName: l.vehicleName, businessMiles: 0, deductionValue: 0 });
    const e = vehicleMap.get(l.vehicleId)!;
    e.businessMiles += l.miles; e.deductionValue += l.deductionValue;
  }

  res.json({
    year,
    irsRate: rate,
    businessName: biz.name,
    totalBusinessMiles,
    totalDeduction,
    byMonth,
    byQuarter,
    byVehicle: Array.from(vehicleMap.values()).sort((a, b) => b.businessMiles - a.businessMiles),
    note: "IRS standard mileage rate deduction estimate. Actual deductible amount may differ — consult your tax advisor.",
  });
});

// ── GET /api/mileage?businessId=X[&vehicleId=Y&year=Z] ───────────────────────
router.get("/mileage", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string) : null;
  const year      = req.query.year      ? parseInt(req.query.year as string)      : null;

  const logs = await getMileageLogs(businessId, year, vehicleId);
  const totalBusinessMiles  = logs.filter((l) => l.tripType === "business").reduce((s, l) => s + l.miles, 0);
  const totalDeductionValue = logs.filter((l) => l.tripType === "business").reduce((s, l) => s + l.deductionValue, 0);

  res.json({ logs, totalBusinessMiles, totalDeductionValue });
});

// ── POST /api/mileage ─────────────────────────────────────────────────────────
router.post("/mileage", async (req: AuthRequest, res): Promise<void> => {
  const { businessId, vehicleId, jobId, driverName, date, startLocation, endLocation, odometerStart, odometerEnd, purpose, tripType, notes } = req.body;
  if (!businessId || !date) { res.status(400).json({ error: "businessId and date required" }); return; }
  const biz = await verifyBusiness(Number(businessId), req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const computedMiles = odometerEnd && odometerStart ? Number(odometerEnd) - Number(odometerStart) : null;

  const [log] = await db.insert(mileageLogsTable).values({
    businessId: Number(businessId),
    vehicleId: vehicleId ? Number(vehicleId) : null,
    jobId: jobId ? Number(jobId) : null,
    driverName: driverName || null, date,
    startLocation: startLocation || null, endLocation: endLocation || null,
    odometerStart: odometerStart || null, odometerEnd: odometerEnd || null,
    miles: computedMiles !== null ? String(computedMiles) : null,
    purpose: purpose || null,
    tripType: tripType || "business",
    notes: notes || null,
  }).returning();
  res.status(201).json(log);
});

// ── PATCH /api/mileage/:id ────────────────────────────────────────────────────
router.patch("/mileage/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyMileageLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Mileage log not found" }); return; }

  const { vehicleId, jobId, driverName, date, startLocation, endLocation, odometerStart, odometerEnd, purpose, tripType, notes } = req.body;
  const u: Partial<typeof mileageLogsTable.$inferInsert> = {};
  if (vehicleId      !== undefined) u.vehicleId      = vehicleId ? Number(vehicleId) : null;
  if (jobId          !== undefined) u.jobId          = jobId ? Number(jobId) : null;
  if (driverName     !== undefined) u.driverName     = driverName || null;
  if (date           !== undefined) u.date           = date;
  if (startLocation  !== undefined) u.startLocation  = startLocation || null;
  if (endLocation    !== undefined) u.endLocation    = endLocation || null;
  if (odometerStart  !== undefined) u.odometerStart  = odometerStart || null;
  if (odometerEnd    !== undefined) u.odometerEnd    = odometerEnd || null;
  if (purpose        !== undefined) u.purpose        = purpose || null;
  if (tripType       !== undefined) u.tripType       = tripType || "business";
  if (notes          !== undefined) u.notes          = notes || null;

  // Recompute miles when odometer values change
  if (odometerStart !== undefined || odometerEnd !== undefined) {
    const [cur] = await db.select().from(mileageLogsTable).where(eq(mileageLogsTable.id, log.id)).limit(1);
    const s = odometerStart !== undefined ? odometerStart : cur?.odometerStart;
    const e = odometerEnd   !== undefined ? odometerEnd   : cur?.odometerEnd;
    if (s && e) u.miles = String(Number(e) - Number(s));
  }

  const [updated] = await db.update(mileageLogsTable).set(u).where(eq(mileageLogsTable.id, log.id)).returning();
  res.json(updated);
});

// ── DELETE /api/mileage/:id ───────────────────────────────────────────────────
router.delete("/mileage/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyMileageLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Mileage log not found" }); return; }
  await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, log.id));
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
// FUEL  — all static routes BEFORE /:id
// ══════════════════════════════════════════════════════════════

// ── GET /api/fuel/report/ifta?businessId=X&year=Y[&quarter=Q] ────────────────
router.get("/fuel/report/ifta", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const year    = req.query.year    ? parseInt(req.query.year    as string) : new Date().getFullYear();
  const quarter = req.query.quarter ? parseInt(req.query.quarter as string) : null;

  // Date range for filtering
  let startDate: string, endDate: string;
  if (quarter && QUARTERS[quarter]) {
    const months = QUARTERS[quarter];
    const firstMonth = String(months[0]).padStart(2, "0");
    const lastMonth  = String(months[months.length - 1]).padStart(2, "0");
    startDate = `${year}-${firstMonth}-01`;
    endDate   = `${year}-${lastMonth}-31`;
  } else {
    startDate = `${year}-01-01`;
    endDate   = `${year}-12-31`;
  }

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
      gte(fuelLogsTable.date, startDate),
      lte(fuelLogsTable.date, endDate),
    ))
    .orderBy(fuelLogsTable.state, fuelLogsTable.date);

  // Group by state
  const stateMap = new Map<string, { state: string; gallons: number; iftaGallons: number; totalAmount: number; entries: number }>();
  for (const r of rows) {
    const state = r.log.state || "Unknown";
    if (!stateMap.has(state)) stateMap.set(state, { state, gallons: 0, iftaGallons: 0, totalAmount: 0, entries: 0 });
    const e = stateMap.get(state)!;
    e.gallons += n(r.log.gallons);
    if (r.log.iftaReportable) e.iftaGallons += n(r.log.gallons);
    e.totalAmount += n(r.log.totalAmount);
    e.entries++;
  }

  // Group by vehicle
  const vehicleMap = new Map<number | null, { vehicleId: number | null; vehicleName: string | null; licensePlate: string | null; gallons: number; iftaGallons: number; totalAmount: number; states: string[] }>();
  for (const r of rows) {
    const key = r.log.vehicleId;
    if (!vehicleMap.has(key)) vehicleMap.set(key, { vehicleId: key, vehicleName: r.vehicleName, licensePlate: r.vehicleLicensePlate, gallons: 0, iftaGallons: 0, totalAmount: 0, states: [] });
    const e = vehicleMap.get(key)!;
    e.gallons += n(r.log.gallons);
    if (r.log.iftaReportable) e.iftaGallons += n(r.log.gallons);
    e.totalAmount += n(r.log.totalAmount);
    if (r.log.state && !e.states.includes(r.log.state)) e.states.push(r.log.state);
  }

  const allGallons     = rows.reduce((s, r) => s + n(r.log.gallons), 0);
  const iftaGallons    = rows.filter((r) => r.log.iftaReportable).reduce((s, r) => s + n(r.log.gallons), 0);
  const totalAmount    = rows.reduce((s, r) => s + n(r.log.totalAmount), 0);
  const avgPpg         = allGallons > 0 ? totalAmount / allGallons : 0;

  res.json({
    year,
    quarter: quarter ? `Q${quarter}` : "Full Year",
    startDate,
    endDate,
    businessName: biz.name,
    totalGallons: allGallons,
    iftaGallons,
    totalAmount,
    avgPricePerGallon: avgPpg,
    entryCount: rows.length,
    byState: Array.from(stateMap.values()).sort((a, b) => b.iftaGallons - a.iftaGallons),
    byVehicle: Array.from(vehicleMap.values()).sort((a, b) => b.gallons - a.gallons),
    note: "IFTA requires reporting taxable miles driven and fuel purchased in each jurisdiction. Use this data to prepare your quarterly IFTA return.",
  });
});

// ── GET /api/fuel?businessId=X[&vehicleId=Y&year=Z] ──────────────────────────
router.get("/fuel", async (req: AuthRequest, res): Promise<void> => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) { res.status(400).json({ error: "businessId required" }); return; }
  const biz = await verifyBusiness(businessId, req.userId!);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string) : null;
  const year      = req.query.year      ? parseInt(req.query.year as string)      : null;

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
  const logs = filtered.map((r) => ({ ...r.log, vehicleName: r.vehicleName, vehicleLicensePlate: r.vehicleLicensePlate }));

  const totalGallons = logs.reduce((s, l) => s + n(l.gallons), 0);
  const totalAmount  = logs.reduce((s, l) => s + n(l.totalAmount), 0);

  res.json({ logs, totalGallons, totalAmount, avgPricePerGallon: totalGallons > 0 ? totalAmount / totalGallons : 0 });
});

// ── POST /api/fuel ────────────────────────────────────────────────────────────
router.post("/fuel", async (req: AuthRequest, res): Promise<void> => {
  const { businessId, vehicleId, jobId, transactionId, date, stationName, state, gallons, pricePerGallon, totalAmount, odometer, fuelType, receiptId, iftaReportable, notes } = req.body;
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
    stationName: stationName || null, state: state || null,
    gallons: gallons || null, pricePerGallon: pricePerGallon || null,
    totalAmount: computedTotal,
    odometer: odometer || null,
    fuelType: fuelType || "diesel",
    receiptId: receiptId ? Number(receiptId) : null,
    iftaReportable: iftaReportable !== false,
    notes: notes || null,
  }).returning();
  res.status(201).json(log);
});

// ── PATCH /api/fuel/:id ───────────────────────────────────────────────────────
router.patch("/fuel/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyFuelLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Fuel log not found" }); return; }

  const { vehicleId, jobId, date, stationName, state, gallons, pricePerGallon, totalAmount, odometer, fuelType, iftaReportable, notes } = req.body;
  const u: Partial<typeof fuelLogsTable.$inferInsert> = {};
  if (vehicleId      !== undefined) u.vehicleId      = vehicleId ? Number(vehicleId) : null;
  if (jobId          !== undefined) u.jobId          = jobId ? Number(jobId) : null;
  if (date           !== undefined) u.date           = date;
  if (stationName    !== undefined) u.stationName    = stationName || null;
  if (state          !== undefined) u.state          = state || null;
  if (gallons        !== undefined) u.gallons        = gallons || null;
  if (pricePerGallon !== undefined) u.pricePerGallon = pricePerGallon || null;
  if (totalAmount    !== undefined) u.totalAmount    = totalAmount || null;
  if (odometer       !== undefined) u.odometer       = odometer || null;
  if (fuelType       !== undefined) u.fuelType       = fuelType;
  if (iftaReportable !== undefined) u.iftaReportable = Boolean(iftaReportable);
  if (notes          !== undefined) u.notes          = notes || null;

  // Auto-compute total if both gallons and price are given
  if (gallons && pricePerGallon) u.totalAmount = String(Number(gallons) * Number(pricePerGallon));

  const [updated] = await db.update(fuelLogsTable).set(u).where(eq(fuelLogsTable.id, log.id)).returning();
  res.json(updated);
});

// ── DELETE /api/fuel/:id ──────────────────────────────────────────────────────
router.delete("/fuel/:id", async (req: AuthRequest, res): Promise<void> => {
  const log = await verifyFuelLog(Number(req.params.id), req.userId!);
  if (!log) { res.status(404).json({ error: "Fuel log not found" }); return; }
  await db.delete(fuelLogsTable).where(eq(fuelLogsTable.id, log.id));
  res.json({ success: true });
});

export default router;
