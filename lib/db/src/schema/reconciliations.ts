import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const reconciliationsTable = pgTable("reconciliations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  bankAccountName: text("bank_account_name").notNull(),
  periodStart: text("period_start").notNull().default(""),
  periodEnd: text("period_end").notNull().default(""),
  openingBalance: numeric("opening_balance", { precision: 15, scale: 2 }).notNull(),
  closingBalance: numeric("closing_balance", { precision: 15, scale: 2 }).notNull(),
  difference: numeric("difference", { precision: 15, scale: 2 }),
  autoMatchedCount: integer("auto_matched_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft, complete
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReconciliationSchema = createInsertSchema(reconciliationsTable).omit({ id: true, createdAt: true });
export type InsertReconciliation = z.infer<typeof insertReconciliationSchema>;
export type Reconciliation = typeof reconciliationsTable.$inferSelect;
