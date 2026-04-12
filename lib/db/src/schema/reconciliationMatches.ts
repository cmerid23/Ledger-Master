import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { reconciliationsTable } from "./reconciliations";
import { transactionsTable } from "./transactions";
import { journalEntriesTable } from "./journalEntries";

export const reconciliationMatchesTable = pgTable("reconciliation_matches", {
  id: serial("id").primaryKey(),
  reconciliationId: integer("reconciliation_id")
    .notNull()
    .references(() => reconciliationsTable.id, { onDelete: "cascade" }),
  bankTransactionId: integer("bank_transaction_id")
    .references(() => transactionsTable.id, { onDelete: "set null" }),
  journalEntryId: integer("journal_entry_id")
    .references(() => journalEntriesTable.id, { onDelete: "set null" }),
  confidence: text("confidence").notNull().default("manual"), // high, low, manual
  status: text("status").notNull().default("pending"), // confirmed, rejected, pending
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReconciliationMatchSchema = createInsertSchema(reconciliationMatchesTable).omit({ id: true, createdAt: true });
export type InsertReconciliationMatch = z.infer<typeof insertReconciliationMatchSchema>;
export type ReconciliationMatch = typeof reconciliationMatchesTable.$inferSelect;
