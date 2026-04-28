import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { accountsTable } from "./accounts";

export const bankRulesTable = pgTable("bank_rules", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  conditionField: text("condition_field").notNull().default("description"),
  conditionOperator: text("condition_operator").notNull(), // contains, starts_with, ends_with, equals, greater_than, less_than
  conditionValue: text("condition_value").notNull(),
  amountMin: numeric("amount_min", { precision: 15, scale: 2 }),
  amountMax: numeric("amount_max", { precision: 15, scale: 2 }),
  transactionType: text("transaction_type"), // debit, credit, both
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  payeeName: text("payee_name"),
  memo: text("memo"),
  isActive: boolean("is_active").notNull().default(true),
  autoApply: boolean("auto_apply").notNull().default(true),
  timesApplied: integer("times_applied").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBankRuleSchema = createInsertSchema(bankRulesTable).omit({ id: true, createdAt: true });
export type InsertBankRule = z.infer<typeof insertBankRuleSchema>;
export type BankRule = typeof bankRulesTable.$inferSelect;
