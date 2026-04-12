import { pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { jobsTable } from "./jobs";
import { transactionsTable } from "./transactions";
import { receiptsTable } from "./receipts";

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  licensePlate: text("license_plate"),
  vin: text("vin"),
  odometerStart: numeric("odometer_start", { precision: 10, scale: 2 }),
  fuelType: text("fuel_type").notNull().default("diesel"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;

// ─── Mileage Logs ─────────────────────────────────────────────────────────────

export const mileageLogsTable = pgTable("mileage_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  driverName: text("driver_name"),
  date: text("date").notNull(),
  startLocation: text("start_location"),
  endLocation: text("end_location"),
  odometerStart: numeric("odometer_start", { precision: 10, scale: 2 }),
  odometerEnd: numeric("odometer_end", { precision: 10, scale: 2 }),
  // miles is computed in app: odometerEnd - odometerStart (or stored directly)
  miles: numeric("miles", { precision: 10, scale: 2 }),
  purpose: text("purpose"),
  tripType: text("trip_type").notNull().default("business"),
  // business | personal
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMileageLogSchema = createInsertSchema(mileageLogsTable).omit({ id: true, createdAt: true });
export type InsertMileageLog = z.infer<typeof insertMileageLogSchema>;
export type MileageLog = typeof mileageLogsTable.$inferSelect;

// ─── Fuel Logs ────────────────────────────────────────────────────────────────

export const fuelLogsTable = pgTable("fuel_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  date: text("date").notNull(),
  stationName: text("station_name"),
  state: text("state"),
  gallons: numeric("gallons", { precision: 10, scale: 3 }),
  pricePerGallon: numeric("price_per_gallon", { precision: 8, scale: 4 }),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  odometer: numeric("odometer", { precision: 10, scale: 2 }),
  fuelType: text("fuel_type").notNull().default("diesel"),
  receiptId: integer("receipt_id").references(() => receiptsTable.id, { onDelete: "set null" }),
  iftaReportable: boolean("ifta_reportable").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFuelLogSchema = createInsertSchema(fuelLogsTable).omit({ id: true, createdAt: true });
export type InsertFuelLog = z.infer<typeof insertFuelLogSchema>;
export type FuelLog = typeof fuelLogsTable.$inferSelect;
