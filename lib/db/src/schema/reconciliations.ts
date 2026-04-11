import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const reconciliationsTable = pgTable("reconciliations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  bankAccountName: text("bank_account_name").notNull(),
  statementDate: text("statement_date").notNull(),
  openingBalance: numeric("opening_balance", { precision: 15, scale: 2 }).notNull(),
  closingBalance: numeric("closing_balance", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReconciliationSchema = createInsertSchema(reconciliationsTable).omit({ id: true, createdAt: true });
export type InsertReconciliation = z.infer<typeof insertReconciliationSchema>;
export type Reconciliation = typeof reconciliationsTable.$inferSelect;
