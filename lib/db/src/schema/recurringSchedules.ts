import { pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { customersTable } from "./customers";

export const recurringSchedulesTable = pgTable("recurring_schedules", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  // active | paused | cancelled
  frequency: text("frequency").notNull().default("monthly"),
  // weekly | biweekly | monthly | quarterly | yearly
  dayOfMonth: integer("day_of_month").notNull().default(1),
  nextRunDate: text("next_run_date").notNull(),
  lastRunDate: text("last_run_date"),
  totalRuns: integer("total_runs").notNull().default(0),
  // Invoice template fields
  templateTitle: text("template_title").notNull(),
  templateSubtotal: numeric("template_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  templateTaxRate: numeric("template_tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  templateTotal: numeric("template_total", { precision: 12, scale: 2 }).notNull().default("0"),
  templateCurrency: text("template_currency").notNull().default("USD"),
  templateNotes: text("template_notes"),
  templateLineItems: text("template_line_items").notNull().default("[]"),
  // JSON array of line items
  dueAfterDays: integer("due_after_days").notNull().default(30),
  autoSend: boolean("auto_send").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecurringScheduleSchema = createInsertSchema(recurringSchedulesTable).omit({ id: true, createdAt: true });
export type InsertRecurringSchedule = z.infer<typeof insertRecurringScheduleSchema>;
export type RecurringSchedule = typeof recurringSchedulesTable.$inferSelect;
