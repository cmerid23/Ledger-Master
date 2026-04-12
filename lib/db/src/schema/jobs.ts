import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";
import { transactionsTable } from "./transactions";
import { receiptsTable } from "./receipts";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jobNumber: text("job_number"),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  // active | completed | cancelled | on-hold
  jobType: text("job_type"),
  // trucking: route | load | contract   service: project | retainer | one-time
  startDate: text("start_date"),
  endDate: text("end_date"),
  origin: text("origin"),
  destination: text("destination"),
  estimatedMiles: numeric("estimated_miles", { precision: 10, scale: 2 }),
  actualMiles: numeric("actual_miles", { precision: 10, scale: 2 }),
  ratePerMile: numeric("rate_per_mile", { precision: 8, scale: 4 }),
  flatRate: numeric("flat_rate", { precision: 12, scale: 2 }),
  estimatedRevenue: numeric("estimated_revenue", { precision: 12, scale: 2 }),
  actualRevenue: numeric("actual_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  profit: numeric("profit", { precision: 12, scale: 2 }).notNull().default("0"),
  profitMargin: numeric("profit_margin", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const jobExpensesTable = pgTable("job_expenses", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expenseType: text("expense_type"),
  // fuel | tolls | driver_pay | maintenance | insurance | other
  date: text("date"),
  receiptId: integer("receipt_id").references(() => receiptsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
