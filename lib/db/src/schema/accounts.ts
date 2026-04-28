import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // asset, liability, equity, income, cogs, expense
  subtype: text("subtype"), // bank, current_asset, fixed_asset, accounts_receivable, accounts_payable, credit_card, current_liability, long_term_liability, operating_income, other_income, operating_expense, other_expense, cost_of_goods_sold
  normalBalance: text("normal_balance").notNull().default("debit"), // debit or credit
  parentAccountId: integer("parent_account_id"),
  code: text("code"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
